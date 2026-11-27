from collections import Counter, defaultdict
from math import isqrt

from shapely import prepare
from shapely.geometry import LineString, Point, box

from .geometry import bounded_line, label_id, pieces, require, xy

PUBLIC_FOOT = {"yes", "designated", "permissive", "official"}
FOOT_HIGHWAYS = {
    "footway", "pedestrian", "path", "steps", "living_street", "residential", "service",
    "unclassified", "tertiary", "secondary", "primary", "track", "tertiary_link",
    "secondary_link", "primary_link",
}


def public_access(tags):
    foot = tags.get("foot")
    return (not any(key in tags for key in ("foot:conditional", "access:conditional"))
            and (foot in PUBLIC_FOOT or (foot is None and tags.get("access") in (None, *PUBLIC_FOOT))))


def foot_exclusion(tags):
    if any(tags.get(key) not in (None, "no") for key in ("bridge", "tunnel", "covered", "indoor")) or tags.get("layer", "0") != "0":
        return "unsupportedLevel"
    if tags.get("highway") not in FOOT_HIGHWAYS or tags.get("area") == "yes":
        return "unsupportedHighway"
    if not public_access(tags) or tags.get("oneway:foot") not in (None, "no"):
        return "restrictedAccess"
    if tags.get("highway") == "path" and tags.get("foot") not in PUBLIC_FOOT:
        return "unconfirmedPathAccess"
    return None


def length_mm(points):
    length = 0
    for a, b in zip(points, points[1:]):
        x = round(b[0] * 1000) - round(a[0] * 1000)
        z = round(b[1] * 1000) - round(a[1] * 1000)
        squared = x * x + z * z
        low = isqrt(squared)
        length += low + (squared - low * low > low)
    return length


def components(edges):
    adjacent = defaultdict(set)
    for edge in edges:
        adjacent[edge["a"]].add(edge["b"])
        adjacent[edge["b"]].add(edge["a"])
    groups = []
    seen = set()
    for root in sorted(adjacent):
        if root in seen:
            continue
        group = {root}
        queue = [root]
        seen.add(root)
        for node in queue:
            new = adjacent[node] - seen
            queue.extend(sorted(new))
            group.update(new)
            seen.update(new)
        groups.append(group)
    return sorted(groups, key=lambda group: (-len(group), min(group)))


def compact_edges(edges, protected, nodes):
    """Contract only forward runs from the same OSM way, keeping bends in the path."""
    degree = Counter(edge[side] for edge in edges for side in ("a", "b"))
    starts = defaultdict(list)
    ends = defaultdict(list)
    for edge in edges:
        starts[edge["a"], edge["source"]].append(edge)
        ends[edge["b"], edge["source"]].append(edge)

    def neighbor(index, node, source):
        links = index[node, source]
        if node not in protected and degree[node] == 2 and len(links) == 1:
            return links[0]
        return None

    ordered = sorted(edges, key=lambda edge: (neighbor(ends, edge["a"], edge["source"]) is not None, edge["id"]))
    used = set()
    result = []
    for edge in ordered:
        if edge["id"] in used:
            continue
        first = last = edge
        path = list(first["path"])
        used.add(edge["id"])
        while True:
            step = neighbor(starts, last["b"], last["source"])
            if not step or step["id"] in used or step["b"] == first["a"]:
                break
            path.extend(step["path"][1:])
            used.add(step["id"])
            last = step
        a, b = first["a"], last["b"]
        source = first["source"]
        result.append({"id": label_id(f"foot-{source}", [a, b, path]), "a": a, "b": b,
                       "path": path, "mode": "foot", "lengthMm": length_mm(path)})
    nodes = {node: nodes[node] for edge in result for node in (edge["a"], edge["b"])}
    return sorted(result, key=lambda edge: edge["id"]), nodes


