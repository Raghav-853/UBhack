# SnowTwin WNY — Benchmark Results

Generated 2026-11-08 00:22 UTC by `scripts/benchmark.py` at commit `69038aa`.
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
| Critical-segment exposure (min above threshold) | 149.7 | 84.2 | -44% | adaptive better |
| All-segment exposure (min) | 10145.3 | 8849.8 | -13% | adaptive better |
| Avg critical depth at end (in) | 0.64 | 0.77 | +20% | adaptive worse |
| Distance driven (km) | 247.56 | 269.53 | +9% | adaptive worse |
| Deadhead (% travel not plowing) | 53.8 | 65.6 | +22% | adaptive worse |
| Completed service passes | 462 | 509 | +10% | adaptive better |
| Unique segments serviced | 86 | 98 | +14% | adaptive better |
| Re-accumulations after service | 59 | 133 | +125% | adaptive worse |
| Active crew-hours | 11.43 | 11.43 | 0 | same |
| Snow cleared per crew-hour (in*km) | 10.54 | 13.36 | +27% | adaptive better |

## Moving band (wobble) (`moving_band`)

A 4 in/hr synthetic lake-effect band pivots north and south across the corridor right after a plow pass.

Scenario version `84e49470652d` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 50.7 | 7.0 | -86% | adaptive better |
| All-segment exposure (min) | 8284.5 | 4870.8 | -41% | adaptive better |
| Avg critical depth at end (in) | 0.75 | 0.72 | -4% | adaptive better |
| Distance driven (km) | 264.7 | 276.85 | +5% | adaptive worse |
| Deadhead (% travel not plowing) | 69.4 | 72.6 | +5% | adaptive worse |
| Completed service passes | 297 | 326 | +10% | adaptive better |
| Unique segments serviced | 95 | 116 | +22% | adaptive better |
| Re-accumulations after service | 46 | 77 | +67% | adaptive worse |
| Active crew-hours | 10.99 | 11.17 | +2% | adaptive worse |
| Snow cleared per crew-hour (in*km) | 7.86 | 8.52 | +8% | adaptive better |

## Moving band + camera events (`moving_band_obstruction`)

Moving band plus two scheduled synthetic camera events: a stalled vehicle on Kensington Ave near ECMC and reduced visibility on Fillmore Ave.

Scenario version `09a4d17d1923` · fleet P1:heavy_plow, B1:compact_blower · rerun reproduced identical metrics: **yes**

Scheduled observations applied (synthetic): SYNTHETIC-K1 -> S023 closure at tick 541; SYNTHETIC-F1 -> S063 slowdown at tick 901

| Metric | Baseline (city_priority) | Adaptive | Δ | |
|---|---:|---:|---:|---|
| Critical-segment exposure (min above threshold) | 33.0 | 20.5 | -38% | adaptive better |
| All-segment exposure (min) | 8501.0 | 4676.5 | -45% | adaptive better |
| Avg critical depth at end (in) | 0.8 | 0.75 | -6% | adaptive better |
| Distance driven (km) | 261.17 | 274.79 | +5% | adaptive worse |
| Deadhead (% travel not plowing) | 69.6 | 72.3 | +4% | adaptive worse |
| Completed service passes | 297 | 328 | +10% | adaptive better |
| Unique segments serviced | 95 | 116 | +22% | adaptive better |
| Re-accumulations after service | 28 | 92 | +229% | adaptive worse |
| Active crew-hours | 10.88 | 11.14 | +2% | adaptive worse |
| Snow cleared per crew-hour (in*km) | 7.77 | 8.67 | +12% | adaptive better |

## Reading these results

- Adaptive weights critical corridor segments (Main Street, hospital approaches) more heavily, so it trades some work on other segments and some efficiency for lower critical exposure. Rows marked 'adaptive worse' are part of the result.
- Camera-driven events in the live demo depend on dispatcher approval timing, which is not part of these frozen runs; only the scheduled synthetic events in `moving_band_obstruction` are included.
