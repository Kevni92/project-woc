#pragma once

#include "content/world_package.hpp"

#include <filesystem>

namespace woc::native {

inline constexpr auto default_package = "content/public/worlds/breakwater";
[[nodiscard]] content::LoadedWorld read_package(const std::filesystem::path& directory);

}
