#pragma once

#include "core/navigation.hpp"

#include <array>
#include <expected>
#include <map>
#include <string_view>

namespace woc {

enum class MovementStatus { idle, traveling, at_location };
enum class MoveRejection { location_not_found, already_traveling, already_at_location, unreachable };

struct Travel {
    Route route;
    std::optional<std::string_view> location;
    std::uint64_t started_at;
    Distance traveled{};
};

struct Character {
    std::string_view id;
    std::string_view name;
    bool eligible;
    std::int64_t cash;
    GraphPosition position{};
    std::uint64_t position_revision{};
    std::optional<std::string_view> location;
    std::optional<Travel> travel;

    [[nodiscard]] MovementStatus status() const;
};

struct MovementStarted {
    std::string_view character;
    NodeIndex destination;
    std::optional<std::string_view> location;
    std::uint64_t tick;
};

struct EntityArrived {
    std::string_view character;
    NodeIndex destination;
    std::optional<std::string_view> location;
    std::uint64_t tick;
};

struct MovementEvents {
    std::vector<MovementStarted> started;
    std::vector<EntityArrived> arrived;
};

inline constexpr std::array<std::string_view, 3> character_ids{"resident-ada", "resident-ben", "ambient-01"};

struct WorldDefinition {
    std::string id;
    unsigned version;
    Navigation navigation;
    NodeIndex start;
    std::map<std::string, NodeIndex, std::less<>> locations;
    std::array<GraphPosition, character_ids.size()> spawns;
    std::array<NodeIndex, 2> ambient_patrol;
};

[[nodiscard]] std::uint64_t walking_ticks(Distance length);

class World {
public:
    explicit World(WorldDefinition definition);
    World(const World&) = delete;
    World& operator=(const World&) = delete;
    static constexpr std::size_t character_count = character_ids.size();

    [[nodiscard]] const auto& characters() const { return characters_; }
    [[nodiscard]] const WorldDefinition& definition() const { return definition_; }
    [[nodiscard]] std::uint64_t tick() const { return tick_; }
    [[nodiscard]] std::uint64_t game_minutes() const { return 480 + tick_; }
    [[nodiscard]] std::expected<Route, MoveRejection> preview(
        std::size_t character, std::string_view location) const;
    [[nodiscard]] std::expected<MovementStarted, MoveRejection> move_to(
        std::size_t character, std::string_view location);
    [[nodiscard]] MovementEvents advance();

private:
    MovementStarted start(Character& character, Route route, std::optional<std::string_view> location);

    const WorldDefinition definition_;
    std::uint64_t tick_ = 0;
    std::array<Character, character_count> characters_{{
        {character_ids[0], "Ada", true, 100},
        {character_ids[1], "Ben", true, 200},
        {character_ids[2], "Passant", false, 0},
    }};
};

}
