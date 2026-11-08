# SnowTwin WNY — Benchmark Results

Generated 2026-11-08 00:39 UTC by `scripts/benchmark.py` at commit `61c0a3f`.
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
| Critical-segment exposure (min above threshold) | 162.7 | 115.7 | -29% | adaptive better |
| All-segment exposure (min) | 9877.5 | 8337.0 | -16% | adaptive better |
| Avg critical depth at end (in) | 0.59 | 0.81 | +37% | adaptive worse |
| Distance driven (km) | 247.16 | 267.15 | +8% | adaptive worse |
| Deadhead (% travel not plowing) | 53.5 | 64.5 | +21% | adaptive worse |
| Completed service passes | 479 | 515 | +8% | adaptive better |
| Unique segments serviced | 89 | 94 | +6% | adaptive better |
| Re-accumulations after service | 52 | 136 | +162% | adaptive worse |
| Active crew-hours | 11.43 | 11.43 | 0 | same |
| Snow cleared per crew-hour (in*km) | 10.93 | 13.14 | +20% | adaptive better |

## Moving band (wobble) (`moving_band`)

A 4 in/hr synthetic lake-effect band pivots north and south across the corridor right after a plow pass.

Scenario version `84e49470652d` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 87.5 | 4.8 | -95% | adaptive better |
| All-segment exposure (min) | 6870.2 | 5065.3 | -26% | adaptive better |
| Avg critical depth at end (in) | 0.67 | 0.67 | 0 | same |
| Distance driven (km) | 262.08 | 266.58 | +2% | adaptive worse |
| Deadhead (% travel not plowing) | 69.1 | 70.5 | +2% | adaptive worse |
| Completed service passes | 316 | 335 | +6% | adaptive better |
| Unique segments serviced | 106 | 116 | +9% | adaptive better |
| Re-accumulations after service | 63 | 82 | +30% | adaptive worse |
| Active crew-hours | 10.96 | 10.99 | +0% | adaptive worse |
| Snow cleared per crew-hour (in*km) | 8.39 | 8.81 | +5% | adaptive better |

## Moving band + camera events (`moving_band_obstruction`)

Moving band plus two scheduled synthetic camera events: a stalled vehicle on Kensington Ave near ECMC and reduced visibility on Fillmore Ave.

Scenario version `09a4d17d1923` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

Scheduled observations applied (synthetic): SYNTHETIC-K1 -> S023 closure at tick 541; SYNTHETIC-F1 -> S063 slowdown at tick 901

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 137.3 | 19.3 | -86% | adaptive better |
| All-segment exposure (min) | 7090.5 | 3853.5 | -46% | adaptive better |
| Avg critical depth at end (in) | 0.77 | 0.65 | -16% | adaptive better |
| Distance driven (km) | 249.08 | 276.67 | +11% | adaptive worse |
| Deadhead (% travel not plowing) | 66.6 | 71.8 | +8% | adaptive worse |
| Completed service passes | 317 | 337 | +6% | adaptive better |
| Unique segments serviced | 105 | 117 | +11% | adaptive better |
| Re-accumulations after service | 55 | 85 | +55% | adaptive worse |
| Active crew-hours | 10.75 | 11.23 | +4% | adaptive worse |
| Snow cleared per crew-hour (in*km) | 8.64 | 8.63 | -0% | adaptive worse |

## Reading these results

- Adaptive weights critical corridor segments (Main Street, hospital approaches) more heavily, so it trades some work on other segments and some efficiency for lower critical exposure. Rows marked 'adaptive worse' are part of the result.
- Camera-driven events in the live demo depend on dispatcher approval timing, which is not part of these frozen runs; only the scheduled synthetic events in `moving_band_obstruction` are included.
