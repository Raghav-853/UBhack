"""Matched moving-band demo trials; no provider calls or running-server changes.

Run from the repo root: .venv\\Scripts\\python.exe scripts\\demo_parameter_sweep.py
Every candidate runs both policies with the same storm, fleet and threshold.
"""
from __future__ import annotations

import csv
import hashlib
import itertools
import json
import random
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.simulation import Engine

# Same ten rows and directions as frontend/src/App.tsx, including More metrics.
METRICS = [
    ("critical_exposure_min", "Critical exposure (min)", False),
    ("avg_critical_depth_in", "Critical depth (in)", False),
    ("distance_km", "Distance (km)", False),
    ("inch_km_per_crew_hour", "Cleared / crew-hr", True),
    ("critical_over_now", "Critical over now", False),
    ("exposure_min", "All exposure (min)", False),
    ("deadhead_pct", "Deadhead (%)", False),
    ("services", "Service passes", True),
    ("reaccumulations", "Re-accumulations", False),
    ("crew_hours", "Crew-hours", False),
]
SEED = 20261107


def input_hashes():
    paths = [ROOT / "backend/app" / name for name in ("simulation.py", "routing.py", "network.py")]
    paths += [ROOT / "frontend/src/App.tsx", Path(__file__).resolve()]
    paths += sorted((ROOT / "data").glob("*.json"))
    paths += [ROOT / "data/corridor.geojson", ROOT / "data/scenarios/moving_band.json"]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def trial(spec):
    engine = Engine()
    engine.new_run("moving_band", spec["band"], overrides={"baseline_policy": "city_priority", "params": {
        "horizon_s": spec["horizon_min"] * 60, "corridor_beta": spec["beta"], "threshold_in": spec["threshold_in"]}})
    engine.run_to_end()
    return {**spec, "scenario_version": engine.version,
            "metrics": {p: w.metrics() for p, w in engine.worlds.items()}}


def comparison(row):
    fixed, adaptive = row["metrics"]["fixed"], row["metrics"]["adaptive"]
    changes, wins, losses, default_wins, oriented = {}, 0, 0, 0, []
    for i, (key, _, higher) in enumerate(METRICS):
        f, a = fixed[key], adaptive[key]
        delta = 100 * (a - f) / abs(f) if f else None
        improvement = (a - f) * (1 if higher else -1)
        wins += improvement > 0
        losses += improvement < 0
        default_wins += i < 4 and improvement > 0
        if delta is not None:
            oriented.append(delta * (1 if higher else -1))
        changes[key] = {"baseline": f, "adaptive": a, "delta_pct": round(delta, 3) if delta is not None else None,
                        "verdict": "better" if improvement > 0 else "worse" if improvement < 0 else "tie"}
    return {"wins": wins, "losses": losses, "ties": len(METRICS) - wins - losses,
            "default_wins": default_wins, "worst_improvement_pct": min(oriented, default=0),
            "mean_capped_improvement_pct": sum(max(-100, min(100, x)) for x in oriented) / max(len(oriented), 1),
            "changes": changes}


def ranking(row):
    c = comparison(row)
    return (c["wins"], -c["losses"], c["default_wins"], c["worst_improvement_pct"], c["mean_capped_improvement_pct"])


def run_batch(pool, specs, phase):
    futures = [pool.submit(trial, spec) for spec in specs]
    rows = []
    for future in as_completed(futures):
        rows.append(future.result())
        if len(rows) % 20 == 0 or len(rows) == len(specs):
            best = max(rows, key=ranking)
            print(json.dumps({"phase": phase, "completed": len(rows), "total": len(specs),
                              "best_wins": comparison(best)["wins"], "best_horizon": best["horizon_min"],
                              "best_beta": best["beta"]}), flush=True)
    return rows