def make_navigation(ways, aoi, land, building_index, districts, pois, access_nodes, desired_start, counts, report):
    prepare(aoi)
    prepare(land)
    nodes, edges = {}, []
    barriers = {f"n-{id_}" for id_, tags in access_nodes.items() if not public_access(tags)
                or (tags.get("barrier") not in (None, "no", "bollard", "cycle_barrier", "kerb", "entrance")
                    and tags.get("foot") not in PUBLIC_FOOT)}
    for way, coordinates in ways:
        reason = foot_exclusion(way.tags)
        if reason:
            counts[reason] += 1
            continue
        for a, b, p, q in zip(way.nodes, way.nodes[1:], coordinates, coordinates[1:]):
            if a in barriers or b in barriers:
                counts["restrictedNodeSegments"] += 1
                continue
            if p == q or a == b:
                counts["collapsedWaySegments"] += 1
                continue
            segment = LineString([p, q])
            for fragment in pieces(segment if aoi.covers(segment) else segment.intersection(aoi), "LineString"):
                clipped = bounded_line(fragment, aoi)
                if clipped is None:
                    counts["collapsedWaySegments"] += 1
                    continue
                if not land.covers(clipped) or len(building_index.query(clipped, predicate="intersects")):
                    counts["blockedWaySegments"] += 1
                    continue
                path = tuple(xy(point) for point in clipped.coords)
                start, end = path[0], path[-1]

                def node_id(point):
                    if point == p:
                        return a
                    if point == q:
                        return b
                    return label_id(f"cut-{way.id}", [sorted((a, b)), point])

                left, right = node_id(start), node_id(end)
                nodes[left], nodes[right] = start, end
                edges.append({"id": label_id(f"foot-{way.id}", [left, right, path]), "source": way.id,
                              "a": left, "b": right, "path": path})

    occupied = {}
    for node, point in sorted(nodes.items(), key=lambda item: (not item[0].startswith("n-"), item[0])):
        occupied.setdefault(point, node)
    blocked = {node for node, point in nodes.items() if occupied[point] != node}
    counts["quantizationCollisions"] = len(blocked)
    filtered = {edge["id"]: edge for edge in edges if edge["a"] not in blocked and edge["b"] not in blocked}
    counts["excludedDuplicateOrCollidingEdges"] = len(edges) - len(filtered)
    edges = list(filtered.values())
    groups = components(edges)
    require(groups, "No playable component in the AOI after access and geometry checks")
    group = groups[0]
    if desired_start is not None:
        # Explicit start is a nearby reachable graph node. No through-wall or through-water snap.
        candidates = []
        for node in {node for group in groups for node in group}:
            p = nodes[node]
            distance = desired_start.distance(Point(p))
            if distance > 35:
                continue
            access = LineString([desired_start.coords[0], p]) if distance else Point(p)
            if land.covers(access) and not len(building_index.query(access, predicate="intersects")):
                candidates.append((distance, node))
        require(candidates, "Requested start has no visible foot node within 35 m")
        _, start = min(candidates)
        group = next(group for group in groups if start in group)
    else:
        start = min(group, key=lambda node: (nodes[node][0] ** 2 + nodes[node][1] ** 2, node))
    require(len(group) >= 3, "Playable component needs at least three distinct nodes for start, destinations and spawns")
    report["componentSizes"] = [len(part) for part in groups]
    counts["components"] = len(groups)
    selected = [edge for edge in edges if edge["a"] in group]
    counts["disconnectedEdges"] = len(edges) - len(selected)

    locations = []
    used_access = {start}

    def location(id_, name, kind, node, description):
        pt = Point(nodes[node])
        district = next((d["id"] for d, area in districts if area.covers(pt)), districts[-1][0]["id"])
        used_access.add(node)
        locations.append({"id": id_, "name": name, "type": kind, "position": nodes[node],
                          "district": district, "description": description, "access": node})

    for poi in sorted(pois, key=lambda poi: poi.id):
        if poi.id not in group or poi.id in used_access or not public_access(poi.tags):
            counts["excludedPois"] += 1
            continue
        name = poi.tags.get("name", "").strip()
        location(f"poi-{poi.id}", name or POI_LABELS[poi.kind], poi.kind, poi.id, "Ort aus OpenStreetMap.")
    ranked = sorted(group - {start}, key=lambda node: (
        -((nodes[node][0] - nodes[start][0]) ** 2 + (nodes[node][1] - nodes[start][1]) ** 2), node,
    ))
    for node in ranked:
        if len(locations) >= 2:
            break
        if node in used_access:
            continue
        counts["generatedDestinations"] += 1
        location(f"test-stop-{node}", f"Testreiseziel {counts['generatedDestinations']}", "waypoint", node,
                 "Generiertes Reiseziel am Fusswegenetz.")
    spawns = {"resident-ada": {"node": start}, "resident-ben": {"node": ranked[-1]}, "ambient-01": {"node": ranked[-2]}}
    patrol = [spawns["ambient-01"]["node"], ranked[0]]
    if patrol[0] == patrol[1]:
        patrol[1] = start
    protected = used_access | {spawn["node"] for spawn in spawns.values()} | set(patrol)
    final_edges, final_nodes = compact_edges(selected, protected, nodes)
    counts.update({"graphEdges": len(final_edges), "graphNodes": len(final_nodes), "locations": len(locations)})
    report["spawns"] = spawns
    report["ambientPatrol"] = patrol
    return nodes[start], sorted(locations, key=lambda item: item["id"]), {
        "start": start, "nodes": [{"id": node, "position": point} for node, point in sorted(final_nodes.items())],
        "edges": final_edges, "spawns": spawns, "ambientPatrol": patrol,
    }


POI_LABELS = {
    "cafe": "Cafe", "library": "Bibliothek", "marketplace": "Marktplatz", "restaurant": "Restaurant",
    "community_centre": "Gemeinschaftshaus", "park": "Park", "garden": "Garten", "playground": "Spielplatz",
    "museum": "Museum", "attraction": "Sehenswuerdigkeit", "viewpoint": "Aussichtspunkt",
}
