"""Legal shortest paths and the two dispatch policies (fixed-order and adaptive)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import networkx as nx

from .network import VEHICLE_TYPES

if TYPE_CHECKING:
    from .simulation import Vehicle, World


def travel_times(world: "World", vehicle: "Vehicle", t: float):
    """Dijkstra travel time (s) from the vehicle's node over legal, open segments."""
    net, env = world.net, world.env
    spec = VEHICLE_TYPES[vehicle.vtype]

    def weight(u, v, edges):
        best = None
        for sid in edges:
            seg = net.segments[sid]
            if not net.can_traverse(vehicle.vtype, seg) or env.is_closed(sid, t):
                continue
            w = seg.length_m / (spec["travel_mps"] * env.factor(sid, t))
            best = w if best is None or w < best else best
        return best

    return nx.single_source_dijkstra(net.G, vehicle.node, weight=weight)


def legs_for_path(world: "World", vehicle: "Vehicle", path: list[str], t: float) -> list[tuple]:
    net, env = world.net, world.env
    spec = VEHICLE_TYPES[vehicle.vtype]
    legs = []
    for a, b in zip(path, path[1:]):
        best, best_w = None, None
        for sid in net.G.get_edge_data(a, b):
            seg = net.segments[sid]
            if not net.can_traverse(vehicle.vtype, seg) or env.is_closed(sid, t):
                continue
            w = seg.length_m / (spec["travel_mps"] * env.factor(sid, t))
            if best_w is None or w < best_w:
                best, best_w = sid, w
        legs.append((best, a, b, "travel"))
    return legs


def _candidates(world: "World", vehicle: "Vehicle", t: float, dist: dict):
    """Eligible, reachable, unreserved service targets with entry/exit nodes and costs."""
    net, env, p = world.net, world.env, world.params
    spec = VEHICLE_TYPES[vehicle.vtype]
    out = []
    for sid, seg in net.segments.items():
        if not net.can_service(vehicle.vtype, seg) or env.is_closed(sid, t):
            continue
        owner = world.reserved.get(sid)
        if owner is not None and owner != vehicle.id:
            continue
        if world.depth[sid] < p["min_service_depth_in"]:
            continue
        du, dv = dist.get(seg.u), dist.get(seg.v)
        if du is None and dv is None:
            continue
        entry, exit_, travel = (seg.u, seg.v, du) if dv is None or (du is not None and du <= dv) else (seg.v, seg.u, dv)
        service_s = seg.length_m / (spec["service_mps"] * env.factor(sid, t))
        out.append((sid, entry, exit_, travel, service_s))
    return out


BASELINES = {
    "city_priority": "City published priority (primary/hospital access -> secondary -> residential)",
    "service_history": "Service history (longest since last plowed first)",
    "fixed_loop": "Fixed service loop (team baseline)",
}


def choose_fixed(world: "World", vehicle: "Vehicle", t: float, dist: dict):
    kind = world.params.get("baseline_policy", "city_priority")
    if kind == "city_priority":
        return _choose_city_priority(world, vehicle, t, dist)
    if kind == "service_history":
        return _choose_service_history(world, vehicle, t, dist)
    return _choose_fixed_loop(world, vehicle, t, dist)


def _choose_city_priority(world, vehicle, t, dist):
    """Serve the highest published tier that needs work; within a tier take the nearest segment, the way a
    crew works contiguously along its route instead of jumping across the corridor. No storm look-ahead."""
    cands = _candidates(world, vehicle, t, dist)
    if not cands:
        return None, None
    c = min(cands, key=lambda c: (world.net.segments[c[0]].tier, c[3], c[0]))
    seg = world.net.segments[c[0]]
    return c, {
        "policy": "fixed", "baseline": "city_priority",
        "reason": f"Published priority: {seg.city_class.replace('_', ' ')} (tier {seg.tier}) first, nearest within tier",
        "depth_in": round(world.depth[c[0]], 2), "critical": seg.critical, "tier": seg.tier,
        "travel_s": round(c[3]), "service_s": round(c[4]),
    }


def _choose_service_history(world, vehicle, t, dist):
    """Serve the eligible segment plowed longest ago (what a service-history map shows); ties by tier, travel."""
    cands = _candidates(world, vehicle, t, dist)
    if not cands:
        return None, None

    def key(c):
        # Oldest service first in 30-minute bins (a tracker shows coarse age), then nearest.
        last = world.last_service[c[0]]
        return (-1 if last is None else int(last // 1800), c[3], c[0])

    c = min(cands, key=key)
    seg, last = world.net.segments[c[0]], world.last_service[c[0]]
    since = "never serviced this run" if last is None else f"last serviced {round((t - last) / 60)} min ago"
    return c, {
        "policy": "fixed", "baseline": "service_history",
        "reason": f"Service history: {since}", "depth_in": round(world.depth[c[0]], 2), "critical": seg.critical,
        "tier": seg.tier, "travel_s": round(c[3]), "service_s": round(c[4]),
    }


def _choose_fixed_loop(world: "World", vehicle: "Vehicle", t: float, dist: dict):
    order = world.fixed_order[vehicle.id]
    if not order:
        return None, None
    cands = {c[0]: c for c in _candidates(world, vehicle, t, dist)}
    ptr = world.fixed_ptr.get(vehicle.id, 0)
    n = len(order)
    for i in range(n):
        idx = (ptr + i) % n
        sid = order[idx]
        if sid in cands:
            world.fixed_ptr[vehicle.id] = (idx + 1) % n
            c = cands[sid]
            seg = world.net.segments[sid]
            return c, {
                "policy": "fixed", "baseline": "fixed_loop",
                "reason": f"Next eligible segment in fixed service loop (position {idx + 1}/{n})",
                "loop_position": idx + 1,
                "depth_in": round(world.depth[sid], 2),
                "critical": seg.critical,
                "travel_s": round(c[3]),
                "service_s": round(c[4]),
            }
    return None, None


def choose_adaptive(world: "World", vehicle: "Vehicle", t: float, dist: dict):
    p = world.params
    best, best_score, best_info = None, -1.0, None
    h = p["horizon_s"]
    for c in _candidates(world, vehicle, t, dist):
        sid, _, _, travel, service_s = c
        seg = world.net.segments[sid]
        forecast = world.forecast_in(sid, t, h)
        predicted = max(0.0, world.depth[sid] + forecast)
        mult = 1.0 + p["corridor_beta"] * (1 if seg.critical else 0)
        priority = predicted ** 2 * mult / seg.tier
        score = priority / max(travel + service_s, 1.0)
        if score > best_score or (score == best_score and best is not None and sid < best[0]):
            best, best_score = c, score
            best_info = {
                "policy": "adaptive",
                "reason": (
                    f"Highest priority per minute: predicted {predicted:.1f} in within "
                    f"{h // 60:.0f} min{' on critical corridor' if seg.critical else ''}"
                ),
                "depth_in": round(world.depth[sid], 2),
                "predicted_in": round(predicted, 2),
                "priority": round(priority, 2),
                "score": round(score * 60, 3),
                "critical": seg.critical,
                "travel_s": round(travel),
                "service_s": round(service_s),
            }
    return best, best_info


def build_fixed_order(world: "World", vehicle: "Vehicle") -> list[str]:
    """Documented comparison loop: critical first, then tier, then a north-to-south sweep."""
    net = world.net
    segs = [s for s in net.segments.values() if net.can_service(vehicle.vtype, s)]
    segs.sort(key=lambda s: (0 if s.critical else 1, s.tier, -s.mid[1], s.mid[0]))
    return [s.id for s in segs]
