#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace woc {

struct Position {
    int x;
    int z;
    bool operator==(const Position&) const = default;
};

struct Character {
    std::string_view id;
    std::string_view name;
    bool eligible;
    Position position;
    std::int64_t cash;
};

class World {
public:
    static constexpr std::size_t character_count = 3;
    [[nodiscard]] const std::array<Character, character_count>& characters() const { return characters_; }
    [[nodiscard]] std::uint64_t tick() const { return tick_; }
    [[nodiscard]] std::uint64_t game_minutes() const { return 480 + tick_; }

    bool perform_test_action(std::size_t character);
    void advance();

private:
    std::uint64_t tick_ = 0;
    std::array<Character, character_count> characters_{{
        {"resident-ada", "Ada", true, {0, 0}, 100},
        {"resident-ben", "Ben", true, {10, 5}, 200},
        {"ambient-01", "Passant", false, {4, 2}, 0},
    }};
};

}
