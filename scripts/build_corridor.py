"""Build the SnowTwin medical-corridor fixture from an OpenStreetMap drive graph.

Usage (from repo root):
    .venv\\Scripts\\python.exe scripts\\build_corridor.py

Reads data/raw/buffalo_drive.graphml (downloaded with OSMnx; (c) OpenStreetMap
contributors, ODbL) and writes data/corridor.geojson.

Modeling assumptions (documented, not measured):
- Service vehicles may traverse a segment in both directions.
- Width class comes from the OSM highway tag: primary/secondary/tertiary/trunk
  are treated as "wide" (>= 28 ft); residential/unclassified are "narrow".
- Segments are merged through nodes that have degree 2 inside the selected
  sub-network so each modeled segment is a block-scale service unit.
"""

import json
import math
from pathlib import Path

import networkx as nx
import osmnx as ox

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "buffalo_drive.graphml"
OUT = ROOT / "data" / "corridor.geojson"

LAT0, LON0 = 42.927, -78.842
KX = math.cos(math.radians(LAT0)) * 111_320.0
KY = 110_540.0

LANDMARKS = {  # geocoded from OpenStreetMap/Nominatim
    "UB South Campus": (42.9533636, -78.8185843),
    "ECMC": (42.9263064, -78.8324609),
    "BNMC": (42.9012394, -78.8657992),
}
# Corridor polygon (lat, lon): Main Street spine plus the Masten/Kensington area toward ECMC.
CORRIDOR = [
    (42.9580, -78.8145), (42.9580, -78.8245), (42.9450, -78.8400), (42.9250, -78.8565),
    (42.9050, -78.8745), (42.8960, -78.8765), (42.8960, -78.8615), (42.9110, -78.8480),
    (42.9180, -78.8250), (42.9320, -78.8195), (42.9450, -78.8145),
]
WIDE = {"primary", "secondary", "tertiary", "trunk", "primary_link", "secondary_link", "tertiary_link"}
NARROW = {"residential", "unclassified", "living_street"}
TIER = {"primary": 1, "trunk": 1, "primary_link": 1, "secondary": 2, "secondary_link": 2,
        "tertiary": 2, "tertiary_link": 2}

RES_ECMC_M = 620          # residential pocket around ECMC (compact-blower territory)
CRITICAL_HOSPITAL_M = 450
KEEP_STUB_NEAR_LANDMARK_M = 450
# Streets added because archived camera footage shows them: name -> (min_lat, max_lat).
INCLUDE_STREETS = {"Laurel Street": (42.905, 42.915)}


def xy(lon, lat):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def first(v):
    return v[0] if isinstance(v, list) else v


