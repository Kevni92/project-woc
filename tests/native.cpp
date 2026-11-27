#include "protocol/endpoint.hpp"

#include <cstdlib>
#include <iostream>
#include <nlohmann/json.hpp>

namespace {

void check(bool condition, std::string_view message) {
    if (!condition) {
        std::cerr << message << '\n';
        std::exit(1);
    }
}

void test_simulation() {
    using namespace woc;

    SimulationHost host;
    const auto left = host.connect();
    const auto right = host.connect();
    using enum CommandKind;
    check(host.execute(left, acquire, "ambient-01") == Rejection::not_eligible, "ambient acquire");
    check(!host.execute(left, acquire, "resident-ada"), "first acquire");
    check(!host.execute(right, acquire, "resident-ben"), "independent acquire");
    check(host.execute(right, acquire, "resident-ada") == Rejection::character_busy, "contended acquire");
    check(host.view(right).controlled->id == "resident-ben", "failed switch retains control");
    check(host.execute(right, test_action, "resident-ada") == Rejection::not_controller, "authorization");
    check(!host.execute(left, test_action, "resident-ada"), "authorized action");
    check(!host.execute(left, release, "resident-ada"), "release");
    check(!host.execute(right, acquire, "resident-ada"), "atomic switch");
    check(!host.view(right).characters[1].occupied, "switch frees previous character");
    check(host.view(right).controlled->cash == 110, "cash survives release");
    host.disconnect(right);
    const auto reconnect = host.connect();
    check(reconnect != right, "new session assigned");
    check(!host.execute(reconnect, acquire, "resident-ada"), "disconnect frees lease");
    check(host.view(reconnect).characters[0].position == Position{1, 0}, "position survives disconnect");
    check(host.view(reconnect).controlled->cash == 110, "cash survives disconnect");

    host.advance();
    const auto view = host.view(reconnect);
    check(view.tick == 1 && view.game_minutes == 481, "clock advance");
    check(view.characters[2].position == Position{5, 2}, "ambient routine advances");
}

void test_protocol() {
    using nlohmann::json;
    woc::protocol::Endpoint endpoint;
    endpoint.open(1);
    auto receive = [&](const json& wire) { return endpoint.receive(1, wire.dump()); };
    auto request = [](int version, const char* type, const char* id, json payload = json::object()) {
        return json{{"protocolVersion", version}, {"type", type}, {"requestId", id}, {"payload", payload}};
    };
    auto content = [](const auto& delivery) { return json::parse(delivery.message); };

    const auto invalid = endpoint.receive(1, "{invalid");
    check(content(invalid.at(0))["payload"]["code"] == "INVALID_MESSAGE", "bad JSON");
    check(content(receive(request(2, "Hello", "first")).at(0))["payload"]["code"] == "UNSUPPORTED_VERSION",
        "version check");
    check(content(receive(request(1, "SnapshotRequest", "first")).at(0))["payload"]["code"] == "HELLO_REQUIRED",
        "handshake required");

    const auto hello = receive(request(1, "Hello", "hello"));
    check(hello.size() == 2 && content(hello[0])["type"] == "Welcome"
        && content(hello[1])["type"] == "Snapshot", "welcome and initial snapshot");
    check(!content(hello[1]).contains("requestId") && content(hello[1])["streamSeq"] == 5,
        "initial snapshot has sequence but no correlation ID");

    auto acquire = request(1, "Command", "acquire", {{"action", "AcquireCharacter"}, {"characterId", "resident-ada"}});
    acquire["sessionId"] = "session-42";
    check(content(receive(acquire).at(0))["payload"]["code"] == "INVALID_MESSAGE", "reject forged session");
    acquire.erase("sessionId");
    const auto control = receive(acquire);
    check(control.size() == 2 && content(control[1])["payload"]["baseRevision"] == 0, "acquire delta");

    auto action = request(1, "Command", "action", {{"action", "TestAction"}, {"characterId", "resident-ada"}});
    check(receive(action).size() == 2, "action changes projection");
    const auto replay = receive(action);
    check(replay.size() == 1 && content(replay[0])["payload"]["revision"] == 2, "retry does not mutate");
    action["payload"]["characterId"] = "resident-ben";
    check(content(receive(action).at(0))["payload"]["code"] == "REQUEST_ID_REUSED", "detect changed retry");

    const auto update = content(endpoint.tick().at(0));
    check(update["type"] == "Delta" && update["worldTick"] == 1, "tick delta");
    check(update["payload"]["characters"].size() == 1 && update["payload"]["controlled"]["cash"] == 110,
        "delta contains changed character summaries and current private details");
}

}

int main() {
    test_simulation();
    test_protocol();
}
