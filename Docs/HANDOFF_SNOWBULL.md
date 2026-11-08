# SnowBull — Handoff (learned forecast, demo scenario, dashboard polish)

**As of:** 2026-11-08 · branch `feat/snowbull-forecast-demo` (not merged to `main`) · commits `e8de652`, `e5df26e`, `07bf03b` on top of `7e711b4`.
**Read with:** [HANDOFF.md](HANDOFF.md) (Snow Plan baselines, tiers, experiment variables — still valid).

## TL;DR

1. Adaptive ("SnowBull") dispatch no longer reads the synthetic band's future position. A small learned model predicts snowfall over the look-ahead from what is observable now.
2. A scripted ~18 s demo scenario (`demo_18s`) ends at T+03:06. All synthetic bands are now 3 km wide (were 1.8 km).
3. Dashboard: SnowBull naming, results popup at end of run, hero metric is snow cleared per crew-hour.
4. Numbers in `README.md`, `Docs/RESULTS.md`, `Docs/EXPERIMENTS.md` are **stale** (old 1.8 km bands, old look-ahead). Rerun the scripts before quoting them.

## 1. Learned snowfall forecast

| | Before | Now |
|---|---|---|
| How far ahead | 55 min (`horizon_s = 3300`) | 55 min (unchanged) |
| How the next 55 min is known | Reads future band position (oracle) | Ridge regression on currently observable rates |

- **Model:** one ridge regression per horizon (15/30/55/90/120 min), linearly interpolated for other horizons. Target: mean snowfall rate (in/hr) over `[t, t + horizon)`.
- **Features (all observable at time t):** segment rate now and 5/10/15 min ago; current rates ±1 km and ±2 km across the band axis; current rate 3 km upwind; rates ±1 km across, 10 min ago; bias.
- **Training:** 80 random bands (same `Band` model as the simulator), split by storm (16 test / 64 train), 368k training rows, ~30 s, pure Python (no numpy).
- **Held-out accuracy:**

  | Horizon | MAE (in/hr) | R² | Persistence R² |
  |---|---|---|---|
  | 15 min | 0.19 | 0.84 | 0.46 |
  | 55 min (default) | 0.33 | 0.55 | −0.08 |

  On the shipped `moving_band` storm alone, R² at 55 min is ~0 (still better MAE than persistence). On `stationary_band`, persistence predicts better than the model. Both were measured before the 3 km width change.
- **Dispatch effect (1.8 km bands, adaptive critical-road exposure):** model ≈ oracle or better (`moving_band` 444 vs 643 min; `stationary_band` 1396 vs 1579), and clearly better than persistence on all-road exposure.
- **Switch back:** `params.forecast_mode = "oracle"` restores the old look-ahead. It is not exposed in `PARAM_LIMITS`/UI.
- NWS runs are unchanged (they use the NWS forecast).

| File | Role |
|---|---|
| [backend/app/forecast_model.py](../backend/app/forecast_model.py) | Feature code shared by training and runtime; `predict_amount_in` |
| [scripts/train_snow_forecast.py](../scripts/train_snow_forecast.py) | Generates storms, trains, evaluates, writes the model |
| `data/models/snow_forecast_v1.json` | Coefficients, feature names, test metrics |
| [backend/app/simulation.py:281](../backend/app/simulation.py#L281) | `World.forecast_in` → model or oracle |
| [backend/app/routing.py:228](../backend/app/routing.py#L228) | Adds `forecast_source` to the dispatch explanation |

**Retrain** after changing the `Band` model or the feature list (the loader refuses a model trained on different features):
```powershell
.\.venv\Scripts\python.exe scripts\train_snow_forecast.py
```

## 2. Demo scenario and storm settings

- **`data/scenarios/demo_18s.json`** (label "Demo (~18 s: 8x, 12x, 8x)"): same storm as `moving_band`, ends at **T+03:06**, playback 8x until T+00:24, 12x until T+02:26, 8x to the end. Playback seconds = Σ sim seconds / (60 × speed) ≈ 18.2 s (calculated, not timed).
- **`backend/app/main.py`:** the playback loop honours a scenario's `playback_schedule` and never steps past a phase boundary.
- **All synthetic scenarios:** `width_m` 1800 → 3000. Chosen because it gave the least extreme comparison among 8 variants tried.
- **The demo end time (T+03:06) and the 3 km width were picked by looking at the results.** Do not present the demo numbers as typical.

**Current numbers** (forecast model, city_priority baseline, measured with the simulator):

| Scenario (end) | Snow cleared / crew-hour | Unsafe time, all roads | Unsafe time, critical roads |
|---|---|---|---|
| Demo (T+03:06) | **+34%** | −41% | −55% |
| Moving band (T+06:00) | +8% | −36% | −52% |
| Moving band + camera events (T+06:00) | +12% | −35% | −48% |
| Stationary band (T+06:00) | +32% | −26% | −39% |

The demo's critical-road average depth difference is small at T+03:06 (1.20 → 1.06 in, −12%) because the band swings back over cleared roads around then.

Policy Comparison metrics are **cumulative from T+0** (exposure, distance, passes) or **ratios of cumulatives** (crew-hour, deadhead %). "Snow on critical roads" is the current value. Percentages swing early in a run.

## 3. Dashboard changes

- Adaptive pane and table column renamed **SnowBull**.
- **Results popup** opens over the maps when a run finishes (`resultsOpen`); the side panel stays visible. Maps refit so the popup covers fewer roads.
- **Hero metric:** snow cleared per crew-hour (was critical-road exposure). Key rows: crew-hour → all-road exposure → critical-road exposure ([App.tsx:370](../frontend/src/App.tsx#L370)).
- Map: Snow Plan facility markers (H/P/F/C), neutral white snowfall overlay, dark route halo, `#0e0e0e` map background.
- End-of-run summary map/banner is switched off: `SUMMARY_ENABLED = false` ([App.tsx:108](../frontend/src/App.tsx#L108)).

## Open items

1. **Rerun** `scripts/benchmark.py` (→ `Docs/RESULTS.md`) and `scripts/experiments.py` (→ `Docs/EXPERIMENTS.md`); update the README numbers. Note `benchmark.py` does not include `demo_18s`.
2. **Re-tune or re-justify `horizon_s = 3300`**: it was tuned on the old oracle look-ahead and 1.8 km band.
3. Retrain the forecast on 3 km-wide bands if accuracy figures are quoted (training draws widths 0.8–6 km, so it already covers 3 km).
4. **Tests:** `pytest` is not installed in `.venv`; `backend/tests` was not run for these changes. Verified by import, headless engine runs, `tsc --noEmit`, and `npm run build`.
5. **Environment:** system Python 3.12 has a FastAPI/Starlette mismatch (`Router.__init__() got an unexpected keyword argument 'on_startup'`). Use `.venv` (as `run.ps1` does).
6. **Security:** `Docs/tiger-cloud-db-29101-credentials.txt` is tracked in git despite `.gitignore`. Remove it from the index and rotate the credentials.
7. Branch `feat/snowbull-forecast-demo` is not pushed or merged.

## Commands

```powershell
.\run.ps1                                                       # build dashboard + serve http://127.0.0.1:8000
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --port 8000   # backend only (serves frontend/dist)
cd frontend; npm run build                                      # needed after any frontend change (no dev server running)
.\.venv\Scripts\python.exe scripts\train_snow_forecast.py       # retrain forecast (~30 s)
.\.venv\Scripts\python.exe scripts\benchmark.py                 # Docs/RESULTS.md
```

Scenario JSON files are read at server start: restart the backend after editing `data/scenarios/*.json`.
