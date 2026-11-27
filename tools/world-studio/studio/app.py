"""Local-only API. Requests refer to paths relative to a configured source root."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from threading import Lock, Thread
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import psutil
from pyproj import Transformer
from shapely.geometry import Point

from woc_osm.geometry import REPO, ImportFailure, Projection, input_aoi, json_bytes

DATA = Path(os.environ.get("WOC_STUDIO_DATA", REPO / "build/osm-input")).resolve()
WORKSPACE = Path(os.environ.get("WOC_STUDIO_WORKSPACE", REPO / "build/world-studio")).resolve()
PORT = int(os.environ.get("WOC_STUDIO_PORT", "8000"))
PROJECTS = WORKSPACE / "projects"
JOBS_DIR = WORKSPACE / "jobs"
EXPORTS = WORKSPACE / "exports"
for directory in (PROJECTS, JOBS_DIR, EXPORTS):
    directory.mkdir(parents=True, exist_ok=True)
    if not directory.resolve().is_relative_to(WORKSPACE):
        raise RuntimeError(f"Workspace directory is outside the configured root: {directory}")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
jobs = {}
lock = Lock()
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
JOB_ID = re.compile(r"[0-9a-f]{32}\Z")
PACKAGE_FILES = {"manifest.json", "world.json", "visual.json", "theme.json", "provenance.json"}


@app.middleware("http")
async def local_only(request: Request, call_next):
    # Host and Origin checks prevent DNS rebinding and browser cross-origin writes.
    if not request.client or request.client.host != "127.0.0.1" or request.headers.get("host") != f"127.0.0.1:{PORT}":
        return JSONResponse({"detail": "Ungültiger Host"}, status_code=403)
    origin = request.headers.get("origin")
    public_package = request.method in ("GET", "HEAD") and request.url.path.startswith("/worlds/")
    if origin and origin != f"http://127.0.0.1:{PORT}" and not public_package:
        return JSONResponse({"detail": "Ungültiger Ursprung"}, status_code=403)
    if request.method not in ("GET", "HEAD") and (origin != f"http://127.0.0.1:{PORT}" or
                                                  request.headers.get("x-woc-studio") != "1"):
        return JSONResponse({"detail": "Nur lokale Studio-Anfragen sind zulässig"}, status_code=403)
    return await call_next(request)


def slug(value):
    if not isinstance(value, str) or len(value) > 64 or not SLUG.fullmatch(value):
        raise HTTPException(400, "Ungültige ID: Kleinbuchstaben, Zahlen und Bindestriche verwenden.")
    return value


def source(value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise HTTPException(400, "Quelldatei muss relativ zum Datenverzeichnis angegeben werden.")
    path = (DATA / value).resolve()
    if not path.is_relative_to(DATA) or not path.is_file():
        raise HTTPException(400, f"Quelldatei fehlt oder liegt außerhalb des Datenverzeichnisses: {value}")
    return path


def project(document):
    if not isinstance(document, dict) or document.get("version") != 1 or not isinstance(document.get("map"), dict):
        raise HTTPException(400, "Unbekanntes Projektformat.")
    slug(document.get("id"))
    return document


def contained_file(root, path):
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()) or not resolved.is_file():
        raise HTTPException(404, "Datei nicht gefunden")
    return resolved


@app.get("/api/info")
def info():
    return {"dataRoot": str(DATA), "workspace": str(WORKSPACE), "exports": str(EXPORTS)}


@app.get("/api/projects")
def list_projects():
    return sorted(p.stem for p in PROJECTS.glob("*.json") if SLUG.fullmatch(p.stem))


@app.get("/api/projects/{project_id}")
def load_project(project_id: str):
    path = contained_file(PROJECTS, PROJECTS / (slug(project_id) + ".json"))
    return json.loads(path.read_text(encoding="utf-8"))


@app.put("/api/projects/{project_id}")
def save_project(project_id: str, document: dict):
    project(document)
    if slug(project_id) != document["id"]:
        raise HTTPException(400, "Projekt-ID stimmt nicht überein")
    data = json_bytes(document)
    if len(data) > 2_000_000:
        raise HTTPException(400, "Projektdatei zu groß")
    path = PROJECTS / (project_id + ".json")
    temp = PROJECTS / (uuid4().hex + ".tmp")
    try:
        temp.write_bytes(data)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
    return {"saved": project_id}


@app.post("/api/measure")
def measure(document: dict):
    try:
        polygon = input_aoi(document)
        projected = Projection.for_aoi(polygon).geometry(polygon)
        x1, z1, x2, z2 = projected.bounds
        return {"areaM2": projected.area, "widthM": x2 - x1, "heightM": z2 - z1,
                "bbox": list(polygon.bounds)}
    except (ImportFailure, ValueError) as error:
        raise HTTPException(400, str(error)) from error


@app.post("/api/rectangle")
def rectangle(data: dict):
    try:
        lon, lat = float(data["lon"]), float(data["lat"])
        width, height = float(data["width"]), float(data["height"])
        if not (-180 < lon < 180 and -80 < lat < 84 and 0 < width <= 20000 and 0 < height <= 20000):
            raise ValueError("Koordinaten oder Maße liegen außerhalb der Grenzen")
        # Match the importer's UTM/AEQD selection at the requested centre.
        projection = Projection.for_aoi(Point(lon, lat).buffer(0.000001))
        inverse = Transformer.from_crs(projection.crs, 4326, always_xy=True)
        e, n = projection.transformer.transform(lon, lat)
        points = [inverse.transform(e + x * width / 2, n + y * height / 2)
                  for x, y in [(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)]]
        result = {"type": "Polygon", "coordinates": [points]}
        input_aoi(result)
        return result
    except (KeyError, TypeError, ValueError, ImportFailure) as error:
        raise HTTPException(400, str(error)) from error


def get_job(job_id):
    if not JOB_ID.fullmatch(job_id) or job_id not in jobs:
        raise HTTPException(404, "Job nicht gefunden")
    return jobs[job_id]


def job_view(job):
    return {key: job.get(key) for key in ("id", "status", "phase", "error", "report", "worldId")}


def run_job(job, pbf, land, aoi, config):
    try:
        directory = JOBS_DIR / job["id"]
        directory.mkdir()
        (directory / "aoi.json").write_bytes(json_bytes(aoi))
        (directory / "config.json").write_bytes(json_bytes(config))
        cmd = [sys.executable, "-m", "woc_osm", "--pbf", str(pbf), "--land", str(land),
               "--aoi", str(directory / "aoi.json"), "--config", str(directory / "config.json"),
               "--output", str(directory / "package"), "--report", str(directory / "report.json")]
        with lock:
            if job["status"] == "cancelled":
                return
            process = subprocess.Popen(cmd, cwd=Path(__file__).resolve().parents[1], stdout=subprocess.DEVNULL,
                                       stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
            job["process"] = process
            job["status"] = "running"
        lines = []
        for line in process.stderr:
            line = line.strip()
            if line:
                lines.append(line)
                job["phase"] = line
        code = process.wait()
        report = directory / "report.json"
        if report.is_file():
            job["report"] = json.loads(report.read_text(encoding="utf-8"))
        with lock:
            if job["status"] != "cancelled":
                job["status"] = "done" if code == 0 else "failed"
                if code != 0:
                    job["error"] = lines[-1] if lines else f"Importer beendet (Code {code})"
    except Exception as error:
        with lock:
            if job["status"] != "cancelled":
                job["status"], job["error"] = "failed", str(error)


@app.post("/api/jobs")
def create_job(document: dict):
    project(document)
    settings = document["map"]
    pbf, land = source(settings.get("pbf")), source(settings.get("land"))
    aoi, config = settings.get("aoi"), settings.get("config")
    try:
        input_aoi(aoi)
    except (ImportFailure, ValueError) as error:
        raise HTTPException(400, str(error)) from error
    if not isinstance(config, dict):
        raise HTTPException(400, "Importkonfiguration fehlt")
    world_id = slug(config.get("worldId"))
    job = {"id": uuid4().hex, "status": "queued", "phase": "queued", "worldId": world_id}
    with lock:
        jobs[job["id"]] = job
    Thread(target=run_job, args=(job, pbf, land, aoi, config), daemon=True).start()
    return job_view(job)


@app.get("/api/jobs/{job_id}")
def read_job(job_id: str):
    return job_view(get_job(job_id))


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    job = get_job(job_id)
    with lock:
        if job["status"] in ("queued", "running"):
            job["status"] = "cancelled"
            process = job.get("process")
            if process:
                try:
                    parent = psutil.Process(process.pid)
                    for child in reversed(parent.children(recursive=True)):
                        try:
                            child.kill()
                        except psutil.Error:
                            pass
                    try:
                        parent.kill()
                    except psutil.Error:
                        pass
                except psutil.Error:
                    pass
    return job_view(job)


@app.get("/api/jobs/{job_id}/package/{filename}")
def preview_file(job_id: str, filename: str):
    job = get_job(job_id)
    if job["status"] != "done" or filename not in PACKAGE_FILES:
        raise HTTPException(404, "Paketdatei nicht verfügbar")
    path = contained_file(JOBS_DIR, JOBS_DIR / job_id / "package" / filename)
    return FileResponse(path, media_type="application/json")


@app.post("/api/jobs/{job_id}/export")
def export_job(job_id: str):
    job = get_job(job_id)
    if job["status"] != "done":
        raise HTTPException(400, "Nur validierte Pakete können exportiert werden")
    target = EXPORTS / slug(job["worldId"])
    if os.path.lexists(target):
        raise HTTPException(409, "Export existiert bereits; bitte eine neue World-ID wählen.")
    temp = EXPORTS / (".export-" + uuid4().hex)
    try:
        shutil.copytree(JOBS_DIR / job_id / "package", temp)
        os.rename(temp, target)
    except FileExistsError as error:
        raise HTTPException(409, "Export existiert bereits") from error
    finally:
        if temp.exists():
            shutil.rmtree(temp)
    return {"path": str(target), "worldId": job["worldId"]}


@app.get("/worlds/{world_id}/{filename}")
def export_file(world_id: str, filename: str):
    # Game clients may read packages cross-origin; API writes remain same-origin only.
    path = EXPORTS / slug(world_id) / filename
    if filename not in PACKAGE_FILES:
        raise HTTPException(404, "Paketdatei nicht gefunden")
    path = contained_file(EXPORTS, path)
    return FileResponse(path, media_type="application/json", headers={"Access-Control-Allow-Origin": "*"})


dist = Path(__file__).resolve().parents[1] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="studio")
