import hashlib
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from time import perf_counter

from jsonschema import Draft7Validator

from .geometry import REPO, ImportFailure, json_bytes, load_json, require

FILE_SCHEMAS = {
    "world": ("city-v3", 3, 8 * 1024 * 1024),
    "visual": ("city-visual-v2", 2, 8 * 1024 * 1024),
    "theme": ("map-theme-v1", 1, 128 * 1024),
    "provenance": ("world-provenance-v1", 1, 128 * 1024),
}


def digest_file(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def check_schema(document, schema):
    validator = Draft7Validator(load_json(REPO / "content" / f"{schema}.schema.json"))
    error = next(validator.iter_errors(document), None)
    if error:
        raise ImportFailure(f"{schema} at {error.json_path}: {error.message}")


def runtime_validate(directory, native, node):
    def invoke(command):
        started = perf_counter()
        try:
            result = subprocess.run(command, cwd=REPO, input=b"", capture_output=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ImportFailure(f"Runtime validator could not run: {command[0]} ({error})") from error
        require(result.returncode == 0, f"Runtime validator failed: {result.stderr.decode(errors='replace').strip()}")
        return result.stdout, (perf_counter() - started) * 1000

    _, native_ms = invoke([str(native.resolve()), "--world", str(directory)])
    output, _ = invoke([node, str(REPO / "client/tools/validate-world.mjs"), str(directory)])
    return {"nativeProcessMs": native_ms, **json.loads(output)}


def export_package(output, data, metadata, native, node, report, phase):
    require(not os.path.lexists(output), f"Output already exists: {output}")
    with TemporaryDirectory(prefix=".woc-import-", dir=output.parent) as temp:
        directory = Path(temp) / "package"
        directory.mkdir()
        descriptors = {}
        files = {role: json_bytes(document) for role, document in data.items()}
        report["fileBytes"] = {f"{role}.json": len(blob) for role, blob in files.items()}
        for role, blob in files.items():
            schema, version, limit = FILE_SCHEMAS[role]
            name = f"{role}.json"
            require(len(blob) <= limit, f"WORLD_PACKAGE_SIZE_LIMIT: {name} has {len(blob)} bytes, limit {limit}")
            check_schema(json.loads(blob), schema)
            descriptors[role] = {"path": name, "schemaVersion": version, "bytes": len(blob),
                                 "sha256": hashlib.sha256(blob).hexdigest()}
            (directory / name).write_bytes(blob)
        manifest = {**metadata, "files": descriptors, "semanticHash": descriptors["world"]["sha256"]}
        blob = json_bytes(manifest)
        check_schema(json.loads(blob), "world-package-v1")
        require(len(blob) <= 65536, "WORLD_PACKAGE_SIZE_LIMIT: manifest.json")
        report["fileBytes"]["manifest.json"] = len(blob)
        (directory / "manifest.json").write_bytes(blob)

        report["runtimeLoads"] = runtime_validate(directory, native, node)
        phase("export")
        require(not os.path.lexists(output), f"Output already exists: {output}")
        directory.rename(output)
    return manifest
