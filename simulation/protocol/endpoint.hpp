#pragma once

#include "application/simulation_host.hpp"

#include <deque>
#include <string>
#include <vector>

namespace woc::protocol {

using ConnectionId = std::uint32_t;
inline constexpr std::size_t max_message_bytes = 4096;

struct Delivery {
    ConnectionId connection;
    std::string message;
};

using Deliveries = std::vector<Delivery>;

// Call from one serialized host lane. Each operation runs to completion before
// its deliveries are handed to the transport.
class Endpoint {
public:
    Endpoint();
    void open(ConnectionId connection);
    [[nodiscard]] Deliveries close(ConnectionId connection);
    [[nodiscard]] Deliveries receive(ConnectionId connection, std::string_view message);
    [[nodiscard]] Deliveries tick();

private:
    struct CachedCommand {
        std::string request_id;
        std::string action;
        std::string character;
        std::string location;
        std::optional<Rejection> rejection;
        std::uint64_t revision;
    };

    struct Connection {
        std::optional<SessionId> session;
        std::optional<View> last_view;
        std::uint64_t sequence = 0;
        std::deque<CachedCommand> commands;
    };

    void publish_changes(Deliveries& deliveries);

    SimulationHost host_;
    std::map<ConnectionId, Connection> connections_;
};

}
