# SnowTwin WNY — Benchmark Results

Generated 2026-11-08 00:14 UTC by `scripts/benchmark.py` at commit `972c958`.
Raw data: [`results.json`](results.json).

**What this is:** simulated results for a synthetic snowband over a 118-segment Buffalo corridor, one heavy plow and one compact unit per policy, identical inputs for both policies. Baseline = City published priority (primary/hospital access -> secondary -> residential; see `data/city_priority.json`); other baselines and randomized trials are in [EXPERIMENTS.md](EXPERIMENTS.md). It is not a historical reconstruction and not a field measurement. The 1.5 in exposure threshold is illustrative, not a safety standard.

Shared parameters: service eligible from 1.0 in, service leaves 0.2 in, adaptive look-ahead 30 min, critical multiplier 1+3.0, closure 45 min, visibility slowdown x0.8/x0.6. Vehicle speeds: Heavy plow travel 11.2 m/s, service 6.7 m/s, Compact blower travel 6.7 m/s, service 2.2 m/s.

## Clear weather (control) (`clear_weather`)

No snowfall. Dispatch must not invent work on clear roads.

Scenario version `90525b5d553c` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Baseline (city_priority) | Adaptive | Δ | |
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

Scenario version `9d3269ff31e6` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 2866.5 | 19.2 | -99% | adaptive better |
| All-segment exposure (min) | 19701.0 | 9285.7 | -53% | adaptive better |
| Avg critical depth at end (in) | 1.82 | 0.81 | -55% | adaptive better |
| Distance driven (km) | 324.19 | 270.42 | -17% | adaptive better |
| Deadhead (% travel not plowing) | 87.4 | 66.4 | -24% | adaptive better |
| Completed service passes | 236 | 487 | +106% | adaptive better |
| Unique segments serviced | 40 | 106 | +165% | adaptive better |
| Re-accumulations after service | 56 | 134 | +139% | adaptive worse |
| Active crew-hours | 11.43 | 11.43 | 0 | same |
| Snow cleared per crew-hour (in*km) | 4.55 | 13.22 | +191% | adaptive better |

## Moving band (wobble) (`moving_band`)

A 4 in/hr synthetic lake-effect band pivots north and south across the corridor right after a plow pass.

Scenario version `84e49470652d` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 1370.3 | 16.3 | -99% | adaptive better |
| All-segment exposure (min) | 15757.3 | 6355.8 | -60% | adaptive better |
| Avg critical depth at end (in) | 0.97 | 0.71 | -27% | adaptive better |
| Distance driven (km) | 312.89 | 290.76 | -7% | adaptive better |
| Deadhead (% travel not plowing) | 84.8 | 75.8 | -11% | adaptive better |
| Completed service passes | 181 | 304 | +68% | adaptive better |
| Unique segments serviced | 61 | 112 | +84% | adaptive better |
| Re-accumulations after service | 45 | 92 | +104% | adaptive worse |
| Active crew-hours | 11.28 | 11.28 | 0 | same |
| Snow cleared per crew-hour (in*km) | 5.09 | 8.01 | +57% | adaptive better |

## Moving band + camera events (`moving_band_obstruction`)

Moving band plus two scheduled synthetic camera events: a stalled vehicle on Kensington Ave near ECMC and reduced visibility on Fillmore Ave.

Scenario version `09a4d17d1923` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

Scheduled observations applied (synthetic): SYNTHETIC-K1 -> S023 closure at tick 541; SYNTHETIC-F1 -> S063 slowdown at tick 901

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 1254.3 | 21.7 | -98% | adaptive better |
| All-segment exposure (min) | 15623.3 | 5763.2 | -63% | adaptive better |
| Avg critical depth at end (in) | 0.89 | 0.73 | -18% | adaptive better |
| Distance driven (km) | 311.25 | 285.63 | -8% | adaptive better |
| Deadhead (% travel not plowing) | 84.0 | 74.2 | -12% | adaptive better |
| Completed service passes | 191 | 314 | +64% | adaptive better |
| Unique segments serviced | 62 | 115 | +85% | adaptive better |
| Re-accumulations after service | 43 | 84 | +95% | adaptive worse |
| Active crew-hours | 11.28 | 11.28 | 0 | same |
| Snow cleared per crew-hour (in*km) | 5.43 | 8.16 | +50% | adaptive better |

## Reading these results

- Adaptive weights critical corridor segments (Main Street, hospital approaches) more heavily, so it trades some work on other segments and some efficiency for lower critical exposure. Rows marked 'adaptive worse' are part of the result.
- Camera-driven events in the live demo depend on dispatcher approval timing, which is not part of these frozen runs; only the scheduled synthetic events in `moving_band_obstruction` are included.
