"""SnowTwin WNY API: paired simulation, observations, persistence, and static dashboard."""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
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

from .cameras import LiveCameras  # noqa: E402
from .simulation import SUBSTEP_S, Engine, derive_effect  # noqa: E402
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
        if engine.playing:
            substeps = max(1, round(BASE_SIM_PER_WALL_S * WALL_INTERVAL_S * engine.speed / SUBSTEP_S))
            engine.advance(substeps)
        _snapshot_cache["data"] = engine.snapshot()
        time.sleep(max(0.05, WALL_INTERVAL_S - (time.time() - start)))


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_loop, daemon=True, name="sim-loop").start()
    threading.Thread(target=_auto_analyze_loop, daemon=True, name="auto-analyze").start()
    yield


# ------------------------------------------------- automatic camera analysis
# Every camera image/video is analyzed once per media version (upload, 511NY refresh, startup).
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
                executor.submit(_do_analyze, fid, v)
        time.sleep(3)


def _do_analyze(fid: str, v: int):
    try:
        res = vision.analyze(fid, "auto")
    except Exception as e:
        res = {"status": "failed", "result": None, "error": type(e).__name__}
    finally:
        _inflight.discard(fid)
    res.update(frame_id=fid, version=v, analyzed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    if res.get("result"):
        res["proposed_effect"] = frame_effect(fid, res["result"])
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


class ScenarioIn(BaseModel):
    scenario_id: str
    band: BandIn | None = None
    seed: int | None = None
    autoplay: bool = False


class ControlIn(BaseModel):
    action: Literal["play", "pause", "step"]
    speed_multiplier: float | None = Field(None, gt=0, le=32)


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
    snap = _snapshot_cache["data"] or engine.snapshot()
    camera = {"analyses": list(analyses.values()), "decisions": dict(engine.decisions)}
    return JSONResponse({**snap, "integrations": integrations(), "camera": camera})


class DecideIn(BaseModel):
    run_id: str
    frame_id: str
    version: int
    decision: Literal["approve", "reject"]


@app.post("/api/proposals/decide")
def decide(body: DecideIn):
    with engine.lock:
        return _decide_locked(body)


def _decide_locked(body: DecideIn):
    if body.run_id != engine.run_id:
        raise HTTPException(409, "Run is no longer active")
    a = analyses.get(body.frame_id)
    if not a or a.get("status") != "done" or a.get("version") != body.version:
        raise HTTPException(409, "No current analysis for this camera")
    if vision.frames.get(body.frame_id, {}).get("version", 0) != body.version:
        raise HTTPException(409, "Camera media changed since this analysis; wait for re-analysis")
    eff = a.get("proposed_effect") or {"kind": "none"}
    if eff["kind"] == "none":
        raise HTTPException(409, "Nothing to approve for this camera")
    key = f"{body.frame_id}@{body.version}"
    if key in engine.decisions:
        return engine.decisions[key]
    rec = {"frame_id": body.frame_id, "version": body.version, "decision": body.decision,
           "effect": eff, "sim_time_s": engine.t}
    if body.decision == "approve":
        if engine.t >= engine.duration:
            raise HTTPException(409, "Run finished; reset the scenario to apply new observations")
        frame = vision.frames[body.frame_id]
        obs = {"observation_id": "obs-" + uuid.uuid4().hex[:8], "run_id": engine.run_id, "frame_id": body.frame_id,
               "status": "done", "result": a["result"], "source_kind": a.get("source_kind"),
               "model_id": a.get("model_id"), "observed_at": a.get("observed_at"), "proposed_effect": eff,
               "applications": [], "segment_ids": frame["segment_ids"]}
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
    analyses.pop(frame_id, None)  # the auto loop picks it up within a few seconds
    return {"status": "queued"}


@app.post("/api/scenario")
def new_scenario(body: ScenarioIn):
    try:
        run_id = engine.new_run(body.scenario_id, body.band.model_dump() if body.band else None, body.seed)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario {body.scenario_id}")
    except ValueError as e:
        raise HTTPException(422, str(e))
    engine.playing = body.autoplay
    _snapshot_cache["data"] = engine.snapshot()
    return {"run_id": run_id, "scenario_version": engine.version}


@app.post("/api/control")
def control(body: ControlIn):
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
    if body.run_id != engine.run_id:
        raise HTTPException(409, "Run is no longer active")
    obs = engine.observations.get(body.observation_id)
    if not obs or obs.get("run_id") != body.run_id:
        raise HTTPException(404, "Unknown observation for this run")
    if obs["status"] != "done" or not obs.get("result"):
        raise HTTPException(409, f"Observation not applicable (status {obs['status']})")
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
