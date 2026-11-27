#include "core/world.hpp"

namespace woc {

bool World::perform_test_action(std::size_t character) {
    auto& resident = characters_.at(character);
    if (!resident.eligible || resident.position.x >= 1000) {
        return false;
    }
    ++resident.position.x;
    resident.cash += 10;
    return true;
}

void World::advance() {
    ++tick_;
    // Walk back and forth along a four-minute route.
    const auto phase = static_cast<int>(tick_ % 4);
    characters_.back().position.x = 4 + (phase <= 2 ? phase : 4 - phase);
}

}
