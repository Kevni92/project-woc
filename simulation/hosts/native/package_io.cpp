#include "hosts/native/package_io.hpp"

#include <fstream>
#include <stdexcept>

namespace woc::native {
namespace {

namespace fs = std::filesystem;
using namespace woc::content;

std::string read_bytes(const fs::path& directory, std::string_view filename, std::size_t limit) {
    std::error_code error;
    const auto path = fs::canonical(directory / filename, error);
    if (error || path.parent_path() != directory || !fs::is_regular_file(path, error)) {
        throw std::runtime_error("WORLD_PACKAGE_FILE: " + std::string(filename));
    }
    const auto size = fs::file_size(path);
    if (size > limit) throw std::runtime_error("WORLD_PACKAGE_SIZE_LIMIT: " + std::string(filename));
    std::string bytes(static_cast<std::size_t>(size), '\0');
    std::ifstream input(path, std::ios::binary);
    if (!input.read(bytes.data(), static_cast<std::streamsize>(bytes.size()))
        || input.peek() != std::char_traits<char>::eof() || input.bad()) {
        throw std::runtime_error("WORLD_PACKAGE_FILE: " + std::string(filename));
    }
    return bytes;
}

}

content::LoadedWorld read_package(const std::filesystem::path& directory) {
    std::error_code error;
    const auto root = fs::canonical(directory, error);
    if (error || !fs::is_directory(root, error)) {
        throw std::runtime_error("WORLD_PACKAGE_DIRECTORY: " + directory.string());
    }
    const auto manifest = parse_manifest(read_bytes(root, "manifest.json", max_manifest_bytes));
    auto world = load_world(manifest, read_bytes(root, manifest.file(FileRole::world).path,
        manifest.file(FileRole::world).bytes), read_bytes(root, manifest.file(FileRole::visual).path,
        manifest.file(FileRole::visual).bytes));
    for (auto role : {FileRole::theme, FileRole::provenance}) {
        const auto& file = manifest.file(role);
        validate_presentation_file(manifest, role, read_bytes(root, file.path, file.bytes));
    }
    return world;
}

}
