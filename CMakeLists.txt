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

add_library(woc_core STATIC simulation/core/world.cpp)
target_include_directories(woc_core PUBLIC simulation)
add_library(woc_application STATIC simulation/application/simulation_host.cpp)
target_link_libraries(woc_application PUBLIC woc_core)
add_library(woc_protocol STATIC simulation/protocol/endpoint.cpp)
target_link_libraries(woc_protocol PUBLIC woc_application PRIVATE nlohmann_json::nlohmann_json)

if(EMSCRIPTEN)
    add_executable(woc_wasm simulation/hosts/wasm/bridge.cpp)
    target_link_libraries(woc_wasm PRIVATE woc_protocol nlohmann_json::nlohmann_json)
    set_target_properties(woc_wasm PROPERTIES OUTPUT_NAME woc SUFFIX ".mjs")
    target_link_options(woc_wasm PRIVATE
        --no-entry
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

    add_executable(woc_cli simulation/hosts/native/cli.cpp)
    target_link_libraries(woc_cli PRIVATE woc_protocol nlohmann_json::nlohmann_json)
    add_executable(woc_server simulation/hosts/native/server.cpp)
    target_link_libraries(woc_server PRIVATE woc_protocol Boost::beast)
    if(WIN32)
        target_compile_definitions(woc_server PRIVATE _WIN32_WINNT=0x0A00)
    endif()

    include(CTest)
    if(BUILD_TESTING)
        add_executable(woc_native_tests tests/native.cpp)
        target_link_libraries(woc_native_tests PRIVATE woc_protocol nlohmann_json::nlohmann_json)
        add_test(NAME woc_native_tests COMMAND woc_native_tests)
    endif()
endif()