def dist_point_seg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def seg_key(u, v, name, coords):
    """Endpoints + name + midpoint, so parallel carriageways between the same nodes stay distinct."""
    mid = coords[len(coords) // 2]
    return (frozenset((u, v)), name, round(mid[0], 4), round(mid[1], 4))


def in_poly(p, poly):
    x, y = p
    inside = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def main():
    G = ox.load_graphml(RAW)
    U = ox.convert.to_undirected(G)

    def coords(u, v, d):
        if "geometry" in d:
            return list(d["geometry"].coords)
        return [(U.nodes[u]["x"], U.nodes[u]["y"]), (U.nodes[v]["x"], U.nodes[v]["y"])]

    poly = [xy(lon, lat) for lat, lon in CORRIDOR]
    ecmc = xy(*LANDMARKS["ECMC"][::-1])
    marks = [xy(lon, lat) for lat, lon in LANDMARKS.values()]

    keep = nx.MultiGraph()
    for u, v, k, d in U.edges(keys=True, data=True):
        h = first(d.get("highway"))
        pts = [xy(*c) for c in coords(u, v, d)]
        mid = pts[len(pts) // 2]
        if not in_poly(mid, poly):
            continue
        if h in WIDE or (h in NARROW and math.dist(mid, ecmc) <= RES_ECMC_M):
            keep.add_edge(u, v, key=k, **d)
    # Explicitly included streets (archived camera footage locations), even outside the pockets above.
    for u, v, k, d in U.edges(keys=True, data=True):
        name = str(first(d.get("name", "")))
        lat = (U.nodes[u]["y"] + U.nodes[v]["y"]) / 2
        if name in INCLUDE_STREETS and INCLUDE_STREETS[name][0] <= lat <= INCLUDE_STREETS[name][1]:
            keep.add_edge(u, v, key=k, **d)
    for n in keep.nodes:
        keep.nodes[n].update(U.nodes[n])

    # Remove dead-end stubs created by the polygon cut (keep stubs near landmarks).
    changed = True
    while changed:
        changed = False
        for n in [n for n in keep.nodes if keep.degree(n) <= 1]:
            p = xy(keep.nodes[n]["x"], keep.nodes[n]["y"])
            if min(math.dist(p, m) for m in marks) > KEEP_STUB_NEAR_LANDMARK_M:
                keep.remove_node(n)
                changed = True

    comp = max(nx.connected_components(keep), key=len)
    keep = keep.subgraph(comp).copy()

    # Merge through degree-2 nodes when both sides share road class and name.
    def edge_attrs(d):
        return (first(d.get("highway")), str(first(d.get("name", ""))))

    segs = []
    visited = set()
    for u, v, k, d in keep.edges(keys=True, data=True):
        if (u, v, k) in visited or (v, u, k) in visited:
            continue
        chain_nodes = [u, v]
        chain_coords = coords(u, v, d)
        if (chain_coords[0][0], chain_coords[0][1]) != (keep.nodes[u]["x"], keep.nodes[u]["y"]):
            chain_coords = chain_coords[::-1]
        visited.add((u, v, k))
        attrs = edge_attrs(d)
        osm_ids = [first(d.get("osmid"))]
        lanes = [first(d.get("lanes"))]

        def extend(end_node, prev_node, forward):
            nonlocal chain_coords
            cur, prev = end_node, prev_node
            while keep.degree(cur) == 2:
                nbrs = [(a, b, kk, dd) for a, b, kk, dd in keep.edges(cur, keys=True, data=True)
                        if (a, b, kk) not in visited and (b, a, kk) not in visited]
                if not nbrs:
                    break
                a, b, kk, dd = nbrs[0]
                nxt = b if a == cur else a
                if edge_attrs(dd) != attrs:
                    break
                visited.add((a, b, kk))
                c = coords(a, b, dd)
                if (c[0][0], c[0][1]) != (keep.nodes[cur]["x"], keep.nodes[cur]["y"]):
                    c = c[::-1]
                osm_ids.append(first(dd.get("osmid")))
                lanes.append(first(dd.get("lanes")))
                if forward:
                    chain_coords = chain_coords + c[1:]
                    chain_nodes.append(nxt)
                else:
                    chain_coords = c[::-1][:-1] + chain_coords
                    chain_nodes.insert(0, nxt)
                prev, cur = cur, nxt

        extend(v, u, True)
        extend(u, v, False)
        segs.append((chain_nodes[0], chain_nodes[-1], chain_coords, attrs, osm_ids))

    bnmc = xy(*LANDMARKS["BNMC"][::-1])
    # Keep segment IDs stable across rebuilds: reuse the previous ID for the same endpoints + name.
    previous = {}
    if OUT.exists():
        for f in json.loads(OUT.read_text(encoding="utf-8"))["features"]:
            p = f["properties"]
            previous[seg_key(p["u"], p["v"], p.get("name"), f["geometry"]["coordinates"])] = p["segment_id"]
    next_id = max([int(x[1:]) for x in previous.values()] + [-1]) + 1
    features = []
    for a, b, cs, (h, name), osm_ids in sorted(segs, key=lambda s: (-s[2][0][1], s[2][0][0])):
        pts = [xy(*c) for c in cs]
        length = sum(math.dist(p, q) for p, q in zip(pts, pts[1:]))
        if a == b or length < 15:
            continue
        mid = pts[len(pts) // 2]
        sid = previous.get(seg_key(str(a), str(b), None if name == "nan" else name, cs))
        if sid is None:
            sid = f"S{next_id:03d}"
            next_id += 1
        width_class = "wide" if h in WIDE else "narrow"
        tier = TIER.get(h, 3)
        near_hosp = min(math.dist(mid, ecmc), math.dist(mid, bnmc)) <= CRITICAL_HOSPITAL_M
        critical = (name == "Main Street") or (near_hosp and width_class == "wide")
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[round(x, 6), round(y, 6)] for x, y in cs]},
            "properties": {
                "segment_id": sid,
                "u": str(a), "v": str(b),
                "name": None if name == "nan" else name,
                "highway": h,
                "width_class": width_class,
                "priority_tier": tier,
                "critical": bool(critical),
                "length_m": round(length, 1),
                "osm_way_ids": [int(x) for x in osm_ids if x is not None],
            },
        })

    out = {
        "type": "FeatureCollection",
        "properties": {
            "source": "OpenStreetMap contributors (ODbL), extracted with OSMnx",
            "projection": {"lat0": LAT0, "lon0": LON0, "kx_m_per_deg": KX, "ky_m_per_deg": KY,
                           "method": "local equirectangular"},
            "landmarks": {k: {"lat": v[0], "lon": v[1]} for k, v in LANDMARKS.items()},
            "assumptions": [
                "Width class derived from OSM highway tag, not measured width.",
                "Critical = Main Street plus wide roads within 450 m of ECMC or BNMC (modeled designation).",
                "Vehicles may traverse segments in both directions.",
            ],
        },
        "features": features,
    }
    OUT.write_text(json.dumps(out), encoding="utf-8")
    wide = sum(f["properties"]["width_class"] == "wide" for f in features)
    crit = sum(f["properties"]["critical"] for f in features)
    print(f"segments={len(features)} wide={wide} narrow={len(features)-wide} critical={crit} "
          f"nodes={len(keep.nodes)} total_km={sum(f['properties']['length_m'] for f in features)/1000:.1f}")


if __name__ == "__main__":
    main()
