# SnowTwin WNY — Handoff (City Snow Plan baselines, experiment variables, snow contours)

**As of:** 2026-11-07 ~20:15 ET · code through `61c0a3f` · builds on YoungJun's NWS/storm-model work (`e072d77`).
**Read with:** [MASTER_EXECUTION_PLAN.md](MASTER_EXECUTION_PLAN.md), [IMPLEMENTATION_AUDIT_AND_REMAINING_WORK.md](IMPLEMENTATION_AUDIT_AND_REMAINING_WORK.md), [WEATHER_HANDOFF.md](WEATHER_HANDOFF.md).
**Primary source:** City of Buffalo DPW Winter Snow Plan 2026-27 — [Docs/sources/Buffalo_Winter_Snow_Plan_2026-27.pdf](sources/Buffalo_Winter_Snow_Plan_2026-27.pdf).

## What the Snow Plan says (and how it is used)

| Plan content | Page | Used as |
|---|---|---|
| Fleet assigned to **pre-determined routes within plowing districts** | 8 | Justifies a fixed/priority baseline |
| Equipment **may be reassigned** where snowfall rate/depth is heavier | 9 | SnowTwin's role: decision support for that reassignment |
| Focus first on **primaries and secondaries** (incl. NFTA bus routes) and **streets around critical facilities**, then residential | 12, 16 | Baseline order and tiers |
| At least one pass on every residential street **within 24 h** after the event | 12, 16 | Context (not a metric yet) |
| **Primary/Secondary street table** (289 rows) | 26–33 | Corridor tiers; extracted to `data/city_ps_table.json` |
| Plow district maps | 35–49 | Images; corridor spans several districts, Main St is a boundary. **Not modeled** |
| **Snow fleet inventory**: 49 plow trucks listed — 22 up, 18 down, 4 auction, 5 on order; hi-lifts 12 up / 6 down; 7 tractors on order | 50–51 | `data/city_fleet.json`; business-case context (same fleet, better dispatch) |
| Police districts, fire stations, critical facilities (hospitals etc.) | 53, 54, 61 | Geocoded; streets within 200 m are tier 1 (`data/critical_facilities.json`), shown on the map |
| NFTA priority clearing bus routes | 58–60 | `bus_route` flag per segment |

## What changed in the app

| Area | Change | Where |
|---|---|---|
| Priority tiers | Tier 1 = plan primary, or within 200 m of a plan facility, or hospital approach; 2 = plan secondary; 3 = other. Both policies use the same tiers. Corridor: **83 primary, 4 facility access, 1 hospital access, 7 secondary, 23 residential**. | `backend/app/network.py`, `data/city_priority.json` (page-cited rules, limits, matched table entries) |
| Baselines | Comparison world selectable: **`city_priority`** (default; highest tier needing work, nearest within the tier), **`service_history`** (longest since plowed in 30-min bins, then nearest — what a tracker shows), **`fixed_loop`** (original team loop). | `backend/app/routing.py` |
| Experiment variables | Per-run overrides, validated: fleet size/mix (1–2 heavy, 0–2 compact) and start points, look-ahead, critical weight, eligibility floor, threshold, baseline. Reset keeps current variables. | `apply_overrides` in `simulation.py`; `POST /api/scenario {overrides: {...}}`; dashboard "Experiment variables" panel |
| Start points | Six candidate starts (BNMC, ECMC, UB South, three Main St intersections) — assumptions; the DPW Snow Hub address was not found in the plan text. | `data/depots.json` |
| Map | Dashed snowfall contours (blue = 0.25 in/hr snow edge, white = 2 in/hr heavy core); Snow Plan facility markers (H/P/F); comparison map titled with the active baseline. | `MapPane.tsx`, `simulation.py` (`_contour`) |
| Experiments | `scripts/experiments.py` (25 seeded random storms/starts per baseline, ablations, start-point sweep) → `Docs/EXPERIMENTS.md`; `scripts/benchmark.py` → `Docs/RESULTS.md`. | |

## Key results (simulated, synthetic storm; full tables in EXPERIMENTS.md)

- **Adaptive vs City published priority (strongest baseline):** critical-segment exposure median **−66%** (better in 19/25, 2 ties; worst trial unfavorable), distance **+8%** (better in 1/25), snow cleared per crew-hour −1.6%. Claim it as a **trade-off: roughly 8–10% more driving to cut exposure on Main St / hospital approaches by about two thirds**.
- **Vs service history:** critical exposure much lower in nearly all trials; efficiency slightly worse.
- **Ablations:** the gain comes from the **critical-corridor weight**; the 30-min look-ahead contributes little. Pitch "risk-weighted, need-aware dispatch", not "forecasting".
- Baselines originally ignored travel within a tier (artificially weak); fixed in `fba6694` before these numbers. Tiers originally came from a press-reported list that was wrong for E Delavan / E Utica / Grider; replaced by the plan table in `69038aa`.

## Honest framing (keep)

- Baselines follow the plan's **published** priority rules and table; they do not reproduce the City's district routes, turn-by-turn order, or crew assignments.
- Street matching is by normalized name; printed limits of every matched entry span the corridor portion. Humboldt Pkwy and Laurel St are not in the table (residential). Warming centers have no addresses (not modeled). Fire Engine 33 (Fillmore & Buehl) could not be located.
- Say "following the City's 2026-27 Snow Plan priority rules", never "the City's actual dispatch".

## Open items

1. Plow districts (pp. 35–49) per segment, if district-constrained routes are wanted.
2. Automated tests.
3. Rerun `benchmark.py` and `experiments.py` after any model change; numbers above are from `61c0a3f`.
4. NWS runs: archive clips cannot be applied (capture-time rule by design).

## Commands

```powershell
.\run.ps1                                                       # http://127.0.0.1:8000
.\.venv\Scripts\python.exe scripts\benchmark.py                 # Docs/RESULTS.md (~5 s)
.\.venv\Scripts\python.exe scripts\experiments.py --trials 25   # Docs/EXPERIMENTS.md (~3 min)
```
