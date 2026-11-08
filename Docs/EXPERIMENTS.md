# SnowTwin WNY — Controlled Experiments

Generated 2026-11-08 00:39 UTC by `scripts/experiments.py` at commit `61c0a3f` (seed 20261107, 25 randomized trials). Raw data: [`experiments.json`](experiments.json).

**Design.** Each trial draws one storm (band rate 2.5–5 in/hr, flow 55–100°, width 1.2–2.6 km, start offset ±3.5 km, wobble 0–3 km) and one start point per vehicle (one heavy plow, one compact unit) from the candidate start points. The baseline world and the adaptive world then run on exactly those inputs; only the dispatch rule differs. Results are simulated with a synthetic storm; they are not field measurements. Exposure threshold 1.5 in (illustrative).

**Baselines.** *City published priority* serves City primary streets and hospital access first, then secondary, then residential (City lists via BTPM, Jan 2026; see `data/city_priority.json` for sources and limits). *Service history* serves the segment plowed longest ago, mirroring what a service-history tracker shows. *Fixed service loop* is the team's original fixed-order loop. None of these is a reconstruction of the City's actual dispatch software.

## Adaptive vs City published priority

| Metric | City published priority (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 37.7 | 14.8 | -65.7% | +782.5% | 19/25 (2 ties) |
| All-segment exposure (min) | 1174.5 | 1260.0 | -8.4% | +782.5% | 16/25 |
| Distance driven (km) | 226.91 | 252.51 | +8.3% | +21.7% | 1/25 |
| Active crew-hours | 9.93 | 10.31 | +2.6% | +16.9% | 2/25 (6 ties) |
| Snow cleared per crew-hour | 7.68 | 7.2 | -1.6% | -11.2% | 12/25 |

## Adaptive vs Service history (oldest first)

| Metric | Service history (oldest first) (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 535.3 | 14.8 | -97.3% | +8.7% | 24/25 |
| All-segment exposure (min) | 950.7 | 1260.0 | -25.0% | +1152.5% | 21/25 |
| Distance driven (km) | 241.89 | 252.51 | +4.0% | +26.6% | 9/25 |
| Active crew-hours | 9.75 | 10.31 | +2.0% | +19.6% | 3/25 (6 ties) |
| Snow cleared per crew-hour | 7.4 | 7.2 | -6.1% | -15.0% | 6/25 (1 ties) |

## Adaptive vs Fixed service loop

| Metric | Fixed service loop (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 453.5 | 14.8 | -96.7% | +109.0% | 22/25 (1 ties) |
| All-segment exposure (min) | 1475.7 | 1260.0 | -32.8% | +253.7% | 20/25 |
| Distance driven (km) | 263.75 | 252.51 | -4.8% | +13.2% | 18/25 |
| Active crew-hours | 10.3 | 10.31 | +0.0% | +9.4% | 9/25 (8 ties) |
| Snow cleared per crew-hour | 6.78 | 7.2 | +2.1% | -11.6% | 17/25 |

## Ablations (vs City published priority, same trials)

Which part of the adaptive policy produces the effect: the 30-minute storm look-ahead, the critical-corridor weight, or neither.

### Adaptive without look-ahead

| Metric | City priority (median) | Adaptive without look-ahead (median) | Median paired change | Worst trial | Adaptive without look-ahead better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 37.7 | 28.2 | -58.1% | +1430.0% | 18/25 (1 ties) |
| All-segment exposure (min) | 1174.5 | 578.8 | -27.7% | +1430.0% | 20/25 |
| Distance driven (km) | 226.91 | 249.65 | +6.9% | +19.4% | 3/25 |
| Active crew-hours | 9.93 | 10.04 | +1.6% | +11.2% | 2/25 (6 ties) |
| Snow cleared per crew-hour | 7.68 | 7.24 | +0.3% | -18.4% | 13/25 |

### Adaptive without critical weight

| Metric | City priority (median) | Adaptive without critical weight (median) | Median paired change | Worst trial | Adaptive without critical weight better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 37.7 | 33.2 | +30.0% | +1205.6% | 9/25 (1 ties) |
| All-segment exposure (min) | 1174.5 | 376.3 | -46.7% | +605.0% | 22/25 |
| Distance driven (km) | 226.91 | 234.85 | +4.3% | +15.4% | 5/25 (1 ties) |
| Active crew-hours | 9.93 | 9.85 | +0.3% | +10.5% | 6/25 (6 ties) |
| Snow cleared per crew-hour | 7.68 | 7.45 | +2.8% | -17.2% | 18/25 |

### Adaptive without either

| Metric | City priority (median) | Adaptive without either (median) | Median paired change | Worst trial | Adaptive without either better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 37.7 | 34.8 | +16.8% | +1716.7% | 8/25 (1 ties) |
| All-segment exposure (min) | 1174.5 | 289.8 | -57.2% | +975.0% | 21/25 |
| Distance driven (km) | 226.91 | 229.75 | +2.4% | +19.8% | 9/25 |
| Active crew-hours | 9.93 | 9.4 | +0.0% | +15.5% | 10/25 (6 ties) |
| Snow cleared per crew-hour | 7.68 | 7.78 | +8.7% | -17.2% | 20/25 |

## One variable at a time: heavy-plow start point

Default moving-band storm, compact unit at ECMC, City-priority baseline.

| Heavy start | Baseline critical exposure | Adaptive critical exposure | Baseline distance km | Adaptive distance km |
|---|---:|---:|---:|---:|
| BNMC | 87.5 | 4.8 | 262.08 | 266.58 |
| ECMC | 148.8 | 5.3 | 264.07 | 282.42 |
| Main St & E Delavan Ave | 126.3 | 9.0 | 242.79 | 272.76 |
| Main St & E Ferry St | 91.0 | 18.7 | 250.09 | 283.6 |
| Main St & Kensington Ave | 157.3 | 20.8 | 263.78 | 284.47 |
| UB South Campus | 142.3 | 12.0 | 239.94 | 283.84 |

## Reading these results

- 'Adaptive better in k/n' counts trials where adaptive beat the baseline on that metric; the worst-trial column shows the least favorable paired change, so unfavorable cases stay visible.
- Critical exposure is weighted toward Main Street and hospital approaches by design; efficiency metrics can move the other way.