def main():
    before = input_hashes()
    scene = json.loads((ROOT / "data/scenarios/moving_band.json").read_text())
    default_band = scene["band"]
    rows = []
    with ProcessPoolExecutor(max_workers=4) as pool:
        # Exhaust every look-ahead and weight value available in the UI.
        policies = [{"phase": "policy", "band": default_band, "horizon_min": h, "beta": b / 2,
                     "threshold_in": 1.5} for h, b in itertools.product(range(0, 121, 5), range(13))]
        rows += run_batch(pool, policies, "policy")
        top_policies = sorted(rows, key=ranking, reverse=True)[:4]
        # A seeded sample across all five snowband steer controls, retaining a moving band.
        rng = random.Random(SEED)
        choices = {"rate_in_hr": [2.5, 3, 4, 5, 6], "heading_deg": [55, 65, 75, 85, 95],
                   "width_m": [1000, 1400, 1800, 2200, 2800], "offset_m": [-3000, -2400, -1800, -1200, -600, 0],
                   "wobble_amp_m": [1200, 1800, 2400, 3000, 3600]}
        storms, seen = [], set()
        while len(storms) < 48:
            band = {**default_band, **{k: rng.choice(v) for k, v in choices.items()}}
            identity = json.dumps(band, sort_keys=True)
            if identity not in seen:
                seen.add(identity)
                storms.append(band)
        storm_specs = [{**policy, "phase": "storm", "band": band} for band, policy in itertools.product(storms, top_policies)]
        rows += run_batch(pool, storm_specs, "storm")
        finalists = sorted(rows, key=ranking, reverse=True)[:6]
        # Threshold affects measurement, so show sensitivity separately from the fixed-1.5 ranking.
        thresholds = [{**row, "phase": "threshold", "threshold_in": threshold}
                      for row, threshold in itertools.product(finalists, (0.75, 1.0, 1.25, 1.75, 2.0, 2.5))]
        thresholds = [{k: r[k] for k in ("phase", "band", "horizon_min", "beta", "threshold_in")} for r in thresholds]
        rows += run_batch(pool, thresholds, "threshold")
    after = input_hashes()
    if before != after:
        raise RuntimeError("Repository inputs changed during the sweep; rerun before reporting these results")
    primary = sorted([r for r in rows if r["phase"] != "threshold"], key=ranking, reverse=True)
    # Reproduce the selected configuration with the ordinary paired engine.
    best = primary[0]
    repeated = Engine()
    repeated.new_run("moving_band", best["band"], overrides={"baseline_policy": "city_priority", "params": {
        "horizon_s": best["horizon_min"] * 60, "corridor_beta": best["beta"], "threshold_in": best["threshold_in"]}})
    timeline = []
    for hour in range(1, 7):
        repeated.advance(360)
        point = {"hour": hour, "metrics": {p: w.metrics() for p, w in repeated.worlds.items()}}
        timeline.append({**point, "comparison": comparison(point)})
    assert timeline[-1]["metrics"] == best["metrics"], "Selected run did not reproduce"
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True).stdout.strip()
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "seed": SEED, "commit": commit,
              "input_hashes": before, "scenario": scene, "base_threshold_in": 1.5,
              "ranking": "Most strictly better metrics; fewest worse; most default rows better; smallest worst percentage loss; mean capped improvement.",
              "best_reproduced": True, "best_hourly_timeline": timeline, "metric_definitions": METRICS,
              "results": [{**r, "comparison": comparison(r)} for r in rows],
              "best": {**best, "comparison": comparison(best)}}
    dest = ROOT / "Docs/demo_parameter_sweep.json"
    dest.write_text(json.dumps(report, indent=2), encoding="utf-8")
    csv_path = dest.with_suffix(".csv")
    columns = ["phase", "horizon_min", "beta", "threshold_in", "rate_in_hr", "heading_deg", "width_m", "offset_m", "wobble_amp_m", "wins", "losses", "ties"]
    columns += [f"{k}_{suffix}" for k, _, _ in METRICS for suffix in ("baseline", "adaptive", "delta_pct", "verdict")]
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for r in rows:
            c = comparison(r)
            out = {k:r[k] for k in ("phase", "horizon_min", "beta", "threshold_in")}
            out.update({k:r["band"][k] for k in ("rate_in_hr", "heading_deg", "width_m", "offset_m", "wobble_amp_m")})
            out.update({k:c[k] for k in ("wins", "losses", "ties")})
            out.update({f"{k}_{suffix}": values[suffix] for k, values in c["changes"].items() for suffix in ("baseline", "adaptive", "delta_pct", "verdict")})
            writer.writerow(out)
    print(json.dumps({"saved": str(dest), "csv": str(csv_path), "trials": len(rows), "best": report["best"]}), flush=True)


if __name__ == "__main__":
    main()
