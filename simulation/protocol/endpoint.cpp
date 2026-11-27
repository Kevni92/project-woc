#include "protocol/endpoint.hpp"

#include <algorithm>
#include <initializer_list>
#include <nlohmann/json.hpp>
#include <utility>

namespace woc::protocol {
namespace {

using Json = nlohmann::json;
constexpr int version = 3;
constexpr std::size_t command_history_size = 64;

std::string_view error_code(Rejection rejection) {
    switch (rejection) {
        case Rejection::character_not_found: return "CHARACTER_NOT_FOUND";
        case Rejection::not_eligible: return "NOT_ELIGIBLE";
        case Rejection::character_busy: return "CHARACTER_BUSY";
        case Rejection::not_controller: return "NOT_CONTROLLER";
        case Rejection::location_not_found: return "LOCATION_NOT_FOUND";
        case Rejection::already_traveling: return "ALREADY_TRAVELING";
        case Rejection::already_at_location: return "ALREADY_AT_LOCATION";
        case Rejection::unreachable: return "UNREACHABLE";
    }
    return "UNREACHABLE";
}

std::optional<CommandKind> command_kind(std::string_view action) {
    if (action == "AcquireCharacter") return CommandKind::acquire;
    if (action == "ReleaseCharacter") return CommandKind::release;
    if (action == "MoveTo") return CommandKind::move_to;
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

Json position(Position point) {
    return {{"x", static_cast<double>(point.x) / 1000}, {"z", static_cast<double>(point.z) / 1000}};
}

std::string_view movement_status(MovementStatus status) {
    switch (status) {
        case MovementStatus::idle: return "Idle";
        case MovementStatus::traveling: return "Traveling";
        case MovementStatus::at_location: return "AtLocation";
    }
    return "Idle";
}

Json summary(const CharacterSummary& character) {
    return {
        {"id", character.id}, {"name", character.name}, {"eligible", character.eligible},
        {"occupied", character.occupied},
        {"position", position(character.position)}, {"status", movement_status(character.status)},
    };
}

Json route_details(const Route& route, const Navigation& navigation) {
    auto points = Json::array();
    for (const auto point : navigation.geometry(route)) points.push_back(position(point));
    auto edges = Json::array();
    for (const auto& leg : route.legs) edges.push_back(navigation.edges()[leg.edge].id);
    return {
        {"distanceMm", route.length}, {"durationTicks", walking_ticks(route.length)},
        {"points", std::move(points)}, {"edgeIds", std::move(edges)},
    };
}

Json projection(const View& view, const Navigation& navigation, const View* previous = nullptr) {
    Json characters = Json::array();
    for (std::size_t i = 0; i < view.characters.size(); ++i) {
        if (!previous || view.characters[i] != previous->characters[i]) {
            characters.push_back(summary(view.characters[i]));
        }
    }
    Json controlled = nullptr;
    if (view.controlled) {
        const auto& character = *view.controlled;
        controlled = {
            {"id", character.id}, {"cash", character.cash}, {"positionRevision", character.position_revision},
            {"locationId", character.location ? Json(*character.location) : Json(nullptr)},
            {"travel", nullptr},
        };
        if (character.travel) {
            const auto& trip = *character.travel;
            controlled["travel"] = {
                {"locationId", *trip.location}, {"startTick", trip.started_at}, {"progressMm", trip.traveled},
                {"remainingTicks", walking_ticks(trip.route.length) - (view.tick - trip.started_at)},
                {"route", route_details(trip.route, navigation)},
            };
        }
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
    Json payload, std::uint64_t world_tick, int wire_version = version) {
    Json message = {
        {"protocolVersion", wire_version}, {"type", type}, {"streamSeq", ++sequence},
        {"worldTick", world_tick}, {"payload", std::move(payload)},
    };
    if (!request_id.empty()) {
        message["requestId"] = request_id;
    }
    return message.dump();
}

}

Endpoint::Endpoint(WorldDefinition definition, unsigned world_revision, std::string semantic_hash)
    : host_(std::move(definition)), world_revision_(world_revision), semantic_hash_(std::move(semantic_hash)) {}

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
                projection(view, host_.definition().navigation, &*connection.last_view), view.tick)});
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
        // Older clients can read the rejection using their own error envelope.
        const auto& requested = message["protocolVersion"];
        const int error_version = requested == 1 ? 1 : requested == 2 ? 2 : version;
        deliveries.push_back({id, encode(connection.sequence, "Error", request_id,
            {{"code", "UNSUPPORTED_VERSION"}}, host_.world_tick(), error_version)});
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
                {"worldId", host_.definition().id}, {"worldSchemaVersion", host_.definition().version},
                {"worldRevision", world_revision_}, {"semanticHash", semantic_hash_},
                {"capabilities", Json::array({"CharacterControl", "FootTravel", "SnapshotDelta"})},
            });
            send("Snapshot", projection(*connection.last_view, host_.definition().navigation), false);
        }
        return deliveries;
    }
    if (!connection.session) {
        error("HELLO_REQUIRED");
        return deliveries;
    }

    if (type == "SnapshotRequest" && payload.empty()) {
        connection.last_view = host_.view(*connection.session);
        send("Snapshot", projection(*connection.last_view, host_.definition().navigation));
        return deliveries;
    }
    if (type == "RoutePreview") {
        const auto character = read_id(payload, "characterId");
        const auto location = read_id(payload, "locationId");
        if (!has_exact_keys(payload, {"characterId", "locationId"}) || character.empty() || location.empty()) {
            error("INVALID_MESSAGE");
            return deliveries;
        }
        const auto result = host_.preview(*connection.session, character, location);
        if (result) {
            send("RoutePreviewResult", {
                {"accepted", true}, {"characterId", character}, {"locationId", location},
                {"positionRevision", result->position_revision},
                {"route", route_details(result->route, host_.definition().navigation)},
            });
        } else {
            send("RoutePreviewResult", {{"accepted", false}, {"code", error_code(result.error())}});
        }
        return deliveries;
    }
    if (type != "Command") {
        error("INVALID_MESSAGE");
        return deliveries;
    }
    const auto action = read_id(payload, "action");
    const auto character = read_id(payload, "characterId");
    const auto location = read_id(payload, "locationId");
    const bool move = action == "MoveTo";
    const bool valid_payload = move ? has_exact_keys(payload, {"action", "characterId", "locationId"})
        : has_exact_keys(payload, {"action", "characterId"});
    if (!valid_payload || action.empty() || character.empty() || (move && location.empty())) {
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
        if (cached->action == action && cached->character == character && cached->location == location) {
            send_result(*cached);
        } else {
            error("REQUEST_ID_REUSED");
        }
        return deliveries;
    }

    const auto outcome = host_.execute(*connection.session, *kind, character, location);
    const auto rejection = outcome ? std::nullopt : std::optional{outcome.error()};
    if (connection.commands.size() == command_history_size) {
        connection.commands.pop_front();
    }
    const auto& result = connection.commands.emplace_back(
        std::string(request_id), std::string(action), std::string(character), std::string(location),
        rejection, host_.revision());
    send_result(result);
    publish_changes(deliveries);
    return deliveries;
}

Deliveries Endpoint::tick() {
    static_cast<void>(host_.advance());
    Deliveries deliveries;
    publish_changes(deliveries);
    return deliveries;
}

}
