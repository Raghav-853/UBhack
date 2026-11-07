# SnowTwin WNY — Benchmark Results

Generated 2026-11-07 22:37 UTC by `scripts/benchmark.py` at commit `8415fe0`.
Raw data: [`results.json`](results.json).

**What this is:** simulated results for a synthetic snowband over a 118-segment Buffalo corridor, one heavy plow and one compact unit per policy, identical inputs for both policies. It is not a historical reconstruction and not a field measurement. The 1.5 in exposure threshold is illustrative, not a safety standard.

Shared parameters: service eligible from 1.0 in, service leaves 0.2 in, adaptive look-ahead 30 min, critical multiplier 1+3.0, closure 45 min, visibility slowdown x0.8/x0.6. Vehicle speeds: Heavy plow travel 11.2 m/s, service 6.7 m/s, Compact blower travel 6.7 m/s, service 2.2 m/s.

## Clear weather (control) (`clear_weather`)

No snowfall. Dispatch must not invent work on clear roads.

Scenario version `1565f307d8ea` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Fixed | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 0.0 | 0.0 | 0 | same |
| All-segment exposure (min) | 0.0 | 0.0 | 0 | same |
| Avg critical depth at end (in) | 0.0 | 0.0 | 0 | same |
| Distance driven (km) | 0.0 | 0.0 | 0 | same |
| Deadhead (% travel not plowing) | 0.0 | 0.0 | 0 | same |
| Completed service passes | 0 | 0 | 0 | same |
| Unique segments serviced | 0 | 0 | 0 | same |
| Re-accumulations after service | 0 | 0 | 0 | same |
| Active crew-hours | 0.0 | 0.0 | 0 | same |
| Snow cleared per crew-hour (in*km) | 0.0 | 0.0 | 0 | same |

## Stationary band (`stationary_band`)

A 3.5 in/hr band parked over the ECMC / Kensington area; demand stays geographically stable.

Scenario version `da1936a8a513` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Fixed | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 5394.5 | 905.2 | -83% | adaptive better |
| All-segment exposure (min) | 17898.0 | 13461.0 | -25% | adaptive better |
| Avg critical depth at end (in) | 2.13 | 0.87 | -59% | adaptive better |
| Distance driven (km) | 282.24 | 263.88 | -7% | adaptive better |
| Deadhead (% travel not plowing) | 69.9 | 59.4 | -15% | adaptive better |
| Completed service passes | 369 | 605 | +64% | adaptive better |
| Unique segments serviced | 76 | 76 | 0 | same |
| Re-accumulations after service | 349 | 371 | +6% | adaptive worse |
| Active crew-hours | 11.65 | 11.65 | 0 | same |
| Snow cleared per crew-hour (in*km) | 27.83 | 27.02 | -3% | adaptive worse |

## Moving band (wobble) (`moving_band`)

A 4 in/hr synthetic lake-effect band pivots north and south across the corridor right after a plow pass.

Scenario version `958236894c8b` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Fixed | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 4009.0 | 511.5 | -87% | adaptive better |
| All-segment exposure (min) | 13761.0 | 8736.3 | -37% | adaptive better |
| Avg critical depth at end (in) | 1.3 | 0.7 | -46% | adaptive better |
| Distance driven (km) | 278.28 | 272.89 | -2% | adaptive better |
| Deadhead (% travel not plowing) | 69.4 | 68.3 | -2% | adaptive better |
| Completed service passes | 331 | 390 | +18% | adaptive better |
| Unique segments serviced | 103 | 103 | 0 | same |
| Re-accumulations after service | 227 | 178 | -22% | adaptive better |
| Active crew-hours | 11.52 | 11.24 | -2% | adaptive better |
| Snow cleared per crew-hour (in*km) | 14.24 | 14.58 | +2% | adaptive better |

## Moving band + camera events (`moving_band_obstruction`)

Moving band plus two scheduled synthetic camera events: a stalled vehicle on Kensington Ave near ECMC and reduced visibility on Fillmore Ave.

Scenario version `5214a3b52a35` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

Scheduled observations applied (synthetic): SYNTHETIC-K1 -> S023 closure at tick 541; SYNTHETIC-F1 -> S063 slowdown at tick 901

| Metric | Fixed | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 3592.5 | 519.2 | -86% | adaptive better |
| All-segment exposure (min) | 12569.8 | 8730.7 | -31% | adaptive better |
| Avg critical depth at end (in) | 1.26 | 0.62 | -51% | adaptive better |
| Distance driven (km) | 276.13 | 277.21 | +0% | adaptive worse |
| Deadhead (% travel not plowing) | 69.8 | 67.7 | -3% | adaptive better |
| Completed service passes | 325 | 401 | +23% | adaptive better |
| Unique segments serviced | 103 | 103 | 0 | same |
| Re-accumulations after service | 220 | 183 | -17% | adaptive better |
| Active crew-hours | 11.46 | 11.43 | -0% | adaptive better |
| Snow cleared per crew-hour (in*km) | 14.38 | 14.54 | +1% | adaptive better |

## Reading these results

- Adaptive weights critical corridor segments (Main Street, hospital approaches) more heavily, so it trades some work on other segments and some efficiency for lower critical exposure. Rows marked 'adaptive worse' are part of the result.
- Camera-driven events in the live demo depend on dispatcher approval timing, which is not part of these frozen runs; only the scheduled synthetic events in `moving_band_obstruction` are included.
