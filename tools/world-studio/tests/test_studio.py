"""Exercise the local API with the same offline importer as the CLI."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest

from fastapi.testclient import TestClient
from fixture import fixture

TEMP = TemporaryDirectory(prefix="woc-studio-test-")
ROOT = Path(TEMP.name)
os.environ["WOC_STUDIO_DATA"] = str(ROOT / "data")
os.environ["WOC_STUDIO_WORKSPACE"] = str(ROOT / "workspace")
os.environ["WOC_STUDIO_PORT"] = "8000"
fixture(ROOT / "data")
from studio.app import app  # noqa: E402


class StudioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 12345), headers={
            "origin": "http://127.0.0.1:8000", "x-woc-studio": "1"})

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        TEMP.cleanup()

    def document(self, name):
        config = json.loads((ROOT / "data/config.json").read_text(encoding="utf-8"))
        config["worldId"] = name
        return {"version": 1, "id": name, "map": {"aoi": json.loads((ROOT / "data/aoi.json").read_text()),
                "pbf": "fixture.osm.pbf", "land": "land.json", "config": config}}

    def wait(self, job_id):
        for _ in range(600):
            result = self.client.get(f"/api/jobs/{job_id}").json()
            if result["status"] not in ("queued", "running"):
                return result
            time.sleep(.1)
        self.fail("Import timed out")

    def test_security_and_projects(self):
        doc = self.document("project-one")
        self.assertEqual(self.client.put("/api/projects/project-one", json=doc).status_code, 200)
        self.assertEqual(self.client.get("/api/projects/project-one").json(), doc)
        self.assertEqual(self.client.put("/api/projects/project-one", json=doc, headers={"origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/info", headers={"host": "evil.example:8000"}).status_code, 403)
        with TestClient(app, base_url="http://127.0.0.1:8000", client=("192.0.2.1", 12345)) as remote:
            self.assertEqual(remote.get("/api/info").status_code, 403)
        for path in ("../outside.pbf", str(ROOT / "data/fixture.osm.pbf")):
            doc["map"]["pbf"] = path
            self.assertEqual(self.client.post("/api/jobs", json=doc).status_code, 400)
        self.assertEqual(self.client.post("/api/jobs", json=doc, headers={"x-woc-studio": "0"}).status_code, 403)

    def test_metric_rectangle(self):
        response = self.client.post("/api/rectangle", json={"lon": 8.8072, "lat": 53.0785, "width": 5000, "height": 5000})
        self.assertEqual(response.status_code, 200)
        metrics = self.client.post("/api/measure", json=response.json()).json()
        self.assertAlmostEqual(metrics["widthM"], 5000, delta=.1)
        self.assertAlmostEqual(metrics["heightM"], 5000, delta=.1)
        self.assertEqual(self.client.post("/api/measure", json={"type": "Polygon", "coordinates": []}).status_code, 400)

    def test_job_export_and_error(self):
        doc = self.document("api-fixture")
        result = self.client.post("/api/jobs", json=doc)
        self.assertEqual(result.status_code, 200)
        job = self.wait(result.json()["id"])
        self.assertEqual(job["status"], "done", job)
        self.assertIn("quality", job["report"])
        job_id = job["id"]
        self.assertEqual(self.client.get(f"/api/jobs/{job_id}/package/manifest.json").status_code, 200)
        self.assertEqual(self.client.post(f"/api/jobs/{job_id}/export", json={}).status_code, 200)
        self.assertEqual(self.client.post(f"/api/jobs/{job_id}/export", json={}).status_code, 409)
        shared = self.client.get("/worlds/api-fixture/manifest.json", headers={"origin": "http://127.0.0.1:5173"})
        self.assertEqual(shared.status_code, 200)
        self.assertEqual(shared.headers["access-control-allow-origin"], "*")
        doc["map"]["config"]["revision"] = -1
        failed = self.wait(self.client.post("/api/jobs", json=doc).json()["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertIn("revision", failed["error"])
        self.assertEqual(self.client.post(f"/api/jobs/{failed['id']}/export", json={}).status_code, 400)

    def test_cancel(self):
        result = self.client.post("/api/jobs", json=self.document("cancelled-world")).json()
        cancelled = self.client.post(f"/api/jobs/{result['id']}/cancel", json={}).json()
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(self.client.post(f"/api/jobs/{result['id']}/export", json={}).status_code, 400)

    def test_island_job(self):
        doc = self.document("island-world")
        doc["map"]["config"].update(mode="island", paddingM=500)
        job = self.wait(self.client.post("/api/jobs", json=doc).json()["id"])
        self.assertEqual(job["status"], "done", job)
        world = self.client.get(f"/api/jobs/{job['id']}/package/world.json").json()
        self.assertEqual(world["boundaryMode"], "island")


if __name__ == "__main__":
    unittest.main()
