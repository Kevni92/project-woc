#pragma once

#include "core/world.hpp"

namespace woc {

using SessionId = std::uint64_t;

enum class CommandKind { acquire, release, move_to };

enum class Rejection {
    character_not_found,
    not_eligible,
    character_busy,
    not_controller,
    location_not_found,
    already_traveling,
    already_at_location,
    unreachable,
};

struct CharacterSummary {
    std::string_view id;
    std::string_view name;
    bool eligible;
    bool occupied;
    Position position;
    MovementStatus status;
    bool operator==(const CharacterSummary&) const = default;
};

struct ControlledCharacter {
    std::string_view id;
    std::int64_t cash;
    std::uint64_t position_revision;
    std::optional<std::string_view> location;
    std::optional<Travel> travel;
};

struct RoutePreview {
    std::uint64_t position_revision;
    Route route;
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
    explicit SimulationHost(const WorldDefinition& definition) : world_(definition) {}

    [[nodiscard]] SessionId connect();
    void disconnect(SessionId session);
    [[nodiscard]] std::expected<std::optional<MovementStarted>, Rejection> execute(
        SessionId session, CommandKind command, std::string_view character_id, std::string_view location = {});
    [[nodiscard]] std::expected<RoutePreview, Rejection> preview(
        SessionId session, std::string_view character_id, std::string_view location) const;
    [[nodiscard]] View view(SessionId session) const;
    [[nodiscard]] const WorldDefinition& definition() const { return world_.definition(); }
    [[nodiscard]] std::uint64_t world_tick() const { return world_.tick(); }
    [[nodiscard]] std::uint64_t revision() const { return revision_; }
    [[nodiscard]] MovementEvents advance();

private:
    [[nodiscard]] std::optional<std::size_t> character_index(std::string_view id) const;

    World world_;
    std::uint64_t revision_ = 0;
    SessionId next_session_ = 1;
    std::map<SessionId, std::optional<std::size_t>> sessions_;
    std::array<std::optional<SessionId>, World::character_count> controllers_{};
};

}
