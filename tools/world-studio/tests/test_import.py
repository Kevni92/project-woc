import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from shapely.geometry import LineString, Polygon
from shapely import STRtree, union_all

from fixture import degrees, fixture, polygon, rectangle
from woc_osm import ImportFailure, import_world
from woc_osm.geometry import REPO, load_json


def decode(area):
    return union_all([Polygon(part["outer"], part["holes"]) for part in area["polygons"]])


class ImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.native = REPO / "build/native" / ("woc_cli.exe" if sys.platform == "win32" else "woc_cli")

    def inputs(self, scenario):
        root = self.root / scenario
        pbf = fixture(root, scenario)
        return pbf, root / "land.json", load_json(root / "aoi.json"), load_json(root / "config.json")

    def run_import(self, inputs, suffix="package", **kwargs):
        output = self.root / suffix
        report = {}
        phases = []
        import_world(*inputs, output, self.native, progress=phases.append, report=report, **kwargs)
        self.assertEqual(phases, ["decode", "project-normalize", "clip", "graph-locations-spawns",
                                  "visuals", "validate", "export"])
        return output, report

    def test_modes_reproducibility_geometry_and_access(self):
        inputs = self.inputs("standard")
        natural, report = self.run_import(inputs, "natural")
        again, _ = self.run_import(inputs, "again")
        for file in natural.iterdir():
            self.assertEqual(file.read_bytes(), (again / file.name).read_bytes())

        config = {**inputs[-1], "mode": "island"}
        del config["paddingM"]
        island, _ = self.run_import((*inputs[:-1], config), "island")
        w, i = [load_json(world / "world.json") for world in (natural, island)]
        nv, iv = [load_json(world / "visual.json") for world in (natural, island)]
        self.assertEqual(w["land"], i["land"])
        self.assertEqual(w["navigation"], i["navigation"])
        self.assertEqual(set(c["kind"] for c in nv["coasts"]), {"cut", "shore"})
        self.assertEqual(set(c["kind"] for c in iv["coasts"]), {"island", "shore"})
        aoi, land = decode(w["aoi"]), decode(w["land"])
        self.assertEqual(len(aoi.interiors), 1)
        self.assertLess(aoi.area, aoi.convex_hull.area)
        self.assertEqual(land.geom_type, "MultiPolygon")
        self.assertTrue(aoi.covers(land))
        self.assertAlmostEqual(aoi.bounds[0] - i["bounds"]["minX"], 500)
        self.assertEqual(len(w["buildings"]), 2)
        self.assertEqual(len(decode(next(b["footprint"] for b in w["buildings"] if b["id"] == "building-r-202")).interiors), 1)

        nodes = {n["id"]: n["position"] for n in w["navigation"]["nodes"]}
        self.assertTrue(any(n.startswith("cut-w-1-") for n in nodes))
        forbidden = {"n-12", "n-13", "n-14", "n-15", "n-16", "n-17", "n-18", "n-19", "n-20", "n-21", "n-22", "n-23", "n-24"}
        self.assertFalse(nodes.keys() & forbidden)
        self.assertEqual(len(set(tuple(pos) for pos in nodes.values())), len(nodes))
        building_index = STRtree([decode(b["footprint"]) for b in w["buildings"]])
        for edge in w["navigation"]["edges"]:
            line = LineString(edge["path"])
            self.assertTrue(land.covers(line))
            self.assertEqual(len(building_index.query(line, predicate="intersects")), 0)
        self.assertEqual(report["counts"]["unsupportedLevel"], 2)
        self.assertEqual(report["counts"]["boundaryBuildings"], 1)
        self.assertEqual(report["counts"]["estimatedHeights"], 1)
        self.assertEqual(report["waterSources"], ["r-201"])
        self.assertEqual(report["counts"]["generatedDestinations"], 1)
        self.assertEqual([loc["name"] for loc in w["locations"] if loc["type"] != "waypoint"], ["Testbibliothek"])
        self.assertNotIn("Testmuseum", json.dumps(w))
        with self.assertRaisesRegex(ImportFailure, "Output already exists"):
            self.run_import(inputs, "natural")
        self.assertEqual((natural / "world.json").read_bytes(), (again / "world.json").read_bytes())

    def test_explicit_start_selects_component_and_rejects_blocked_snap(self):
        inputs = self.inputs("collision")
        pbf, land, aoi, config = inputs
        _, report = self.run_import(inputs)
        self.assertGreater(report["counts"]["quantizationCollisions"], 0)
        self.assertGreater(report["counts"]["excludedDuplicateOrCollidingEdges"], 0)
        with self.assertRaisesRegex(ImportFailure, "at least three distinct nodes"):
            self.run_import((pbf, land, aoi, {**config, "start": list(degrees(270, -230))}), "small")
        with self.assertRaisesRegex(ImportFailure, "within 35 m"):
            self.run_import((pbf, land, aoi, {**config, "start": list(degrees(322, 64))}), "water")

    def test_angled_aoi_clips_a_multipolygon_shore(self):
        pbf, land, _, config = self.inputs("standard")
        aoi = polygon([(-400, -300), (261, -300), (361, 300), (-400, 300), (-400, -300)],
                      rectangle(120, 80, 190, 145))
        package, _ = self.run_import((pbf, land, aoi, config))
        world = load_json(package / "world.json")
        visual = load_json(package / "visual.json")
        selection = decode(world["aoi"])
        ground = decode(world["land"])
        self.assertTrue(selection.covers(ground))
        for coast in visual["coasts"]:
            if coast["kind"] == "cut":
                self.assertTrue(selection.boundary.covers(LineString(coast["path"])))
        self.assertTrue(any(coast["kind"] == "shore" for coast in visual["coasts"]))

    def test_input_and_validation_errors_leave_no_output(self):
        pbf, land, aoi, config = self.inputs("standard")
        bowtie = {"type": "Polygon", "coordinates": [[[8, 53], [8.001, 53.001], [8, 53.001], [8.001, 53], [8, 53]]]}
        tiny = {"type": "Polygon", "coordinates": [[[8, 53], [8 + 1e-11, 53], [8.001, 53], [8.001, 53.001], [8, 53]]]}
        cases = [
            ((pbf, land.with_name("missing.json"), aoi, config), "Missing source"),
            ((pbf.with_name("missing.osm.pbf"), land, aoi, config), "Missing local"),
            ((pbf, land, bowtie, config), "Invalid AOI"),
            ((pbf, land, tiny, config), "millimeter grid|quantization collision"),
            ((pbf, land, aoi, {**config, "paddingM": 10000}), "coordinate limit"),
            (self.inputs("missing-node"), "Incomplete OSM references"),
            (self.inputs("missing-relation"), "Incomplete OSM references"),
            (self.inputs("unplayable"), "No playable component"),
        ]
        for inputs, regex in cases:
            with self.subTest(error=regex), self.assertRaisesRegex(ImportFailure, regex):
                self.run_import(inputs)
            self.assertFalse((self.root / "package").exists())

        with patch.dict("woc_osm.package.FILE_SCHEMAS", {"world": ("city-v3", 3, 100)}):
            with self.assertRaisesRegex(ImportFailure, "WORLD_PACKAGE_SIZE_LIMIT"):
                self.run_import((pbf, land, aoi, config))
        self.assertFalse((self.root / "package").exists())
        with self.assertRaisesRegex(ImportFailure, "Runtime validator could not run"):
            import_world(pbf, land, aoi, config, self.root / "package", self.root / "missing-cli")
        self.assertFalse((self.root / "package").exists())
        self.assertFalse(list(self.root.glob(".woc-import-*")))


if __name__ == "__main__":
    unittest.main()
