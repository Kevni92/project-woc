#include "content/world_package.hpp"
#include "content/city.hpp"
#include "schemas.hpp"

#include <nlohmann/json-schema.hpp>
#include <picosha2.h>
#include <stdexcept>

namespace woc::content {
namespace {

using Json = nlohmann::json;
using Validator = nlohmann::json_schema::json_validator;

std::array<double, 4> bounds_of(const Json& bounds) {
    return {bounds.at("minX").get<double>(), bounds.at("maxX").get<double>(),
            bounds.at("minZ").get<double>(), bounds.at("maxZ").get<double>()};
}

Json validate_json(std::string_view bytes, const Validator& validator, std::string_view filename) {
    try {
        auto document = Json::parse(bytes);
        validator.validate(document);
        return document;
    } catch (const std::exception& error) {
        throw std::invalid_argument("WORLD_PACKAGE_SCHEMA: " + std::string(filename) + ": " + error.what());
    }
}

void verify_bytes(const PackageFile& file, std::string_view bytes) {
    if (bytes.size() != file.bytes) throw std::invalid_argument("WORLD_PACKAGE_SIZE_MISMATCH: " + file.path);
    if (picosha2::hash256_hex_string(bytes.begin(), bytes.end()) != file.sha256) {
        throw std::invalid_argument("WORLD_PACKAGE_HASH_MISMATCH: " + file.path);
    }
}

}

PackageManifest parse_manifest(std::string_view bytes) {
    if (bytes.size() > max_manifest_bytes) throw std::invalid_argument("WORLD_PACKAGE_SIZE_LIMIT: manifest.json");
    static const Validator validator(Json::parse(schemas::package));
    const auto document = validate_json(bytes, validator, "manifest.json");
    if (document.contains("modules") && !document.at("modules").empty()) {
        throw std::invalid_argument("WORLD_PACKAGE_UNSUPPORTED_MODULE: " +
            document.at("modules").at(0).at("role").get<std::string>());
    }
    PackageManifest manifest{
        document.at("worldId"), document.at("displayName"), document.at("worldSchemaVersion"),
        document.at("worldRevision"), document.at("visualRevision"), document.at("semanticHash"),
        bounds_of(document.at("bounds")), {},
    };
    const auto& [min_x, max_x, min_z, max_z] = manifest.bounds;
    if (min_x >= max_x || min_z >= max_z) throw std::invalid_argument("WORLD_PACKAGE_BOUNDS: manifest.json");

    constexpr std::array keys{"world", "visual", "theme", "provenance"};
    for (std::size_t index = 0; index < keys.size(); ++index) {
        const auto& file = document.at("files").at(keys[index]);
        manifest.files[index] = {file.at("path"), file.at("bytes"), file.at("sha256")};
    }
    if (manifest.file(FileRole::world).sha256 != manifest.semantic_hash) {
        throw std::invalid_argument("WORLD_PACKAGE_HASH_MISMATCH: manifest semanticHash");
    }
    return manifest;
}

LoadedWorld load_world(const PackageManifest& manifest, std::string_view bytes) {
    verify_bytes(manifest.file(FileRole::world), bytes);
    try {
        const auto document = validate_city_json(bytes);
        if (document.at("id") != manifest.world_id || document.at("version") != manifest.schema_version
            || document.at("name") != manifest.display_name || bounds_of(document.at("bounds")) != manifest.bounds) {
            throw std::invalid_argument("manifest identity or bounds differ from world.json");
        }
        return {parse_city(document), manifest.revision, manifest.semantic_hash};
    } catch (const std::exception& error) {
        throw std::invalid_argument(std::string("WORLD_PACKAGE_INVALID_WORLD: ") + error.what());
    }
}

void validate_presentation_file(const PackageManifest& manifest, FileRole role, std::string_view bytes) {
    const auto& file = manifest.file(role);
    verify_bytes(file, bytes);
    switch (role) {
    case FileRole::visual: {
        static const Validator validator(Json::parse(schemas::visual));
        const auto visual = validate_json(bytes, validator, file.path);
        if (visual.at("worldId") != manifest.world_id || visual.at("worldVersion") != manifest.schema_version
            || visual.value("revision", 1u) != manifest.visual_revision) {
            throw std::invalid_argument("WORLD_PACKAGE_IDENTITY_MISMATCH: visual.json");
        }
        break;
    }
    case FileRole::theme: {
        static const Validator validator(Json::parse(schemas::theme));
        validate_json(bytes, validator, file.path);
        break;
    }
    case FileRole::provenance: {
        static const Validator validator(Json::parse(schemas::provenance));
        validate_json(bytes, validator, file.path);
        break;
    }
    case FileRole::world:
        throw std::logic_error("Use load_world for semantic package data");
    }
}

}
