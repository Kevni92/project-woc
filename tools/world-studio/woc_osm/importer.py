from collections import Counter
from math import isfinite
from pathlib import Path
from time import perf_counter
import os

from pyproj import network
from pyproj.exceptions import ProjError
from shapely import STRtree, normalize, prepare, set_precision, snap, union_all
from shapely.errors import GEOSException
from shapely.geometry import LineString, Point, box, mapping

from .geometry import (GENERATOR, GRID, REPO, ImportFailure, Projection, bounded_line, encode_area, input_aoi,
                       label_id, load_json, load_land, pieces, polygonal, quantize_aoi, require, rings, xy)
from .navigation import make_navigation
from .osm import normalize_area, read_osm
from .package import digest_file, export_package

ATTRIBUTION = "\u00a9 OpenStreetMap contributors"
OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright"
MAIN_ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary",
              "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
ROAD_WIDTHS = {"motorway": 14, "trunk": 12, "primary": 10, "secondary": 9, "tertiary": 7,
               "service": 4, "living_street": 5, "footway": 2, "pedestrian": 3, "path": 2, "steps": 2,
               "cycleway": 2.5, "track": 3, "bridleway": 2.5}


def positive_tag(value, maximum):
    if value is None:
        return None
    try:
        number = float(value.removesuffix(" m").strip())
        return number if GRID <= number <= maximum else None
    except ValueError:
        return None


def building_appearance(id_, tags, seed, counts):
    use = tags.get("building")
    if use in {"industrial", "warehouse", "hangar", "farm_auxiliary", "garage", "garages"}:
        profile, low, high = "warehouse", 4, 10
    elif use in {"retail", "commercial", "office", "school", "hospital", "hotel"}:
        profile, low, high = "commercial", 8, 21
    else:
        profile, low, high = "residential", 5, 13
    height = positive_tag(tags.get("height"), 1000)
    if height is None:
        levels = positive_tag(tags.get("building:levels"), 250)
        if levels is not None:
            height = levels * 3
            counts["levelHeights"] += 1
        else:
            fraction = int(label_id("h", [id_, seed]).split("-")[1], 16) / (2**64 - 1)
            height = low + (high - low) * fraction
            counts["estimatedHeights"] += 1
    appearance = {"buildingId": id_, "profile": profile}
    roof = tags.get("roof:shape")
    if roof:
        appearance["roof"] = "gabled" if roof == "gabled" else "flat"
        roof_height = positive_tag(tags.get("roof:height"), 1000)
        if roof == "gabled" and roof_height and round(roof_height, 3) < round(height, 3):
            appearance["roofHeightM"] = max(GRID, round(roof_height, 3))
    return max(GRID, round(height, 3)), appearance


def rounded_polygon(geometry, counts):
    result = polygonal(set_precision(geometry, GRID))
    if geometry.area and (result.is_empty or not result.is_valid):
        counts["collapsedPolygons"] += 1
    return result


def clip_polygon(geometry, mask, counts):
    result = rounded_polygon(geometry.intersection(mask), counts)
    if not mask.covers(result) and not result.is_empty:
        # A snapped intersection can fall across an angled edge by a fraction of a millimeter.
        # In that case clip on the inside, keeping the exported area a strict subset.
        result = rounded_polygon(geometry.intersection(mask.buffer(-0.002)), counts)
        counts["inwardGridClips"] += 1
    require(result.is_empty or mask.covers(result), "Clipped polygon lies outside the mask on the millimeter grid")
    return result


def point_inside(geometry):
    p = geometry.representative_point()
    rounded = xy(p.coords[0])
    if geometry.covers(Point(rounded)):
        return rounded
    for part in pieces(geometry, "Polygon"):
        for coord in part.exterior.coords:
            if geometry.covers(Point(xy(coord))):
                return xy(coord)
    raise ImportFailure("No representative point on the millimeter grid")


