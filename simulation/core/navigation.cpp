#include "core/navigation.hpp"

#include <algorithm>
#include <cstdlib>
#include <functional>
#include <limits>
#include <queue>
#include <set>
#include <stdexcept>
#include <string_view>
#include <tuple>
#include <utility>

namespace woc {
namespace {

// All coordinates are limited to +/-10 km. Squared distances and interpolation
// products fit in signed 64 bits with this bound.
constexpr Distance coordinate_limit = 10'000'000;

bool valid_point(Position p) {
    return p.x >= -coordinate_limit && p.x <= coordinate_limit
        && p.z >= -coordinate_limit && p.z <= coordinate_limit;
}

Distance rounded_length(Position from, Position to) {
    const auto x = to.x - from.x;
    const auto z = to.z - from.z;
    const auto squared = x * x + z * z;
    Distance low = 0;
    Distance high = 4 * coordinate_limit + 1;
    while (high - low > 1) {
        const auto middle = (low + high) / 2;
        if (middle * middle <= squared) low = middle;
        else high = middle;
    }
    return squared - low * low > low ? low + 1 : low;
}

Position edge_point(const Edge& edge, const std::vector<Distance>& offsets, Distance offset) {
    if (offset == edge.length) return edge.path.back();
    const auto next = std::upper_bound(offsets.begin(), offsets.end(), offset) - offsets.begin();
    const auto distance = offset - offsets[next - 1];
    const auto length = offsets[next] - offsets[next - 1];
    const auto a = edge.path[next - 1];
    const auto b = edge.path[next];
    return {a.x + (b.x - a.x) * distance / length, a.z + (b.z - a.z) * distance / length};
}

}

Navigation::Navigation(std::vector<Node> nodes, std::vector<Edge> edges)
    : nodes_(std::move(nodes)), edges_(std::move(edges)), adjacent_(nodes_.size()) {
    if (nodes_.empty()) throw std::invalid_argument("Navigation has no nodes");
    std::set<std::string> ids;
    for (const auto& node : nodes_) {
        if (node.id.empty() || !ids.insert(node.id).second || !valid_point(node.point)) {
            throw std::invalid_argument("Invalid navigation node: " + node.id);
        }
    }
    for (EdgeIndex i = 0; i < edges_.size(); ++i) {
        const auto& edge = edges_[i];
        if (edge.id.empty() || !ids.insert(edge.id).second
            || edge.a >= nodes_.size() || edge.b >= nodes_.size() || edge.a == edge.b
            || edge.path.size() < 2 || edge.path.front() != nodes_[edge.a].point
            || edge.path.back() != nodes_[edge.b].point
            || !std::ranges::all_of(edge.path, valid_point)) {
            throw std::invalid_argument("Invalid navigation edge: " + edge.id);
        }
        auto& offsets = offsets_.emplace_back(1, 0);
        for (std::size_t p = 1; p < edge.path.size(); ++p) {
            const auto length = rounded_length(edge.path[p - 1], edge.path[p]);
            if (!length || offsets.back() > std::numeric_limits<Distance>::max() - length) {
                throw std::invalid_argument("Invalid navigation segment: " + edge.id);
            }
            offsets.push_back(offsets.back() + length);
        }
        if (edge.length != offsets.back()) {
            throw std::invalid_argument("Incorrect navigation length: " + edge.id);
        }
        adjacent_[edge.a].push_back(i);
        adjacent_[edge.b].push_back(i);
    }
    for (auto& edges_at_node : adjacent_) {
        std::ranges::sort(edges_at_node, {}, [&](EdgeIndex i) { return edges_[i].id; });
    }
}

bool Navigation::valid(GraphPosition position) const {
    if (!position.edge) return position.node < nodes_.size() && position.offset == 0;
    return *position.edge < edges_.size() && position.offset > 0
        && position.offset < edges_[*position.edge].length;
}

std::vector<bool> Navigation::reachable_from(NodeIndex start) const {
    std::vector<bool> visited(nodes_.size());
    std::vector<NodeIndex> frontier{start};
    visited.at(start) = true;
    while (!frontier.empty()) {
        const auto head = frontier.back();
        frontier.pop_back();
        for (auto index : adjacent_[head]) {
            const auto& edge = edges_[index];
            const auto neighbor = edge.a == head ? edge.b : edge.a;
            if (!visited[neighbor]) {
                visited[neighbor] = true;
                frontier.push_back(neighbor);
            }
        }
    }
    return visited;
}

Position Navigation::point(GraphPosition position) const {
    if (!position.edge) return nodes_[position.node].point;
    const auto edge = *position.edge;
    return edge_point(edges_[edge], offsets_[edge], position.offset);
}

std::optional<Route> Navigation::route(GraphPosition from, NodeIndex to) const {
    if (!valid(from) || to >= nodes_.size()) return std::nullopt;

    constexpr auto infinity = std::numeric_limits<Distance>::max();
    std::vector<Distance> distances(nodes_.size(), infinity);
    struct Previous {
        Leg leg;
        std::optional<NodeIndex> node;
    };
    std::vector<std::optional<Previous>> previous(nodes_.size());
    // At equal distance, visit the lexicographically first node ID. Edges are
    // examined in ID order. The first path of a given cost keeps its predecessor.
    using QueueEntry = std::tuple<Distance, std::string_view, NodeIndex>;
    std::priority_queue<QueueEntry, std::vector<QueueEntry>, std::greater<>> frontier;
    const auto relax = [&](NodeIndex node, Distance length, std::optional<Previous> step) {
        if (length >= distances[node]) return;
        distances[node] = length;
        previous[node] = step;
        frontier.emplace(length, nodes_[node].id, node);
    };
    if (from.edge) {
        const auto& edge = edges_[*from.edge];
        relax(edge.a, from.offset, Previous{{*from.edge, from.offset, 0}, std::nullopt});
        relax(edge.b, edge.length - from.offset,
            Previous{{*from.edge, from.offset, edge.length}, std::nullopt});
    } else {
        relax(from.node, 0, std::nullopt);
    }

    while (!frontier.empty()) {
        const auto [distance, id, node] = frontier.top();
        frontier.pop();
        if (distance != distances[node]) continue;
        if (node == to) break;
        for (const auto index : adjacent_[node]) {
            const auto& edge = edges_[index];
            if (distance > infinity - edge.length) continue;
            const bool forward = edge.a == node;
            const Leg leg{index, forward ? 0 : edge.length, forward ? edge.length : 0};
            relax(forward ? edge.b : edge.a, distance + edge.length, Previous{leg, node});
        }
    }
    if (distances[to] == infinity) return std::nullopt;

    Route result{to, distances[to], {}};
    for (auto node = std::optional{to}; node && previous[*node]; node = previous[*node]->node) {
        result.legs.push_back(previous[*node]->leg);
    }
    std::ranges::reverse(result.legs);
    return result;
}

GraphPosition Navigation::position_on(const Route& route, Distance traveled) const {
    for (const auto& leg : route.legs) {
        const auto length = std::abs(leg.to - leg.from);
        if (traveled < length) {
            const auto& edge = edges_[leg.edge];
            const auto offset = leg.from + (leg.from < leg.to ? traveled : -traveled);
            if (offset == 0) return {.node = edge.a};
            if (offset == edge.length) return {.node = edge.b};
            return {.edge = leg.edge, .offset = offset};
        }
        traveled -= length;
    }
    return {.node = route.destination};
}

std::vector<Position> Navigation::geometry(const Route& route) const {
    if (route.legs.empty()) return {nodes_[route.destination].point};
    std::vector<Position> points;
    for (const auto& leg : route.legs) {
        const auto& edge = edges_[leg.edge];
        const auto& offsets = offsets_[leg.edge];
        if (points.empty()) points.push_back(edge_point(edge, offsets, leg.from));
        if (leg.from < leg.to) {
            for (std::size_t p = 1; p + 1 < offsets.size(); ++p) {
                if (leg.from < offsets[p] && offsets[p] < leg.to) points.push_back(edge.path[p]);
            }
        } else {
            for (std::size_t p = offsets.size() - 2; p > 0; --p) {
                if (leg.to < offsets[p] && offsets[p] < leg.from) points.push_back(edge.path[p]);
            }
        }
        points.push_back(edge_point(edge, offsets, leg.to));
    }
    return points;
}

}
