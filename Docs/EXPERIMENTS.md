# SnowTwin WNY — Controlled Experiments

Generated 2026-11-08 00:22 UTC by `scripts/experiments.py` at commit `69038aa` (seed 20261107, 25 randomized trials). Raw data: [`experiments.json`](experiments.json).

**Design.** Each trial draws one storm (band rate 2.5–5 in/hr, flow 55–100°, width 1.2–2.6 km, start offset ±3.5 km, wobble 0–3 km) and one start point per vehicle (one heavy plow, one compact unit) from the candidate start points. The baseline world and the adaptive world then run on exactly those inputs; only the dispatch rule differs. Results are simulated with a synthetic storm; they are not field measurements. Exposure threshold 1.5 in (illustrative).

**Baselines.** *City published priority* serves City primary streets and hospital access first, then secondary, then residential (City lists via BTPM, Jan 2026; see `data/city_priority.json` for sources and limits). *Service history* serves the segment plowed longest ago, mirroring what a service-history tracker shows. *Fixed service loop* is the team's original fixed-order loop. None of these is a reconstruction of the City's actual dispatch software.

## Adaptive vs City published priority

| Metric | City published priority (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 27.2 | 20.7 | -50.2% | +782.5% | 17/25 (3 ties) |
| All-segment exposure (min) | 1172.3 | 1251.3 | +2.9% | +782.5% | 12/25 |
| Distance driven (km) | 224.29 | 254.05 | +9.8% | +25.5% | 1/25 |
| Active crew-hours | 9.67 | 10.31 | +3.0% | +16.9% | 1/25 (5 ties) |
| Snow cleared per crew-hour | 7.53 | 7.17 | -2.2% | -15.9% | 10/25 |

## Adaptive vs Service history (oldest first)

| Metric | Service history (oldest first) (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 535.3 | 20.7 | -97.1% | +8.7% | 24/25 |
| All-segment exposure (min) | 950.7 | 1251.3 | -21.1% | +1249.2% | 18/25 |
| Distance driven (km) | 241.89 | 254.05 | +4.0% | +24.2% | 8/25 |
| Active crew-hours | 9.75 | 10.31 | +2.0% | +18.9% | 2/25 (6 ties) |
| Snow cleared per crew-hour | 7.4 | 7.17 | -5.3% | -17.1% | 5/25 |

## Adaptive vs Fixed service loop

| Metric | Fixed service loop (median) | Adaptive (median) | Median paired change | Worst trial | Adaptive better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 420.3 | 20.7 | -93.1% | +109.0% | 21/25 (2 ties) |
| All-segment exposure (min) | 1389.8 | 1251.3 | -29.2% | +253.7% | 18/25 |
| Distance driven (km) | 262.88 | 254.05 | -4.8% | +13.2% | 18/25 |
| Active crew-hours | 10.31 | 10.31 | +0.0% | +9.4% | 9/25 (7 ties) |
| Snow cleared per crew-hour | 7.0 | 7.17 | +1.1% | -12.8% | 17/25 |

## Ablations (vs City published priority, same trials)

Which part of the adaptive policy produces the effect: the 30-minute storm look-ahead, the critical-corridor weight, or neither.

### Adaptive without look-ahead

| Metric | City priority (median) | Adaptive without look-ahead (median) | Median paired change | Worst trial | Adaptive without look-ahead better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 27.2 | 27.7 | -64.2% | +1430.0% | 16/25 (3 ties) |
| All-segment exposure (min) | 1172.3 | 633.8 | -16.6% | +1430.0% | 17/25 |
| Distance driven (km) | 224.29 | 251.5 | +9.1% | +25.9% | 2/25 |
| Active crew-hours | 9.67 | 10.03 | +2.1% | +11.2% | 1/25 (6 ties) |
| Snow cleared per crew-hour | 7.53 | 7.1 | +0.0% | -18.4% | 12/25 (1 ties) |

### Adaptive without critical weight

| Metric | City priority (median) | Adaptive without critical weight (median) | Median paired change | Worst trial | Adaptive without critical weight better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 27.2 | 28.2 | +61.7% | +4514.3% | 8/25 (3 ties) |
| All-segment exposure (min) | 1172.3 | 376.3 | -43.3% | +605.0% | 22/25 |
| Distance driven (km) | 224.29 | 234.85 | +4.7% | +18.2% | 6/25 |
| Active crew-hours | 9.67 | 9.92 | +0.5% | +10.5% | 5/25 (5 ties) |
| Snow cleared per crew-hour | 7.53 | 7.45 | +3.0% | -17.2% | 16/25 |

### Adaptive without either

| Metric | City priority (median) | Adaptive without either (median) | Median paired change | Worst trial | Adaptive without either better in |
|---|---:|---:|---:|---:|---:|
| Critical-segment exposure (min) | 27.2 | 43.0 | +53.3% | +3900.0% | 5/25 (1 ties) |
| All-segment exposure (min) | 1172.3 | 351.7 | -46.6% | +975.0% | 21/25 |
| Distance driven (km) | 224.29 | 227.98 | +3.2% | +19.8% | 8/25 |
| Active crew-hours | 9.67 | 9.47 | +0.0% | +15.5% | 11/25 (5 ties) |
| Snow cleared per crew-hour | 7.53 | 7.78 | +9.1% | -17.2% | 19/25 |

## One variable at a time: heavy-plow start point

Default moving-band storm, compact unit at ECMC, City-priority baseline.

| Heavy start | Baseline critical exposure | Adaptive critical exposure | Baseline distance km | Adaptive distance km |
|---|---:|---:|---:|---:|
| BNMC | 50.7 | 7.0 | 264.7 | 276.85 |
| ECMC | 268.5 | 8.7 | 248.99 | 281.76 |
| Main St & E Delavan Ave | 33.2 | 4.2 | 261.66 | 284.18 |
| Main St & E Ferry St | 130.2 | 5.8 | 255.09 | 281.77 |
| Main St & Kensington Ave | 140.7 | 16.7 | 255.26 | 281.2 |
| UB South Campus | 118.3 | 5.7 | 245.11 | 275.88 |

## Reading these results

- 'Adaptive better in k/n' counts trials where adaptive beat the baseline on that metric; the worst-trial column shows the least favorable paired change, so unfavorable cases stay visible.
- Critical exposure is weighted toward Main Street and hospital approaches by design; efficiency metrics can move the other way.
