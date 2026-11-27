#include "content/city.hpp"
#include "content/area_geometry.hpp"
#include "schemas.hpp"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <nlohmann/json-schema.hpp>
#include <set>
#include <stdexcept>
#include <utility>

namespace woc::content {
namespace {

using Json = nlohmann::json;
using Polygon = std::vector<Position>;

void require(bool condition, std::string_view message) {
    if (!condition) throw std::invalid_argument("Invalid city: " + std::string(message));
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

bool intersects(Position a, Position b, Position c, Position d) {
    if (std::max(a.x, b.x) < std::min(c.x, d.x) || std::max(c.x, d.x) < std::min(a.x, b.x)
        || std::max(a.z, b.z) < std::min(c.z, d.z) || std::max(c.z, d.z) < std::min(a.z, b.z)) return false;
    const auto same_side = [](Position start, Position end, Position p, Position q) {
        const auto along = difference(end, start);
        const auto side_p = cross(along, difference(p, start));
        const auto side_q = cross(along, difference(q, start));
        return (side_p > 0 && side_q > 0) || (side_p < 0 && side_q < 0);
    };
    return !same_side(a, b, c, d) && !same_side(c, d, a, b);
}

void validate_polygon(const Polygon& polygon) {
    std::vector<Box> boxes;
    for (std::size_t i = 0; i < polygon.size(); ++i) {
        boxes.push_back(Segment{polygon[i], polygon[(i + 1) % polygon.size()]}.bounds());
    }
    const SpatialIndex index(std::move(boxes));
    double area = 0;
    for (std::size_t i = 0; i < polygon.size(); ++i) {
        const auto a = polygon[i];
        const auto b = polygon[(i + 1) % polygon.size()];
        const auto c = polygon[(i + 2) % polygon.size()];
        const auto along = difference(b, a);
        const auto next = difference(c, b);
        require(a != b && (cross(along, next) != 0 || along.x * next.x + along.z * next.z > 0),
            "invalid polygon segment");
        area += cross(a, b);
        index.query(Segment{a, b}.bounds(), [&](auto j) {
            if (j < i + 2 || (i == 0 && j == polygon.size() - 1)) return;
            require(!intersects(a, b, polygon[j], polygon[(j + 1) % polygon.size()]), "intersecting polygon segments");
        });
    }
    require(area != 0, "polygon without area");
}

AreaBoundary ring_boundary(const Json& ring, const Box& bounds) {
    const auto polygon = points(ring);
    for (auto p : polygon) require(bounds.contains(p.x, p.z), "ring outside world bounds");
    validate_polygon(polygon);
    std::vector<Segment> edges;
    for (std::size_t i = 0; i < polygon.size(); ++i) {
        edges.push_back({polygon[i], polygon[(i + 1) % polygon.size()]});
    }
    return AreaBoundary(std::move(edges));
}

bool shared_line(Segment a, Segment b) {
    const auto direction = difference(a.b, a.a);
    if (cross(direction, difference(b.a, a.a)) || cross(direction, difference(b.b, a.a))) return false;
    const auto x = a.bounds();
    const auto y = b.bounds();
    return std::max(x.min_x, y.min_x) < std::min(x.max_x, y.max_x)
        || std::max(x.min_z, y.min_z) < std::min(x.max_z, y.max_z);
}

bool shares_line(const AreaBoundary& a, const AreaBoundary& b) {
    return std::ranges::any_of(a.edges(), [&](auto edge) {
        bool shared = false;
        b.nearby(edge, [&](auto i) { shared = shared || shared_line(edge, b.edges()[i]); });
        return shared;
    });
}

bool overlaps(const AreaBoundary& a, const AreaBoundary& b) {
    if (a.has_interior_on(b) || b.has_interior_on(a)) return true;
    return std::ranges::any_of(a.edges(), [&](auto edge) {
        bool overlap = false;
        b.nearby(edge, [&](auto i) {
            const auto other = b.edges()[i];
            if (!shared_line(edge, other)) return;
            const auto span = edge.bounds();
            const auto range = other.bounds();
            const auto x = (std::max(span.min_x, range.min_x) + std::min(span.max_x, range.max_x)) / 2;
            const auto z = (std::max(span.min_z, range.min_z) + std::min(span.max_z, range.max_z)) / 2;
            const auto delta = difference(edge.b, edge.a);
            const auto step = 1e-4 / std::hypot(delta.x, delta.z);
            for (double sign : {-1, 1}) {
                const auto px = x + sign * step * delta.z, pz = z - sign * step * delta.x;
                overlap = overlap || (a.side(px, pz) > 0 && b.side(px, pz) > 0);
            }
        });
        return overlap;
    });
}

SpatialIndex index_areas(const std::vector<AreaBoundary>& areas) {
    std::vector<Box> boxes;
    for (const auto& area : areas) boxes.push_back(area.bounds());
    return SpatialIndex(std::move(boxes));
}

void validate_disjoint(const std::vector<AreaBoundary>& areas) {
    const auto index = index_areas(areas);
    for (std::size_t i = 0; i < areas.size(); ++i) {
        const auto& a = areas[i];
        index.query(a.bounds(), [&](auto j) {
            if (j <= i) return;
            const auto& b = areas[j];
            require(!a.has_interior_on(b) && !b.has_interior_on(a) && !shares_line(a, b),
                "overlapping polygon parts or holes");
        });
    }
}

AreaBoundary area_boundary(const Json& area, const Box& bounds) {
    std::vector<AreaBoundary> parts;
    std::vector<Segment> area_edges;
    for (const auto& part : area.at("polygons")) {
        const auto outer = ring_boundary(part.at("outer"), bounds);
        std::vector<AreaBoundary> holes;
        auto edges = outer.edges();
        for (const auto& ring : part.at("holes")) {
            auto hole = ring_boundary(ring, bounds);
            require(outer.covers(hole) && !shares_line(outer, hole), "hole outside polygon");
            edges.insert(edges.end(), hole.edges().begin(), hole.edges().end());
            holes.push_back(std::move(hole));
        }
        validate_disjoint(holes);
        area_edges.insert(area_edges.end(), edges.begin(), edges.end());
        parts.emplace_back(std::move(edges));
    }
    validate_disjoint(parts);
    return AreaBoundary(std::move(area_edges));
}

void validate_geography(const Json& city, const Navigation& navigation,
                        const std::vector<Polygon>& land, const std::vector<Polygon>& buildings) {
    const auto& bounds = city.at("bounds");
    const auto min_x = millimeters(bounds.at("minX"));
    const auto max_x = millimeters(bounds.at("maxX"));
    const auto min_z = millimeters(bounds.at("minZ"));
    const auto max_z = millimeters(bounds.at("maxZ"));
    require(min_x < max_x && min_z < max_z, "inverted bounds");
    const auto check_point = [&](Position p) {
        require(p.x >= min_x && p.x <= max_x && p.z >= min_z && p.z <= max_z, "point outside world bounds");
    };
    const auto check_polygon = [&](const Polygon& polygon) {
        for (auto p : polygon) check_point(p);
        validate_polygon(polygon);
    };
    for (const auto& polygon : land) check_polygon(polygon);
    for (const auto& polygon : buildings) check_polygon(polygon);
    const bool legacy = city.at("version") == 2;
    if (legacy) for (const auto& polygon : city.at("greens")) check_polygon(points(polygon));
    check_point(point(city.at("start")));
    if (city.contains("waterLabel")) check_point(point(city.at("waterLabel").at("position")));

    std::set<std::string> ids{identifier(city.at("id"))};
    const auto add_id = [&](const std::string& id) {
        require(ids.insert(id).second, "duplicate geography ID " + id);
    };
    std::set<std::string> districts;
    for (const auto& district : city.at("districts")) {
        const auto id = identifier(district.at("id"));
        add_id(id);
        districts.insert(id);
        check_point(point(district.at("label")));
        if (legacy) check_polygon(points(district.at("outline")));
    }
    const auto district_id = [&](const Json& feature) {
        const auto id = identifier(feature.at("district"));
        require(districts.contains(id), "unknown district " + id);
        return id;
    };
    std::map<std::string, std::string> building_districts;
    for (const auto& building : city.at("buildings")) {
        const auto id = identifier(building.at("id"));
        add_id(id);
        building_districts.emplace(id, district_id(building));
    }
    for (const auto& location : city.at("locations")) {
        add_id(identifier(location.at("id")));
        check_point(point(location.at("position")));
        const auto district = district_id(location);
        if (location.contains("building")) {
            const auto building = building_districts.find(identifier(location.at("building")));
            require(building != building_districts.end() && building->second == district, "invalid location building reference");
        }
    }
    for (const auto& road : city.at("roads")) {
        add_id(identifier(road.at("id")));
        const auto path = points(road.at("path"));
        for (auto p : path) check_point(p);
        require(std::adjacent_find(path.begin(), path.end()) == path.end(), "road has a zero length segment");
    }
    for (const auto& node : navigation.nodes()) {
        add_id(node.id);
        check_point(node.point);
    }
    for (const auto& edge : navigation.edges()) {
        add_id(edge.id);
        for (auto p : edge.path) check_point(p);
    }
}

Box city_bounds(const Json& city) {
    const auto& bounds = city.at("bounds");
    return {static_cast<double>(millimeters(bounds.at("minX"))), static_cast<double>(millimeters(bounds.at("minZ"))),
            static_cast<double>(millimeters(bounds.at("maxX"))), static_cast<double>(millimeters(bounds.at("maxZ")))};
}

void validate_city_v3(const Json& city, const Navigation& navigation) {
    const auto box = city_bounds(city);
    const auto aoi = area_boundary(city.at("aoi"), box);
    const auto land = area_boundary(city.at("land"), box);
    require(aoi.covers(land), "land outside AOI");
    std::vector<AreaBoundary> buildings;
    for (const auto& building : city.at("buildings")) {
        auto footprint = area_boundary(building.at("footprint"), box);
        require(land.covers(footprint), "building outside land");
        buildings.push_back(std::move(footprint));
    }
    const auto building_index = index_areas(buildings);
    for (const auto& green : city.at("greens")) require(land.covers(area_boundary(green, box)), "green outside land");
    for (const auto& district : city.at("districts")) {
        const auto outline = area_boundary(district.at("outline"), box);
        const auto label = point(district.at("label"));
        require(land.covers(outline) && outline.side(label.x, label.z) >= 0, "district outside land or label outside district");
    }
    for (const auto& location : city.at("locations")) {
        const auto p = point(location.at("position"));
        require(land.side(p.x, p.z) >= 0, "location outside land");
    }
    for (const auto& road : city.at("roads")) {
        const auto path = points(road.at("path"));
        for (std::size_t i = 1; i < path.size(); ++i) {
            require(aoi.covers(Segment{path[i - 1], path[i]}), "road outside AOI");
        }
    }
    for (const auto& edge : navigation.edges()) {
        for (std::size_t i = 1; i < edge.path.size(); ++i) {
            const Segment segment{edge.path[i - 1], edge.path[i]};
            require(land.covers(segment), "edge outside land: " + edge.id);
            building_index.query(segment.bounds(), [&](auto j) {
                const auto& building = buildings[j];
                std::vector<double> cuts;
                building.cuts(segment, cuts);
                require(along_segment(segment, std::move(cuts), [&](double x, double z) {
                    return building.side(x, z) < 0;
                }), "blocked edge " + edge.id);
            });
        }
    }
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

Json validate_city_json(std::string_view source) {
    static const nlohmann::json_schema::json_validator validator(Json::parse(schemas::city));
    static const nlohmann::json_schema::json_validator validator_v3(Json::parse(schemas::city_v3));
    try {
        auto city = Json::parse(source);
        (city.is_object() && city.value("version", 0) == 3 ? validator_v3 : validator).validate(city);
        return city;
    } catch (const std::exception& error) {
        throw std::invalid_argument(std::string("Invalid city schema: ") + error.what());
    }
}

WorldDefinition load_city(std::string_view source) {
    return parse_city(validate_city_json(source));
}

WorldDefinition parse_city(const Json& city) {
    const auto version = city.at("version").get<unsigned>();
    require(version == 2 || version == 3, "unsupported content version");
    const auto& graph = city.at("navigation");
    require(graph.at("nodes").is_array() && graph.at("edges").is_array(), "invalid navigation lists");

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
    if (version == 2) {
        for (const auto& polygon : city.at("land")) land.push_back(points(polygon));
        for (const auto& building : city.at("buildings")) buildings.push_back(points(building.at("footprint")));
    }
    validate_geography(city, navigation, land, buildings);
    if (version == 3) {
        validate_city_v3(city, navigation);
    } else {
        for (const auto& edge : navigation.edges()) {
            for (std::size_t i = 1; i < edge.path.size(); ++i) {
                require(walkable(edge.path[i - 1], edge.path[i], land, buildings), "blocked edge " + edge.id);
            }
        }
    }

    const auto start = node_index(graph.at("start"));
    require(navigation.nodes()[start].point == point(city.at("start")), "start position mismatch");
    require(!navigation.edges().empty(), "no walking edges");
    const auto reachable = navigation.reachable_from(start);
    for (NodeIndex i = 0; i < reachable.size(); ++i) {
        require(reachable[i], "disconnected node " + navigation.nodes()[i].id);
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
    return {identifier(city.at("id")), version, std::move(navigation), start, std::move(locations),
            spawn_positions, waypoints};
}

void validate_visual_v2(const Json& city, const Json& visual) {
    const auto bounds = city_bounds(city);
    const auto aoi = area_boundary(city.at("aoi"), bounds);
    const auto land = area_boundary(city.at("land"), bounds);
    std::set<std::string> ids{identifier(city.at("id"))};
    for (const auto* key : {"buildings", "roads", "districts", "locations"}) {
        for (const auto& entry : city.at(key)) ids.insert(identifier(entry.at("id")));
    }
    for (const auto* key : {"nodes", "edges"}) {
        for (const auto& entry : city.at("navigation").at(key)) ids.insert(identifier(entry.at("id")));
    }
    std::map<std::string, double> heights, widths;
    std::vector<AreaBoundary> occupied;
    for (const auto& building : city.at("buildings")) {
        heights.emplace(identifier(building.at("id")), building.at("height").get<double>());
        occupied.push_back(area_boundary(building.at("footprint"), bounds));
    }
    for (const auto& appearance : visual.at("buildings")) {
        const auto id = identifier(appearance.at("buildingId"));
        const auto building = heights.find(id);
        require(building != heights.end(), "visual building reference " + id);
        if (appearance.contains("roofHeightM")) {
            require(appearance.at("roofHeightM").get<double>() < building->second
                && appearance.value("roof", std::string("gabled")) == "gabled", "visual roof height " + id);
        }
        heights.erase(building);
    }
    for (const auto& road : city.at("roads")) widths.emplace(identifier(road.at("id")), road.at("width").get<double>());
    for (const auto& road : visual.at("roads")) {
        const auto id = identifier(road.at("roadId"));
        const auto original = widths.find(id);
        require(original != widths.end(), "visual road reference " + id);
        require(road.value("sidewalkWidthM", 0.0) * 2 <= original->second * 0.4, "visual sidewalk width " + id);
        widths.erase(original);
        auto area = area_boundary(road.at("polygon"), bounds);
        require(aoi.covers(area), "visual road outside AOI " + id);
        occupied.push_back(std::move(area));
    }
    require(widths.empty(), "missing visual road polygons");
    const auto index = index_areas(occupied);
    for (const auto& surface : visual.at("surfaces")) {
        const auto id = identifier(surface.at("id"));
        require(ids.insert(id).second, "duplicate visual ID " + id);
        const auto area = area_boundary(surface.at("polygon"), bounds);
        require(land.covers(area), "visual surface outside land " + id);
        index.query(area.bounds(), [&](auto i) {
            require(!overlaps(area, occupied[i]), "visual surface covers a road or building " + id);
        });
    }
    const std::string_view outside = city.at("boundaryMode") == "island" ? "island" : "cut";
    std::vector<Segment> coast_segments;
    for (const auto& coast : visual.at("coasts")) {
        const auto id = identifier(coast.at("id"));
        require(ids.insert(id).second, "duplicate visual ID " + id);
        const auto path = points(coast.at("path"));
        const auto kind = coast.at("kind").get<std::string>();
        for (std::size_t i = 1; i < path.size(); ++i) {
            const Segment line{path[i - 1], path[i]};
            require(line.a != line.b, "zero-length coastal segment " + id);
            std::vector<double> cuts;
            land.cuts(line, cuts);
            require(along_segment(line, std::move(cuts), [&](double x, double z) {
                return land.side(x, z) == 0;
            }), "coast outside land boundary " + id);
            aoi.cuts(line, cuts = {});
            const auto on_aoi = along_segment(line, std::move(cuts), [&](double x, double z) {
                return aoi.side(x, z) == 0;
            });
            require(kind == (on_aoi ? outside : "shore"), "coastal kind differs from AOI boundary " + id);
            coast_segments.push_back(line);
        }
    }
    require(!coast_segments.empty(), "missing coastal boundaries");
    const AreaBoundary coast(std::move(coast_segments));
    for (auto line : land.edges()) {
        std::vector<double> cuts;
        coast.cuts(line, cuts);
        require(along_segment(line, std::move(cuts), [&](double x, double z) {
            return coast.side(x, z) == 0;
        }), "incomplete coastal boundary");
    }
}

}
