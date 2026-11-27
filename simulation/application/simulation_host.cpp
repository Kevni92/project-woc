#include "application/simulation_host.hpp"

#include <algorithm>
#include <utility>

namespace woc {
namespace {

Rejection rejection(MoveRejection code) {
    switch (code) {
        case MoveRejection::location_not_found: return Rejection::location_not_found;
        case MoveRejection::already_traveling: return Rejection::already_traveling;
        case MoveRejection::already_at_location: return Rejection::already_at_location;
        case MoveRejection::unreachable: return Rejection::unreachable;
    }
    return Rejection::unreachable;
}

}

SessionId SimulationHost::connect() {
    const auto session = next_session_++;
    sessions_.emplace(session, std::nullopt);
    return session;
}

void SimulationHost::disconnect(SessionId session) {
    const auto entry = sessions_.find(session);
    if (entry == sessions_.end()) return;
    if (entry->second) {
        controllers_[*entry->second].reset();
        ++revision_;
    }
    sessions_.erase(entry);
}

std::optional<std::size_t> SimulationHost::character_index(std::string_view id) const {
    const auto& characters = world_.characters();
    const auto found = std::ranges::find(characters, id, &Character::id);
    if (found == characters.end()) return std::nullopt;
    return static_cast<std::size_t>(found - characters.begin());
}

std::expected<std::optional<MovementStarted>, Rejection> SimulationHost::execute(
    SessionId session, CommandKind command, std::string_view character_id, std::string_view location) {
    const auto index = character_index(character_id);
    if (!index) return std::unexpected(Rejection::character_not_found);
    auto& controlled = sessions_.at(session);
    auto& controller = controllers_[*index];
    std::optional<MovementStarted> started;

    if (command == CommandKind::acquire) {
        if (!world_.characters()[*index].eligible) return std::unexpected(Rejection::not_eligible);
        if (controller == session) return started;
        if (controller) return std::unexpected(Rejection::character_busy);
        if (controlled) controllers_[*controlled].reset();
        controlled = index;
        controller = session;
    } else {
        if (controller != session) return std::unexpected(Rejection::not_controller);
        if (command == CommandKind::release) {
            controller.reset();
            controlled.reset();
        } else {
            auto movement = world_.move_to(*index, location);
            if (!movement) return std::unexpected(rejection(movement.error()));
            started = *movement;
        }
    }

    ++revision_;
    return started;
}

std::expected<RoutePreview, Rejection> SimulationHost::preview(
    SessionId session, std::string_view character_id, std::string_view location) const {
    const auto index = character_index(character_id);
    if (!index) return std::unexpected(Rejection::character_not_found);
    if (controllers_[*index] != session) return std::unexpected(Rejection::not_controller);
    auto route = world_.preview(*index, location);
    if (!route) return std::unexpected(rejection(route.error()));
    return RoutePreview{world_.characters()[*index].position_revision, std::move(*route)};
}

View SimulationHost::view(SessionId session) const {
    View result{revision_, world_.tick(), world_.game_minutes(), {}, std::nullopt};
    const auto& characters = world_.characters();
    for (std::size_t i = 0; i < characters.size(); ++i) {
        const auto& character = characters[i];
        result.characters[i] = {
            character.id, character.name, character.eligible, controllers_[i].has_value(),
            definition().navigation.point(character.position), character.status(),
        };
    }
    if (const auto controlled = sessions_.at(session)) {
        const auto& character = characters[*controlled];
        result.controlled = ControlledCharacter{
            character.id, character.cash, character.position_revision, character.location, character.travel,
        };
    }
    return result;
}

MovementEvents SimulationHost::advance() {
    auto events = world_.advance();
    ++revision_;
    return events;
}

}
