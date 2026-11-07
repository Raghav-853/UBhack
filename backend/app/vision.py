<<<<<<< HEAD
"""Camera observation adapter: Gemini image analysis with labeled recorded/synthetic fallback."""

from __future__ import annotations

=======
"""Camera observation adapter.

Gemini classifies a camera image or short video clip into a validated schema. Every live result is
recorded (data/frames/recorded/<frame_id>.json, keyed to the media hash) so the demo can replay the
exact same model output later, labeled RECORDED. Synthetic fixtures stay labeled SYNTHETIC.
"""

from __future__ import annotations

import hashlib
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .network import DATA

FRAMES_DIR = DATA / "frames"
<<<<<<< HEAD
RASTER = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

PROMPT = (
    "You are assisting a winter road operations planner. Look at this traffic camera frame and "
    "classify only what is visible. surface_class: dry, wet, snow_covered, or unknown. "
    "visibility_class: good, reduced, or poor (falling snow, fog, lens obstruction) or unknown. "
=======
RECORDED_DIR = FRAMES_DIR / "recorded"
UPLOADS = FRAMES_DIR / "uploads.json"
RASTER = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
VIDEO = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}
MEDIA = {**RASTER, **VIDEO}
INLINE_LIMIT = 18_000_000  # larger videos go through the Gemini Files API

PROMPT = (
    "You are assisting a winter road operations planner. Look at this traffic camera image or short video "
    "clip (consider the whole clip) and classify only what is visible. surface_class: dry, wet, snow_covered, "
    "or unknown. visibility_class: good, reduced, or poor (falling snow, fog, lens obstruction) or unknown. "
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
    "obstruction: yes only if a stopped/stranded vehicle, debris or snow pile clearly blocks a travel lane; "
    "no if lanes are visibly open; unknown otherwise. Do not estimate snow depth in inches. "
    "evidence_summary: one short sentence describing the visual evidence."
)


class CameraObservation(BaseModel):
    surface_class: Literal["dry", "wet", "snow_covered", "unknown"]
    visibility_class: Literal["good", "reduced", "poor", "unknown"]
    obstruction: Literal["yes", "no", "unknown"]
    evidence_summary: str = Field(max_length=400)


<<<<<<< HEAD
UPLOADS = FRAMES_DIR / "uploads.json"


=======
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
def load_frames() -> dict[str, dict]:
    out = {}
    for path in (FRAMES_DIR / "frames.json", UPLOADS):
        if path.exists():
            out.update({f["frame_id"]: f for f in json.loads(path.read_text(encoding="utf-8"))["frames"]})
    return out


def save_upload(frame: dict):
    data = json.loads(UPLOADS.read_text(encoding="utf-8")) if UPLOADS.exists() else {"frames": []}
    data["frames"] = [f for f in data["frames"] if f["frame_id"] != frame["frame_id"]] + [frame]
    UPLOADS.write_text(json.dumps(data, indent=2), encoding="utf-8")


<<<<<<< HEAD
class Vision:
    def __init__(self):
        self.key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
=======
def media_rel(frame: dict) -> str:
    return frame.get("media") or frame["image"]


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


class Vision:
    def __init__(self):
        self.key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
        self.frames = load_frames()
        self.last_error: str | None = None
        self._client = None

    def status(self) -> dict:
<<<<<<< HEAD
        return {
            "available": bool(self.key),
            "mode": "live" if self.key else "fixture",
            "model": self.model if self.key else None,
            "last_error": self.last_error,
        }

    def frame_path(self, frame: dict) -> Path:
        return FRAMES_DIR / frame["image"]
=======
        return {"available": bool(self.key), "mode": "live" if self.key else "fixture",
                "model": self.model if self.key else None, "last_error": self.last_error}

    def frame_path(self, frame: dict) -> Path:
        return FRAMES_DIR / media_rel(frame)

    def recording(self, frame_id: str) -> dict | None:
        p = RECORDED_DIR / f"{frame_id}.json"
        if not p.exists():
            return None
        rec = json.loads(p.read_text(encoding="utf-8"))
        media = self.frame_path(self.frames[frame_id]) if frame_id in self.frames else None
        if media is not None and media.exists() and rec.get("media_sha1") != sha1(media):
            return None  # media changed since recording; do not replay a mismatched result
        return rec
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613

    def public_frames(self) -> list[dict]:
        out = []
        for f in self.frames.values():
            p = self.frame_path(f)
<<<<<<< HEAD
            out.append({
                **{k: v for k, v in f.items() if k != "recorded_result"},
                "image_url": f"/api/frames/{f['frame_id']}/image?v={f.get('version', 0)}",
                "is_raster": p.suffix.lower() in RASTER,
                "has_recorded_result": "recorded_result" in f,
                "live_capable": bool(self.key) and p.suffix.lower() in RASTER and p.exists(),
            })
        return out

    def analyze(self, frame_id: str) -> dict:
        """Blocking call; run outside the simulation lock. Never invents a successful result."""
        frame = self.frames[frame_id]
        path = self.frame_path(frame)
        received_at = datetime.now(timezone.utc).isoformat()
        base = {"frame_id": frame_id, "camera_id": frame.get("camera_id"), "segment_ids": frame["segment_ids"],
                "observed_at": frame.get("observed_at"), "received_at": received_at}

        if self.key and path.suffix.lower() in RASTER and path.exists():
            try:
                result = self._gemini(path)
                self.last_error = None
                return {**base, "status": "done", "source_kind": "live_inference", "model_id": self.model,
                        "result": result}
            except Exception as e:  # provider failure -> explicit failure, not a fabricated result
                self.last_error = type(e).__name__
                if "recorded_result" not in frame:
                    return {**base, "status": "failed", "source_kind": "live_inference", "model_id": self.model,
                            "error": f"Gemini request failed ({type(e).__name__})", "result": None}

        rec = frame.get("recorded_result")
        if rec is None:
            return {**base, "status": "failed", "source_kind": "none", "result": None,
                    "error": "No Gemini key/raster image and no recorded result for this frame"}
        time.sleep(0.6)  # keep UI flow honest about asynchronous processing
        return {**base, "status": "done", "source_kind": rec.get("source_kind", "synthetic_fixture"),
                "model_id": rec.get("model_id"), "result": normalize(rec["result"])}
