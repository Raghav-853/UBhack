"""SnowTwin WNY API: paired simulation, observations, persistence, and static dashboard."""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .network import ROOT

load_dotenv(ROOT / ".env.local", override=False, interpolate=False)
load_dotenv(ROOT / ".env", override=False, interpolate=False)
load_dotenv(ROOT / ".env.download", override=False, interpolate=False)

from .cameras import LiveCameras  # noqa: E402
from .nws import NWS_SCENARIO_ID, ForecastUnavailable, fetch_forecast  # noqa: E402
from .simulation import DEFAULT_PARAMS, SUBSTEP_S, Engine, derive_effect  # noqa: E402
from .telemetry import Telemetry  # noqa: E402
from .vision import MEDIA, VIDEO, Vision, save_upload  # noqa: E402
from .voice import Voice  # noqa: E402

WALL_INTERVAL_S = 0.5
BASE_SIM_PER_WALL_S = 60.0  # x1 playback: one simulated minute per wall second

engine = Engine()
vision = Vision()
telemetry = Telemetry(engine)
voice = Voice()
live_cams = LiveCameras(vision, engine.net)
executor = ThreadPoolExecutor(max_workers=2)
_snapshot_cache: dict = {"data": None}


def _loop():
    while True:
        start = time.time()
        with engine.lock:
            if engine.playing:
                substeps = max(1, round(BASE_SIM_PER_WALL_S * WALL_INTERVAL_S * engine.speed / SUBSTEP_S))
                engine.advance(substeps)
            _announce_camera_proposals()
            _snapshot_cache["data"] = engine.snapshot()
        time.sleep(max(0.05, WALL_INTERVAL_S - (time.time() - start)))


# --------------------------------------------- camera radio announcements
# When Gemini's analysis yields a proposal, announce it once per run (re-announced after a reset).
# The sentence is assembled only from the validated classification fields; no numbers are invented.
_announced: set[str] = set()
_SURFACE = {"snow_covered": "snow-covered", "wet": "wet", "dry": "dry"}
FORECAST_CAMERA_MAX_AGE = timedelta(minutes=30)


def _camera_reference_only(observed_at: str | None) -> bool:
    forecast = engine.forecast
    if forecast is None:
        return False
    if not isinstance(observed_at, str):
        return True
    try:
        capture_time = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    if capture_time.tzinfo is None:
        return True
    age = forecast.start_at + timedelta(seconds=engine.t) - capture_time
    return not timedelta(0) <= age <= FORECAST_CAMERA_MAX_AGE


def _spoken_place(frame: dict) -> str:
    title = frame.get("title", frame["frame_id"]).split(" (")[0]
    title = re.sub(r"\bSt\b\.?", "Street", title)
    return re.sub(r"\bAve\b\.?", "Avenue", title)


