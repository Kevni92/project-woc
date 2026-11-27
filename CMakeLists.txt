cmake_minimum_required(VERSION 3.25)
project(project_woc LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
set(JSON_BuildTests OFF CACHE BOOL "")
FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
    URL_HASH SHA256=42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa
)
FetchContent_MakeAvailable(nlohmann_json)

if(EMSCRIPTEN)
    add_compile_options(-fexceptions)
endif()
FetchContent_Declare(json_schema_validator
    URL https://codeload.github.com/pboettch/json-schema-validator/tar.gz/refs/tags/2.4.1
    URL_HASH SHA256=0c8bf7ba59bd50e312d82da4bab1d49cf3e2211cfbd659472f9c90505d2a4e4c
)
FetchContent_Declare(picosha2
    URL https://codeload.github.com/okdshin/PicoSHA2/tar.gz/refs/tags/v1.0.1
    URL_HASH SHA256=9983136544234e573fe07cc1a22fdf978ad7979043e7be2e9082f6d4991ff8a8
    SOURCE_SUBDIR header_only
)
FetchContent_MakeAvailable(json_schema_validator picosha2)

# Embed the schema contracts. World package data is read only at runtime.
function(woc_read_schema name file)
    set(path "${PROJECT_SOURCE_DIR}/content/${file}.schema.json")
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${path}")
    file(READ "${path}" schema)
    set(${name}_schema "${schema}" PARENT_SCOPE)
endfunction()
woc_read_schema(package world-package-v1)
woc_read_schema(city city-v2)
woc_read_schema(city_v3 city-v3)
woc_read_schema(visual city-visual-v1)
woc_read_schema(visual_v2 city-visual-v2)
woc_read_schema(theme map-theme-v1)
woc_read_schema(provenance world-provenance-v1)
configure_file(simulation/content/schemas.hpp.in generated/schemas.hpp @ONLY)

add_library(woc_core STATIC simulation/core/world.cpp simulation/core/navigation.cpp)
target_include_directories(woc_core PUBLIC simulation)
add_library(woc_content STATIC simulation/content/city.cpp simulation/content/world_package.cpp)
target_include_directories(woc_content PRIVATE "${PROJECT_BINARY_DIR}/generated" "${picosha2_SOURCE_DIR}")
target_link_libraries(woc_content PUBLIC woc_core PRIVATE nlohmann_json_schema_validator)
add_library(woc_application STATIC simulation/application/simulation_host.cpp)
target_link_libraries(woc_application PUBLIC woc_core)
add_library(woc_protocol STATIC simulation/protocol/endpoint.cpp)
target_link_libraries(woc_protocol PUBLIC woc_application PRIVATE nlohmann_json::nlohmann_json)

if(EMSCRIPTEN)
    add_executable(woc_wasm simulation/hosts/wasm/bridge.cpp)
    target_link_libraries(woc_wasm PRIVATE woc_protocol woc_content nlohmann_json::nlohmann_json)
    set_target_properties(woc_wasm PROPERTIES OUTPUT_NAME woc SUFFIX ".mjs")
    target_link_options(woc_wasm PRIVATE
        --no-entry
        -fexceptions
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=1"
        "-sENVIRONMENT=worker"
        "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
        "-sEXPORTED_RUNTIME_METHODS=['HEAPU8']"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sFILESYSTEM=0"
    )
    add_custom_target(woc_browser_assets ALL
        COMMAND "${CMAKE_COMMAND}" -E make_directory "${PROJECT_SOURCE_DIR}/client/src/generated"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "$<TARGET_FILE:woc_wasm>" "$<TARGET_FILE_DIR:woc_wasm>/woc.wasm"
            "${PROJECT_SOURCE_DIR}/client/src/generated"
        DEPENDS woc_wasm
        VERBATIM
    )
else()
    set(BOOST_INCLUDE_LIBRARIES beast)
    set(BOOST_ENABLE_CMAKE ON)
    set(BUILD_SHARED_LIBS OFF)
    FetchContent_Declare(Boost
        URL https://github.com/boostorg/boost/releases/download/boost-1.90.0/boost-1.90.0-cmake.tar.xz
        URL_HASH SHA256=aca59f889f0f32028ad88ba6764582b63c916ce5f77b31289ad19421a96c555f
    )
    FetchContent_MakeAvailable(Boost)

    add_library(woc_native_package STATIC simulation/hosts/native/package_io.cpp)
    target_link_libraries(woc_native_package PUBLIC woc_content)
    add_executable(woc_cli simulation/hosts/native/cli.cpp)
    target_link_libraries(woc_cli PRIVATE woc_protocol woc_native_package nlohmann_json::nlohmann_json)
    add_executable(woc_server simulation/hosts/native/server.cpp)
    target_link_libraries(woc_server PRIVATE woc_protocol woc_native_package Boost::beast)
    if(WIN32)
        target_compile_definitions(woc_server PRIVATE _WIN32_WINNT=0x0A00)
    endif()

    include(CTest)
    if(BUILD_TESTING)
        add_executable(woc_native_tests tests/native.cpp)
        target_link_libraries(woc_native_tests PRIVATE woc_protocol woc_native_package nlohmann_json::nlohmann_json)
        add_test(NAME woc_native_tests COMMAND woc_native_tests WORKING_DIRECTORY "${PROJECT_SOURCE_DIR}")
    endif()
endif()
