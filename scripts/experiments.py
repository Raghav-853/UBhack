"""Controlled experiments: randomized paired trials, one-variable sweeps, and ablations.

Usage (repo root):  .venv\\Scripts\\python.exe scripts\\experiments.py [--trials 25]

Every trial runs the baseline world and the adaptive world on identical inputs (same band, fleet,
starts, parameters). Randomness only chooses those shared inputs, from a fixed seed, so the whole
report is reproducible. Writes Docs/EXPERIMENTS.md and Docs/experiments.json. No providers are called.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.simulation import Engine  # noqa: E402

SCENARIO = "moving_band"
METRICS = [  # key, label, lower_is_better
    ("critical_exposure_min", "Critical-segment exposure (min)", True),
    ("exposure_min", "All-segment exposure (min)", True),
    ("distance_km", "Distance driven (km)", True),
    ("crew_hours", "Active crew-hours", True),
    ("inch_km_per_crew_hour", "Snow cleared per crew-hour", False),
]
BASELINES = ["city_priority", "service_history", "fixed_loop"]
BASELINE_LABEL = {"city_priority": "City published priority", "service_history": "Service history (oldest first)",
                  "fixed_loop": "Fixed service loop"}


def random_inputs(rng: random.Random, starts: list[str]) -> dict:
    return {
        "band": {"rate_in_hr": round(rng.uniform(2.5, 5.0), 2), "heading_deg": round(rng.uniform(55, 100)),
                 "width_m": round(rng.uniform(1200, 2600), -1), "offset_m": round(rng.uniform(-3500, 3500), -1),
                 "wobble_amp_m": round(rng.uniform(0, 3000), -1)},
        "fleet": [{"id": "P1", "type": "heavy_plow", "start": rng.choice(starts)},
                  {"id": "B1", "type": "compact_blower", "start": rng.choice(starts)}],
    }


def run(engine: Engine, band: dict | None, fleet: list | None, baseline: str, params: dict | None = None) -> dict:
    engine.new_run(SCENARIO, band, overrides={"fleet": fleet, "baseline_policy": baseline, "params": params or {}})
    engine.run_to_end()
    return {p: w.metrics() for p, w in engine.worlds.items()}


def summarize(pairs: list[tuple[dict, dict]]) -> dict:
    out = {}
    for key, _, lower in METRICS:
        b = [x[key] for x, _ in pairs]
        a = [y[key] for _, y in pairs]
        rel = [((y - x) / abs(x) * 100) for x, y in zip(b, a) if x]
        better = sum(1 for x, y in zip(b, a) if (y < x if lower else y > x))
        same = sum(1 for x, y in zip(b, a) if x == y)
        out[key] = {
            "baseline_median": round(statistics.median(b), 2), "adaptive_median": round(statistics.median(a), 2),
            "median_rel_change_pct": round(statistics.median(rel), 1) if rel else None,
            "worst_rel_change_pct": (round(max(rel) if lower else min(rel), 1)) if rel else None,
            "adaptive_better": better, "ties": same, "n": len(pairs),
        }
    return out


def table(summary: dict, base_label: str, adapt_label: str = "Adaptive") -> list[str]:
    lines = [f"| Metric | {base_label} (median) | {adapt_label} (median) | Median paired change | Worst trial | {adapt_label} better in |",
             "|---|---:|---:|---:|---:|---:|"]
    for key, label, _ in METRICS:
        s = summary[key]
        fmt = lambda v: "—" if v is None else f"{v:+.1f}%"
        lines.append(f"| {label} | {s['baseline_median']} | {s['adaptive_median']} | {fmt(s['median_rel_change_pct'])} | "
                     f"{fmt(s['worst_rel_change_pct'])} | {s['adaptive_better']}/{s['n']}" + (f" ({s['ties']} ties)" if s['ties'] else "") + " |")
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=25)
    ap.add_argument("--seed", type=int, default=20261107)
    args = ap.parse_args()

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    engine = Engine()
    starts = sorted(engine.net.start_points)
    rng = random.Random(args.seed)
    trials = [random_inputs(rng, starts) for _ in range(args.trials)]
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "commit": commit, "seed": args.seed,
              "scenario": SCENARIO, "trials": trials, "start_points": starts, "results": {}}

    # 1. randomized paired trials, per baseline
    for b in BASELINES:
        pairs = []
        for t in trials:
            m = run(engine, t["band"], t["fleet"], b)
            pairs.append((m["fixed"], m["adaptive"]))
        report["results"][f"random:{b}"] = {"summary": summarize(pairs), "raw": pairs}
        print(f"random trials vs {b}: done")

    # 2. ablations of the adaptive policy vs the city-priority baseline (same trials)
    for name, params in {"no_lookahead": {"horizon_s": 0}, "no_critical_weight": {"corridor_beta": 0},
                         "neither": {"horizon_s": 0, "corridor_beta": 0}}.items():
        pairs = []
        for t in trials:
            m = run(engine, t["band"], t["fleet"], "city_priority", params)
            pairs.append((m["fixed"], m["adaptive"]))
        report["results"][f"ablation:{name}"] = {"params": params, "summary": summarize(pairs), "raw": pairs}
        print(f"ablation {name}: done")

    # 3. one variable at a time: heavy-plow start point (default storm, compact at ECMC, city baseline)
    oat = {}
    for s in starts:
        m = run(engine, None, [{"id": "P1", "type": "heavy_plow", "start": s},
                               {"id": "B1", "type": "compact_blower", "start": "ECMC"}], "city_priority")
        oat[s] = m
    report["results"]["oat:heavy_start"] = oat
    print("one-at-a-time sweep: done")
    (ROOT / "Docs" / "experiments.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    p = engine.params
    L = ["# SnowTwin WNY — Controlled Experiments", "",
         f"Generated {report['generated_at'][:16].replace('T', ' ')} UTC by `scripts/experiments.py` at commit `{commit}` "
         f"(seed {args.seed}, {args.trials} randomized trials). Raw data: [`experiments.json`](experiments.json).", "",
         "**Design.** Each trial draws one storm (band rate 2.5–5 in/hr, flow 55–100°, width 1.2–2.6 km, start offset ±3.5 km, "
         "wobble 0–3 km) and one start point per vehicle (one heavy plow, one compact unit) from the candidate start points. "
         "The baseline world and the adaptive world then run on exactly those inputs; only the dispatch rule differs. "
         "Results are simulated with a synthetic storm; they are not field measurements. "
         f"Exposure threshold {p['threshold_in']} in (illustrative).", "",
         "**Baselines.** *City published priority* serves City primary streets and hospital access first, then secondary, then "
         "residential (City lists via BTPM, Jan 2026; see `data/city_priority.json` for sources and limits). *Service history* "
         "serves the segment plowed longest ago, mirroring what a service-history tracker shows. *Fixed service loop* is the "
         "team's original fixed-order loop. None of these is a reconstruction of the City's actual dispatch software.", ""]
    for b in BASELINES:
        L += [f"## Adaptive vs {BASELINE_LABEL[b]}", ""] + table(report["results"][f"random:{b}"]["summary"], BASELINE_LABEL[b]) + [""]
    L += ["## Ablations (vs City published priority, same trials)", "",
          f"Which part of the adaptive policy produces the effect: the {p['horizon_s'] / 60:g}-minute storm look-ahead, the critical-corridor weight, or neither.", ""]
    for name, label in [("no_lookahead", "Adaptive without look-ahead"), ("no_critical_weight", "Adaptive without critical weight"),
                        ("neither", "Adaptive without either")]:
        L += [f"### {label}", ""] + table(report["results"][f"ablation:{name}"]["summary"], "City priority", label) + [""]
    L += ["## One variable at a time: heavy-plow start point", "",
          "Default moving-band storm, compact unit at ECMC, City-priority baseline.", "",
          "| Heavy start | Baseline critical exposure | Adaptive critical exposure | Baseline distance km | Adaptive distance km |",
          "|---|---:|---:|---:|---:|"]
    for s, m in oat.items():
        L.append(f"| {s} | {m['fixed']['critical_exposure_min']} | {m['adaptive']['critical_exposure_min']} | "
                 f"{m['fixed']['distance_km']} | {m['adaptive']['distance_km']} |")
    L += ["", "## Reading these results", "",
          "- 'Adaptive better in k/n' counts trials where adaptive beat the baseline on that metric; the worst-trial column shows "
          "the least favorable paired change, so unfavorable cases stay visible.",
          "- Critical exposure is weighted toward Main Street and hospital approaches by design; efficiency metrics can move the "
          "other way.", ""]
    (ROOT / "Docs" / "EXPERIMENTS.md").write_text("\n".join(L), encoding="utf-8")
    print("wrote Docs/EXPERIMENTS.md and Docs/experiments.json")


if __name__ == "__main__":
    main()
