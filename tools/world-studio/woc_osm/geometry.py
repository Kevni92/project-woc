from dataclasses import dataclass
from hashlib import sha256
from math import isfinite
from pathlib import Path
import json

from pyproj import CRS, Transformer
from shapely import normalize, set_precision, union_all
from shapely.geometry import LineString, Polygon, box, shape
from shapely.ops import transform

GRID = 0.001
REPO = Path(__file__).resolve().parents[3]
GENERATOR = "woc-osm/1.0.0"


class ImportFailure(Exception):
    """Input, geometry, package or runtime validation rejected the import."""


def require(condition, message):
    if not condition:
        raise ImportFailure(message)


def load_json(path):
    require(path.is_file(), f"Missing source: {path}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def label_id(source, value):
    return f"{source}-{sha256(json_bytes(value)).hexdigest()[:16]}"


def mm_range(value):
    return float(value) if value else 0


def xy(point):
    return tuple(mm_range(round(float(v), 3)) for v in point)


def pieces(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from pieces(part, kind)


def polygonal(geometry):
    return union_all(list(pieces(geometry, "Polygon")))


def rings(polygon):
    return (polygon.exterior, *polygon.interiors)


def encode_area(geometry):
    result = []
    for polygon in pieces(normalize(geometry), "Polygon"):
        outer, *holes = [[xy(point) for point in ring.coords[:-1]] for ring in rings(polygon)]
        result.append({"outer": outer, "holes": holes})
    require(result, "Empty polygon after quantization")
    return {"polygons": result}


def input_aoi(document):
    require(isinstance(document, dict), "AOI must be a WGS84 GeoJSON Polygon")
    if document.get("type") == "Feature":
        document = document.get("geometry") or {}
    require(document.get("type") == "Polygon" and "crs" not in document, "AOI must be a WGS84 GeoJSON Polygon")
    rings_data = document.get("coordinates")
    require(isinstance(rings_data, (list, tuple)) and rings_data, "AOI does not contain rings")
    for ring in rings_data:
        require(isinstance(ring, (list, tuple)) and len(ring) >= 4 and ring[0] == ring[-1], "AOI rings must be closed")
        for point in ring:
            require(isinstance(point, (list, tuple)) and len(point) == 2 and all(
                type(v) in (int, float) and isfinite(v) for v in point
            ), "AOI coordinates must be finite longitude/latitude pairs")
            require(-180 < point[0] < 180 and -85 < point[1] < 85, "Antimeridian and polar regions are unsupported")
    polygon = shape(document)
    require(polygon.is_valid and polygon.area > 0, "Invalid AOI polygon (self-intersection or invalid holes)")
    require(polygon.bounds[2] - polygon.bounds[0] < 180, "Antimeridian AOI is unsupported")
    return polygon


@dataclass(frozen=True)
class Projection:
    crs: CRS
    origin: tuple[float, float]
    transformer: Transformer
    easting: float
    northing: float

    @classmethod
    def for_aoi(cls, polygon):
        lon, lat = polygon.centroid.coords[0]
        west, south, east, north = polygon.bounds
        zone = int((lon + 180) // 6) + 1
        central_meridian = zone * 6 - 183
        if south >= -80 and north < 84 and max(central_meridian - west, east - central_meridian) <= 3:
            crs = CRS.from_epsg((32600 if lat >= 0 else 32700) + zone)
        else:
            crs = CRS.from_proj4(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs")
        transformer = Transformer.from_crs(4326, crs, always_xy=True, allow_ballpark=False)
        easting, northing = transformer.transform(lon, lat, errcheck=True)
        return cls(crs, (lon, lat), transformer, easting, northing)

    def coordinates(self, lon, lat):
        east, north = self.transformer.transform(lon, lat, errcheck=True)
        return east - self.easting, self.northing - north

    def geometry(self, geometry):
        return transform(self.coordinates, geometry)


def quantize_aoi(projected):
    # Use pointwise rounding first. GEOS must never repair the user's selection.
    rounded = set_precision(projected, GRID, mode="pointwise")
    require(rounded.is_valid and not rounded.is_empty and rounded.area > 0, "AOI is invalid on the millimeter grid")
    require(all(len(set(ring.coords[:-1])) == len(ring.coords) - 1 for ring in rings(rounded)),
            "AOI contains a quantization collision")
    return set_precision(rounded, GRID)


def load_land(path, aoi):
    document = load_json(path)
    require(isinstance(document, dict) and "crs" not in document, "Land source must be WGS84 GeoJSON")
    kind = document.get("type")
    if kind == "FeatureCollection":
        features = [feature["geometry"] for feature in document.get("features", []) if feature.get("geometry")]
    elif kind == "Feature":
        features = [document.get("geometry")]
    else:
        features = [document]
    bounds = box(*aoi.bounds)
    result = []
    for feature in features:
        require(isinstance(feature, dict) and feature.get("type") in {"Polygon", "MultiPolygon"},
                "Land source must contain Polygon or MultiPolygon geometry")
        geometry = shape(feature)
        require(geometry.is_valid and not geometry.has_z and not geometry.is_empty,
                "Invalid polygon in land source")
        if bounds.intersects(geometry):
            result.append(geometry)
    require(result, "Land source does not cover any land in the AOI")
    return result


def bounded_line(line, area):
    """Round a clipped line; choose the closest inside lattice point at a cut."""
    from shapely.geometry import Point
    from itertools import product

    points = []
    for raw in line.coords:
        point = xy(raw)
        if not area.covers(Point(point)):
            candidates = [xy((point[0] + dx * GRID, point[1] + dz * GRID))
                          for dx, dz in product(range(-2, 3), repeat=2)]
            candidates.sort(key=lambda p: ((p[0] - raw[0]) ** 2 + (p[1] - raw[1]) ** 2, p))
            point = next((candidate for candidate in candidates if area.covers(Point(candidate))), None)
            if point is None:
                return None
        if not points or point != points[-1]:
            points.append(point)
    if len(points) < 2:
        return None
    result = LineString(points)
    return result if area.covers(result) else None
