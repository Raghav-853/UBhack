"""Learned short-range snowfall forecast for synthetic band scenarios.

The adaptive policy needs "how much snow will land on this segment within the
planning horizon". Instead of reading the band's future position, this model
predicts the mean rate over the horizon from what is observable *now*:
recent rates at the segment (radar history) and current rates at nearby points
across and upwind of the band axis. One ridge regression per trained horizon;
other horizons are linearly interpolated. Training: scripts/train_snow_forecast.py.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

from .network import DATA

if TYPE_CHECKING:
    from .simulation import Band

MODEL_PATH = DATA / "models" / "snow_forecast_v1.json"

LAGS_S = (300, 600, 900)          # radar history at the segment
ACROSS_M = (-2000, -1000, 1000, 2000)
UPWIND_M = 3000
ACROSS_LAG_S = 600                 # neighbour history: tells which way the band is sliding

FEATURES = (
    ["bias", "r_now"]
    + [f"r_lag{lag // 60}m" for lag in LAGS_S]
    + [f"r_across{d:+d}" for d in ACROSS_M]
    + ["r_upwind3k", "r_across-1000_lag10m", "r_across+1000_lag10m"]
)


def features(band: "Band", p: tuple[float, float], t: float, background: float,
             history: dict[int, float] | None = None) -> list[float]:
    """Observable inputs at point p and time t. `history` may supply r(p, t - lag) to avoid recomputation."""
    ax, ay = band.axis
    nx, ny = band.normal
    rate = band.rate

    def at(dx: float, dy: float, when: float) -> float:
        return rate((p[0] + dx, p[1] + dy), when, background)

    def past(lag: int) -> float:
        return history[lag] if history is not None else at(0, 0, t - lag)

    return (
        [1.0, past(0)]
        + [past(lag) for lag in LAGS_S]
        + [at(nx * d, ny * d, t) for d in ACROSS_M]
        + [at(-ax * UPWIND_M, -ay * UPWIND_M, t),
           at(-nx * 1000, -ny * 1000, t - ACROSS_LAG_S),
           at(nx * 1000, ny * 1000, t - ACROSS_LAG_S)]
    )


@lru_cache(maxsize=1)
def load(path: Path = MODEL_PATH) -> dict:
    model = json.loads(path.read_text(encoding="utf-8"))
    if model["features"] != FEATURES:
        raise RuntimeError(f"{path.name} was trained with different features; rerun scripts/train_snow_forecast.py")
    model["models"].sort(key=lambda m: m["horizon_s"])
    return model


def _rate_for(model: dict, x: list[float], horizon: float) -> float:
    ms = model["models"]

    def pred(m: dict) -> float:
        return sum(c * v for c, v in zip(m["coef"], x))

    if horizon <= ms[0]["horizon_s"]:
        return pred(ms[0])
    for lo, hi in zip(ms, ms[1:]):
        if horizon <= hi["horizon_s"]:
            w = (horizon - lo["horizon_s"]) / (hi["horizon_s"] - lo["horizon_s"])
            return (1 - w) * pred(lo) + w * pred(hi)
    return pred(ms[-1])


def predict_amount_in(band: "Band", p: tuple[float, float], t: float, horizon: float, background: float) -> float:
    """Predicted snowfall (inches) at p over [t, t + horizon)."""
    if horizon <= 0:
        return 0.0
    rate = max(0.0, _rate_for(load(), features(band, p, t, background), horizon))
    return rate * horizon / 3600