def _announce_camera_proposals():
    for a in list(analyses.values()):
        if a.get("status") != "done" or not a.get("result"):
            continue
        eff = a.get("proposed_effect") or {}
        if eff.get("kind") in (None, "none"):
            continue
        key = f"{engine.run_id}:{a['frame_id']}@{a.get('version')}"
        if key in _announced or a["frame_id"] not in vision.frames:
            continue
        frame = vision.frames[a["frame_id"]]
        # Alert only once modeled snow on the camera's mapped road reaches the exposure threshold (either world).
        with engine.lock:
            thr = engine.params["threshold_in"]
            depth = max((w.depth.get(sid, 0.0) for w in engine.worlds.values() for sid in frame["segment_ids"]), default=0.0)
            if a["frame_id"] not in engine.camera_triggered:
                if depth < thr:
                    continue
                engine.camera_triggered[a["frame_id"]] = {"sim_time_s": engine.t, "depth_in": round(depth, 2)}
        r = a["result"]
        seg = engine.net.segments.get(frame["segment_ids"][0])
        parts = []
        if r.get("surface_class") in _SURFACE:
            parts.append(f"road {_SURFACE[r['surface_class']]}")
        if r.get("visibility_class") in ("good", "reduced", "poor"):
            parts.append(f"visibility {r['visibility_class']}")
        if r.get("obstruction_detected") is True:
            parts.append("a travel lane appears blocked")
        action = "Segment closure" if eff["kind"] == "closure" else "Speed reduction"
        where = (seg.name or "this segment") if seg else "this segment"
        source = ", archive footage" if "archive" in frame.get("source", "").lower() else ""
        text = (f"Camera report, {_spoken_place(frame)}{source}: {', '.join(parts)}. "
                f"{action} proposed on {where}. Awaiting dispatcher approval.")
        with engine.lock:
            if not key.startswith(f"{engine.run_id}:") or _camera_reference_only(a.get("observed_at")):
                continue
            _announced.add(key)
            engine.add_alert("camera", text, a["frame_id"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_loop, daemon=True, name="sim-loop").start()
    threading.Thread(target=_auto_analyze_loop, daemon=True, name="auto-analyze").start()
    yield


# ------------------------------------------------- automatic camera analysis
# Changed camera media is analyzed once; unchanged content reuses saved/session results.
# The dispatcher only approves or rejects the proposed effect.
analyses: dict[str, dict] = {}
_inflight: set[str] = set()


def _auto_analyze_loop():
    while True:
        for fid, f in list(vision.frames.items()):
            v = f.get("version", 0)
            a = analyses.get(fid)
            if (a is None or a.get("version") != v) and fid not in _inflight:
                _inflight.add(fid)
                analyses[fid] = {"frame_id": fid, "version": v, "status": "processing"}
                executor.submit(_do_analyze, fid, v, "cached")
        time.sleep(3)


def _do_analyze(fid: str, v: int, mode: str = "cached"):
    try:
        res = vision.analyze(fid, mode)
    except Exception as e:
        res = {"status": "failed", "result": None, "error": type(e).__name__}
    finally:
        _inflight.discard(fid)
    res.update(frame_id=fid, version=v, analyzed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    if res.get("result"):
        res["proposed_effect"] = frame_effect(fid, res["result"])
        for sample in res["result"].get("samples", []):
            sample["proposed_effect"] = frame_effect(fid, sample["result"])
    if fid in vision.frames and vision.frames[fid].get("version", 0) == v:
        analyses[fid] = res


app = FastAPI(title="SnowTwin WNY", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def integrations() -> dict:
    return {
        "gemini": vision.status(),
        "tiger": telemetry.status(),
        "voice": voice.status(),
        "ny511": live_cams.status(),
    }


# ------------------------------------------------------------------ schemas
class BandIn(BaseModel):
    rate_in_hr: float | None = Field(None, ge=0, le=8)
    heading_deg: float | None = None
    width_m: float | None = Field(None, ge=200, le=20000)
    offset_m: float | None = Field(None, ge=-8000, le=8000)
    drift_mps: float | None = Field(None, ge=-3, le=3)
    wobble_amp_m: float | None = Field(None, ge=0, le=6000)
    wobble_period_s: float | None = Field(None, ge=600, le=43200)


class VehicleIn(BaseModel):
    id: str = Field(min_length=1, max_length=8)
    type: Literal["heavy_plow", "compact_blower"]
    start: str


class ParamsIn(BaseModel):
    horizon_s: float | None = None
    corridor_beta: float | None = None
    min_service_depth_in: float | None = None
    threshold_in: float | None = None


class OverridesIn(BaseModel):
    fleet: list[VehicleIn] | None = None
    params: ParamsIn | None = None
    baseline_policy: Literal["city_priority", "service_history", "fixed_loop"] | None = None


class ScenarioIn(BaseModel):
    scenario_id: str
    band: BandIn | None = None
    overrides: OverridesIn | None = None
    seed: int | None = None
    autoplay: bool = False


class ControlIn(BaseModel):
    action: Literal["play", "pause", "step"]
    speed_multiplier: float | None = Field(None, gt=0, le=64)


class AnalyzeIn(BaseModel):
    run_id: str
    frame_id: str
    mode: Literal["auto", "live", "replay"] = "auto"


class ApplyIn(BaseModel):
    run_id: str
    observation_id: str
    segment_id: str


def frame_effect(frame_id: str, result: dict) -> dict:
    """Adjacent (e.g. highway) cameras may support a visibility slowdown, never a closure."""
    frame = vision.frames.get(frame_id, {})
    if frame.get("relation") == "adjacent" and result.get("obstruction_detected"):
        result = {**result, "obstruction_detected": None}
    return derive_effect(result, engine.params)


# ---------------------------------------------------------------- endpoints
@app.get("/api/health")
def health():
    return {"ok": True, "run_id": engine.run_id, "integrations": integrations()}


@app.get("/api/network")
def network():
    return engine.net.to_public()


@app.get("/api/scenarios")
def scenarios():
    return [{"id": s["id"], "label": s["label"], "description": s.get("description", ""), "band": s["band"],
             "duration_s": s["duration_s"]} for s in engine.scenarios.values()]


@app.get("/api/state")
def state():
    with engine.lock:
        snap = _snapshot_cache["data"] or engine.snapshot()
        camera = {"analyses": [{**a, "reference_only": _camera_reference_only(a.get("observed_at"))}
                               for a in list(analyses.values())],
                  "decisions": dict(engine.decisions), "triggered": dict(engine.camera_triggered)}
    return JSONResponse({**snap, "integrations": integrations(), "camera": camera})


class DecideIn(BaseModel):
    run_id: str
    frame_id: str
    version: int
    decision: Literal["approve", "reject"]
    sample_offset_s: int | None = Field(default=None, ge=0, multiple_of=5)


@app.post("/api/proposals/decide")
def decide(body: DecideIn):
    with engine.lock:
        return _decide_locked(body)


def _decide_locked(body: DecideIn):
    if body.run_id != engine.run_id:
        raise HTTPException(409, "Run is no longer active")
    if body.frame_id not in engine.camera_triggered:
        raise HTTPException(409, "Snow on this camera's road has not reached the alert threshold yet")
    a = analyses.get(body.frame_id)
    if not a or a.get("status") != "done" or a.get("version") != body.version:
        raise HTTPException(409, "No current analysis for this camera")
    if vision.frames.get(body.frame_id, {}).get("version", 0) != body.version:
        raise HTTPException(409, "Camera media changed since this analysis; wait for re-analysis")
    if _camera_reference_only(a.get("observed_at")):
        raise HTTPException(409, "Camera footage is outside the 30-minute observation window for this forecast.")
    result = a.get("result") or {}
    samples = result.get("samples", [])
    offset = body.sample_offset_s
    if samples:
        offset = 0 if offset is None else offset
        sample = next((s for s in samples if s["offset_s"] == offset), None)
        if sample is None:
            raise HTTPException(409, "No analyzed frame at this playback time")
        result = sample["result"]
    elif offset is not None:
        raise HTTPException(409, "This recording has no time-specific analysis; re-analyze the media")
    eff = frame_effect(body.frame_id, result)
    if eff["kind"] == "none":
        raise HTTPException(409, "Nothing to approve for this camera")
    key = f"{body.frame_id}@{body.version}" + (f":{offset}" if offset is not None else "")
    if key in engine.decisions:
        return engine.decisions[key]
    rec = {"frame_id": body.frame_id, "version": body.version, "decision": body.decision,
           "effect": eff, "sim_time_s": engine.t, "sample_offset_s": offset}
    if body.decision == "approve":
        if engine.t >= engine.duration:
            raise HTTPException(409, "Run finished; reset the scenario to apply new observations")
        frame = vision.frames[body.frame_id]
        obs = {"observation_id": "obs-" + uuid.uuid4().hex[:8], "run_id": engine.run_id, "frame_id": body.frame_id,
               "status": "done", "result": result, "source_kind": a.get("source_kind"),
               "model_id": a.get("model_id"), "observed_at": a.get("observed_at"), "proposed_effect": eff,
               "applications": [], "segment_ids": frame["segment_ids"], "sample_offset_s": offset}
        engine.observations[obs["observation_id"]] = obs
        rec["apply_tick"] = engine.schedule_apply(obs, frame["segment_ids"][0])
        rec["segment_id"] = frame["segment_ids"][0]
    engine.decisions[key] = rec
    return rec


@app.post("/api/analyses/{frame_id}/rerun")
def rerun_analysis(frame_id: str):
    if frame_id not in vision.frames:
        raise HTTPException(404, "Unknown frame")
    if frame_id in _inflight:
        return {"status": "processing"}
    current = analyses.get(frame_id)
    if current and current.get("status") == "done" and current.get("version") == vision.frames[frame_id].get("version", 0):
        return {"status": "done", "reused": True}
    analyses.pop(frame_id, None)  # reload cache/session result; unchanged media is never forced live
    return {"status": "queued"}


@app.post("/api/scenario")
def new_scenario(body: ScenarioIn):
    forecast = None
    previous_run_id = engine.run_id
    if body.scenario_id == NWS_SCENARIO_ID:
        if body.band is not None:
            raise HTTPException(422, "Snowband controls apply only to synthetic storms.")
        scenario = engine.scenarios[NWS_SCENARIO_ID]
        horizon = scenario.get("params", {}).get("horizon_s", DEFAULT_PARAMS["horizon_s"])
        try:
            forecast = fetch_forecast(engine.net, scenario["duration_s"], horizon)
        except ForecastUnavailable as e:
            raise HTTPException(503, str(e)) from e

    try:
        with engine.lock:
            if forecast is not None and previous_run_id != engine.run_id:
                raise HTTPException(409, "The active scenario changed while the NWS forecast was loading. Retry to switch.")
            run_id = engine.new_run(body.scenario_id, body.band.model_dump() if body.band else None,
                                    body.seed, forecast=forecast,
                                    overrides=body.overrides.model_dump() if body.overrides else None)
            engine.playing = body.autoplay
            _snapshot_cache["data"] = engine.snapshot()
            return {"run_id": run_id, "scenario_version": engine.version}
    except KeyError:
        raise HTTPException(404, f"Unknown scenario {body.scenario_id}")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/control")
def control(body: ControlIn):
    with engine.lock:
        if body.speed_multiplier is not None:
            engine.speed = body.speed_multiplier
        if body.action == "play":
            engine.playing = engine.t < engine.duration
        elif body.action == "pause":
            engine.playing = False
        elif body.action == "step":
            engine.playing = False
            engine.advance(6)
        _snapshot_cache["data"] = engine.snapshot()
        return {"playback_status": "playing" if engine.playing else "paused", "speed": engine.speed}


WEATHER_FILE = ROOT / "data" / "weather" / "dec2022_context.json"
WEATHER = json.loads(WEATHER_FILE.read_text(encoding="utf-8")) if WEATHER_FILE.exists() else {"rows": [], "note": ""}


@app.get("/api/frames")
def frames():
    out, used = [], {}
    for f in vision.public_frames():
        seg = engine.net.segments.get(f["segment_ids"][0]) if f.get("segment_ids") else None
        ll = f.get("lonlat") or (engine.net.to_ll(seg.mid) if seg else None)
        if ll:
            # Display-only offset so cameras mapped to the same segment don't hide each other.
            k = used.get(tuple(ll), 0)
            used[tuple(ll)] = k + 1
            ll = [round(ll[0] + 0.0006 * k, 6), ll[1]]
        f["lonlat"] = ll
        day = (f.get("observed_at") or "")[:10]
        f["weather_context"] = [r for r in WEATHER["rows"] if r["date"] == day]
        f["weather_note"] = WEATHER.get("note", "") if f["weather_context"] else ""
        out.append(f)
    return out


@app.post("/api/cameras/refresh")
def cameras_refresh():
    if not live_cams.key:
        raise HTTPException(503, "NY511_API_KEY not configured")
    try:
        return live_cams.refresh()
    except Exception as e:
        raise HTTPException(502, str(e)[:200])


@app.get("/api/cameras/nearby")
def cameras_nearby(radius_m: float = 250):
    if not live_cams.key:
        raise HTTPException(503, "NY511_API_KEY not configured")
    try:
        return live_cams.nearby(radius_m)
    except Exception as e:
        raise HTTPException(502, str(e)[:200])


@app.post("/api/frames/upload")
async def upload_frame(
    file: UploadFile = File(...),
    title: str = Form(...),
    source: str = Form(...),
    segment_id: str = Form(...),
    relation: Literal["on_segment", "adjacent"] = Form("on_segment"),
    observed_at: str = Form(""),
    license_note: str = Form(""),
):
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in MEDIA:
        raise HTTPException(422, "Upload an image (JPG/PNG/WEBP) or video (MP4/WEBM/MOV)")
    if segment_id not in engine.net.segments:
        raise HTTPException(422, "Unknown segment")
    data = await file.read()
    if len(data) > (80_000_000 if ext in VIDEO else 8_000_000):
        raise HTTPException(413, "File too large (8 MB image / 80 MB video)")
    frame_id = "UP-" + uuid.uuid4().hex[:6].upper()
    rel = f"uploads/{frame_id}{ext}"
    dest = vision.frame_path({"media": rel})
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    frame = {"frame_id": frame_id, "camera_id": frame_id, "title": title[:80], "media": rel,
             "source": source[:120], "license_note": license_note[:200], "observed_at": observed_at or None,
             "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "segment_ids": [segment_id],
             "relation": relation, "version": int(time.time())}
    vision.frames[frame_id] = frame
    save_upload(frame)
    return frame


@app.get("/api/frames/{frame_id}/image")
def frame_image(frame_id: str):
    f = vision.frames.get(frame_id)
    if not f:
        raise HTTPException(404, "Unknown frame")
    p = vision.frame_path(f)
    if not p.exists():
        raise HTTPException(404, "Image file missing")
    return FileResponse(p)


@app.post("/api/observations/analyze")
def analyze(body: AnalyzeIn):
    if body.run_id != engine.run_id:
        raise HTTPException(409, "Run is no longer active")
    if body.frame_id not in vision.frames:
        raise HTTPException(404, "Unknown frame")
    with engine.lock:
        for o in engine.observations.values():
            if (o.get("run_id") == body.run_id and o.get("frame_id") == body.frame_id
                    and o.get("frame_version") == vision.frames[body.frame_id].get("version")
                    and o.get("mode") == body.mode
                    and o["status"] in ("processing", "done")):
                return o
        obs = {"observation_id": "obs-" + uuid.uuid4().hex[:8], "run_id": body.run_id, "frame_id": body.frame_id,
               "status": "processing", "result": None, "applications": [],
               "frame_version": vision.frames[body.frame_id].get("version"), "mode": body.mode,
               "segment_ids": vision.frames[body.frame_id]["segment_ids"]}
        engine.observations[obs["observation_id"]] = obs

    def work():
        res = vision.analyze(body.frame_id, body.mode)
        with engine.lock:
            if obs["run_id"] != engine.run_id:
                obs["status"] = "stale"
                return
            obs.update(res)
            if res.get("result"):
                obs["proposed_effect"] = frame_effect(body.frame_id, res["result"])

    executor.submit(work)
    return obs


@app.get("/api/observations/{observation_id}")
def get_observation(observation_id: str):
    o = engine.observations.get(observation_id)
    if not o:
        raise HTTPException(404, "Unknown observation")
    return o


@app.post("/api/observations/apply")
def apply(body: ApplyIn):
    with engine.lock:
        if body.run_id != engine.run_id:
            raise HTTPException(409, "Run is no longer active")
        obs = engine.observations.get(body.observation_id)
        if not obs or obs.get("run_id") != body.run_id:
            raise HTTPException(404, "Unknown observation for this run")
        if obs["status"] != "done" or not obs.get("result"):
            raise HTTPException(409, f"Observation not applicable (status {obs['status']})")
        if _camera_reference_only(obs.get("observed_at")):
            raise HTTPException(409, "Camera footage is outside the 30-minute observation window for this forecast.")
        if body.segment_id not in obs.get("segment_ids", []):
            raise HTTPException(422, "Segment is not mapped to this camera")
        if engine.t >= engine.duration:
            raise HTTPException(409, "Run finished; reset the scenario to apply new observations")
        tick = engine.schedule_apply(obs, body.segment_id)
        return {"apply_tick": tick, "effect": obs.get("proposed_effect") or frame_effect(obs["frame_id"], obs["result"])}


@app.get("/api/voice/{alert_id}")
def voice_audio(alert_id: str):
    alert = next((a for a in engine.alerts if a["alert_id"] == alert_id), None)
    if not alert:
        raise HTTPException(404, "Unknown alert")
    audio = voice.synthesize(alert_id, alert["text"])
    if audio is None:
        return JSONResponse({"fallback": "browser_tts", "text": alert["text"]}, status_code=503)
    return Response(audio, media_type="audio/mpeg")


def _need_db():
    if not telemetry.status()["available"]:
        raise HTTPException(503, "Tiger Data persistence unavailable")


@app.get("/api/runs")
def runs():
    _need_db()
    return telemetry.recent_runs()


@app.get("/api/runs/{run_id}/checkpoints")
def checkpoints(run_id: str):
    _need_db()
    return telemetry.list_checkpoints(run_id)


@app.get("/api/runs/{run_id}/checkpoints/{tick}")
def checkpoint(run_id: str, tick: int):
    _need_db()
    snap = telemetry.get_checkpoint(run_id, tick)
    if snap is None:
        raise HTTPException(404, "Checkpoint not found")
    return snap


@app.get("/api/runs/{run_id}/segments/{segment_id}/history")
def segment_history(run_id: str, segment_id: str):
    _need_db()
    return telemetry.segment_history(run_id, segment_id)


# ------------------------------------------------------------ static build
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
