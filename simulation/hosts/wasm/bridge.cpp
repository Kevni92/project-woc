#include "protocol/endpoint.hpp"
#include "content/world_package.hpp"

#include <emscripten/emscripten.h>
#include <nlohmann/json.hpp>

namespace {

using namespace woc::protocol;

std::optional<Endpoint> endpoint;
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

// The worker supplies validated package files as borrowed bytes. C++ verifies
// the semantic bytes again and constructs the endpoint only on success.
EMSCRIPTEN_KEEPALIVE int woc_init(const char* manifest, std::size_t manifest_length,
                                 const char* world, std::size_t world_length) {
    using namespace woc::content;
    if (endpoint) {
        output = "WORLD_ALREADY_INITIALIZED";
        return 1;
    }
    try {
        if (!manifest || !world || manifest_length > max_manifest_bytes || world_length > max_world_bytes) {
            output = "WORLD_PACKAGE_INIT_SIZE";
            return 1;
        }
        auto loaded = load_world(parse_manifest({manifest, manifest_length}), {world, world_length});
        endpoint.emplace(std::move(loaded.definition), loaded.revision, std::move(loaded.semantic_hash));
        output.clear();
        return 0;
    } catch (const std::exception& error) {
        output = error.what();
        return 1;
    }
}

EMSCRIPTEN_KEEPALIVE void woc_open(ConnectionId connection) {
    if (endpoint) endpoint->open(connection);
    store({});
}

EMSCRIPTEN_KEEPALIVE void woc_close(ConnectionId connection) {
    store(endpoint ? endpoint->close(connection) : Deliveries{});
}

// Input is borrowed during this call. Output is owned by the module until the
// next open, close, receive or tick. Both buffers use explicit byte lengths.
EMSCRIPTEN_KEEPALIVE void woc_receive(ConnectionId connection, const char* input, std::size_t length) {
    store(endpoint ? endpoint->receive(connection, {input, length}) : Deliveries{});
}

EMSCRIPTEN_KEEPALIVE void woc_tick() {
    store(endpoint ? endpoint->tick() : Deliveries{});
}

EMSCRIPTEN_KEEPALIVE const char* woc_output_data() {
    return output.data();
}

EMSCRIPTEN_KEEPALIVE std::size_t woc_output_size() {
    return output.size();
}

}
