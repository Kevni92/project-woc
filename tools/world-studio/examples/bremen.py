"""Prepare WGS84 inputs for the Bremen measurements from a local land shapefile."""
import argparse
from pathlib import Path

from pyproj import Transformer
import shapefile

from woc_osm.geometry import json_bytes


def prepare(shp, output):
    project = Transformer.from_crs(4326, 32632, always_xy=True)
    unproject = Transformer.from_crs(32632, 4326, always_xy=True)
    output.mkdir(parents=True, exist_ok=True)
    all_points = []
    for slug, kilometers, lon, lat in [
        ("bremen-1km", 1, 8.8072, 53.0785),
        ("bremen-5km", 5, 8.8072, 53.0785),
        ("bremen-nord-5km", 5, 8.8185, 53.1115),
    ]:
        x, y = project.transform(lon, lat)
        d = kilometers * 500
        ring = [unproject.transform(px, py) for px, py in
                [(x-d, y-d), (x+d, y-d), (x+d, y+d), (x-d, y+d), (x-d, y-d)]]
        all_points.extend(ring)
        (output / f"{slug}-aoi.json").write_bytes(json_bytes({"type": "Polygon", "coordinates": [ring]}))
        config = {
            "worldId": slug, "name": f"{'Bremen Nord' if '-nord-' in slug else 'Bremen'} ({kilometers} x {kilometers} km)",
            "revision": 1, "seed": "bremen-2026", "mode": "natural",
            "osmProvider": "Geofabrik / OpenStreetMap",
            "osmUrl": "https://download.geofabrik.de/europe/germany/bremen.html",
            "landSource": {"provider": "osmdata.openstreetmap.de", "url": "https://osmdata.openstreetmap.de/data/land-polygons.html",
                           "license": "ODbL-1.0", "dataDate": "2026-11-25T22:00:00Z",
                           "attribution": "\u00a9 OpenStreetMap contributors"},
        }
        (output / f"{slug}-config.json").write_bytes(json_bytes(config))
    lon, lat = zip(*all_points)
    bounds = [min(lon) - .01, min(lat) - .01, max(lon) + .01, max(lat) + .01]
    with shapefile.Reader(str(shp)) as reader:
        features = [{"type": "Feature", "properties": {}, "geometry": record.__geo_interface__}
                    for record in reader.iterShapes(bbox=bounds)]
    (output / "bremen-land.geojson").write_bytes(json_bytes({"type": "FeatureCollection", "features": features}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("shp", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    prepare(args.shp, args.output)
