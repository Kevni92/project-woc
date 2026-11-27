#include "protocol/endpoint.hpp"

#include <algorithm>
#include <initializer_list>
#include <nlohmann/json.hpp>

namespace woc::protocol {
namespace {

using Json = nlohmann::json;
constexpr int version = 1;
constexpr std::size_t command_history_size = 64;

std::string_view error_code(Rejection rejection) {
    switch (rejection) {
        case Rejection::character_not_found: return "CHARACTER_NOT_FOUND";
        case Rejection::not_eligible: return "NOT_ELIGIBLE";
        case Rejection::character_busy: return "CHARACTER_BUSY";
        case Rejection::not_controller: return "NOT_CONTROLLER";
        case Rejection::invalid_action: return "INVALID_ACTION";
    }
    return "INVALID_ACTION";
}

std::optional<CommandKind> command_kind(std::string_view action) {
    if (action == "AcquireCharacter") return CommandKind::acquire;
    if (action == "ReleaseCharacter") return CommandKind::release;
    if (action == "TestAction") return CommandKind::test_action;
    return std::nullopt;
}

bool has_exact_keys(const Json& object, std::initializer_list<std::string_view> keys) {
    return object.is_object() && object.size() == keys.size()
        && std::ranges::all_of(keys, [&](auto key) { return object.contains(key); });
}

std::string_view read_id(const Json& object, std::string_view key) {
    const auto entry = object.find(key);
    if (entry == object.end() || !entry->is_string()) {
        return {};
    }
    const auto& value = entry->get_ref<const std::string&>();
    if (value.empty() || value.size() > 64) {
        return {};
    }
    constexpr std::string_view allowed =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    return value.find_first_not_of(allowed) == std::string::npos ? value : std::string_view{};
}

Json summary(const CharacterSummary& character) {
    return {
        {"id", character.id}, {"name", character.name}, {"eligible", character.eligible},
        {"occupied", character.occupied},
        {"position", {{"x", character.position.x}, {"z", character.position.z}}},
    };
}

Json projection(const View& view, const View* previous = nullptr) {
    Json characters = Json::array();
    for (std::size_t i = 0; i < view.characters.size(); ++i) {
        if (!previous || view.characters[i] != previous->characters[i]) {
            characters.push_back(summary(view.characters[i]));
        }
    }
    Json controlled = nullptr;
    if (view.controlled) {
        controlled = {{"id", view.controlled->id}, {"cash", view.controlled->cash}};
    }
    Json result = {
        {"revision", view.revision}, {"gameMinutes", view.game_minutes},
        {"characters", std::move(characters)}, {"controlled", std::move(controlled)},
    };
    if (previous) {
        result["baseRevision"] = previous->revision;
    }
    return result;
}

std::string encode(
    std::uint64_t& sequence, std::string_view type, std::string_view request_id,
    Json payload, std::uint64_t world_tick) {
    Json message = {
        {"protocolVersion", version}, {"type", type}, {"streamSeq", ++sequence},
        {"worldTick", world_tick}, {"payload", std::move(payload)},
    };
    if (!request_id.empty()) {
        message["requestId"] = request_id;
    }
    return message.dump();
}

}

void Endpoint::open(ConnectionId connection) {
    connections_.try_emplace(connection);
}

Deliveries Endpoint::close(ConnectionId id) {
    const auto connection = connections_.find(id);
    if (connection == connections_.end()) {
        return {};
    }
    if (const auto session = connection->second.session) {
        host_.disconnect(*session);
    }
    connections_.erase(connection);
    Deliveries deliveries;
    publish_changes(deliveries);
    return deliveries;
}

void Endpoint::publish_changes(Deliveries& deliveries) {
    for (auto& [id, connection] : connections_) {
        if (!connection.session) {
            continue;
        }
        const auto view = host_.view(*connection.session);
        if (view.revision != connection.last_view->revision) {
            deliveries.push_back({id, encode(connection.sequence, "Delta", {},
                projection(view, &*connection.last_view), view.tick)});
            connection.last_view = view;
        }
    }
}

Deliveries Endpoint::receive(ConnectionId id, std::string_view wire) {
    auto entry = connections_.find(id);
    if (entry == connections_.end()) {
        return {};
    }
    auto& connection = entry->second;
    Deliveries deliveries;
    const auto message = wire.size() <= max_message_bytes
        ? Json::parse(wire, nullptr, false) : Json{};
    const auto request_id = read_id(message, "requestId");
    const auto send = [&](std::string_view type, const Json& payload, bool correlate = true) {
        const auto tick = host_.world_tick();
        deliveries.push_back({id, encode(connection.sequence, type, correlate ? request_id : "",
            payload, tick)});
    };
    const auto error = [&](std::string_view code) {
        send("Error", {{"code", code}});
    };

    if (!has_exact_keys(message, {"protocolVersion", "type", "requestId", "payload"})
        || !message["type"].is_string() || !message["protocolVersion"].is_number_integer()
        || request_id.empty() || !message["payload"].is_object()) {
        error("INVALID_MESSAGE");
        return deliveries;
    }
    if (message["protocolVersion"] != version) {
        error("UNSUPPORTED_VERSION");
        return deliveries;
    }

    const auto& type = message["type"].get_ref<const std::string&>();
    const auto& payload = message["payload"];
    if (type == "Hello") {
        if (!payload.empty()) {
            error("INVALID_MESSAGE");
        } else if (connection.session) {
            error("ALREADY_CONNECTED");
        } else {
            connection.session = host_.connect();
            connection.last_view = host_.view(*connection.session);
            send("Welcome", {
                {"sessionId", "session-" + std::to_string(*connection.session)},
                {"worldId", "p0-test-world"},
                {"capabilities", Json::array({"CharacterControl", "TestAction", "SnapshotDelta"})},
            });
            send("Snapshot", projection(*connection.last_view), false);
        }
        return deliveries;
    }
    if (!connection.session) {
        error("HELLO_REQUIRED");
        return deliveries;
    }

    if (type == "SnapshotRequest" && payload.empty()) {
        connection.last_view = host_.view(*connection.session);
        send("Snapshot", projection(*connection.last_view));
        return deliveries;
    }
    if (type != "Command" || !has_exact_keys(payload, {"action", "characterId"})) {
        error("INVALID_MESSAGE");
        return deliveries;
    }
    const auto action = read_id(payload, "action");
    const auto character = read_id(payload, "characterId");
    if (action.empty() || character.empty()) {
        error("INVALID_MESSAGE");
        return deliveries;
    }
    const auto kind = command_kind(action);
    if (!kind) {
        error("UNKNOWN_COMMAND");
        return deliveries;
    }
    const auto send_result = [&](const CachedCommand& command) {
        Json result = {{"accepted", !command.rejection}, {"revision", command.revision}};
        if (command.rejection) {
            result["code"] = error_code(*command.rejection);
        }
        send("CommandResult", result);
    };
    const auto cached = std::ranges::find(connection.commands, request_id, &CachedCommand::request_id);
    if (cached != connection.commands.end()) {
        if (cached->action == action && cached->character == character) {
            send_result(*cached);
        } else {
            error("REQUEST_ID_REUSED");
        }
        return deliveries;
    }

    const auto rejection = host_.execute(*connection.session, *kind, character);
    if (connection.commands.size() == command_history_size) {
        connection.commands.pop_front();
    }
    const auto& result = connection.commands.emplace_back(
        std::string(request_id), std::string(action), std::string(character), rejection,
        host_.view(*connection.session).revision);
    send_result(result);
    publish_changes(deliveries);
    return deliveries;
}

Deliveries Endpoint::tick() {
    host_.advance();
    Deliveries deliveries;
    publish_changes(deliveries);
    return deliveries;
}

}
