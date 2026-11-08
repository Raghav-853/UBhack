"""Road network fixture: segments, travel graph, and vehicle compatibility."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

VEHICLE_TYPES = {
    # Speeds are scenario assumptions shared by both policies (m/s).
    "heavy_plow": {"label": "Heavy plow", "travel_mps": 11.2, "service_mps": 6.7},
    "compact_blower": {"label": "Compact blower", "travel_mps": 6.7, "service_mps": 2.2},
}


@dataclass
class Segment:
    id: str
    u: str
    v: str
    name: str | None
    highway: str
    width_class: str
    tier: int
    critical: bool
    length_m: float
    xy: list[tuple[float, float]]
    mid: tuple[float, float]
    osm_way_ids: list[int] = field(default_factory=list)
    osm_tier: int = 0
    city_class: str = "residential"  # primary | secondary | hospital_access | residential (City list)
    heavy_ok: bool = False       # heavy plow may traverse and service
    compact_service: bool = False  # compact blower may service


class Network:
    def __init__(self, path: Path = DATA / "corridor.geojson"):
        text = path.read_text(encoding="utf-8")
        self.file_hash = hashlib.sha256(text.encode()).hexdigest()[:12]
        raw = json.loads(text)
        self.meta = raw["properties"]
        proj = self.meta["projection"]
        self.lat0, self.lon0 = proj["lat0"], proj["lon0"]
        self.kx, self.ky = proj["kx_m_per_deg"], proj["ky_m_per_deg"]

        self.segments: dict[str, Segment] = {}
        self.node_xy: dict[str, tuple[float, float]] = {}
        self.G = nx.MultiGraph()
        for f in raw["features"]:
            p = f["properties"]
            xy = [self.to_xy(lon, lat) for lon, lat in f["geometry"]["coordinates"]]
            seg = Segment(
                id=p["segment_id"], u=p["u"], v=p["v"], name=p.get("name"),
                highway=p["highway"], width_class=p["width_class"], tier=p["priority_tier"],
                critical=p["critical"], length_m=p["length_m"], xy=xy,
                mid=_polyline_point(xy, 0.5), osm_way_ids=p.get("osm_way_ids", []),
            )
            self.segments[seg.id] = seg
            self.node_xy.setdefault(seg.u, xy[0])
            self.node_xy.setdefault(seg.v, xy[-1])
            self.G.add_edge(seg.u, seg.v, key=seg.id)

        # Heavy plows stay on the largest connected wide-road component.
        W = nx.Graph()
        for s in self.segments.values():
            if s.width_class == "wide":
                W.add_edge(s.u, s.v)
        self.heavy_nodes = max(nx.connected_components(W), key=len) if W else set()
        for s in self.segments.values():
            s.heavy_ok = s.width_class == "wide" and s.u in self.heavy_nodes and s.v in self.heavy_nodes
            # Compact units may service either modeled road class (team decision, Nov 7).
            s.compact_service = True

        self.landmarks = {
            k: self.to_xy(v["lon"], v["lat"]) for k, v in self.meta.get("landmarks", {}).items()
        }
        # Candidate start points (scenario assumptions) for experiments.
        self.start_points = dict(self.landmarks)
        depots_file = DATA / "depots.json"
        if depots_file.exists():
            for d in json.loads(depots_file.read_text(encoding="utf-8"))["depots"]:
                self.start_points[d["name"]] = self.to_xy(d["lon"], d["lat"])

        # Priority tiers from the City DPW Winter Snow Plan 2026-27 primary/secondary table (data/city_priority.json).
        # Tier 1 = City primary or hospital access (critical segments near ECMC/BNMC), 2 = City secondary,
        # 3 = everything else (residential / not on either list).
        self.city_priority = {}
        cp_file = DATA / "city_priority.json"
        if cp_file.exists():
            self.city_priority = json.loads(cp_file.read_text(encoding="utf-8"))
            primary, secondary = set(self.city_priority["primary"]), set(self.city_priority["secondary"])
            for s in self.segments.values():
                s.osm_tier = s.tier
                if s.name in primary:
                    s.city_class, s.tier = "primary", 1
                elif s.critical and s.width_class == "wide":
                    s.city_class, s.tier = "hospital_access", 1
                elif s.name in secondary:
                    s.city_class, s.tier = "secondary", 2
                else:
                    s.city_class, s.tier = "residential", 3
        xs = [p[0] for s in self.segments.values() for p in s.xy]
        ys = [p[1] for s in self.segments.values() for p in s.xy]
        self.bounds = (min(xs), min(ys), max(xs), max(ys))
        self.center = ((self.bounds[0] + self.bounds[2]) / 2, (self.bounds[1] + self.bounds[3]) / 2)

    def to_xy(self, lon: float, lat: float) -> tuple[float, float]:
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)

    def to_ll(self, xy: tuple[float, float]) -> list[float]:
        return [round(self.lon0 + xy[0] / self.kx, 6), round(self.lat0 + xy[1] / self.ky, 6)]

    def can_traverse(self, vtype: str, seg: Segment) -> bool:
        return seg.heavy_ok if vtype == "heavy_plow" else True

    def can_service(self, vtype: str, seg: Segment) -> bool:
        return seg.heavy_ok if vtype == "heavy_plow" else seg.compact_service

    def nearest_node(self, xy: tuple[float, float], vtype: str) -> str:
        nodes = self.heavy_nodes if vtype == "heavy_plow" else self.node_xy.keys()
        return min(nodes, key=lambda n: math.dist(self.node_xy[n], xy))

    def to_public(self) -> dict:
        return {
            "segments": [
                {
                    "segment_id": s.id, "name": s.name, "highway": s.highway,
                    "width_class": s.width_class, "priority_tier": s.tier, "critical": s.critical,
                    "length_m": s.length_m, "coords": [self.to_ll(p) for p in s.xy],
                    "heavy_ok": s.heavy_ok, "compact_service": s.compact_service,
                    "city_class": s.city_class,
                    "u": s.u, "v": s.v,
                }
                for s in self.segments.values()
            ],
            "landmarks": {k: self.to_ll(v) for k, v in self.landmarks.items()},
            "bounds": self.to_ll((self.bounds[0], self.bounds[1])) + self.to_ll((self.bounds[2], self.bounds[3])),
            "source": self.meta.get("source"),
            "assumptions": self.meta.get("assumptions", []),
            "vehicle_types": VEHICLE_TYPES,
            "start_points": {k: self.to_ll(v) for k, v in self.start_points.items()},
            "city_priority": {k: self.city_priority.get(k) for k in ("source", "source_urls", "published_rules", "limitations")},
            "file_hash": self.file_hash,
        }


def _polyline_point(xy: list[tuple[float, float]], frac: float) -> tuple[float, float]:
    total = sum(math.dist(a, b) for a, b in zip(xy, xy[1:]))
    return point_along(xy, frac * total)


def point_along(xy: list[tuple[float, float]], dist_m: float) -> tuple[float, float]:
    if dist_m <= 0:
        return xy[0]
    acc = 0.0
    for a, b in zip(xy, xy[1:]):
        d = math.dist(a, b)
        if acc + d >= dist_m and d > 0:
            t = (dist_m - acc) / d
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        acc += d
    return xy[-1]
