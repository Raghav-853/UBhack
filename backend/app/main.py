"""SnowTwin WNY API: paired simulation, observations, persistence, and static dashboard."""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .network import ROOT

load_dotenv(ROOT / ".env.local", override=False, interpolate=False)
load_dotenv(ROOT / ".env", override=False, interpolate=False)

from .simulation import SUBSTEP_S, Engine, derive_effect  # noqa: E402
from .telemetry import Telemetry  # noqa: E402
from .vision import Vision  # noqa: E402
from .voice import Voice  # noqa: E402

WALL_INTERVAL_S = 0.5
BASE_SIM_PER_WALL_S = 60.0  # x1 playback: one simulated minute per wall second

engine = Engine()
vision = Vision()
telemetry = Telemetry(engine)
voice = Voice()
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
    yield


app = FastAPI(title="SnowTwin WNY", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def integrations() -> dict:
    return {
        "gemini": vision.status(),
        "tiger": telemetry.status(),
        "voice": voice.status(),
        "camera_source": "recorded/synthetic frames in data/frames (511NY live retrieval not connected)",
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


class ApplyIn(BaseModel):
    run_id: str
    observation_id: str
    segment_id: str


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
    return JSONResponse({**snap, "integrations": integrations()})


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
    return vision.public_frames()


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
            if o.get("run_id") == body.run_id and o.get("frame_id") == body.frame_id and o["status"] in ("processing", "done"):
                return o
        obs = {"observation_id": "obs-" + uuid.uuid4().hex[:8], "run_id": body.run_id, "frame_id": body.frame_id,
               "status": "processing", "result": None, "applications": [],
               "segment_ids": vision.frames[body.frame_id]["segment_ids"]}
        engine.observations[obs["observation_id"]] = obs

    def work():
        res = vision.analyze(body.frame_id)
        with engine.lock:
            if obs["run_id"] != engine.run_id:
                obs["status"] = "stale"
                return
            obs.update(res)
            if res.get("result"):
                obs["proposed_effect"] = derive_effect(res["result"], engine.params)

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
    return {"apply_tick": tick, "effect": derive_effect(obs["result"], engine.params)}


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
