#include "application/simulation_host.hpp"

#include <algorithm>

namespace woc {

SessionId SimulationHost::connect() {
    const auto session = next_session_++;
    sessions_.emplace(session, std::nullopt);
    return session;
}

void SimulationHost::disconnect(SessionId session) {
    const auto entry = sessions_.find(session);
    if (entry == sessions_.end()) {
        return;
    }
    if (entry->second) {
        controllers_[*entry->second].reset();
        ++revision_;
    }
    sessions_.erase(entry);
}

std::optional<Rejection> SimulationHost::execute(
    SessionId session, CommandKind command, std::string_view character_id) {
    auto& controlled = sessions_.at(session);
    const auto& characters = world_.characters();
    const auto found = std::ranges::find(characters, character_id, &Character::id);
    if (found == characters.end()) {
        return Rejection::character_not_found;
    }
    const auto index = static_cast<std::size_t>(found - characters.begin());
    auto& controller = controllers_[index];

    if (command == CommandKind::acquire) {
        if (!found->eligible) {
            return Rejection::not_eligible;
        }
        if (controller == session) {
            return std::nullopt;
        }
        if (controller) {
            return Rejection::character_busy;
        }
        if (controlled) {
            controllers_[*controlled].reset();
        }
        controlled = index;
        controller = session;
    } else {
        if (controller != session) {
            return Rejection::not_controller;
        }
        if (command == CommandKind::release) {
            controller.reset();
            controlled.reset();
        } else if (!world_.perform_test_action(index)) {
            return Rejection::invalid_action;
        }
    }

    ++revision_;
    return std::nullopt;
}

View SimulationHost::view(SessionId session) const {
    View result{revision_, world_.tick(), world_.game_minutes(), {}, std::nullopt};
    const auto& characters = world_.characters();
    for (std::size_t i = 0; i < characters.size(); ++i) {
        const auto& character = characters[i];
        result.characters[i] = {
            character.id, character.name, character.eligible, controllers_[i].has_value(),
            character.position,
        };
    }
    if (const auto controlled = sessions_.at(session)) {
        const auto& character = characters[*controlled];
        result.controlled = ControlledCharacter{character.id, character.cash};
    }
    return result;
}

void SimulationHost::advance() {
    world_.advance();
    ++revision_;
}

}
