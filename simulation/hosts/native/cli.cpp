#include "protocol/endpoint.hpp"
#include "hosts/native/package_io.hpp"

#include <iostream>
#include <nlohmann/json.hpp>

namespace {

int run(woc::protocol::Endpoint& endpoint) {
    using nlohmann::json;
    using namespace woc::protocol;

    for (std::string line; std::getline(std::cin, line);) {
        try {
            const auto event = json::parse(line);
            const auto operation = event.at("op").get<std::string>();
            const auto connection = event.value("connection", ConnectionId{});
            Deliveries deliveries;
            if (operation == "open") {
                endpoint.open(connection);
            } else if (operation == "close") {
                deliveries = endpoint.close(connection);
            } else if (operation == "send") {
                const auto& message = event.at("message");
                deliveries = endpoint.receive(connection, message.dump());
            } else if (operation == "tick") {
                deliveries = endpoint.tick();
            } else {
                std::cerr << "Unknown operation: " << operation << '\n';
                return 1;
            }

            auto output = json::array();
            for (const auto& delivery : deliveries) {
                output.push_back({
                    {"connection", delivery.connection}, {"message", json::parse(delivery.message)},
                });
            }
            std::cout << output.dump() << '\n' << std::flush;
        } catch (const json::exception& error) {
            std::cerr << "Invalid CLI frame: " << error.what() << '\n';
            return 1;
        }
    }
    return 0;
}

}

int main(int argc, char** argv) {
    std::filesystem::path package = woc::native::default_package;
    if (argc == 3 && std::string_view(argv[1]) == "--world") {
        package = argv[2];
    } else if (argc != 1) {
        std::cerr << "Usage: woc_cli [--world DIRECTORY]\n";
        return 1;
    }
    try {
        auto world = woc::native::read_package(package);
        woc::protocol::Endpoint endpoint(std::move(world.definition), world.revision, std::move(world.semantic_hash));
        return run(endpoint);
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
