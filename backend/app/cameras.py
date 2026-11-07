"""511NY live camera refresh (official Developer API key required).

- Auto-refresh every NY511_REFRESH_S (default 600 s) plus a manual refresh endpoint.
- Only cameras explicitly mapped in data/frames/live_cameras.json are downloaded
  (camera-to-segment mapping is explicit, never "nearest camera").
- 511NY rate limit is 10 calls / 60 s: one list call (cached) + a few image downloads per refresh.
- Downloaded images stay local (data/frames/live/, git-ignored). Attribution: "powered by 511NY".
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .network import DATA

LIVE_DIR = DATA / "frames" / "live"
CONFIG = DATA / "frames" / "live_cameras.json"
# Documented endpoint forms differ between 511NY doc versions; both are tried.
LIST_URLS = [
    "https://511ny.org/api/getcameras?key={key}&format=json",
    "https://511ny.org/api/v2/get/cameras?key={key}&format=json",
]
UA = "SnowTwin-WNY/0.1 (hackathon prototype)"


class LiveCameras:
    def __init__(self, vision, net):
        self.vision, self.net = vision, net
        self.key = os.environ.get("NY511_API_KEY")
        self.interval = float(os.environ.get("NY511_REFRESH_S", "600"))
        self.lock = threading.Lock()
        self.catalog: list[dict] = []
        self.catalog_at = 0.0
        self.state = {"configured": bool(self.key), "last_refresh": None, "next_refresh": None,
                      "last_error": None, "frames": 0, "list_url": None}
        if self.key:
            threading.Thread(target=self._loop, daemon=True, name="ny511").start()

    def status(self) -> dict:
        return {**self.state, "interval_s": self.interval}

    def _loop(self):
        while True:
            try:
                self.refresh()
            except Exception:
                pass
            self.state["next_refresh"] = time.time() + self.interval
            time.sleep(self.interval)

    # ------------------------------------------------------------ fetching
    def _get(self, url: str, timeout: float = 15):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        return urllib.request.urlopen(req, timeout=timeout)

    def _load_catalog(self) -> list[dict]:
        if self.catalog and time.time() - self.catalog_at < 3600:
            return self.catalog
        last = None
        for tmpl in LIST_URLS:
            try:
                with self._get(tmpl.format(key=urllib.parse.quote(self.key))) as r:
                    data = json.loads(r.read().decode("utf-8"))
                cams = [_normalize(c) for c in (data if isinstance(data, list) else data.get("cameras", data.get("Cameras", [])))]
                cams = [c for c in cams if c["id"]]
                if cams:
                    self.catalog, self.catalog_at = cams, time.time()
                    self.state["list_url"] = tmpl.split("?")[0]
                    return cams
            except Exception as e:
                last = type(e).__name__
        raise RuntimeError(f"511NY camera list unavailable ({last or 'empty response'})")

    def refresh(self) -> dict:
        if not self.key:
            raise RuntimeError("NY511_API_KEY not configured")
        with self.lock:
            try:
                catalog = {c["id"]: c for c in self._load_catalog()}
                mapped = json.loads(CONFIG.read_text(encoding="utf-8"))["cameras"] if CONFIG.exists() else []
                LIVE_DIR.mkdir(parents=True, exist_ok=True)
                updated = []
                for m in mapped:
                    cam = catalog.get(str(m["camera_id"]))
                    if not cam or not cam["image_url"] or cam["disabled"]:
                        continue
                    with self._get(cam["image_url"]) as r:
                        img = r.read()
                        lm = r.headers.get("Last-Modified")
                    ext = ".png" if img[:4] == b"\x89PNG" else ".jpg"
                    fname = f"{m['frame_id']}{ext}"
                    (LIVE_DIR / fname).write_bytes(img)
                    observed = parsedate_to_datetime(lm).astimezone(timezone.utc).isoformat() if lm else None
                    self.vision.frames[m["frame_id"]] = {
                        "frame_id": m["frame_id"], "camera_id": cam["id"], "title": m.get("title") or cam["name"],
                        "image": f"live/{fname}", "source": "511NY live (NYSDOT) - powered by 511NY",
                        "license_note": "511NY Developer API; display with attribution",
                        "observed_at": observed,  # from HTTP Last-Modified when provided; never fabricated
                        "received_at": datetime.now(timezone.utc).isoformat(),
                        "segment_ids": m["segment_ids"], "version": int(time.time()),
                    }
                    updated.append(m["frame_id"])
                    time.sleep(1.0)  # stay well under the 10 calls / 60 s limit
                self.state.update(last_refresh=time.time(), last_error=None, frames=len(updated))
                return {"updated": updated}
            except Exception as e:
                self.state["last_error"] = str(e)[:200]
                raise

    def nearby(self, radius_m: float = 250) -> list[dict]:
        """Catalog cameras near corridor segments, to help fill live_cameras.json."""
        out = []
        for c in self._load_catalog():
            if c["lat"] is None or c["lon"] is None:
                continue
            p = self.net.to_xy(c["lon"], c["lat"])
            seg = min(self.net.segments.values(), key=lambda s: math.dist(s.mid, p))
            d = math.dist(seg.mid, p)
            if d <= radius_m:
                out.append({**c, "nearest_segment": seg.id, "nearest_segment_name": seg.name, "distance_m": round(d)})
        return sorted(out, key=lambda c: c["distance_m"])


def _normalize(c: dict) -> dict:
    g = lambda *ks: next((c[k] for k in ks if k in c and c[k] not in (None, "")), None)
    views = c.get("Views") or c.get("views") or []
    url = g("Url", "url", "ImageUrl", "imageUrl") or (views[0].get("Url") or views[0].get("url") if views else None)
    return {
        "id": str(g("ID", "Id", "id") or ""),
        "name": g("Name", "name", "Location", "location", "RoadwayName") or "",
        "lat": _f(g("Latitude", "latitude", "Lat")),
        "lon": _f(g("Longitude", "longitude", "Lon", "Lng")),
        "image_url": url,
        "disabled": bool(g("Disabled", "disabled") or g("Blocked", "blocked")),
    }


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
