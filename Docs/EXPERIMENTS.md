# SnowTwin WNY — Controlled Experiments

Generated 2026-11-08 00:14 UTC by `scripts/experiments.py` at commit `972c958` (seed 20261107, 25 randomized trials). Raw data: [`experiments.json`](experiments.json).

**Design.** Each trial draws one storm (band rate 2.5–5 in/hr, flow 55–100°, width 1.2–2.6 km, start offset ±3.5 km, wobble 0–3 km) and one start point per vehicle (one heavy plow, one compact unit) from the candidate start points. The baseline world and the adaptive world then run on exactly those inputs; only the dispatch rule differs. Results are simulated with a synthetic storm; they are not field measurements. Exposure threshold 1.5 in (illustrative).

**Baselines.** *City published priority* serves City primary streets and hospital access first, then secondary, then residential (City lists via BTPM, Jan 2026; see `data/city_priority.json` for sources and limits). *Service history* serves the segment plowed longest ago, mirroring what a service-history tracker shows. *Fixed service loop* is the team's original fixed-order loop. None of these is a reconstruction of the City's actual dispatch software.

## Adaptive vs City published priority

| Metric | City published priority (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 476.5 | 18.8 | -96.6% | +212.4% | 22/25 |
| All-segment exposure (min) | 3494.0 | 1227.8 | -58.3% | +212.4% | 23/25 |
| Distance driven (km) | 278.99 | 255.53 | -8.9% | +1.1% | 24/25 |
| Active crew-hours | 10.46 | 10.41 | -0.3% | +4.8% | 14/25 (7 ties) |
| Snow cleared per crew-hour | 5.5 | 7.21 | +23.8% | -3.6% | 22/25 |

## Adaptive vs Service history (oldest first)

| Metric | Service history (oldest first) (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 828.7 | 18.8 | -97.3% | -82.6% | 25/25 |
| All-segment exposure (min) | 2098.3 | 1227.8 | -62.0% | +632.2% | 21/25 |
| Distance driven (km) | 251.03 | 255.53 | -1.8% | +16.5% | 16/25 |
| Active crew-hours | 10.23 | 10.41 | +0.3% | +7.8% | 5/25 (6 ties) |
| Snow cleared per crew-hour | 7.44 | 7.21 | -1.4% | -13.2% | 10/25 |

## Adaptive vs Fixed service loop

| Metric | Fixed service loop (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 670.5 | 18.8 | -95.5% | +2650.0% | 23/25 |
| All-segment exposure (min) | 1570.2 | 1227.8 | -25.8% | +2650.0% | 19/25 |
| Distance driven (km) | 258.9 | 255.53 | -3.2% | +10.7% | 15/25 |
| Active crew-hours | 10.18 | 10.41 | +0.0% | +15.0% | 7/25 (7 ties) |
| Snow cleared per crew-hour | 6.87 | 7.21 | +0.2% | -17.1% | 13/25 (1 ties) |

## Ablations (vs City published priority, same trials)

Which part of the adaptive policy produces the effect: the 30-minute storm look-ahead, the critical-corridor weight, or neither.

### Adaptive without look-ahead

| Metric | City priority (median) | Adaptive without look-ahead (median) | Median paired change | Worst trial | Adaptive without look-ahead better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 476.5 | 21.2 | -97.0% | +131.8% | 21/25 |
| All-segment exposure (min) | 3494.0 | 761.3 | -70.5% | +61.1% | 23/25 |
| Distance driven (km) | 278.99 | 248.73 | -10.8% | +9.5% | 23/25 |
| Active crew-hours | 10.46 | 10.26 | -1.6% | +7.2% | 16/25 (6 ties) |
| Snow cleared per crew-hour | 5.5 | 7.24 | +23.3% | -6.9% | 22/25 (1 ties) |

### Adaptive without critical weight

| Metric | City priority (median) | Adaptive without critical weight (median) | Median paired change | Worst trial | Adaptive without critical weight better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 476.5 | 32.5 | -90.6% | +183.2% | 22/25 |
| All-segment exposure (min) | 3494.0 | 293.5 | -86.6% | +183.2% | 23/25 |
| Distance driven (km) | 278.99 | 238.13 | -16.2% | +3.6% | 24/25 |
| Active crew-hours | 10.46 | 9.78 | -2.4% | +4.0% | 18/25 (6 ties) |
| Snow cleared per crew-hour | 5.5 | 7.22 | +32.9% | -5.0% | 23/25 |

### Adaptive without either

| Metric | City priority (median) | Adaptive without either (median) | Median paired change | Worst trial | Adaptive without either better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 476.5 | 44.7 | -85.0% | +295.6% | 20/25 |
| All-segment exposure (min) | 3494.0 | 263.8 | -87.9% | +295.6% | 23/25 |
| Distance driven (km) | 278.99 | 234.1 | -17.6% | -3.2% | 25/25 |
| Active crew-hours | 10.46 | 9.78 | -4.4% | +0.2% | 18/25 (6 ties) |
| Snow cleared per crew-hour | 5.5 | 7.45 | +40.2% | -4.4% | 24/25 |

## One variable at a time: heavy-plow start point

Default moving-band storm, compact unit at ECMC, City-priority baseline.

| Heavy start | Baseline critical exposure | Adaptive critical exposure | Baseline distance km | Adaptive distance km |
|---|---:|---:|---:|---:|
| BNMC | 1370.3 | 16.3 | 312.89 | 290.76 |
| ECMC | 1231.8 | 9.5 | 307.27 | 281.1 |
| Main St & E Delavan Ave | 1199.2 | 0.0 | 312.59 | 285.69 |
| Main St & E Ferry St | 1136.2 | 3.5 | 307.65 | 289.03 |
| Main St & Kensington Ave | 1243.0 | 0.0 | 310.72 | 286.08 |
| UB South Campus | 1381.3 | 14.2 | 307.78 | 288.43 |

## Reading these results

- 'Adaptive better in k/n' counts trials where adaptive beat the baseline on that metric; the worst-trial column shows the least favorable paired change, so unfavorable cases stay visible.
- Critical exposure is weighted toward Main Street and hospital approaches by design; efficiency metrics can move the other way.
