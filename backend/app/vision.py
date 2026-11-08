"""Camera observation adapter.

Gemini classifies a camera image or short video clip into a validated schema. Every live result is
recorded (data/frames/recorded/<frame_id>.json, keyed to the media hash) so the demo can replay the
exact same model output later, labeled RECORDED. Synthetic fixtures stay labeled SYNTHETIC.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .network import DATA

FRAMES_DIR = DATA / "frames"
RECORDED_DIR = FRAMES_DIR / "recorded"
UPLOADS = FRAMES_DIR / "uploads.json"
RASTER = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
VIDEO = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}
MEDIA = {**RASTER, **VIDEO}
INLINE_LIMIT = 18_000_000  # larger videos go through the Gemini Files API
SAMPLE_INTERVAL_S = 5
ANALYSIS_SCHEMA_VERSION = 3

PROMPT = (
    "You are assisting a winter road operations planner. Look at this traffic camera image or short video "
    "clip and classify only what is visible. surface_class: dry, wet, snow_covered, "
    "or unknown. visibility_class: good, reduced, or poor (falling snow, fog, lens obstruction) or unknown. "
    "obstruction: yes only if a stopped/stranded vehicle, debris or snow pile clearly blocks a travel lane; "
    "no if lanes are visibly open; unknown otherwise. "
    "For this demonstration, ALWAYS return your best-effort numeric estimate of snow_depth_cm on "
    "the street, not roadside piles or roofs. Return one finite nonnegative number, never null. "
    "Use the visual cues, general snow knowledge and any supplied scene context to make a rough "
    "estimate even when the scale or view is uncertain. This is an experimental AI estimate, "
    "NOT a measurement. Use zero for an apparently snow-free street, not as a missing-data code. "
    "ALWAYS include numeric depth_confidence_pct (0-100): your self-reported confidence, NOT a "
    "calibrated probability. Lower it substantially, including to zero, when the road is obscured "
    "or the estimate depends mostly on assumptions. Do not equate regional snowfall totals with "
    "remaining street depth. evidence_summary: explain the visual cues, supplied context, assumptions "
    "and limitations behind the number, including when the road cannot be seen directly. "
    "Also describe camera-angle changes, visibility and obstruction. Do not invent observed measurements."
)


class CameraObservation(BaseModel):
    surface_class: Literal["dry", "wet", "snow_covered", "unknown"]
    visibility_class: Literal["good", "reduced", "poor", "unknown"]
    obstruction: Literal["yes", "no", "unknown"]
    snow_depth_cm: float = Field(ge=0, allow_inf_nan=False)
    depth_confidence_pct: float = Field(ge=0, le=100, allow_inf_nan=False)
    evidence_summary: str = Field(max_length=1200)


class TimedCameraObservation(CameraObservation):
    # Gemini's schema subset has no multipleOf; CameraTimeline validates the exact cadence.
    offset_s: int = Field(ge=0)


class CameraTimeline(BaseModel):
    samples: list[TimedCameraObservation] = Field(min_length=1, max_length=720)

    @model_validator(mode="after")
    def check_offsets(self):
        offsets = [s.offset_s for s in self.samples]
        if offsets != list(range(0, len(offsets) * SAMPLE_INTERVAL_S, SAMPLE_INTERVAL_S)):
            raise ValueError("Video samples must start at zero and advance by exactly five seconds")
        return self


def provider_schema(model: type[BaseModel]) -> dict:
    """Keep the provider schema simple; enforce numeric bounds/cadence locally."""
    schema = model.model_json_schema()
    definitions = schema.get("$defs", {})

    def simplify(node):
        if "$ref" in node:
            return simplify(definitions[node["$ref"].rsplit("/", 1)[-1]])
        out = {k: node[k] for k in ("type", "enum", "required") if k in node}
        if "properties" in node:
            out["properties"] = {k: simplify(v) for k, v in node["properties"].items()}
        if "items" in node:
            out["items"] = simplify(node["items"])
        return out

    return simplify(schema)


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


def media_rel(frame: dict) -> str:
    return frame.get("media") or frame["image"]


def scene_context(frame: dict) -> dict:
    """Attach weather for the footage date, never today's forecast to an archived clip."""
    context = {k: frame[k] for k in ("title", "observed_at", "observed_at_precision") if frame.get(k)}
    day = (frame.get("observed_at") or "")[:10]
    path = DATA / "weather" / "dec2022_context.json"
    if day and path.exists():
        weather = json.loads(path.read_text(encoding="utf-8"))
        rows = [r for r in weather.get("rows", []) if r.get("date") == day]
        if rows:
            context["weather_context"] = rows
            context["weather_context_note"] = (
                "Capture-date regional observations, not measured depth on this road. Daily snowfall "
                "totals may include snow after the recording time. Plowing, drifting, compaction and "
                "location can make street depth different; disclose assumptions and lower confidence."
            )
    return context


def sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


class Vision:
    def __init__(self):
        self.key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.model = os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash"
        self.fallback_model = os.environ.get("GEMINI_FALLBACK_MODEL") or "gemini-3.5-flash-lite"
        self.frames = load_frames()
        self.last_error: str | None = None
        self.last_success: str | None = None
        self.last_model: str | None = None
        self._client = None
        self._analysis_lock = threading.Lock()
        self._attempted: dict[str, dict] = {}
        self._rate_limited = False
        self._rate_limited_models: set[str] = set()

    def status(self) -> dict:
        # "configured" = key present; "verified" = at least one successful live request this session.
        return {"configured": bool(self.key), "verified": self.last_success is not None,
                "available": self.last_success is not None, "mode": "live" if self.key else "fixture",
                "model": self.model if self.key else None, "fallback_model": self.fallback_model if self.key else None,
                "last_model": self.last_model, "last_success": self.last_success, "last_error": self.last_error}

    def frame_path(self, frame: dict) -> Path:
        return FRAMES_DIR / media_rel(frame)

    def recording(self, frame_id: str) -> dict | None:
        media = self.frame_path(self.frames[frame_id]) if frame_id in self.frames else None
        media_hash = sha1(media) if media is not None and media.exists() else None
        for p in (RECORDED_DIR / f"{frame_id}.timeline-v{ANALYSIS_SCHEMA_VERSION}.json",
                  RECORDED_DIR / f"{frame_id}.timeline-v2.json", RECORDED_DIR / f"{frame_id}.json"):
            if not p.exists():
                continue
            rec = json.loads(p.read_text(encoding="utf-8"))
            if media_hash is not None and rec.get("media_sha1") != media_hash:
                continue
            return rec
        return None

    def public_frames(self) -> list[dict]:
        out = []
        for f in self.frames.values():
            p = self.frame_path(f)
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
        """Analyze unchanged media once; reuse saved/session results even for legacy live requests."""
        with self._analysis_lock:
            return self._analyze_once(frame_id, mode)

    def _analyze_once(self, frame_id: str, mode: str) -> dict:
        """Blocking; run outside the simulation lock. Never invents a result.

        All modes honor an existing recording. replay never calls the provider.
        Other modes attempt new media once per session; exhausted models are skipped.
        """
        frame = self.frames[frame_id]
        path = self.frame_path(frame)
        base = {"frame_id": frame_id, "camera_id": frame.get("camera_id"), "segment_ids": frame["segment_ids"],
                "observed_at": frame.get("observed_at"), "received_at": datetime.now(timezone.utc).isoformat()}
        live_error = None

        rec = self.recording(frame_id)
        if rec is not None:
            return {**base, "status": "done", "source_kind": "recorded_inference", "model_id": rec["model_id"],
                    "recorded_at": rec["recorded_at"], "result": rec["result"]}
        fingerprint = sha1(path) if path.exists() else None
        if mode != "replay" and fingerprint in self._attempted:
            saved = self._attempted[fingerprint]
            return {**saved, **base, "source_kind": "recorded_inference" if saved["status"] == "done" else saved.get("source_kind"),
                    "note": "Reused this video's previous analysis attempt; no new Gemini request."}
        if self._rate_limited and mode != "replay":
            return {**base, "status": "failed", "source_kind": "none", "result": None,
                    "error": "Gemini quota/rate limit reached (429). Automatic requests stopped; saved results remain available."}

        if mode in ("auto", "live", "cached") and self.key and path.suffix.lower() in MEDIA and path.exists():
            try:
                result, model_used = self._gemini_with_fallback(path)
                self.last_error = None
                self.last_success = datetime.now(timezone.utc).isoformat()
                self.last_model = model_used
                self._record(frame_id, path, result, model_used)
                response = {**base, "status": "done", "source_kind": "live_inference", "model_id": model_used,
                            "result": result}
                self._attempted[fingerprint] = response
                return response
            except Exception as e:
                code = getattr(e, "code", None)
                failure = "Quota/rate limit reached (429)" if code == 429 else f"{type(e).__name__}{f' ({code})' if code else ''}"
                live_error = f"Gemini request failed: {failure}"
                self.last_error = failure
                self._rate_limited = all(m in self._rate_limited_models for m in
                                         {self.model, self.fallback_model} if m)
                response = {**base, "status": "failed", "source_kind": "live_inference", "model_id": self.model,
                            "error": live_error, "result": None}
                self._attempted[fingerprint] = response
                if mode == "live" or self._rate_limited:
                    return response

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

    def _gemini_with_fallback(self, path: Path) -> tuple[dict, str]:
        last_error = None
        for model in dict.fromkeys(m for m in (self.model, self.fallback_model) if m):
            if model in self._rate_limited_models:
                continue
            try:
                return self._gemini(path, model), model
            except Exception as error:
                last_error = error
                if getattr(error, "code", None) == 429:
                    self._rate_limited_models.add(model)
        if last_error is not None:
            raise last_error
        raise RuntimeError("All configured Gemini models reached their quota this session")

    def _record(self, frame_id: str, path: Path, result: dict, model_id: str):
        RECORDED_DIR.mkdir(parents=True, exist_ok=True)
        rec = {"frame_id": frame_id, "media": path.name, "media_sha1": sha1(path), "model_id": model_id,
               "recorded_at": datetime.now(timezone.utc).isoformat(), "source_kind": "recorded_inference",
               "analysis_schema_version": ANALYSIS_SCHEMA_VERSION, "result": result}
        # Preserve the previous genuine whole-clip recording when upgrading the schema.
        (RECORDED_DIR / f"{frame_id}.timeline-v{ANALYSIS_SCHEMA_VERSION}.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")

    def _gemini(self, path: Path, model: str) -> dict:
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = genai.Client(api_key=self.key, http_options=types.HttpOptions(
                timeout=120_000, retry_options=types.HttpRetryOptions(attempts=1)))
        mime = MEDIA[path.suffix.lower()]
        if path.stat().st_size <= INLINE_LIMIT:
            media = types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)
        else:
            upload = self._client.files.upload(file=str(path), config={"mime_type": mime})
            deadline = time.time() + 90
            while getattr(upload.state, "name", str(upload.state)) == "PROCESSING" and time.time() < deadline:
                time.sleep(2)
                upload = self._client.files.get(name=upload.name)
            if getattr(upload.state, "name", str(upload.state)) != "ACTIVE":
                raise RuntimeError("Video processing did not finish successfully")
            media = types.Part.from_uri(file_uri=upload.uri, mime_type=mime)
        is_video = path.suffix.lower() in VIDEO
        schema = CameraTimeline if is_video else CameraObservation
        prompt = PROMPT
        frame = next((f for f in self.frames.values() if self.frame_path(f) == path), {})
        context = scene_context(frame)
        if context:
            prompt += " Supplied scene context (background only, not measured street depth): " + json.dumps(context)
        if is_video:
            # Use default decoding and request a separate result at each five-second timestamp.
            prompt += (
                " Return a samples array with ONE separate observation for every sampled frame at "
                "0, 5, 10, 15, ... seconds strictly before the clip ends. Set offset_s to that exact "
                "timestamp. Base EACH result only on what is visible at that timestamp, not a summary "
                "of the entire clip. Update estimates if the camera pans. When the road leaves view, "
                "still provide a rough numeric depth with very low confidence and explain that it is "
                "assumption-based; surface/visibility/obstruction may remain unknown. Include every "
                "offset in order, even when conditions are unchanged."
            )
            if frame.get("duration_s"):
                offsets = list(range(0, math.ceil(frame["duration_s"]), SAMPLE_INTERVAL_S))
                prompt += f" Verified clip duration: {frame['duration_s']} seconds. Required offset_s values: {offsets}."
        resp = self._client.models.generate_content(
            model=model,
            contents=[media, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_json_schema=provider_schema(schema), temperature=0),
        )
        obs = resp.parsed if isinstance(resp.parsed, schema) else schema.model_validate_json(resp.text)
        if is_video:
            if frame.get("duration_s"):
                expected = list(range(0, math.ceil(frame["duration_s"]), SAMPLE_INTERVAL_S))
                if [s.offset_s for s in obs.samples] != expected:
                    raise ValueError("Gemini timeline does not cover every required timestamp in this clip")
            samples = [{"offset_s": s.offset_s, "result": normalize(s.model_dump())} for s in obs.samples]
            return {**samples[0]["result"], "samples": samples, "sample_interval_s": SAMPLE_INTERVAL_S}
        return normalize(obs.model_dump())


def normalize(r: dict) -> dict:
    obs = r.get("obstruction", r.get("obstruction_detected"))
    od = True if obs in ("yes", True) else False if obs in ("no", False) else None
    return {
        "surface_class": r.get("surface_class", "unknown"),
        "visibility_class": r.get("visibility_class", "unknown"),
        "obstruction_detected": od,
        "snow_depth_cm": r.get("snow_depth_cm"),
        "depth_confidence_pct": r.get("depth_confidence_pct") if r.get("snow_depth_cm") is not None else None,
        "evidence_summary": r.get("evidence_summary", ""),
    }
