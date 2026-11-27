#include "protocol/endpoint.hpp"

#include <boost/asio.hpp>
#include <boost/beast/websocket.hpp>

#include <charconv>
#include <chrono>
#include <csignal>
#include <deque>
#include <iostream>
#include <map>
#include <memory>
#include <thread>

namespace {

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace ws = beast::websocket;
using asio::ip::tcp;
using beast::error_code;
using woc::protocol::ConnectionId;
using woc::protocol::Deliveries;

enum class ClockMode { realtime, frozen, stdin_ticks };

class Peer;

class Server {
public:
    Server(asio::io_context& io, unsigned short port, bool manual_clock)
        : acceptor_(io, {asio::ip::address_v4::loopback(), port}), timer_(io) {
        accept();
        if (!manual_clock) {
            schedule_tick();
        }
    }

    [[nodiscard]] unsigned short port() const { return acceptor_.local_endpoint().port(); }

    void connected(ConnectionId id, const std::shared_ptr<Peer>& peer) {
        peers_.emplace(id, peer);
        endpoint_.open(id);
    }

    void disconnected(ConnectionId id) {
        peers_.erase(id);
        deliver(endpoint_.close(id));
    }

    void received(ConnectionId id, std::string_view message) {
        deliver(endpoint_.receive(id, message));
    }

    void tick() {
        deliver(endpoint_.tick());
    }

private:
    void accept();
    void deliver(Deliveries messages);

    void schedule_tick() {
        timer_.expires_after(std::chrono::seconds(1));
        timer_.async_wait([this](error_code error) {
            if (!error) {
                tick();
                schedule_tick();
            }
        });
    }

    tcp::acceptor acceptor_;
    asio::steady_timer timer_;
    woc::protocol::Endpoint endpoint_;
    std::map<ConnectionId, std::weak_ptr<Peer>> peers_;
    ConnectionId next_connection_ = 1;
};

class Peer : public std::enable_shared_from_this<Peer> {
public:
    Peer(tcp::socket socket, Server& server, ConnectionId id)
        : socket_(std::move(socket)), server_(server), id_(id) {}

    void start() {
        socket_.set_option(ws::stream_base::timeout::suggested(beast::role_type::server));
        socket_.read_message_max(woc::protocol::max_message_bytes);
        socket_.async_accept([self = shared_from_this()](error_code error) {
            if (!error) {
                self->server_.connected(self->id_, self);
                self->read();
            }
        });
    }

    void send(std::string message) {
        if (closed_ || overflowed_) {
            return;
        }
        constexpr std::size_t max_queued_messages = 64;
        if (outgoing_.size() >= max_queued_messages) {
            overflowed_ = true;
            asio::post(socket_.get_executor(), [self = shared_from_this()] { self->stop(); });
            return;
        }
        outgoing_.push_back(std::move(message));
        if (outgoing_.size() == 1) {
            write();
        }
    }

private:
    void stop() {
        if (!closed_) {
            closed_ = true;
            error_code ignored;
            socket_.next_layer().close(ignored);
            server_.disconnected(id_);
        }
    }

    void read() {
        socket_.async_read(incoming_, [self = shared_from_this()](error_code error, std::size_t) {
            if (error || self->closed_ || self->overflowed_ || !self->socket_.got_text()) {
                self->stop();
                return;
            }
            const auto data = self->incoming_.data();
            self->server_.received(self->id_, {
                static_cast<const char*>(data.data()), data.size(),
            });
            self->incoming_.consume(data.size());
            if (!self->overflowed_) {
                self->read();
            }
        });
    }

    void write() {
        socket_.text(true);
        socket_.async_write(asio::buffer(outgoing_.front()),
            [self = shared_from_this()](error_code error, std::size_t) {
                if (error) {
                    self->stop();
                    return;
                }
                self->outgoing_.pop_front();
                if (!self->closed_ && !self->overflowed_ && !self->outgoing_.empty()) {
                    self->write();
                }
            });
    }

    ws::stream<tcp::socket> socket_;
    Server& server_;
    ConnectionId id_;
    beast::flat_buffer incoming_;
    std::deque<std::string> outgoing_;
    bool closed_ = false;
    bool overflowed_ = false;
};

void Server::accept() {
    acceptor_.async_accept([this](error_code error, tcp::socket socket) {
        if (!error) {
            std::make_shared<Peer>(std::move(socket), *this, next_connection_++)->start();
        }
        if (error != asio::error::operation_aborted) {
            accept();
        }
    });
}

void Server::deliver(Deliveries messages) {
    for (auto& delivery : messages) {
        const auto entry = peers_.find(delivery.connection);
        if (entry != peers_.end()) {
            if (auto peer = entry->second.lock()) {
                peer->send(std::move(delivery.message));
            }
        }
    }
}

}

int main(int argc, char** argv) {
    unsigned short port = 8765;
    ClockMode clock = ClockMode::realtime;
    for (int i = 1; i < argc; ++i) {
        const std::string_view argument = argv[i];
        if (argument == "--manual-clock") {
            clock = ClockMode::frozen;
        } else if (argument == "--manual-clock-stdin") {
            clock = ClockMode::stdin_ticks;
        } else if (argument == "--port" && i + 1 < argc) {
            const std::string_view value = argv[++i];
            const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), port);
            if (error != std::errc{} || end != value.data() + value.size()) {
                std::cerr << "Invalid port\n";
                return 1;
            }
        } else {
            std::cerr << "Usage: woc_server [--port PORT] [--manual-clock | --manual-clock-stdin]\n";
            return 1;
        }
    }

    try {
        asio::io_context io;
        Server server(io, port, clock != ClockMode::realtime);
        std::cout << "ws://127.0.0.1:" << server.port() << '\n' << std::flush;
        if (clock == ClockMode::stdin_ticks) {
            // The contract harness drives time over stdin. WebSocket peers
            // have the same command set in both clock modes.
            std::thread network([&io] { io.run(); });
            for (std::string line; std::getline(std::cin, line);) {
                if (line == "tick") asio::post(io, [&server] { server.tick(); });
            }
            asio::post(io, [&io] { io.stop(); });
            network.join();
        } else {
            asio::signal_set signals(io, SIGINT, SIGTERM);
            signals.async_wait([&io](error_code, int) { io.stop(); });
            io.run();
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
