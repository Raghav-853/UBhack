"""Train the short-range snowfall forecast used by the adaptive policy.

Usage (repo root):  .venv\\Scripts\\python.exe scripts\\train_snow_forecast.py

Generates random synthetic bands (same Band model the simulator uses), builds
observable features (backend/app/forecast_model.py) and fits one ridge
regression per horizon on the mean snowfall rate over [t, t + horizon).
Split is by storm, so test storms are never seen in training. Pure Python,
no extra dependencies. Writes data/models/snow_forecast_v1.json.
"""

from __future__ import annotations

import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.forecast_model import FEATURES, LAGS_S, MODEL_PATH, features  # noqa: E402
from app.network import Network  # noqa: E402
from app.simulation import Band, load_scenarios  # noqa: E402

SEED = 7
N_STORMS = 80
TEST_FRAC = 0.2
SEGS_PER_STORM = 80
STEP_S = 300
DURATION_S = 21600
HORIZONS_S = (900, 1800, 3300, 5400, 7200)
RIDGE_LAMBDA = 1.0


def random_band(rng: random.Random) -> tuple[dict, float]:
    cfg = {
        "rate_in_hr": rng.uniform(1.0, 6.0),
        "heading_deg": rng.uniform(0, 360),
        "width_m": rng.uniform(800, 6000),
        "length_m": rng.uniform(15000, 40000),
        "offset_m": rng.uniform(-5000, 5000),
        "drift_mps": rng.uniform(-1.5, 1.5) if rng.random() < 0.5 else 0.0,
        "wobble_amp_m": rng.uniform(0, 4000) if rng.random() < 0.8 else 0.0,
        "wobble_period_s": rng.uniform(3600, 14400),
    }
    background = rng.uniform(0, 0.25) if rng.random() < 0.4 else 0.0
    return cfg, background


def storm_rows(band: Band, background: float, segs: list, horizons=HORIZONS_S):
    """Yield (x, {horizon: target mean rate}) for every segment x time on the grid."""
    max_lag, max_h = max(LAGS_S), max(horizons)
    for seg in segs:
        p = seg.mid
        grid = range(-max_lag, DURATION_S + max_h + 1, STEP_S)
        series = {t: band.rate(p, t, background) for t in grid}
        for t in range(0, DURATION_S, STEP_S):
            x = features(band, p, t, background, {lag: series[t - lag] for lag in (0, *LAGS_S)})
            ys = {}
            for h in horizons:
                pts = [series[t + k] for k in range(0, h + 1, STEP_S)]
                ys[h] = (sum(pts) - 0.5 * (pts[0] + pts[-1])) / (len(pts) - 1)  # trapezoid mean
            yield x, ys


def solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[piv] = m[piv], m[c]
        for r in range(c + 1, n):
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    out = [0.0] * n
    for r in range(n - 1, -1, -1):
        out[r] = (m[r][n] - sum(m[r][k] * out[k] for k in range(r + 1, n))) / m[r][r]
    return out


def evaluate(coefs: dict, rows: list) -> dict:
    out = {}
    for h, coef in coefs.items():
        ys = [y[h] for _, y in rows]
        mean = sum(ys) / len(ys)
        pred = [max(0.0, sum(c * v for c, v in zip(coef, x))) for x, _ in rows]
        persist = [x[1] for x, _ in rows]
        sst = sum((y - mean) ** 2 for y in ys) or 1.0
        out[h] = {
            "mae_in_hr": sum(abs(p - y) for p, y in zip(pred, ys)) / len(ys),
            "persistence_mae_in_hr": sum(abs(p - y) for p, y in zip(persist, ys)) / len(ys),
            "r2": 1 - sum((p - y) ** 2 for p, y in zip(pred, ys)) / sst,
            "persistence_r2": 1 - sum((p - y) ** 2 for p, y in zip(persist, ys)) / sst,
            "n": len(ys),
        }
    return out


def main():
    t0 = time.time()
    rng = random.Random(SEED)
    net = Network()
    segs = list(net.segments.values())
    k = len(FEATURES)
    xtx = {h: [[0.0] * k for _ in range(k)] for h in HORIZONS_S}
    xty = {h: [0.0] * k for h in HORIZONS_S}
    test_rows, n_train = [], 0
    n_test_storms = int(N_STORMS * TEST_FRAC)

    for s in range(N_STORMS):
        cfg, bg = random_band(rng)
        band = Band(cfg, net.center)
        is_test = s < n_test_storms
        for x, ys in storm_rows(band, bg, rng.sample(segs, min(SEGS_PER_STORM, len(segs)))):
            if is_test:
                test_rows.append((x, ys))
                continue
            n_train += 1
            for i in range(k):
                xi = x[i]
                if xi == 0.0:
                    continue
                row = xtx[HORIZONS_S[0]][i]
                for j in range(k):
                    row[j] += xi * x[j]
                for h in HORIZONS_S:
                    xty[h][i] += xi * ys[h]
        print(f"storm {s + 1}/{N_STORMS} ({'test' if is_test else 'train'})  {time.time() - t0:.0f}s", end="\r")
    print()

    base = xtx[HORIZONS_S[0]]  # X'X is the same for every horizon
    coefs = {}
    for h in HORIZONS_S:
        a = [[base[i][j] + (RIDGE_LAMBDA if i == j and i > 0 else 0.0) for j in range(k)] for i in range(k)]
        coefs[h] = solve(a, xty[h])

    metrics = evaluate(coefs, test_rows)

    # Sanity check on the shipped demo storms (never used for training).
    demo = {}
    for sid, sc in load_scenarios().items():
        if sc.get("band"):
            band = Band(sc["band"], net.center)
            demo[sid] = evaluate({3300: coefs[3300]}, list(storm_rows(band, sc.get("background_rate_in_hr", 0.0),
                                                                       segs, (3300,))))[3300]

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps({
        "name": "snow_forecast_v1",
        "kind": "ridge_regression_per_horizon",
        "target": "mean snowfall rate (in/hr) over [t, t + horizon)",
        "features": FEATURES,
        "training": {"seed": SEED, "storms": N_STORMS, "test_storms": n_test_storms, "train_rows": n_train,
                     "segments_per_storm": SEGS_PER_STORM, "step_s": STEP_S, "ridge_lambda": RIDGE_LAMBDA,
                     "band_model": Band.MODEL},
        "models": [{"horizon_s": h, "coef": [round(c, 6) for c in coefs[h]],
                    "test": {m: round(v, 4) for m, v in metrics[h].items()}} for h in HORIZONS_S],
        "demo_scenarios_h3300": {sid: {m: round(v, 4) for m, v in r.items()} for sid, r in demo.items()},
    }, indent=1), encoding="utf-8")

    print(f"train rows {n_train}, test rows {len(test_rows)}, {time.time() - t0:.0f}s")
    print(f"{'horizon':>8} {'MAE':>7} {'persist':>8} {'R2':>6} {'persistR2':>9}")
    for h in HORIZONS_S:
        m = metrics[h]
        print(f"{h // 60:>6}m {m['mae_in_hr']:>7.3f} {m['persistence_mae_in_hr']:>8.3f} "
              f"{m['r2']:>6.2f} {m['persistence_r2']:>9.2f}")
    print("demo scenarios @55m:")
    for sid, m in demo.items():
        print(f"  {sid:<26} MAE {m['mae_in_hr']:.3f} (persist {m['persistence_mae_in_hr']:.3f})  "
              f"R2 {m['r2']:.2f} (persist {m['persistence_r2']:.2f})")
    print(f"wrote {MODEL_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
