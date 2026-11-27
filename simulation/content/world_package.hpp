#pragma once

#include "core/world.hpp"

namespace woc::content {

inline constexpr std::size_t max_manifest_bytes = 65'536;
inline constexpr std::size_t max_world_bytes = 8'388'608;

enum class FileRole { world, visual, theme, provenance };
inline constexpr std::array file_roles{FileRole::world, FileRole::visual, FileRole::theme, FileRole::provenance};

struct PackageFile {
    std::string path;
    std::size_t bytes;
    std::string sha256;
};

struct PackageManifest {
    std::string world_id;
    std::string display_name;
    unsigned schema_version;
    unsigned revision;
    unsigned visual_revision;
    std::string semantic_hash;
    std::array<double, 4> bounds;
    std::array<PackageFile, file_roles.size()> files;

    [[nodiscard]] const PackageFile& file(FileRole role) const { return files[static_cast<std::size_t>(role)]; }
};

struct LoadedWorld {
    WorldDefinition definition;
    unsigned revision;
    std::string semantic_hash;
};

[[nodiscard]] PackageManifest parse_manifest(std::string_view bytes);
[[nodiscard]] LoadedWorld load_world(const PackageManifest& manifest, std::string_view bytes,
                                    std::optional<std::string_view> visual_bytes = std::nullopt);
void validate_presentation_file(const PackageManifest& manifest, FileRole role, std::string_view bytes);

}