def make_buildings(features, aoi, land, districts, seed, counts):
    candidates = []
    parts = []
    for item in features:
        if item.kind not in {"building", "part"} or not item.geometry.intersects(aoi):
            continue
        if not aoi.covers(item.geometry):
            counts["boundaryBuildings"] += 1
            continue
        geometry = rounded_polygon(item.geometry, counts)
        if geometry.is_empty or not land.covers(geometry):
            counts["excludedBuildingsOutsideLand"] += 1
            continue
        (parts if item.kind == "part" else candidates).append((item, geometry))
    candidates.sort(key=lambda entry: (not entry[0].id.startswith("r-"), -entry[1].area, entry[0].id))
    index = STRtree([geometry for _, geometry in candidates])
    kept = set()
    for i, (_, geometry) in enumerate(candidates):
        overlaps = index.query(geometry, predicate="intersects")
        if any(other in kept and geometry.intersection(candidates[other][1]).area > 0 for other in overlaps):
            counts["overlappingBuildings"] += 1
        else:
            kept.add(i)
    for _, geometry in parts:
        parents = [i for i in index.query(geometry, predicate="within") if i in kept]
        counts["coveredBuildingParts" if len(parents) == 1 else "ambiguousBuildingParts"] += 1

    result = []
    for i in sorted(kept, key=lambda i: candidates[i][0].id):
        item, geometry = candidates[i]
        id_ = f"building-{item.id}"
        district = next((district["id"] for district, area in districts if area.covers(geometry.representative_point())),
                        districts[-1][0]["id"])
        height, visual = building_appearance(id_, item.tags, seed, counts)
        result.append(({"id": id_, "district": district, "height": height, "footprint": encode_area(geometry)}, visual, geometry))
    return result


def make_roads(ways, aoi, counts):
    roads = []
    for way, coordinates in ways:
        if len(set(coordinates)) < 2:
            counts["collapsedRoads"] += 1
            continue
        axis = LineString(coordinates)
        tags = way.tags
        highway = tags["highway"]
        kind = "avenue" if highway in MAIN_ROADS else "street"
        width = positive_tag(tags.get("width"), 80) or ROAD_WIDTHS.get(highway, 6)
        if tags.get("area") == "yes":
            counts["excludedHighwayAreas"] += 1
            continue
        applied = False
        for fragment in pieces(axis if aoi.covers(axis) else axis.intersection(aoi), "LineString"):
            snapped = bounded_line(fragment, aoi)
            if snapped is None:
                counts["collapsedRoads"] += 1
                continue
            path = [xy(point) for point in snapped.coords]
            path = min(path, list(reversed(path)))
            corridor = clip_polygon(snapped.buffer(width / 2, cap_style="flat", join_style="round", quad_segs=3),
                                    aoi, counts)
            if corridor.is_empty:
                counts["collapsedRoads"] += 1
                continue
            id_ = label_id(f"road-{way.id}", path)
            profile = "main" if kind == "avenue" else "local"
            roads.append(({"id": id_, "kind": kind, "width": width, "path": path},
                          {"roadId": id_, "profile": profile, "polygon": encode_area(corridor)}, corridor))
            applied = True
        if not applied:
            counts["excludedRoads"] += 1
    return list({road[0]["id"]: road for road in sorted(roads, key=lambda road: road[0]["id"])}.values())


def build_coasts(land, aoi, mode):
    coasts = []
    for polygon in pieces(normalize(land), "Polygon"):
        for ring in rings(polygon):
            points = [xy(coord) for coord in ring.coords]
            runs = []
            for p, q in zip(points, points[1:]):
                edge = LineString([p, q])
                if aoi.boundary.covers(edge):
                    kind = "island" if mode == "island" else "cut"
                else:
                    kind = "shore"
                if runs and runs[-1][0] == kind:
                    runs[-1][1].append(q)
                else:
                    runs.append((kind, [p, q]))
            for kind, path in runs:
                coasts.append({"id": label_id("coast", [kind, path]), "kind": kind, "path": path})
    return sorted(coasts, key=lambda coast: coast["id"])


