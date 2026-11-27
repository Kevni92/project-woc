"""Write a minimal local PBF and its WGS84 selection without network access."""
import argparse
from pathlib import Path

import osmium
from pyproj import Transformer

from woc_osm import import_world
from woc_osm.geometry import REPO, json_bytes, load_json
import sys

TRANSFORM = Transformer.from_crs(32632, 4326, always_xy=True)
ORIGIN = (487000, 5880000)


def degrees(x, z):
    return TRANSFORM.transform(ORIGIN[0] + x, ORIGIN[1] - z)


def polygon(*rings):
    return {"type": "Polygon", "coordinates": [[degrees(*point) for point in ring] for ring in rings]}


def rectangle(x1, z1, x2, z2):
    return [(x1, z1), (x2, z1), (x2, z2), (x1, z2), (x1, z1)]


def fixture(root, scenario="standard"):
    root.mkdir(parents=True, exist_ok=True)
    aoi = polygon([(-400, -300), (400, -300), (400, 300), (80, 300), (80, 195),
                   (-60, 195), (-60, 300), (-400, 300), (-400, -300)], rectangle(120, 80, 190, 145))
    (root / "aoi.json").write_bytes(json_bytes(aoi))
    (root / "land.json").write_bytes(json_bytes(polygon(rectangle(-500, -450, 550, 450))))
    config = {"worldId": "osm-fixture", "name": "OSM-Offline-Testwelt", "revision": 1, "seed": "offline",
              "mode": "natural", "paddingM": 100, "osmProvider": "Synthetische Testdaten",
              "osmDataDate": "2026-11-27",
              "landSource": {"provider": "WOC synthetic fixture", "url": "https://github.com/Kevni92/project-woc",
                             "license": "CC0-1.0", "attribution": "Project WOC", "dataDate": "2026-11-27"}}
    (root / "config.json").write_bytes(json_bytes(config))

    nodes = [
        (-470, 0), (-300, 0), (-210, 0), (-110, 0), (0, 0), (0, 90), (0, 155),
        (-210, -90), (-210, -190), (-110, 80), (-110, 160), (270, -230), (320, -230),
        (-300, -135), (-135, -135), (-300, -100), (-300, -230), (-210, 80), (-210, 165),
        (-100, -65), (0, -65), (-360, 40), (-345, 45), (-260, 30), (330, 20), (330, 190),
        (100, 110), (220, 110), (220, -200), (250, -200), (320, -220), (320, -180),
    ]
    if scenario == "collision":
        nodes[30] = nodes[11]
    ways = {
        1: ([1, 2, 3, 4, 5], {"highway": "residential", "width": "7 m"}),
        2: ([3, 8, 9], {"highway": "footway"}),
        3: ([4, 10, 11], {"highway": "residential"}),
        4: ([5, 6, 7], {"highway": "footway"}),
        5: ([12, 13], {"highway": "footway"}),
        6: ([14, 15], {"highway": "footway"}),  # crosses way 2 with no shared node
        7: ([2, 16, 17], {"highway": "residential", "access": "private"}),
        8: ([3, 18, 19], {"highway": "footway", "bridge": "yes", "layer": "1"}),
        9: ([5, 21, 20], {"highway": "footway", "tunnel": "yes"}),
        10: ([22, 23], {"highway": "motorway"}),
        11: ([25, 26], {"highway": "footway"}),  # crosses lake
        12: ([27, 28], {"highway": "footway"}),  # crosses the AOI hole
        13: ([29, 30], {"highway": "footway", "foot": "no"}),
        14: ([31, 32], {"highway": "footway"}),
    }
    relations = {}

    def ring(points):
        ids = list(range(len(nodes) + 1, len(nodes) + len(points)))
        nodes.extend(points[:-1])
        return ids + ids[:1]

    def area(id_, points, tags):
        ways[id_] = (ring(points), tags)

    area(101, rectangle(-380, 50, -340, 100), {"building": "house"})
    area(102, rectangle(-450, 25, -390, 80), {"building": "yes", "height": "9"})
    area(103, rectangle(-375, 65, -360, 85), {"building:part": "yes"})
    area(104, rectangle(-60, -245, 45, -204), {"natural": "beach"})
    area(105, rectangle(-320, -70, -245, 70), {"leisure": "park"})

    # A partial outer is assembled by relation IDs, including an inner and a second outer.
    exterior = ring(rectangle(288, 45, 355, 170))
    ways[110] = (exterior[:3], {})
    ways[111] = (exterior[2:], {})
    area(112, rectangle(300, 80, 319, 106), {})
    area(113, rectangle(218, 200, 244, 232), {})
    relations[201] = ({"type": "multipolygon", "natural": "water"},
                       [("w", 111, "outer"), ("w", 112, "inner"), ("w", 113, "outer"), ("w", 110, "outer")])
    area(114, rectangle(-120, -220, -88, -157), {})
    area(115, rectangle(-110, -210, -98, -185), {})
    relations[202] = ({"type": "multipolygon", "building": "commercial", "building:levels": "5"},
                       [("w", 114, "outer"), ("w", 115, "inner")])

    if scenario == "missing-node":
        ways[1][0].append(9999)
    if scenario == "missing-relation":
        relations[201][1].append(("w", 9999, "outer"))
    if scenario == "unplayable":
        for _, tags in ways.values():
            if "highway" in tags:
                tags["foot"] = "no"

    tags = {8: {"amenity": "library", "name": "Testbibliothek"}, 24: {"tourism": "museum", "name": "Testmuseum"}}
    pbf = root / "fixture.osm.pbf"
    with osmium.SimpleWriter(pbf) as writer:
        for id_, position in enumerate(nodes, 1):
            writer.add_node(osmium.osm.mutable.Node(id=id_, location=degrees(*position), tags=tags.get(id_, {})))
        for id_, (refs, tags) in sorted(ways.items()):
            writer.add_way(osmium.osm.mutable.Way(id=id_, nodes=refs, tags=tags))
        for id_, (tags, members) in sorted(relations.items()):
            writer.add_relation(osmium.osm.mutable.Relation(id=id_, members=members, tags=tags))
    return pbf


def export_fixtures(inputs, worlds):
    pbf = fixture(inputs)
    worlds.mkdir(parents=True, exist_ok=True)
    config = load_json(inputs / "config.json")
    aoi = load_json(inputs / "aoi.json")
    native = REPO / "build/native" / ("woc_cli.exe" if sys.platform == "win32" else "woc_cli")
    for settings in [config, {**config, "worldId": "osm-fixture-island", "name": "OSM-Insel-Testwelt", "mode": "island"}]:
        if settings["mode"] == "island":
            del settings["paddingM"]
        import_world(pbf, inputs / "land.json", aoi, settings, worlds / settings["worldId"], native)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--worlds", type=Path, help="Also validate and export both boundary modes to this directory")
    args = parser.parse_args()
    if args.worlds:
        export_fixtures(args.directory, args.worlds)
    else:
        fixture(args.directory)
