#include "content/city.hpp"
#include "breakwater_json.hpp"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <set>
#include <stdexcept>
#include <utility>

namespace woc::content {
namespace {

using Json = nlohmann::json;
using Polygon = std::vector<Position>;
constexpr unsigned content_version = 2;

void require(bool condition, const std::string& message) {
    if (!condition) throw std::invalid_argument("Invalid city: " + message);
}

std::string identifier(const Json& value) {
    const auto id = value.get<std::string>();
    constexpr std::string_view characters = "abcdefghijklmnopqrstuvwxyz0123456789-";
    require(!id.empty() && id.size() <= 64 && id.front() != '-' && id.back() != '-'
        && id.find("--") == std::string::npos && id.find_first_not_of(characters) == std::string::npos,
        "invalid ID " + id);
    return id;
}

Distance millimeters(const Json& value) {
    const auto meters = value.get<double>();
    require(std::isfinite(meters) && std::abs(meters) <= 10'000, "coordinate out of range");
    const auto scaled = meters * 1000;
    const auto rounded = std::llround(scaled);
    require(std::abs(scaled - rounded) <= 1e-6, "coordinate precision exceeds one millimeter");
    return rounded;
}

Position point(const Json& value) {
    require(value.is_array() && value.size() == 2, "invalid point");
    return {millimeters(value.at(0)), millimeters(value.at(1))};
}

std::vector<Position> points(const Json& value) {
    require(value.is_array(), "invalid point list");
    std::vector<Position> result;
    for (const auto& entry : value) result.push_back(point(entry));
    return result;
}

Distance positive_length(const Json& value) {
    require(value.is_number_integer() && value > 0 && value <= 1'000'000'000, "invalid length or offset");
    return value.get<Distance>();
}

Distance cross(Position a, Position b) {
    return a.x * b.z - a.z * b.x;
}

Position difference(Position a, Position b) {
    return {a.x - b.x, a.z - b.z};
}

bool inside(const Polygon& polygon, double x, double z, bool include_boundary) {
    bool interior = false;
    for (std::size_t i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
        const auto [ax, az] = polygon[j];
        const auto [bx, bz] = polygon[i];
        const auto area = (bx - ax) * (z - az) - (bz - az) * (x - ax);
        if (std::abs(area) <= 1e-4 && x >= std::min(ax, bx) && x <= std::max(ax, bx)
            && z >= std::min(az, bz) && z <= std::max(az, bz)) {
            return include_boundary;
        }
        if ((az > z) != (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) {
            interior = !interior;
        }
    }
    return interior;
}

// Between polygon boundary intersections, land/building membership is constant.
// Test the cuts too so a route cannot touch a building or end in the water.
bool walkable(Position a, Position b, const std::vector<Polygon>& land,
              const std::vector<Polygon>& buildings) {
    std::vector<double> cuts{0, 1};
    const auto along = difference(b, a);
    const auto add_cuts = [&](const Polygon& polygon) {
        for (std::size_t i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
            const auto side = difference(polygon[i], polygon[j]);
            const auto start = difference(polygon[j], a);
            const auto denominator = cross(along, side);
            if (denominator != 0) {
                const auto t = static_cast<double>(cross(start, side)) / denominator;
                const auto u = static_cast<double>(cross(start, along)) / denominator;
                if (0 < t && t < 1 && 0 <= u && u <= 1) cuts.push_back(t);
            } else if (cross(start, along) == 0) {
                for (const auto end : {polygon[j], polygon[i]}) {
                    const auto offset = difference(end, a);
                    const auto t = along.x ? static_cast<double>(offset.x) / along.x
                                           : static_cast<double>(offset.z) / along.z;
                    if (0 < t && t < 1) cuts.push_back(t);
                }
            }
        }
    };
    for (const auto& polygon : land) add_cuts(polygon);
    for (const auto& polygon : buildings) add_cuts(polygon);
    std::ranges::sort(cuts);
    const auto allowed = [&](double t) {
        const auto x = a.x + t * along.x;
        const auto z = a.z + t * along.z;
        return std::ranges::any_of(land, [&](const auto& polygon) { return inside(polygon, x, z, true); })
            && std::ranges::none_of(buildings, [&](const auto& polygon) { return inside(polygon, x, z, true); });
    };
    if (!allowed(cuts.front())) return false;
    for (std::size_t i = 1; i < cuts.size(); ++i) {
        if (!allowed(cuts[i]) || !allowed((cuts[i - 1] + cuts[i]) / 2)) return false;
    }
    return true;
}

}

WorldDefinition load_city(std::string_view source) {
    const auto city = Json::parse(source);
    require(city.at("version") == content_version, "unsupported content version");
    const auto& graph = city.at("navigation");
    require(graph.at("nodes").is_array() && graph.at("edges").is_array(), "invalid navigation lists");
    require(city.at("land").is_array() && city.at("buildings").is_array()
        && city.at("locations").is_array(), "invalid geography lists");

    std::vector<Node> nodes;
    std::vector<Edge> edges;
    std::map<std::string, NodeIndex, std::less<>> node_ids;
    std::map<std::string, EdgeIndex, std::less<>> edge_ids;
    std::set<std::pair<Distance, Distance>> node_points;
    for (const auto& node : graph.at("nodes")) {
        const auto id = identifier(node.at("id"));
        const auto position = point(node.at("position"));
        require(node_ids.emplace(id, nodes.size()).second, "duplicate node " + id);
        require(node_points.emplace(position.x, position.z).second, "duplicate node position " + id);
        nodes.push_back({id, position});
    }
    const auto node_index = [&](const Json& id) {
        const auto key = identifier(id);
        const auto found = node_ids.find(key);
        require(found != node_ids.end(), "unknown node " + key);
        return found->second;
    };
    for (const auto& edge : graph.at("edges")) {
        const auto id = identifier(edge.at("id"));
        require(edge_ids.emplace(id, edges.size()).second, "duplicate edge " + id);
        require(edge.at("mode") == "foot", "unsupported edge mode " + id);
        edges.push_back({id, node_index(edge.at("a")), node_index(edge.at("b")),
                         positive_length(edge.at("lengthMm")), points(edge.at("path"))});
    }

    Navigation navigation(std::move(nodes), std::move(edges));
    std::vector<Polygon> land;
    std::vector<Polygon> buildings;
    for (const auto& polygon : city.at("land")) land.push_back(points(polygon));
    for (const auto& building : city.at("buildings")) buildings.push_back(points(building.at("footprint")));
    require(!land.empty() && std::ranges::all_of(land, [](const auto& p) { return p.size() >= 3; })
        && std::ranges::all_of(buildings, [](const auto& p) { return p.size() >= 3; }), "invalid polygons");
    for (const auto& edge : navigation.edges()) {
        for (std::size_t i = 1; i < edge.path.size(); ++i) {
            require(walkable(edge.path[i - 1], edge.path[i], land, buildings), "blocked edge " + edge.id);
        }
    }

    const auto start = node_index(graph.at("start"));
    require(navigation.nodes()[start].point == point(city.at("start")), "start position mismatch");
    require(!navigation.edges().empty(), "no walking edges");
    for (NodeIndex i = 0; i < navigation.nodes().size(); ++i) {
        require(navigation.route({.node = start}, i).has_value(),
            "disconnected node " + navigation.nodes()[i].id);
    }

    std::map<std::string, NodeIndex, std::less<>> locations;
    std::set<NodeIndex> accesses;
    for (const auto& location : city.at("locations")) {
        const auto id = identifier(location.at("id"));
        const auto access = node_index(location.at("access"));
        require(locations.emplace(id, access).second, "duplicate location " + id);
        require(accesses.insert(access).second, "duplicate location access " + id);
    }
    require(!locations.empty(), "no location accesses");

    const auto& spawns = graph.at("spawns");
    std::array<GraphPosition, character_ids.size()> spawn_positions{};
    require(spawns.is_object() && spawns.size() == spawn_positions.size(), "invalid spawn list");
    for (std::size_t i = 0; i < character_ids.size(); ++i) {
        const auto& spawn = spawns.at(character_ids[i]);
        if (spawn.is_object() && spawn.size() == 1 && spawn.contains("node")) {
            spawn_positions[i] = {.node = node_index(spawn.at("node"))};
        } else {
            require(spawn.is_object() && spawn.size() == 2, "invalid spawn shape");
            const auto edge = identifier(spawn.at("edge"));
            const auto index = edge_ids.find(edge);
            require(index != edge_ids.end(), "unknown spawn edge " + edge);
            spawn_positions[i] = {.edge = index->second, .offset = positive_length(spawn.at("offsetMm"))};
        }
        require(navigation.valid(spawn_positions[i]), "invalid spawn position");
    }

    const auto& patrol = graph.at("ambientPatrol");
    require(patrol.is_array() && patrol.size() == 2, "invalid ambient patrol");
    const std::array waypoints{node_index(patrol.at(0)), node_index(patrol.at(1))};
    require(waypoints[0] != waypoints[1] && spawn_positions.back() == GraphPosition{.node = waypoints[0]},
        "invalid ambient start or waypoint");
    return {identifier(city.at("id")), content_version, std::move(navigation), start, std::move(locations),
            spawn_positions, waypoints};
}

const WorldDefinition& breakwater() {
    static const auto definition = load_city({
        reinterpret_cast<const char*>(breakwater_json), sizeof(breakwater_json),
    });
    return definition;
}

}
