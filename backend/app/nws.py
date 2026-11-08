"""Load a frozen NWS snowfall forecast for the Buffalo demonstration corridor."""

from __future__ import annotations

import hashlib
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.client import HTTPException
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .network import Network

NWS_SCENARIO_ID = "nws_forecast"
_ORIGIN = "https://api.weather.gov"
# NWS /points discovery plus live cell polygons cover every corridor midpoint.
_GRID_IDS = ("BUF/36,48", "BUF/36,49", "BUF/37,48", "BUF/37,49", "BUF/37,50")
_HEADERS = {"User-Agent": "SnowTwin-WNY/0.1 (UB Hacking demo)", "Accept": "application/geo+json"}
_MAX_BYTES = 2_000_000
_TIMEOUT_S = 5
_NDFD_SNOW_PERIOD_S = 6 * 3600
_ISO_DURATION = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")


class ForecastUnavailable(RuntimeError):
    """A public error containing no upstream response or connection details."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class _SnowWindow:
    start_s: float
    end_s: float
    amount_mm: float

    @property
    def rate_in_s(self) -> float:
        return self.amount_mm / 25.4 / (self.end_s - self.start_s)


@dataclass(frozen=True)
class _GridCell:
    issued_at: datetime
    ring: tuple[tuple[float, float], ...]
    windows: tuple[_SnowWindow, ...]

    def geometry(self) -> dict:
        return {"type": "Polygon", "coordinates": [[list(point) for point in self.ring]]}


@dataclass(frozen=True)
class NWSForecast:
    start_at: datetime
    _coverage_s: float
    _cells: dict[str, _GridCell]
    _segment_grids: dict[str, str]
    version: str = field(init=False)

    def __post_init__(self):
        payload = json.dumps(self.provenance(), sort_keys=True, separators=(",", ":"))
        object.__setattr__(self, "version", hashlib.sha256(payload.encode()).hexdigest()[:12])

    @property
    def issued_at(self) -> datetime:
        """Oldest NWS grid update included in the snapshot."""
        return min(cell.issued_at for cell in self._cells.values())

    def _time_at(self, t_s: float) -> str:
        return (self.start_at + timedelta(seconds=t_s)).isoformat()

    def amount_in(self, sid: str, t_s: float, dt_s: float) -> float:
        """Integrate the published window-average rate over [t_s, t_s + dt_s)."""
        end_s = t_s + dt_s
        if not 0 <= t_s <= end_s <= self._coverage_s:
            raise ValueError("Requested snowfall falls outside the frozen forecast window")
        cell = self._cells[self._segment_grids[sid]]
        return sum(
            max(0.0, min(end_s, window.end_s) - max(t_s, window.start_s)) * window.rate_in_s
            for window in cell.windows
        )

    def public(self, t_s: float) -> dict:
        if not 0 <= t_s <= self._coverage_s:
            raise ValueError("Cursor falls outside the frozen forecast window")
        # At the terminal boundary, show the last modeled instant's rate.
        cursor_s = min(t_s, math.nextafter(self._coverage_s, 0.0))
        features = []
        for grid_id, cell in self._cells.items():
            window = next(w for w in cell.windows if w.start_s <= cursor_s < w.end_s)
            features.append({
                "type": "Feature",
                "geometry": cell.geometry(),
                "properties": {"rate_in_hr": window.rate_in_s * 3600, "grid_id": grid_id},
            })
        return {
            "source": "nws",
            "issued_at": self.issued_at.isoformat(),
            "valid_at": self._time_at(t_s),
            "areas": {"type": "FeatureCollection", "features": features},
            "max_rate_in_hr": max(f["properties"]["rate_in_hr"] for f in features),
        }

    def provenance(self) -> dict:
        """Serializable inputs for reproducing the frozen weather snapshot."""
        return {
            "source": "nws",
            "issued_at": self.issued_at.isoformat(),
            "start_at": self.start_at.isoformat(),
            "coverage_end_at": self._time_at(self._coverage_s),
            "rate_assumption": "Uniform snowfall within each published accumulation window",
            "segment_grid_ids": dict(self._segment_grids),
            "grids": {
                grid_id: {
                    "issued_at": cell.issued_at.isoformat(),
                    "geometry": cell.geometry(),
                    "snowfall": [
                        {"start_at": self._time_at(w.start_s), "end_at": self._time_at(w.end_s),
                         "amount_mm": w.amount_mm}
                        for w in cell.windows
                    ],
                }
                for grid_id, cell in self._cells.items()
            },
        }


def fetch_forecast(net: Network, duration_s: float, lookahead_s: float) -> NWSForecast:
    """Fetch each corridor cell once, then validate geometry and full time coverage."""
    coverage_s = duration_s + lookahead_s
    if duration_s <= 0 or lookahead_s < 0 or not math.isfinite(coverage_s):
        raise ValueError("Forecast duration and lookahead must be finite and nonnegative")

    with ThreadPoolExecutor(max_workers=len(_GRID_IDS)) as workers:
        documents = list(workers.map(_get_grid, _GRID_IDS))

    start_at = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    try:
        rings = {grid_id: _ring(doc["geometry"]) for grid_id, doc in zip(_GRID_IDS, documents)}
        segment_grids = {}
        for sid, segment in net.segments.items():
            point = net.to_ll(segment.mid)
            grid_id = next((gid for gid, ring in rings.items() if _contains(ring, point)), None)
            if grid_id is None:
                raise ForecastUnavailable("NWS forecast grid coverage does not include every corridor segment.")
            segment_grids[sid] = grid_id
        if not segment_grids:
            raise ForecastUnavailable("No corridor segments are available for NWS forecast mapping.")

        used_grids = set(segment_grids.values())
        cells = {}
        for grid_id, doc in zip(_GRID_IDS, documents):
            if grid_id not in used_grids:
                continue
            props = doc["properties"]
            layer = props["snowfallAmount"]
            if (layer.get("uom") or layer.get("unitCode")) != "wmoUnit:mm":
                raise ForecastUnavailable("NWS snowfall forecast units are unavailable or unsupported.")
            windows = _snow_windows(layer["values"], start_at, coverage_s)
            cells[grid_id] = _GridCell(_utc(props["updateTime"]), rings[grid_id], windows)
        return NWSForecast(start_at, coverage_s, cells, segment_grids)
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
        raise ForecastUnavailable("NWS forecast did not contain valid snowfall and grid data.") from None


def _get_grid(grid_id: str) -> dict:
    if grid_id not in _GRID_IDS:
        raise ForecastUnavailable("Unsupported NWS forecast grid.")
    request = Request(f"{_ORIGIN}/gridpoints/{grid_id}", headers=_HEADERS)
    try:
        with build_opener(_NoRedirect).open(request, timeout=_TIMEOUT_S) as response:
            content = response.read(_MAX_BYTES + 1)
        if len(content) > _MAX_BYTES:
            raise ForecastUnavailable("NWS forecast response exceeded the supported size.")
        return json.loads(content)
    except (OSError, HTTPException, ValueError):
        raise ForecastUnavailable("Could not retrieve the NWS forecast. Try again shortly.") from None


def _utc(value: str) -> datetime:
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Missing NWS timezone")
    return stamp.astimezone(timezone.utc)


def _snow_windows(values: list[dict], start_at: datetime, coverage_s: float) -> tuple[_SnowWindow, ...]:
    windows = []
    for item in values:
        start, duration = item["validTime"].split("/", 1)
        match = _ISO_DURATION.fullmatch(duration)
        if match is None:
            raise ValueError("Unsupported NWS duration")
        days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
        duration_s = days * 86400 + hours * 3600 + minutes * 60 + seconds
        if duration_s <= 0:
            raise ValueError("NWS snowfall interval has no duration")
        start_s = (_utc(start) - start_at).total_seconds()
        end_s = start_s + duration_s
        if end_s <= 0 or start_s >= coverage_s:
            continue

        amount = item.get("value")
        if type(amount) not in (float, int) or not math.isfinite(amount) or amount < 0:
            raise ForecastUnavailable("NWS snowfall amount is missing for part of the simulation window.")
        # NDFD snowfall is a 6-hour accumulation. The JSON API can merge equal
        # adjacent values or truncate the first window. Zero is unambiguous in
        # either case. For positive values, avoid silently mis-scaling totals.
        if amount > 0 and duration_s != _NDFD_SNOW_PERIOD_S:
            raise ForecastUnavailable("NWS returned a positive snowfall amount with an ambiguous interval length.")
        windows.append(_SnowWindow(start_s, end_s, float(amount)))

    windows.sort(key=lambda w: w.start_s)
    covered = 0.0
    for window in windows:
        if max(0.0, window.start_s) != covered:
            raise ForecastUnavailable("NWS snowfall intervals have a gap or overlap in the simulation window.")
        covered = window.end_s
    if covered < coverage_s:
        raise ForecastUnavailable("NWS snowfall forecast does not cover the full simulation window.")
    return tuple(windows)


def _ring(geometry: dict) -> tuple[tuple[float, float], ...]:
    if geometry["type"] != "Polygon" or len(geometry["coordinates"]) != 1:
        raise ValueError("Unsupported NWS grid polygon")
    ring = tuple((float(lon), float(lat)) for lon, lat in geometry["coordinates"][0])
    if len(ring) < 4 or ring[0] != ring[-1] or any(
        not (-180 <= lon <= 180 and -90 <= lat <= 90) for lon, lat in ring
    ):
        raise ValueError("Invalid NWS grid polygon")
    return ring


def _contains(ring: tuple[tuple[float, float], ...], point: list[float]) -> bool:
    """Point-in-polygon with deterministic inclusion of shared cell edges."""
    x, y = point
    inside = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)
        if abs(cross) < 1e-12 and min(x0, x1) <= x <= max(x0, x1) and min(y0, y1) <= y <= max(y0, y1):
            return True
        if (y0 > y) != (y1 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0):
            inside = not inside
    return inside
