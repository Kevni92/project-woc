#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace woc {

using Distance = std::int64_t; // Millimeters.
using NodeIndex = std::size_t;
using EdgeIndex = std::size_t;

struct Position {
    Distance x;
    Distance z;
    bool operator==(const Position&) const = default;
};

struct Node {
    std::string id;
    Position point;
};

struct Edge {
    std::string id;
    NodeIndex a;
    NodeIndex b;
    Distance length;
    std::vector<Position> path;
};

struct GraphPosition {
    NodeIndex node{};
    std::optional<EdgeIndex> edge;
    Distance offset{}; // From a toward b along the edge polyline.
    bool operator==(const GraphPosition&) const = default;
};

struct Leg {
    EdgeIndex edge;
    Distance from;
    Distance to;
    bool operator==(const Leg&) const = default;
};

struct Route {
    NodeIndex destination;
    Distance length{};
    std::vector<Leg> legs;
    bool operator==(const Route&) const = default;
};

class Navigation {
public:
    Navigation(std::vector<Node> nodes, std::vector<Edge> edges);
    [[nodiscard]] const auto& nodes() const { return nodes_; }
    [[nodiscard]] const auto& edges() const { return edges_; }

    [[nodiscard]] bool valid(GraphPosition position) const;
    [[nodiscard]] Position point(GraphPosition position) const;
    [[nodiscard]] std::optional<Route> route(GraphPosition from, NodeIndex to) const;
    [[nodiscard]] GraphPosition position_on(const Route& route, Distance traveled) const;
    [[nodiscard]] std::vector<Position> geometry(const Route& route) const;

private:
    std::vector<Node> nodes_;
    std::vector<Edge> edges_;
    std::vector<std::vector<EdgeIndex>> adjacent_;
    std::vector<std::vector<Distance>> offsets_;
};

}
