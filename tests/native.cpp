#include "content/city.hpp"
#include "protocol/endpoint.hpp"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>
#include <stdexcept>

namespace {

using namespace woc;
using nlohmann::json;

void check(bool condition, std::string_view message) {
    if (!condition) {
        std::cerr << message << '\n';
        std::exit(1);
    }
}

Navigation test_graph() {
    return {
        {{"start", {0, 0}}, {"beta", {0, 30000}}, {"alpha", {30000, 0}},
         {"destination", {30000, 30000}}, {"isolated", {100000, 100000}}},
        {{"start-beta", 0, 1, 30000, {{0, 0}, {0, 30000}}},
         {"beta-end", 1, 3, 30000, {{0, 30000}, {30000, 30000}}},
         {"start-alpha", 0, 2, 30000, {{0, 0}, {30000, 0}}},
         {"alpha-end", 2, 3, 30000, {{30000, 0}, {30000, 30000}}},
         {"detour", 0, 3, 86056, {{0, 0}, {50000, 0}, {30000, 30000}}}},
    };
}

void test_routing() {
    const auto graph = test_graph();
    const auto shortest = graph.route({.node = 0}, 3).value();
    check(shortest.length == 60000 && shortest.legs.size() == 2, "shortest path wins");
    check(graph.edges()[shortest.legs.front().edge].id == "start-alpha",
        "equal paths use stable node ID rather than input order");
    check(graph.geometry(shortest) == std::vector<Position>{{0, 0}, {30000, 0}, {30000, 30000}},
        "geometry follows the selected corner");
    check(graph.position_on(shortest, 30000) == GraphPosition{.node = 2}, "exact junction position");
    check(graph.point(graph.position_on(shortest, 45000)) == Position{30000, 15000},
        "partial progress on second edge");
    const auto reverse = graph.route({.edge = 2, .offset = 13000}, 0).value();
    check(reverse.length == 13000 && graph.geometry(reverse) == std::vector<Position>{{13000, 0}, {0, 0}}
        && graph.point(graph.position_on(reverse, 3000)) == Position{10000, 0}, "partial edge in reverse");
    const auto forward = graph.route({.edge = 2, .offset = 13000}, 3).value();
    check(forward.length == 47000 && graph.geometry(forward).front() == Position{13000, 0},
        "partial edge forward without moving to a node");
    const auto stationary = graph.route({.node = 0}, 0).value();
    check(stationary.length == 0 && stationary.legs.empty() && graph.geometry(stationary).size() == 1,
        "start equals destination");
    check(!graph.route({.node = 0}, 4) && !graph.route({.node = 0}, 5)
        && !graph.route({.edge = 2, .offset = 31000}, 3), "reject disconnected or invalid positions");

    const WorldDefinition disconnected{"test", 2, test_graph(), 0, {{"isolated", 4}},
                                       {{{.node = 0}, {.node = 1}, {.node = 2}}}, {2, 3}};
    World world(disconnected);
    check(world.move_to(0, "isolated").error() == MoveRejection::unreachable, "unreachable destination");
}

void test_content() {
    const auto& city = content::breakwater();
    const auto& graph = city.navigation;
    check(city.version == 2 && city.locations.size() == 6 && graph.nodes()[city.start].point == Position{0, 0},
        "embedded Breakwater with six access points");
    for (const auto& [id, access] : city.locations) {
        const auto route = graph.route({.node = city.start}, access).value();
        const auto points = graph.geometry(route);
        check(route.length > 0 && points.front() == Position{0, 0} && points.back() == graph.nodes()[access].point,
            "all access points have a nonempty route");
    }
    const auto node = [&](std::string_view id) {
        return static_cast<NodeIndex>(std::ranges::find(graph.nodes(), id, &Node::id) - graph.nodes().begin());
    };
    const auto connects = [&](std::string_view from, std::string_view to, std::string_view junction) {
        const auto geometry = graph.geometry(graph.route({.node = node(from)}, node(to)).value());
        return std::ranges::find(geometry, graph.nodes().at(node(junction)).point) != geometry.end();
    };
    check(connects("j-n267-n490", "access-overlook", "j-n257-n421"), "ridge crosses West Avenue");
    check(connects("j-n451-n221", "j-n257-n421", "j-n245-n222"), "offset north junction is explicit");
    check(connects("j-353-n104", "j-n12-4", "j-n12-n103"), "shore connects to Central Street");
    check(connects("j-372-23", "j-n245-104", "j-292-23"), "library joins Civic Avenue");
    check(graph.point(city.spawns[1]) == Position{10000, 4000}, "Ben starts inside a civic edge");

    std::ifstream file("content/breakwater.json");
    const auto original = json::parse(file);
    const auto reject = [&](const auto& edit, std::string_view error) {
        auto altered = original;
        edit(altered);
        try {
            static_cast<void>(content::load_city(altered.dump()));
        } catch (const std::invalid_argument& reason) {
            check(std::string_view(reason.what()).find(error) != std::string_view::npos, error);
            return;
        }
        check(false, error);
    };
    reject([](auto& data) { data["navigation"]["edges"][0]["lengthMm"] = 0; }, "invalid length");
    reject([](auto& data) { data["navigation"]["edges"][0]["lengthMm"] = 1; }, "Incorrect navigation length");
    reject([](auto& data) { data["navigation"]["edges"][0]["path"][0] = {0, 0}; }, "Invalid navigation edge");
    reject([](auto& data) { data["navigation"]["edges"][0]["mode"] = "car"; }, "unsupported edge mode");
    reject([](auto& data) { data["navigation"]["nodes"].push_back(data["navigation"]["nodes"][0]); }, "duplicate node");
    reject([](auto& data) { data["navigation"]["edges"].push_back(data["navigation"]["edges"][0]); }, "duplicate edge");
    reject([](auto& data) { data["navigation"]["edges"].erase(0); }, "disconnected node");
    reject([](auto& data) { data["locations"][0]["access"] = "missing"; }, "unknown node");
    reject([](auto& data) { data["start"] = {1, 0}; }, "start position mismatch");
    reject([](auto& data) { data["navigation"]["spawns"]["resident-ben"]["offsetMm"] = 14000; }, "invalid spawn");
    reject([](auto& data) { data["land"][0] = {{-1, -1}, {1, -1}, {1, 1}, {-1, 1}}; }, "blocked edge");
    reject([](auto& data) {
        data["buildings"][0]["footprint"] = {{-1, 1}, {1, 1}, {1, 2}, {-1, 2}};
    }, "blocked edge");
}

void test_movement() {
    World world(content::breakwater());
    check(walking_ticks(0) == 0 && walking_ticks(66666) == 1 && walking_ticks(66667) == 2
        && walking_ticks(200000) == 3 && walking_ticks(200001) == 4, "ETA rounds once");
    for (int i = 0; i < 958; ++i) static_cast<void>(world.advance());
    check(world.game_minutes() == 1438, "depart just before midnight");
    check(world.preview(0, "missing").error() == MoveRejection::location_not_found, "unknown place");
    const auto preview = world.preview(0, "workshop").value();
    check(preview.length == 243629 && world.characters()[0].status() == MovementStatus::idle,
        "preview is read only");
    const auto departure = world.move_to(0, "workshop").value();
    check(departure.character == "resident-ada" && departure.location == "workshop"
        && departure.tick == 958 && world.characters()[0].travel->route == preview, "start event follows state");
    check(world.move_to(0, "cafe").error() == MoveRejection::already_traveling, "no rerouting in MVP");
    const auto& ada = world.characters()[0];
    const auto& graph = world.definition().navigation;
    for (const auto distance : {66666, 133333, 200000}) {
        const auto events = world.advance();
        check(std::ranges::none_of(events.arrived, [](const auto& event) { return event.character == "resident-ada"; }),
            "no premature arrival");
        check(ada.travel->traveled == distance && ada.position == graph.position_on(preview, distance), "tick progress");
        if (distance == 66666) {
            check(graph.point(ada.position) == Position{-12000, 54666}, "multiple edges within first tick");
        }
    }
    const auto arrived = world.advance().arrived;
    check(std::ranges::count(arrived, std::string_view("resident-ada"), &EntityArrived::character) == 1
        && arrived.front().location == "workshop" && arrived.front().tick == 962, "single arrival event");
    check(world.game_minutes() == 1442 && ada.status() == MovementStatus::at_location && !ada.travel
        && ada.location == "workshop" && graph.point(ada.position) == Position{26000, 225000},
        "arrival at the exact access point after midnight");
    check(world.preview(0, "workshop")->length == 0
        && world.move_to(0, "workshop").error() == MoveRejection::already_at_location, "already at destination");
    check(std::ranges::none_of(world.advance().arrived, [](const auto& event) { return event.character == "resident-ada"; })
        && ada.cash == 100, "arrival does not repeat or pay");
}

void test_simulation() {
    SimulationHost host(content::breakwater());
    const auto left = host.connect();
    const auto right = host.connect();
    using enum CommandKind;
    check(host.execute(left, acquire, "ambient-01").error() == Rejection::not_eligible, "ambient acquire");
    check(host.execute(left, acquire, "resident-ada").has_value(), "first acquire");
    check(host.execute(right, acquire, "resident-ben").has_value(), "independent acquire");
    check(host.execute(right, acquire, "resident-ada").error() == Rejection::character_busy, "contended acquire");
    check(host.view(right).controlled->id == "resident-ben", "failed switch retains control");
    check(host.execute(right, move_to, "resident-ada", "cafe").error() == Rejection::not_controller
        && host.preview(right, "resident-ada", "cafe").error() == Rejection::not_controller, "movement authorization");
    check(host.execute(left, move_to, "resident-ada", "workshop")->has_value(), "Ada departs");
    check(host.execute(right, move_to, "resident-ben", "market")->has_value(), "Ben departs independently");
    const auto events = host.advance();
    check(events.started.size() == 1 && events.started[0].character == "ambient-01"
        && host.view(left).characters[2].position == Position{70666, 4000}, "ambient uses shared movement");
    check(host.execute(left, release, "resident-ada").has_value(), "release in transit");
    check(host.execute(right, acquire, "resident-ada").has_value(), "atomic switch in transit");
    auto view = host.view(right);
    check(!view.characters[1].occupied && view.characters[1].status == MovementStatus::traveling,
        "switch frees Ben and his journey continues");
    check(view.controlled->cash == 100 && view.controlled->travel->traveled == 66666, "takeover retains travel and money");
    host.disconnect(right);
    static_cast<void>(host.advance());
    const auto reconnect = host.connect();
    check(reconnect != right && !host.view(reconnect).controlled, "new session receives no private state");
    check(host.execute(reconnect, acquire, "resident-ada").has_value(), "disconnect frees lease");
    view = host.view(reconnect);
    check(view.tick == 2 && view.game_minutes == 482 && view.controlled->travel->traveled == 133333,
        "travel and world time progress with no controller");
    check(view.characters[1].status == MovementStatus::at_location, "Ben arrives while unclaimed");
    check(host.execute(reconnect, acquire, "resident-ada").has_value(), "redundant acquire succeeds");
    check(host.view(reconnect).revision == view.revision, "redundant acquire is read only");
}

void test_protocol() {
    woc::protocol::Endpoint endpoint;
    endpoint.open(1);
    auto receive = [&](const json& wire) { return endpoint.receive(1, wire.dump()); };
    auto request = [](int version, const char* type, const char* id, json payload = json::object()) {
        return json{{"protocolVersion", version}, {"type", type}, {"requestId", id}, {"payload", payload}};
    };
    auto content = [](const auto& delivery) { return json::parse(delivery.message); };

    const auto invalid = endpoint.receive(1, "{invalid");
    check(content(invalid.at(0))["payload"]["code"] == "INVALID_MESSAGE", "bad JSON");
    const auto incompatible = content(receive(request(1, "Hello", "old")).at(0));
    check(incompatible["protocolVersion"] == 1 && incompatible["payload"]["code"] == "UNSUPPORTED_VERSION",
        "old client can read its version rejection");
    check(content(receive(request(2, "SnapshotRequest", "first")).at(0))["payload"]["code"] == "HELLO_REQUIRED",
        "handshake required");

    const auto hello = receive(request(2, "Hello", "hello"));
    check(hello.size() == 2 && content(hello[0])["type"] == "Welcome"
        && content(hello[0])["payload"]["contentVersion"] == 2
        && content(hello[1])["type"] == "Snapshot", "welcome and initial snapshot");
    check(!content(hello[1]).contains("requestId") && content(hello[1])["streamSeq"] == 5,
        "initial snapshot has sequence but no correlation ID");

    auto acquire = request(2, "Command", "acquire", {{"action", "AcquireCharacter"}, {"characterId", "resident-ada"}});
    acquire["sessionId"] = "session-42";
    check(content(receive(acquire).at(0))["payload"]["code"] == "INVALID_MESSAGE", "reject forged session");
    acquire.erase("sessionId");
    const auto control = receive(acquire);
    check(control.size() == 2 && content(control[1])["payload"]["baseRevision"] == 0, "acquire delta");

    auto booking = json{{"characterId", "resident-ada"}, {"locationId", "workshop"}};
    const auto preview = receive(request(2, "RoutePreview", "preview", booking));
    check(preview.size() == 1 && content(preview[0])["payload"]["positionRevision"] == 0, "read-only preview");
    booking["action"] = "MoveTo";
    auto action = request(2, "Command", "action", booking);
    action["payload"]["durationTicks"] = 0;
    check(content(receive(action).at(0))["payload"]["code"] == "INVALID_MESSAGE", "reject client time");
    action["payload"].erase("durationTicks");
    const auto departure = receive(action);
    check(departure.size() == 2 && content(departure[1])["payload"]["controlled"]["travel"]["route"]
        == content(preview[0])["payload"]["route"], "authoritative departure matches fresh preview");
    const auto replay = receive(action);
    check(replay.size() == 1 && content(replay[0])["payload"]["revision"] == 2, "retry does not mutate");
    action["payload"]["locationId"] = "cafe";
    check(content(receive(action).at(0))["payload"]["code"] == "REQUEST_ID_REUSED", "detect changed destination retry");
    action["payload"]["locationId"] = "workshop";
    action["payload"]["characterId"] = "resident-ben";
    check(content(receive(action).at(0))["payload"]["code"] == "REQUEST_ID_REUSED", "detect changed character retry");

    const auto update = content(endpoint.tick().at(0));
    const auto payload = update["payload"];
    check(update["type"] == "Delta" && update["worldTick"] == 1, "tick delta");
    check(payload["characters"].size() == 2 && payload["controlled"]["cash"] == 100
        && payload["controlled"]["travel"]["remainingTicks"] == 3, "delta updates changed public and private data");
}

}

int main() {
    test_routing();
    test_content();
    test_movement();
    test_simulation();
    test_protocol();
}
