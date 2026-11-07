"""Camera observation adapter: Gemini image analysis with labeled recorded/synthetic fallback."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .network import DATA

FRAMES_DIR = DATA / "frames"
RASTER = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

PROMPT = (
    "You are assisting a winter road operations planner. Look at this traffic camera frame and "
    "classify only what is visible. surface_class: dry, wet, snow_covered, or unknown. "
    "visibility_class: good, reduced, or poor (falling snow, fog, lens obstruction) or unknown. "
    "obstruction: yes only if a stopped/stranded vehicle, debris or snow pile clearly blocks a travel lane; "
    "no if lanes are visibly open; unknown otherwise. Do not estimate snow depth in inches. "
    "evidence_summary: one short sentence describing the visual evidence."
)


class CameraObservation(BaseModel):
    surface_class: Literal["dry", "wet", "snow_covered", "unknown"]
    visibility_class: Literal["good", "reduced", "poor", "unknown"]
    obstruction: Literal["yes", "no", "unknown"]
    evidence_summary: str = Field(max_length=400)


def load_frames() -> dict[str, dict]:
    path = FRAMES_DIR / "frames.json"
    if not path.exists():
        return {}
    return {f["frame_id"]: f for f in json.loads(path.read_text(encoding="utf-8"))["frames"]}


class Vision:
    def __init__(self):
        self.key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self.frames = load_frames()
        self.last_error: str | None = None
        self._client = None

    def status(self) -> dict:
        return {
            "available": bool(self.key),
            "mode": "live" if self.key else "fixture",
            "model": self.model if self.key else None,
            "last_error": self.last_error,
        }

    def frame_path(self, frame: dict) -> Path:
        return FRAMES_DIR / frame["image"]

    def public_frames(self) -> list[dict]:
        out = []
        for f in self.frames.values():
            p = self.frame_path(f)
            out.append({
                **{k: v for k, v in f.items() if k != "recorded_result"},
                "image_url": f"/api/frames/{f['frame_id']}/image",
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

    def _gemini(self, path: Path) -> dict:
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = genai.Client(api_key=self.key, http_options=types.HttpOptions(timeout=25_000))
        resp = self._client.models.generate_content(
            model=self.model,
            contents=[types.Part.from_bytes(data=path.read_bytes(), mime_type=RASTER[path.suffix.lower()]), PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=CameraObservation, temperature=0),
        )
        obs = resp.parsed if isinstance(resp.parsed, CameraObservation) else CameraObservation.model_validate_json(resp.text)
        return normalize(obs.model_dump())


def normalize(r: dict) -> dict:
    obs = r.get("obstruction", r.get("obstruction_detected"))
    if obs in ("yes", True):
        od = True
    elif obs in ("no", False):
        od = False
    else:
        od = None
    return {
        "surface_class": r.get("surface_class", "unknown"),
        "visibility_class": r.get("visibility_class", "unknown"),
        "obstruction_detected": od,
        "evidence_summary": r.get("evidence_summary", ""),
    }
