"""Run the frozen scenario suite headless and write Docs/RESULTS.md + Docs/results.json.

Usage (repo root):  .venv\\Scripts\\python.exe scripts\\benchmark.py

Each scenario is run twice; the second run must reproduce the first exactly (determinism check).
No providers are called: scheduled observations come from the scenario files.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.network import VEHICLE_TYPES  # noqa: E402
from app.simulation import Engine  # noqa: E402

SCENARIOS = ["clear_weather", "stationary_band", "moving_band", "moving_band_obstruction"]
ROWS = [
    ("critical_exposure_min", "Critical-segment exposure (min above threshold)", "low"),
    ("exposure_min", "All-segment exposure (min)", "low"),
    ("avg_critical_depth_in", "Avg critical depth at end (in)", "low"),
    ("distance_km", "Distance driven (km)", "low"),
    ("deadhead_pct", "Deadhead (% travel not plowing)", "low"),
    ("services", "Completed service passes", "high"),
    ("unique_segments", "Unique segments serviced", "high"),
    ("reaccumulations", "Re-accumulations after service", "low"),
    ("crew_hours", "Active crew-hours", "low"),
    ("inch_km_per_crew_hour", "Snow cleared per crew-hour (in*km)", "high"),
]


def run(engine: Engine, sid: str) -> dict:
    engine.new_run(sid)
    engine.run_to_end()
    return {
        "run_id": engine.run_id,
        "scenario_version": engine.version,
        "fleet": [f"{v.id}:{v.vtype}" for v in engine.worlds["fixed"].vehicles],
        "applications": [
            {"frame_id": o["frame_id"], "segment_id": a["segment_id"], "tick": a["tick"], "effect": a["effect"]["kind"]}
            for o in engine.observations.values() for a in o.get("applications", [])
        ],
        "metrics": {p: w.metrics() for p, w in engine.worlds.items()},
    }


def delta(f, a, direction):
    if f == a:
        return "0", "same"
    better = (a < f) if direction == "low" else (a > f)
    txt = f"{(a - f) / abs(f) * 100:+.0f}%" if f else f"{a - f:+.2f}"
    return txt, "adaptive better" if better else "adaptive worse"


def main():
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "backend", "data"], cwd=ROOT,
                                capture_output=True, text=True).stdout.strip())
    engine = Engine()
    results = {}
    for sid in SCENARIOS:
        first, second = run(engine, sid), run(engine, sid)
        same = first["metrics"] == second["metrics"] and first["applications"] == second["applications"]
        results[sid] = {**first, "reproduced": same, "label": engine.scenarios[sid]["label"],
                        "description": engine.scenarios[sid].get("description", "")}
        print(f"{sid}: reproduced={same}")

    out = {"generated_at": datetime.now(timezone.utc).isoformat(), "commit": commit, "uncommitted_changes": dirty,
           "params": engine.params, "vehicle_types": VEHICLE_TYPES, "results": results}
    (ROOT / "Docs" / "results.json").write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")

    p = engine.params
    lines = [
        "# SnowTwin WNY — Benchmark Results",
        "",
        f"Generated {out['generated_at'][:16].replace('T', ' ')} UTC by `scripts/benchmark.py` at commit `{commit}`"
        + (" (with uncommitted backend/data changes)" if dirty else "") + ".",
        "Raw data: [`results.json`](results.json).",
        "",
        "**What this is:** simulated results for a synthetic snowband over a 118-segment Buffalo corridor, "
        "one heavy plow and one compact unit per policy, identical inputs for both policies. "
        "It is not a historical reconstruction and not a field measurement. "
        f"The {p['threshold_in']} in exposure threshold is illustrative, not a safety standard.",
        "",
        f"Shared parameters: service eligible from {p['min_service_depth_in']} in, service leaves {p['residual_in']} in, "
        f"adaptive look-ahead {p['horizon_s'] // 60:.0f} min, critical multiplier 1+{p['corridor_beta']}, "
        f"closure {p['closure_duration_s'] // 60:.0f} min, visibility slowdown x{p['visibility_factor']['reduced']}/x{p['visibility_factor']['poor']}. "
        "Vehicle speeds: " + ", ".join(f"{v['label']} travel {v['travel_mps']} m/s, service {v['service_mps']} m/s"
                                       for v in VEHICLE_TYPES.values()) + ".",
        "",
    ]
    for sid, r in results.items():
        f, a = r["metrics"]["fixed"], r["metrics"]["adaptive"]
        lines += [f"## {r['label']} (`{sid}`)", "", r["description"], "",
                  f"Scenario version `{r['scenario_version']}` · fleet {', '.join(r['fleet'])} · "
                  f"rerun reproduced identical metrics: **{'yes' if r['reproduced'] else 'NO'}**", ""]
        if r["applications"]:
            lines += ["Scheduled observations applied (synthetic): " + "; ".join(
                f"{x['frame_id']} -> {x['segment_id']} {x['effect']} at tick {x['tick']}" for x in r["applications"]), ""]
        lines += ["| Metric | Fixed | Adaptive | Δ | |", "|---|---:|---:|---:|---|"]
        for key, label, direction in ROWS:
            d, verdict = delta(f[key], a[key], direction)
            lines.append(f"| {label} | {f[key]} | {a[key]} | {d} | {verdict} |")
        lines.append("")
    lines += ["## Reading these results", "",
              "- Adaptive weights critical corridor segments (Main Street, hospital approaches) more heavily, so it "
              "trades some work on other segments and some efficiency for lower critical exposure. Rows marked "
              "'adaptive worse' are part of the result.",
              "- Camera-driven events in the live demo depend on dispatcher approval timing, which is not part of these "
              "frozen runs; only the scheduled synthetic events in `moving_band_obstruction` are included.",
              ""]
    (ROOT / "Docs" / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")
    print("wrote Docs/RESULTS.md and Docs/results.json")


if __name__ == "__main__":
    main()
