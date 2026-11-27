#include "core/world.hpp"

#include <utility>

namespace woc {
namespace {

// 4 km/h = 200,000/3 mm per game minute. The remainder carries across
// ticks and route legs because the budget is measured from departure.
constexpr Distance walking_numerator = 200'000;
constexpr Distance walking_denominator = 3;

}

std::uint64_t walking_ticks(Distance length) {
    return (length / walking_numerator) * walking_denominator
        + (length % walking_numerator * walking_denominator + walking_numerator - 1) / walking_numerator;
}

MovementStatus Character::status() const {
    if (travel) return MovementStatus::traveling;
    return location ? MovementStatus::at_location : MovementStatus::idle;
}

World::World(WorldDefinition definition) : definition_(std::move(definition)) {
    for (std::size_t i = 0; i < characters_.size(); ++i) {
        characters_[i].position = definition_.spawns[i];
        for (const auto& [id, access] : definition_.locations) {
            if (characters_[i].position == GraphPosition{.node = access}) {
                characters_[i].location = id;
                break;
            }
        }
    }
}

std::expected<Route, MoveRejection> World::preview(std::size_t index, std::string_view location) const {
    const auto& character = characters_.at(index);
    if (character.travel) return std::unexpected(MoveRejection::already_traveling);
    const auto target = definition_.locations.find(location);
    if (target == definition_.locations.end()) return std::unexpected(MoveRejection::location_not_found);
    auto route = definition_.navigation.route(character.position, target->second);
    if (!route) return std::unexpected(MoveRejection::unreachable);
    return std::move(*route);
}

MovementStarted World::start(Character& character, Route route, std::optional<std::string_view> location) {
    const auto destination = route.destination;
    character.location.reset();
    character.travel.emplace(std::move(route), location, tick_, 0);
    ++character.position_revision;
    return {character.id, destination, location, tick_};
}

std::expected<MovementStarted, MoveRejection> World::move_to(std::size_t index, std::string_view location) {
    auto route = preview(index, location);
    if (!route) return std::unexpected(route.error());
    if (!route->length) return std::unexpected(MoveRejection::already_at_location);
    return start(characters_.at(index), std::move(*route), definition_.locations.find(location)->first);
}

MovementEvents World::advance() {
    MovementEvents events;
    auto& ambient = characters_.back();
    if (!ambient.travel) {
        const auto& [a, b] = definition_.ambient_patrol;
        const auto next = ambient.position == GraphPosition{.node = a} ? b : a;
        if (auto route = definition_.navigation.route(ambient.position, next); route && route->length) {
            events.started.push_back(start(ambient, std::move(*route), std::nullopt));
        }
    }

    ++tick_;
    for (auto& character : characters_) {
        if (!character.travel) continue;
        auto& trip = *character.travel;
        const auto elapsed = tick_ - trip.started_at;
        const bool arrived = elapsed >= walking_ticks(trip.route.length);
        trip.traveled = arrived ? trip.route.length
            : static_cast<Distance>(elapsed / walking_denominator) * walking_numerator
                + (elapsed % walking_denominator) * walking_numerator / walking_denominator;
        character.position = definition_.navigation.position_on(trip.route, trip.traveled);
        ++character.position_revision;
        if (arrived) {
            const EntityArrived event{character.id, trip.route.destination, trip.location, tick_};
            character.location = trip.location;
            character.travel.reset();
            events.arrived.push_back(event);
        }
    }
    return events;
}

}
