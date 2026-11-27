#pragma once

#include "core/world.hpp"
#include <nlohmann/json_fwd.hpp>

namespace woc::content {

[[nodiscard]] WorldDefinition load_city(std::string_view json);
[[nodiscard]] nlohmann::json validate_city_json(std::string_view source);
[[nodiscard]] WorldDefinition parse_city(const nlohmann::json& city);

}
