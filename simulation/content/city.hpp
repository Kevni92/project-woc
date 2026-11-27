#pragma once

#include "core/world.hpp"

namespace woc::content {

[[nodiscard]] WorldDefinition load_city(std::string_view json);
[[nodiscard]] const WorldDefinition& breakwater();

}
