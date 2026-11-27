#include "protocol/endpoint.hpp"

#include <emscripten/emscripten.h>
#include <nlohmann/json.hpp>

namespace {

using namespace woc::protocol;

Endpoint endpoint;
std::string output;

void store(Deliveries deliveries) {
    auto batch = nlohmann::json::array();
    for (auto& delivery : deliveries) {
        batch.push_back({
            {"connection", delivery.connection}, {"message", std::move(delivery.message)},
        });
    }
    output = batch.dump();
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE void woc_open(ConnectionId connection) {
    endpoint.open(connection);
    store({});
}

EMSCRIPTEN_KEEPALIVE void woc_close(ConnectionId connection) {
    store(endpoint.close(connection));
}

// Input is borrowed during this call. Output is owned by the module until the
// next open, close, receive or tick. Both buffers use explicit byte lengths.
EMSCRIPTEN_KEEPALIVE void woc_receive(ConnectionId connection, const char* input, std::size_t length) {
    store(endpoint.receive(connection, {input, length}));
}

EMSCRIPTEN_KEEPALIVE void woc_tick() {
    store(endpoint.tick());
}

EMSCRIPTEN_KEEPALIVE const char* woc_output_data() {
    return output.data();
}

EMSCRIPTEN_KEEPALIVE std::size_t woc_output_size() {
    return output.size();
}

}
