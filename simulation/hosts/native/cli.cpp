#include "protocol/endpoint.hpp"

#include <iostream>
#include <nlohmann/json.hpp>

int main() {
    using nlohmann::json;
    using namespace woc::protocol;

    Endpoint endpoint;
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
}
