"""Deterministic paired simulation: one shared storm, two independent policy worlds."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

from .network import DATA, VEHICLE_TYPES, Network, point_along
from . import routing

SUBSTEP_S = 10.0
SAMPLE_EVERY_S = 60.0
CHECKPOINT_EVERY_S = 900.0  # Tiger Data checkpoint cadence (simulated seconds)
IDLE_REEVAL_S = 30.0
SCHEMA_VERSION = 1

DEFAULT_PARAMS = {
    "min_service_depth_in": 1.0,
    "residual_in": 0.2,
    "threshold_in": 1.5,          # illustrative, not a certified safety limit
    "horizon_s": 1800,
    "corridor_beta": 3.0,
    "closure_duration_s": 2700,
    "visibility_factor": {"reduced": 0.8, "poor": 0.6},
    "slowdown_duration_s": 3600,
}


# ---------------------------------------------------------------- storm band
class Band:
    """Synthetic rectangular lake-effect band that drifts and wobbles across the corridor."""

    def __init__(self, cfg: dict, origin: tuple[float, float]):
        self.cfg = cfg
        h = math.radians(cfg["heading_deg"])
        self.axis = (math.sin(h), math.cos(h))          # long axis, compass heading
        self.normal = (math.cos(h), -math.sin(h))       # perpendicular
        self.origin = origin

    def offset(self, t: float) -> float:
        c = self.cfg
        wob = c["wobble_amp_m"] * math.sin(2 * math.pi * t / max(c["wobble_period_s"], 1)) if c["wobble_amp_m"] else 0.0
        return c["offset_m"] + c["drift_mps"] * t + wob

    def center(self, t: float) -> tuple[float, float]:
        o = self.offset(t)
        return (self.origin[0] + self.normal[0] * o, self.origin[1] + self.normal[1] * o)

    def contains(self, p: tuple[float, float], t: float) -> bool:
        cx, cy = self.center(t)
        dx, dy = p[0] - cx, p[1] - cy
        along = dx * self.axis[0] + dy * self.axis[1]
        across = dx * self.normal[0] + dy * self.normal[1]
        return abs(along) <= self.cfg["length_m"] / 2 and abs(across) <= self.cfg["width_m"] / 2

    def rate(self, p: tuple[float, float], t: float, background: float) -> float:
        return self.cfg["rate_in_hr"] if self.cfg["rate_in_hr"] > 0 and self.contains(p, t) else background

    def polygon(self, t: float) -> list[list[float]]:
        cx, cy = self.center(t)
        hl, hw = self.cfg["length_m"] / 2, self.cfg["width_m"] / 2
        a, n = self.axis, self.normal
        pts = []
        for sa, sn in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
            pts.append([round(cx + a[0] * hl * sa + n[0] * hw * sn, 1), round(cy + a[1] * hl * sa + n[1] * hw * sn, 1)])
        return pts


# ---------------------------------------------------------- shared environment
class Env:
    """Accepted observation effects, applied identically to both worlds."""

    def __init__(self):
        self.closures: dict[str, dict] = {}   # sid -> {until, observation_id}
        self.slowdowns: dict[str, dict] = {}  # sid -> {until, factor, observation_id}

    def is_closed(self, sid: str, t: float) -> bool:
        c = self.closures.get(sid)
        return c is not None and t < c["until"]

    def factor(self, sid: str, t: float) -> float:
        s = self.slowdowns.get(sid)
        return s["factor"] if s is not None and t < s["until"] else 1.0

    def public(self, t: float) -> dict:
        return {
            "closures": [{"segment_id": k, **v} for k, v in self.closures.items() if t < v["until"]],
            "slowdowns": [{"segment_id": k, **v} for k, v in self.slowdowns.items() if t < v["until"]],
        }


# ------------------------------------------------------------------- vehicles
@dataclass
class Vehicle:
    id: str
    vtype: str
    node: str
    status: str = "idle"
    legs: list = field(default_factory=list)   # (segment_id, from_node, to_node, mode)
    progress: float = 0.0
    target: str | None = None
    next_eval: float = 0.0
    replan_at_node: bool = False
    explanation: dict | None = None

    def position(self, net: Network) -> tuple[float, float]:
        if self.legs and self.progress > 0:
            sid, a, b, _ = self.legs[0]
            seg = net.segments[sid]
            xy = seg.xy if a == seg.u else list(reversed(seg.xy))
            return point_along(xy, self.progress)
        return net.node_xy[self.node]


# --------------------------------------------------------------------- worlds
class World:
    def __init__(self, policy: str, net: Network, scenario: dict, env: Env, params: dict, band: Band):
        self.policy, self.net, self.env, self.params, self.band = policy, net, env, params, band
        self.background = scenario.get("background_rate_in_hr", 0.0)
        init = scenario.get("initial_depth_in", 0.0)
        self.depth = {sid: float(init) for sid in net.segments}
        self.last_service: dict[str, float | None] = {sid: None for sid in net.segments}
        self.reserved: dict[str, str] = {}
        self.pending_reaccum: dict[str, float] = {}
        self.unique_serviced: set[str] = set()
        self.log: deque = deque(maxlen=60)
        self.m = {
            "critical_exposure_min": 0.0, "exposure_min": 0.0, "travel_m": 0.0, "service_m": 0.0,
            "services": 0, "reaccumulations": 0, "reaccum_elapsed_s": [], "active_s": 0.0,
            "inch_km_cleared": 0.0, "idle_s": 0.0,
        }
        self.vehicles: list[Vehicle] = []
        for f in scenario["fleet"]:
            start = net.landmarks.get(f["start"], net.center) if isinstance(f["start"], str) else tuple(f["start"])
            self.vehicles.append(Vehicle(id=f["id"], vtype=f["type"], node=net.nearest_node(start, f["type"])))
        self.fixed_order = {v.id: routing.build_fixed_order(self, v) for v in self.vehicles}
        self.fixed_ptr: dict[str, int] = {}

    # forecast uses the scenario's declared band motion (known-scenario planning)
    def forecast_in(self, sid: str, t: float, horizon: float) -> float:
        p = self.net.segments[sid].mid
        samples = [self.band.rate(p, t + horizon * k / 4, self.background) for k in range(5)]
        return sum(samples) / len(samples) * horizon / 3600

    # ---------------------------------------------------------------- planning
    def plan(self, v: Vehicle, t: float):
        self.reserved = {k: o for k, o in self.reserved.items() if o != v.id}
        v.target, v.legs, v.progress = None, [], 0.0
        dist, paths = routing.travel_times(self, v, t)
        chooser = routing.choose_fixed if self.policy == "fixed" else routing.choose_adaptive
        choice, info = chooser(self, v, t, dist)
        if choice is None:
            v.status = "idle"
            v.next_eval = t + IDLE_REEVAL_S
            v.explanation = {"policy": self.policy, "reason": "No eligible reachable work; waiting", "target": None}
            return
        sid, entry, exit_, _, _ = choice
        legs = routing.legs_for_path(self, v, paths[entry], t)
        legs.append((sid, entry, exit_, "service"))
        v.legs, v.target = legs, sid
        v.status = legs[0][3] == "service" and "servicing" or "traveling"
        self.reserved[sid] = v.id
        seg = self.net.segments[sid]
        info.update({"target": sid, "target_name": seg.name or seg.highway, "vehicle_id": v.id, "sim_time_s": t})
        v.explanation = info
        self.log.appendleft({"t": t, "kind": "assign", **info})

    def on_env_change(self, t: float, closed_sids: set[str]):
        for v in self.vehicles:
            if not v.legs:
                v.next_eval = t
                continue
            future = v.legs[1:] if v.progress > 0 else v.legs
            if v.target in closed_sids or any(l[0] in closed_sids for l in future):
                if v.progress > 0:
                    v.legs = v.legs[:1]
                    v.replan_at_node = True
                    if v.legs[0][3] != "service":
                        self.reserved.pop(v.target, None)
                else:
                    v.legs = []
                    self.reserved.pop(v.target, None)
                    v.status = "idle"
                    v.next_eval = t
                self.log.appendleft({"t": t, "kind": "reroute", "vehicle_id": v.id, "policy": self.policy,
                                     "reason": "Accepted closure affects route; replanning at next node"})

    # -------------------------------------------------------------- stepping
    def step(self, dt: float, t: float, rates: dict[str, float]):
        for sid, r in rates.items():
            if r:
                self.depth[sid] += r * dt / 3600
        for v in self.vehicles:
            self._advance(v, dt, t)
        thr = self.params["threshold_in"]
        for sid, seg in self.net.segments.items():
            if self.depth[sid] > thr:
                self.m["exposure_min"] += dt / 60
                if seg.critical:
                    self.m["critical_exposure_min"] += dt / 60
        for sid in list(self.pending_reaccum):
            if self.depth[sid] > thr:
                self.m["reaccumulations"] += 1
                self.m["reaccum_elapsed_s"].append(t + dt - self.pending_reaccum.pop(sid))

    def _advance(self, v: Vehicle, dt: float, t: float):
        spec = VEHICLE_TYPES[v.vtype]
        if v.status == "idle":
            if t >= v.next_eval:
                self.plan(v, t)
            if v.status == "idle":
                self.m["idle_s"] += dt
                return
        self.m["active_s"] += dt
        budget = dt
        guard = 0
        while budget > 1e-9 and v.legs and guard < 50:
            guard += 1
            sid, a, b, mode = v.legs[0]
            seg = self.net.segments[sid]
            if v.progress == 0 and self.env.is_closed(sid, t):
                self.plan(v, t)
                if v.status == "idle":
                    break
                continue
            speed = (spec["service_mps"] if mode == "service" else spec["travel_mps"]) * self.env.factor(sid, t)
            remaining = seg.length_m - v.progress
            need = remaining / speed
            key = "service_m" if mode == "service" else "travel_m"
            if need <= budget:
                budget -= need
                self.m[key] += remaining
                v.progress, v.node = 0.0, b
                v.legs.pop(0)
                if mode == "service":
                    self._complete_service(v, sid, t + dt - budget)
                if not v.legs or v.replan_at_node:
                    v.replan_at_node = False
                    self.plan(v, t + dt - budget)
                    if v.status == "idle":
                        break
                else:
                    v.status = "servicing" if v.legs[0][3] == "service" else "traveling"
            else:
                v.progress += speed * budget
                self.m[key] += speed * budget
                budget = 0

    def _complete_service(self, v: Vehicle, sid: str, t: float):
        seg = self.net.segments[sid]
        before = self.depth[sid]
        after = min(before, self.params["residual_in"])
        self.depth[sid] = after
        self.last_service[sid] = t
        self.m["services"] += 1
        self.m["inch_km_cleared"] += (before - after) * seg.length_m / 1000
        self.unique_serviced.add(sid)
        self.pending_reaccum[sid] = t
        self.reserved.pop(sid, None)
        v.target = None
        self.log.appendleft({"t": t, "kind": "service", "vehicle_id": v.id, "policy": self.policy, "target": sid,
                             "target_name": seg.name or seg.highway,
                             "reason": f"Serviced {before:.1f} in -> {after:.1f} in"})

    # ---------------------------------------------------------------- output
    def metrics(self) -> dict:
        m = self.m
        dist = m["travel_m"] + m["service_m"]
        crew_h = m["active_s"] / 3600
        crit = [sid for sid, s in self.net.segments.items() if s.critical]
        thr = self.params["threshold_in"]
        re = m["reaccum_elapsed_s"]
        return {
            "critical_exposure_min": round(m["critical_exposure_min"], 1),
            "exposure_min": round(m["exposure_min"], 1),
            "distance_km": round(dist / 1000, 2),
            "travel_km": round(m["travel_m"] / 1000, 2),
            "service_km": round(m["service_m"] / 1000, 2),
            "deadhead_pct": round(100 * m["travel_m"] / dist, 1) if dist else 0.0,
            "services": m["services"],
            "unique_segments": len(self.unique_serviced),
            "reaccumulations": m["reaccumulations"],
            "median_reaccum_min": round(sorted(re)[len(re) // 2] / 60, 1) if re else None,
            "crew_hours": round(crew_h, 2),
            "inch_km_cleared": round(m["inch_km_cleared"], 2),
            "inch_km_per_crew_hour": round(m["inch_km_cleared"] / crew_h, 2) if crew_h else 0.0,
            "critical_over_now": sum(1 for sid in crit if self.depth[sid] > thr),
            "critical_total": len(crit),
            "avg_critical_depth_in": round(sum(self.depth[s] for s in crit) / len(crit), 2) if crit else 0.0,
        }

    def public(self, t: float) -> dict:
        vehicles = []
        for v in self.vehicles:
            x, y = v.position(self.net)
            vehicles.append({
                "vehicle_id": v.id, "type": v.vtype, "label": VEHICLE_TYPES[v.vtype]["label"],
                "status": v.status, "lonlat": self.net.to_ll((x, y)), "target": v.target,
                "route_segments": [l[0] for l in v.legs], "current_segment": v.legs[0][0] if v.legs else None,
                "explanation": v.explanation,
            })
        return {
            "segments": {sid: [round(d, 2), None if self.last_service[sid] is None else round(self.last_service[sid])]
                         for sid, d in self.depth.items()},
            "vehicles": vehicles,
            "metrics": self.metrics(),
            "log": list(self.log)[:25],
        }


# --------------------------------------------------------------------- engine
def load_scenarios() -> dict[str, dict]:
    out = {}
    for p in sorted((DATA / "scenarios").glob("*.json")):
        s = json.loads(p.read_text(encoding="utf-8"))
        out[s["id"]] = s
    return out


class Engine:
    def __init__(self, net: Network | None = None):
        self.net = net or Network()
        self.scenarios = load_scenarios()
        self.lock = threading.RLock()
        self.playing = False
        self.speed = 1.0
        self.alerts: deque = deque(maxlen=30)
        self.observations: dict[str, dict] = {}
        self.pending_apply: list[dict] = []
        self.listeners: list = []       # callables(event, payload) e.g. telemetry
        self.new_run(next(iter(self.scenarios)) if "moving_band" not in self.scenarios else "moving_band")

    # ----------------------------------------------------------- run control
    def new_run(self, scenario_id: str, band_overrides: dict | None = None, seed: int | None = None) -> str:
        if scenario_id not in self.scenarios:
            raise KeyError(scenario_id)
        sc = copy.deepcopy(self.scenarios[scenario_id])
        if band_overrides:
            for k, v in band_overrides.items():
                if v is not None and k in sc["band"]:
                    sc["band"][k] = v
        _validate_band(sc["band"])
        params = {**DEFAULT_PARAMS, **sc.get("params", {})}
        with self.lock:
            self.scenario = sc
            self.params = params
            self.run_id = uuid.uuid4().hex[:10]
            self.version = hashlib.sha256(json.dumps(
                {"scenario": sc, "params": params, "net": self.net.file_hash}, sort_keys=True).encode()).hexdigest()[:12]
            self.band = Band(sc["band"], self.net.center)
            self.env = Env()
            self.worlds = {p: World(p, self.net, sc, self.env, params, self.band) for p in ("fixed", "adaptive")}
            self.t = 0.0
            self.tick = 0
            self.series = {"t": [], "fixed": {"crit": [], "avg": []}, "adaptive": {"crit": [], "avg": []}}
            self.alerts.clear()
            self.observations = {k: o for k, o in self.observations.items() if o.get("run_id") == self.run_id}
            self.pending_apply = []
            self.scheduled = sorted(sc.get("scheduled_observations", []), key=lambda e: e["at_s"])
            self._alert_state = {"crit_frac_high": False, "last_alert_t": -1e9}
            self._sample()
            self._emit("run", {"run_id": self.run_id})
        return self.run_id

    def _emit(self, kind: str, payload: dict):
        for fn in self.listeners:
            try:
                fn(kind, payload)
            except Exception:
                pass

    @property
    def duration(self) -> float:
        return float(self.scenario["duration_s"])

    def advance(self, substeps: int):
        with self.lock:
            for _ in range(substeps):
                if self.t >= self.duration:
                    self.playing = False
                    break
                self._apply_pending()
                rates = {sid: self.band.rate(seg.mid, self.t, self.worlds["fixed"].background)
                         for sid, seg in self.net.segments.items()}
                for w in self.worlds.values():
                    w.step(SUBSTEP_S, self.t, rates)
                self.t += SUBSTEP_S
                self.tick += 1
                if self.t % SAMPLE_EVERY_S < 1e-6:
                    self._sample()
                    self._check_alerts()
                if self.t % CHECKPOINT_EVERY_S < 1e-6:
                    self._emit("checkpoint", {"run_id": self.run_id, "tick": self.tick})

    def run_to_end(self):
        while self.t < self.duration:
            self.advance(60)

    def _sample(self):
        self.series["t"].append(round(self.t))
        for p, w in self.worlds.items():
            m = w.metrics()
            self.series[p]["crit"].append(m["critical_exposure_min"])
            self.series[p]["avg"].append(m["avg_critical_depth_in"])

    def _check_alerts(self):
        m = self.worlds["adaptive"].metrics()
        frac = m["critical_over_now"] / max(m["critical_total"], 1)
        st = self._alert_state
        if frac >= 0.25 and not st["crit_frac_high"] and self.t - st["last_alert_t"] > 1800:
            st["crit_frac_high"], st["last_alert_t"] = True, self.t
            self.add_alert("threshold", f"SnowTwin dispatch. {m['critical_over_now']} critical corridor segments "
                                        f"are above {self.params['threshold_in']} inches. Prioritizing Main Street "
                                        f"and hospital approaches.")
        elif frac < 0.15:
            st["crit_frac_high"] = False

    def add_alert(self, kind: str, text: str, ref: str | None = None):
        alert = {"alert_id": f"{self.run_id}-{len(self.alerts)}-{int(self.t)}", "kind": kind, "text": text,
                 "sim_time_s": self.t, "ref": ref}
        self.alerts.appendleft(alert)
        return alert

    # ---------------------------------------------------------- observations
    def schedule_apply(self, observation: dict, segment_id: str) -> int:
        with self.lock:
            key = (observation["observation_id"], segment_id)
            for p in self.pending_apply:
                if (p["observation"]["observation_id"], p["segment_id"]) == key:
                    return p["apply_tick"]
            if key in {(a["observation_id"], a["segment_id"]) for a in observation.get("applications", [])}:
                return next(a["tick"] for a in observation["applications"] if a["segment_id"] == segment_id)
            apply_tick = self.tick + 1
            self.pending_apply.append({"observation": observation, "segment_id": segment_id, "apply_tick": apply_tick})
            return apply_tick

    def _apply_pending(self):
        # scheduled scenario observations (benchmark replay)
        while self.scheduled and self.scheduled[0]["at_s"] <= self.t:
            ev = self.scheduled.pop(0)
            obs = {"observation_id": f"sched-{ev['frame_id']}-{ev['at_s']}", "run_id": self.run_id,
                   "frame_id": ev["frame_id"], "result": ev["result"], "source_kind": "synthetic_fixture",
                   "status": "done", "applications": []}
            self.observations[obs["observation_id"]] = obs
            self.pending_apply.append({"observation": obs, "segment_id": ev["segment_id"], "apply_tick": self.tick})
        due = [p for p in self.pending_apply if p["apply_tick"] <= self.tick + 1]
        if not due:
            return
        self.pending_apply = [p for p in self.pending_apply if p not in due]
        closed = set()
        for p in due:
            obs, sid = p["observation"], p["segment_id"]
            effect = obs.get("proposed_effect") or derive_effect(obs["result"], self.params)
            seg = self.net.segments[sid]
            label = seg.name or seg.highway
            if effect["kind"] == "closure":
                self.env.closures[sid] = {"until": self.t + self.params["closure_duration_s"],
                                          "observation_id": obs["observation_id"]}
                closed.add(sid)
                self.add_alert("obstruction", f"Dispatch, SnowTwin. Camera reports an obstruction on {label}. "
                                              f"Segment closed in the model; rerouting units.", obs["observation_id"])
            elif effect["kind"] == "slowdown":
                self.env.slowdowns[sid] = {"until": self.t + self.params["slowdown_duration_s"],
                                           "factor": effect["factor"], "observation_id": obs["observation_id"]}
                closed.add(sid)  # forces replanning with new travel costs
                self.add_alert("visibility", f"Dispatch, SnowTwin. {effect['visibility'].capitalize()} visibility on "
                                             f"{label}. Applying a conservative speed penalty.", obs["observation_id"])
            obs.setdefault("applications", []).append(
                {"observation_id": obs["observation_id"], "segment_id": sid, "tick": self.tick,
                 "sim_time_s": self.t, "effect": effect})
            self._emit("observation_applied", {"observation": obs, "segment_id": sid})
        for w in self.worlds.values():
            w.on_env_change(self.t, closed)

    # --------------------------------------------------------------- snapshot
    def snapshot(self) -> dict:
        with self.lock:
            return {
                "schema_version": SCHEMA_VERSION,
                "run_id": self.run_id,
                "scenario_version": self.version,
                "tick": self.tick,
                "sim_time_s": self.t,
                "duration_s": self.duration,
                "playback_status": "playing" if self.playing else ("finished" if self.t >= self.duration else "paused"),
                "speed": self.speed,
                "scenario": {
                    "id": self.scenario["id"], "label": self.scenario["label"],
                    "description": self.scenario.get("description", ""),
                    "band": self.scenario["band"], "params": self.params,
                    "initial_depth_in": self.scenario.get("initial_depth_in", 0.0),
                    "fleet": self.scenario["fleet"],
                    "provenance": "Synthetic storm scenario (not a historical replay)",
                },
                "band": {"polygon": [self.net.to_ll(p) for p in self.band.polygon(self.t)],
                         "rate_in_hr": self.scenario["band"]["rate_in_hr"]},
                "policies": {p: w.public(self.t) for p, w in self.worlds.items()},
                "env": self.env.public(self.t),
                "series": self.series,
                "alerts": list(self.alerts)[:10],
                "observations": [o for o in self.observations.values() if o.get("run_id") == self.run_id][-10:],
            }


def derive_effect(result: dict, params: dict) -> dict:
    if result.get("obstruction_detected") is True:
        return {"kind": "closure"}
    vis = result.get("visibility_class")
    if vis in params["visibility_factor"]:
        return {"kind": "slowdown", "factor": params["visibility_factor"][vis], "visibility": vis}
    return {"kind": "none"}


def _validate_band(b: dict):
    if not (0 <= b["rate_in_hr"] <= 8):
        raise ValueError("rate_in_hr must be between 0 and 8")
    if not (200 <= b["width_m"] <= 20000):
        raise ValueError("width_m must be between 200 and 20000")
    if not (-3 <= b["drift_mps"] <= 3):
        raise ValueError("drift_mps must be between -3 and 3")
    b["heading_deg"] = float(b["heading_deg"]) % 360
