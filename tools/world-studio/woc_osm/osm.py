from dataclasses import dataclass
from shapely import from_wkb, make_valid
from shapely.geometry import box
import osmium

from .geometry import ImportFailure, polygonal, require

POI_TYPES = {
    "amenity": {"cafe", "library", "marketplace", "restaurant", "community_centre"},
    "leisure": {"park", "garden", "playground"},
    "tourism": {"museum", "attraction", "viewpoint"},
}


def poi_type(tags):
    return next((tags[key] for key, values in POI_TYPES.items() if tags.get(key) in values), None)


def area_kind(tags):
    if tags.get("building") not in (None, "no"):
        return "building"
    if tags.get("building:part") not in (None, "no"):
        return "part"
    if tags.get("natural") == "water" or tags.get("waterway") == "riverbank" or tags.get("landuse") in {"reservoir", "basin"}:
        return "water"
    if tags.get("natural") == "beach":
        return "beach"
    if (tags.get("leisure") in {"park", "garden", "recreation_ground", "playground"}
            or tags.get("landuse") in {"grass", "forest", "recreation_ground"}
            or tags.get("natural") in {"wood", "grassland", "scrub"}):
        return "grass"
    if tags.get("boundary") == "administrative" and tags.get("name") and tags.get("admin_level") in {"9", "10", "11"}:
        return "district"
    return None


@dataclass
class AreaFeature:
    id: str
    kind: str
    tags: dict
    geometry: object


@dataclass
class Way:
    id: str
    tags: dict
    nodes: tuple
    coordinates: tuple


@dataclass
class Poi:
    id: str
    kind: str
    tags: dict


def near(coordinates, bounds):
    if not coordinates:
        return False
    west, south, east, north = bounds
    lon, lat = zip(*coordinates)
    return max(lon) >= west and min(lon) <= east and max(lat) >= south and min(lat) <= north


def read_osm(path, aoi, counts):
    require(path.is_file() and path.name.lower().endswith(".osm.pbf"), f"Missing local .osm.pbf source: {path}")
    areas, ways, pois = {}, {}, {}
    near_ways, seen_ways, relations, restricted_nodes = set(), set(), {}, {}
    missing_nodes = {}
    factory = osmium.geom.WKBFactory()
    bounds = aoi.bounds
    date = None
    try:
        processor = osmium.FileProcessor(str(path)).with_locations().with_areas()
        date = processor.header.get("osmosis_replication_timestamp") or None
        for element in processor:
            kind = element.type_str()
            if kind == "n":
                if not element.tags:
                    continue
                tags = dict(element.tags)
                if any(key in tags for key in ("foot", "access", "barrier", "foot:conditional", "access:conditional")):
                    if near([(element.location.lon, element.location.lat)], bounds):
                        restricted_nodes[element.id] = tags
                category = poi_type(tags)
                if category and near([(element.location.lon, element.location.lat)], bounds):
                    pois[f"n-{element.id}"] = Poi(f"n-{element.id}", category, tags)
            elif kind == "w":
                tags = dict(element.tags)
                seen_ways.add(element.id)
                coordinates = tuple((node.lon, node.lat) for node in element.nodes if node.location.valid())
                require(coordinates or not ("highway" in tags or area_kind(tags)),
                        f"Incomplete OSM references: way {element.id} has no available nodes")
                if not near(coordinates, bounds):
                    continue
                near_ways.add(element.id)
                if len(coordinates) != len(element.nodes):
                    missing_nodes[element.id] = True
                    require(not ("highway" in tags or area_kind(tags)),
                            f"Incomplete OSM references: way {element.id} is missing nodes")
                elif "highway" in tags and len(coordinates) >= 2:
                    way_id = f"w-{element.id}"
                    ways[way_id] = Way(way_id, tags, tuple(f"n-{node.ref}" for node in element.nodes), coordinates)
                if poi_type(tags):
                    pois[f"w-{element.id}"] = Poi(f"w-{element.id}", poi_type(tags), tags)
            elif kind == "r":
                tags = dict(element.tags)
                if tags.get("type") in {"multipolygon", "boundary"} and area_kind(tags):
                    members = tuple((member.type, member.ref, member.role) for member in element.members)
                    relations[element.id] = (area_kind(tags), members)
            elif kind == "a":
                if element.from_way() and element.orig_id() not in near_ways:
                    continue
                tags = dict(element.tags)
                category = area_kind(tags)
                if not category:
                    continue
                source = f"{'w' if element.from_way() else 'r'}-{element.orig_id()}"
                try:
                    geometry = from_wkb(factory.create_multipolygon(element))
                except (osmium.InvalidLocationError, RuntimeError):
                    counts["excludedSourceGeometry"] += 1
                    continue
                if not box(*bounds).intersects(box(*geometry.bounds)):
                    continue
                areas[source] = AreaFeature(source, category, tags, geometry)
                if not element.from_way() and poi_type(tags):
                    pois[source] = Poi(source, poi_type(tags), tags)
    except (RuntimeError, OSError) as error:
        raise ImportFailure(f"Unable to decode {path.name}: {error}") from error
    for relation, (category, members) in sorted(relations.items()):
        member_ways = {ref for kind, ref, _ in members if kind == "w"}
        if not member_ways & near_ways and f"r-{relation}" not in areas:
            continue
        incomplete = member_ways - seen_ways or member_ways & missing_nodes.keys()
        if category == "district" and incomplete:
            counts["excludedIncompleteDistricts"] += 1
            areas.pop(f"r-{relation}", None)
            continue
        require(not incomplete, f"Incomplete OSM references: relation {relation} is missing ways or nodes")
        if f"r-{relation}" not in areas:
            counts["excludedUnresolvedRelations"] += 1
            continue
        for kind, ref, role in members:
            member = areas.get(f"w-{ref}")
            if kind == "w" and role in ("", "outer", "inner") and member and member.kind == category:
                counts["duplicateRelationMembers"] += 1
                del areas[member.id]
    return list(areas.values()), list(ways.values()), list(pois.values()), restricted_nodes, date


def normalize_area(geometry, counts):
    if not geometry.is_valid:
        counts["repairedSourceGeometry"] += 1
        geometry = make_valid(geometry)
    geometry = polygonal(geometry)
    if geometry.is_empty:
        counts["excludedSourceGeometry"] += 1
    return geometry