=======
            ext = p.suffix.lower()
            rec = self.recording(f["frame_id"])
            out.append({
                **{k: v for k, v in f.items() if k != "recorded_result"},
                "media_url": f"/api/frames/{f['frame_id']}/image?v={f.get('version', 0)}",
                "image_url": f"/api/frames/{f['frame_id']}/image?v={f.get('version', 0)}",
                "media_type": "video" if ext in VIDEO else "image",
                "has_fixture_result": "recorded_result" in f,
                "recorded_at": rec.get("recorded_at") if rec else None,
                "recorded_model": rec.get("model_id") if rec else None,
                "live_capable": bool(self.key) and ext in MEDIA and p.exists(),
            })
        return out

    # ------------------------------------------------------------- analysis
    def analyze(self, frame_id: str, mode: str = "auto") -> dict:
        """Blocking; run outside the simulation lock. mode: auto | live | replay. Never invents a result."""
        frame = self.frames[frame_id]
        path = self.frame_path(frame)
        base = {"frame_id": frame_id, "camera_id": frame.get("camera_id"), "segment_ids": frame["segment_ids"],
                "observed_at": frame.get("observed_at"), "received_at": datetime.now(timezone.utc).isoformat()}
        live_error = None

        if mode in ("auto", "live") and self.key and path.suffix.lower() in MEDIA and path.exists():
            try:
                result = self._gemini(path)
                self.last_error = None
                self._record(frame_id, path, result)
                return {**base, "status": "done", "source_kind": "live_inference", "model_id": self.model,
                        "result": result}
            except Exception as e:
                live_error = f"Gemini request failed ({type(e).__name__})"
                self.last_error = type(e).__name__
                if mode == "live":
                    return {**base, "status": "failed", "source_kind": "live_inference", "model_id": self.model,
                            "error": live_error, "result": None}

        rec = self.recording(frame_id)
        if rec is not None:
            time.sleep(0.4)
            return {**base, "status": "done", "source_kind": "recorded_inference", "model_id": rec["model_id"],
                    "recorded_at": rec["recorded_at"], "result": rec["result"],
                    "note": live_error and f"{live_error}; replayed recorded result"}
        if mode == "replay":
            return {**base, "status": "failed", "source_kind": "none", "result": None,
                    "error": "No recorded Gemini result for this media yet"}

        fixture = frame.get("recorded_result")
        if fixture is not None:
            time.sleep(0.4)
            return {**base, "status": "done", "source_kind": fixture.get("source_kind", "synthetic_fixture"),
                    "model_id": fixture.get("model_id"), "result": normalize(fixture["result"]), "note": live_error}
        return {**base, "status": "failed", "source_kind": "none", "result": None,
                "error": live_error or "No Gemini key/usable media and no recorded result for this frame"}

    def _record(self, frame_id: str, path: Path, result: dict):
        RECORDED_DIR.mkdir(parents=True, exist_ok=True)
        rec = {"frame_id": frame_id, "media": path.name, "media_sha1": sha1(path), "model_id": self.model,
               "recorded_at": datetime.now(timezone.utc).isoformat(), "source_kind": "recorded_inference",
               "result": result}
        (RECORDED_DIR / f"{frame_id}.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613

    def _gemini(self, path: Path) -> dict:
        from google import genai
        from google.genai import types

        if self._client is None:
<<<<<<< HEAD
            self._client = genai.Client(api_key=self.key, http_options=types.HttpOptions(timeout=25_000))
        resp = self._client.models.generate_content(
            model=self.model,
            contents=[types.Part.from_bytes(data=path.read_bytes(), mime_type=RASTER[path.suffix.lower()]), PROMPT],
=======
            self._client = genai.Client(api_key=self.key, http_options=types.HttpOptions(timeout=120_000))
        mime = MEDIA[path.suffix.lower()]
        if path.stat().st_size <= INLINE_LIMIT:
            media = types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)
        else:
            media = self._client.files.upload(file=str(path), config={"mime_type": mime})
            deadline = time.time() + 90
            while getattr(media.state, "name", str(media.state)) == "PROCESSING" and time.time() < deadline:
                time.sleep(2)
                media = self._client.files.get(name=media.name)
        resp = self._client.models.generate_content(
            model=self.model,
            contents=[media, PROMPT],
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=CameraObservation, temperature=0),
        )
        obs = resp.parsed if isinstance(resp.parsed, CameraObservation) else CameraObservation.model_validate_json(resp.text)
        return normalize(obs.model_dump())


def normalize(r: dict) -> dict:
    obs = r.get("obstruction", r.get("obstruction_detected"))
<<<<<<< HEAD
    if obs in ("yes", True):
        od = True
    elif obs in ("no", False):
        od = False
    else:
        od = None
=======
    od = True if obs in ("yes", True) else False if obs in ("no", False) else None
>>>>>>> 51dc4ae764c073942da161873c9bd977bc89f613
    return {
        "surface_class": r.get("surface_class", "unknown"),
        "visibility_class": r.get("visibility_class", "unknown"),
        "obstruction_detected": od,
        "evidence_summary": r.get("evidence_summary", ""),
    }
