#pragma once

#include "core/world.hpp"

#include <map>
#include <optional>

namespace woc {

using SessionId = std::uint64_t;

enum class CommandKind { acquire, release, test_action };

enum class Rejection {
    character_not_found,
    not_eligible,
    character_busy,
    not_controller,
    invalid_action,
};

struct CharacterSummary {
    std::string_view id;
    std::string_view name;
    bool eligible;
    bool occupied;
    Position position;
    bool operator==(const CharacterSummary&) const = default;
};

struct ControlledCharacter {
    std::string_view id;
    std::int64_t cash;
    bool operator==(const ControlledCharacter&) const = default;
};

struct View {
    std::uint64_t revision;
    std::uint64_t tick;
    std::uint64_t game_minutes;
    std::array<CharacterSummary, World::character_count> characters;
    std::optional<ControlledCharacter> controlled;
};

class SimulationHost {
public:
    [[nodiscard]] SessionId connect();
    void disconnect(SessionId session);
    [[nodiscard]] std::optional<Rejection> execute(
        SessionId session, CommandKind command, std::string_view character_id);
    [[nodiscard]] View view(SessionId session) const;
    [[nodiscard]] std::uint64_t world_tick() const { return world_.tick(); }
    void advance();

private:
    World world_;
    std::uint64_t revision_ = 0;
    SessionId next_session_ = 1;
    std::map<SessionId, std::optional<std::size_t>> sessions_;
    std::array<std::optional<SessionId>, World::character_count> controllers_{};
};

}