def valid_config(config):
    require(isinstance(config, dict), "Config must be a JSON object")
    required = {"worldId", "name", "revision", "seed", "mode", "landSource"}
    require(required <= config.keys(), f"Missing config fields: {', '.join(sorted(required - config.keys()))}")
    import re
    require(isinstance(config["worldId"], str) and len(config["worldId"]) <= 64
            and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", config["worldId"]), "Invalid worldId")
    require(isinstance(config["name"], str) and 0 < len(config["name"].strip()) <= 120, "Invalid world name")
    require(type(config["revision"]) is int and 0 < config["revision"] <= 2147483647, "Invalid revision")
    require(type(config["seed"]) in (int, str), "Seed must be a string or integer")
    require(config["mode"] in ("natural", "island"), "Mode must be natural or island")
    source = config["landSource"]
    require(isinstance(source, dict) and {"provider", "url", "license", "attribution", "dataDate"} <= source.keys(),
            "Land source requires provider, URL, license, attribution and data date")
    padding = config.get("paddingM", 500 if config["mode"] == "island" else 0)
    require(type(padding) in (int, float) and isfinite(padding) and 0 <= padding <= 10000, "Invalid paddingM")
    return padding


def import_world(pbf, land_source, aoi_geojson, config, output, native, node="node", progress=None, report=None):
    """Generate, validate and atomically publish one package. All inputs and validators are local."""
    from psutil import Process
    from threading import Event, Thread

    report = {} if report is None else report
    counts = Counter()
    warnings = []
    report.update(counts=counts, warnings=warnings, phasesMs={})
    process = Process()
    peak_rss = process.memory_info().rss
    stopped = Event()

    def sample():
        nonlocal peak_rss
        while not stopped.wait(0.025):
            peak_rss = max(peak_rss, process.memory_info().rss)

    sampler = Thread(target=sample, daemon=True)
    sampler.start()
    started = previous = perf_counter()
    current = None

    def phase(next_phase):
        nonlocal previous, current
        now = perf_counter()
        if current:
            report["phasesMs"][current] = (now - previous) * 1000
        current, previous = next_phase, now
        if progress and current:
            progress(current)

    try:
        output = Path(output).absolute()
        output = output.parent.resolve() / output.name
        require(not os.path.lexists(output), f"Output already exists: {output}")
        require(output.parent.is_dir(), f"Output parent does not exist: {output.parent}")
        padding = valid_config(config)
        aoi_source = input_aoi(aoi_geojson)
        network.set_network_enabled(False)
        projection = Projection.for_aoi(aoi_source)
        aoi = quantize_aoi(projection.geometry(aoi_source))
        x1, z1, x2, z2 = aoi.bounds
        x1, z1, x2, z2 = (*xy((x1 - padding, z1 - padding)), *xy((x2 + padding, z2 + padding)))
        require(max(abs(v) for v in (x1, x2, z1, z2)) <= 10000, "WorldBounds exceeds the current +/-10 km coordinate limit")
        bounds = {"minX": x1, "maxX": x2, "minZ": z1, "maxZ": z2}
        mode, world_id, seed = config["mode"], config["worldId"], str(config["seed"])
        report["aoiAreaM2"] = aoi.area
        report["bounds"] = bounds
        phase("decode")
        source_land = load_land(land_source, aoi_source)
        features, raw_ways, pois, access_nodes, data_date = read_osm(pbf, aoi_source, counts)
        counts.update({"sourceAreas": len(features), "sourceHighways": len(raw_ways), "sourcePois": len(pois)})
        phase("project-normalize")
        near_aoi = box(*aoi_source.bounds).buffer(0.003, join_style="mitre")
        ground = union_all([projection.geometry(geo.intersection(near_aoi)) for geo in source_land])
        for feature in features:
            feature.geometry = normalize_area(projection.geometry(feature.geometry), counts)
        features.sort(key=lambda feature: feature.id)
        ways = [(way, tuple(xy(projection.coordinates(*coord)) for coord in way.coordinates))
                for way in sorted(raw_ways, key=lambda way: way.id)]
        start = None
        if "start" in config:
            pos = config["start"]
            require(isinstance(pos, list) and len(pos) == 2 and all(
                type(v) in (float, int) and isfinite(v) for v in pos
            ), "Start must be a WGS84 longitude/latitude pair")
            require(aoi_source.covers(Point(pos)), "Requested start is outside the AOI")
            start = Point(projection.coordinates(*pos))

        phase("clip")
        waters = [item for item in features if item.kind == "water" and item.geometry.intersects(aoi)]
        water = union_all([item.geometry for item in waters], grid_size=GRID)
        report["waterSources"] = [item.id for item in waters]
        land = rounded_polygon(ground.difference(water).intersection(aoi), counts)
        if not land.is_empty and not aoi.covers(land):
            # Node angled cuts with the rounded land intersection so both files
            # describe the same AOI boundary and the same coastline.
            aoi = quantize_aoi(snap(aoi, land, 0.0009))
            counts["aoiGridNodes"] += 1
            x1, z1, x2, z2 = aoi.bounds
            require(x1 >= bounds["minX"] and z1 >= bounds["minZ"] and x2 <= bounds["maxX"] and z2 <= bounds["maxZ"],
                    "Quantized AOI exceeds WorldBounds")
        require(not land.is_empty and aoi.covers(land) and land.is_valid, "No valid land is available inside the AOI")
        report["aoiAreaM2"] = aoi.area
        prepare(land)
        prepare(aoi)
        districts = []
        for feature in features:
            if feature.kind != "district":
                continue
            outline = clip_polygon(feature.geometry, land, counts)
            if not outline.is_empty:
                districts.append(({"id": f"district-{feature.id}", "name": feature.tags["name"],
                                   "label": point_inside(outline), "outline": encode_area(outline)}, outline))
        uncovered = clip_polygon(land.difference(union_all([geo for _, geo in districts])), land, counts)
        if not uncovered.is_empty:
            districts.append(({"id": "district-generated", "name": "Generiertes Gebiet",
                               "label": point_inside(uncovered), "outline": encode_area(uncovered)}, uncovered))
        require(districts, "No district with usable land")
        buildings = make_buildings(features, aoi, land, districts, seed, counts)
        roads = make_roads(ways, aoi, counts)
        occupied = STRtree([geometry for _, _, geometry in buildings])

        phase("graph-locations-spawns")
        start_point, locations, navigation = make_navigation(ways, aoi, land, occupied, districts, pois,
                                                             access_nodes, start, counts, report)

        phase("visuals")
        exclusions = [geo for _, _, geo in buildings] + [geo for _, _, geo in roads]
        exclusion_index = STRtree(exclusions)
        surfaces = []
        for item in features:
            if item.kind not in {"grass", "beach"}:
                continue
            surface = clip_polygon(item.geometry, land, counts)
            if surface.is_empty:
                continue
            overlaps = exclusion_index.query(surface, predicate="intersects")
            if len(overlaps):
                # Small grid clearance avoids snapping a difference back into an occupied corridor.
                clear = union_all([exclusions[i].buffer(0.002, quad_segs=2) for i in overlaps])
                surface = clip_polygon(surface.difference(clear), land, counts)
            if not surface.is_empty:
                surfaces.append({"id": f"surface-{item.id}", "kind": item.kind, "polygon": encode_area(surface)})
        coasts = build_coasts(land, aoi, mode)
        counts.update({"buildings": len(buildings), "roads": len(roads), "districts": len(districts),
                       "waterFeatures": len(waters), "surfaces": len(surfaces), "coasts": len(coasts)})
        if counts["disconnectedEdges"]:
            warnings.append("Disconnected walking components are represented visually only.")
        if counts["estimatedHeights"]:
            warnings.append("Missing building heights were estimated from building use and seed.")
        if counts["excludedPois"]:
            warnings.append("Only public POIs on an unambiguous reachable OSM node are playable.")
        if counts["inwardGridClips"]:
            warnings.append("Angled intersections that snapped outside were clipped with a 2 mm interior clearance.")
        if counts["ambiguousBuildingParts"]:
            warnings.append("Building parts without a unique retained parent were excluded.")
        if counts["quantizationCollisions"]:
            warnings.append("Coincident independent graph nodes were excluded without joining ways.")

        report["quality"] = dict(sorted(counts.items()))
        world = {"version": 3, "id": world_id, "name": config["name"], "boundaryMode": mode,
                 "bounds": bounds, "aoi": encode_area(aoi), "land": encode_area(land), "start": start_point,
                 "navigation": navigation, "locations": locations, "districts": [district for district, _ in districts],
                 "greens": [], "buildings": [building for building, _, _ in buildings], "roads": [road for road, _, _ in roads]}
        wet = aoi.difference(land)
        if not wet.is_empty and wet.area > 1:
            p = wet.representative_point()
            pt = xy(p.coords[0])
            if wet.covers(Point(pt)):
                world["waterLabel"] = {"name": "Gew\u00e4sser", "position": pt}
        visual = {"visualVersion": 2, "worldId": world_id, "worldVersion": 3, "revision": 1, "decorations": [],
                  "buildings": [visual for _, visual, _ in buildings], "roads": [visual for _, visual, _ in roads],
                  "surfaces": sorted(surfaces, key=lambda surface: surface["id"]), "coasts": coasts}

        phase("validate")
        osm = {"provider": config.get("osmProvider", "OpenStreetMap"), "url": config.get("osmUrl", OSM_COPYRIGHT),
               "license": "ODbL-1.0", "attribution": ATTRIBUTION, "sha256": digest_file(pbf)}
        if data_date or config.get("osmDataDate"):
            osm["dataDate"] = config.get("osmDataDate") or data_date
        land_provenance = {**config["landSource"], "sha256": digest_file(land_source)}
        crs = projection.crs.to_string()
        provenance = {"provenanceVersion": 1, "method": "osm-pbf", "generatorVersion": GENERATOR, "seed": seed,
                      "sources": [osm, land_provenance], "warnings": warnings, "qualityReport": report["quality"],
                      "parameters": {"sourceCRS": "EPSG:4326", "projectedCRS": crs, "origin": projection.origin,
                                     "aoi": mapping(aoi_source), "boundaryMode": mode, "paddingM": padding,
                                     **({"requestedStart": config["start"]} if "start" in config else {})}}
        theme = load_json(REPO / "content/public/worlds/breakwater/theme.json")
        metadata = {"packageVersion": 1, "worldId": world_id, "displayName": config["name"], "worldSchemaVersion": 3,
                    "worldRevision": config["revision"], "visualRevision": 1, "bounds": bounds, "units": "m",
                    "axes": {"x": "east", "z": "south", "y": "up"}, "scaleFactor": 1,
                    "sourceCRS": "EPSG:4326", "origin": projection.origin}
        data = {"world": world, "visual": visual, "theme": theme, "provenance": provenance}
        manifest = export_package(output, data, metadata, native, node, report, phase)
        report["semanticHash"] = manifest["semanticHash"]
        return manifest
    except (ProjError, GEOSException) as error:
        report["error"] = f"{current or 'projection'}: {error}"
        raise ImportFailure(report["error"]) from error
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        phase(None)
        stopped.set()
        sampler.join()
        memory = process.memory_info()
        report["peakRssBytes"] = max(peak_rss, memory.rss, getattr(memory, "peak_wset", 0))
        report["totalMs"] = (perf_counter() - started) * 1000
