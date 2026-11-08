"""Tiger Data (TimescaleDB) persistence: async checkpoint writer + read-only history queries."""

from __future__ import annotations

import json
import os
import queue
import threading
import time
from datetime import datetime, timedelta, timezone

SCENARIO_EPOCH = datetime(2026, 1, 15, 11, 0, tzinfo=timezone.utc)  # 06:00 America/New_York

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    scenario_version TEXT NOT NULL,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comparison_snapshots (
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    sim_time_s DOUBLE PRECISION NOT NULL,
    sim_ts TIMESTAMPTZ NOT NULL,
    state JSONB NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, tick)
);
CREATE TABLE IF NOT EXISTS road_segment_telemetry (
    sim_ts TIMESTAMPTZ NOT NULL,
    sim_time_s DOUBLE PRECISION NOT NULL,
    run_id TEXT NOT NULL,
    policy TEXT NOT NULL,
    segment_id TEXT NOT NULL,
    snow_depth_in REAL NOT NULL,
    closed BOOLEAN NOT NULL,
    last_service_s DOUBLE PRECISION,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SELECT create_hypertable('road_segment_telemetry', by_range('sim_ts'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS road_segment_telemetry_run_idx
    ON road_segment_telemetry (run_id, segment_id, policy, sim_ts);
CREATE TABLE IF NOT EXISTS observations (
    observation_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    frame_id TEXT,
    source_kind TEXT,
    observed_at TEXT,
    result JSONB,
    segment_id TEXT,
    applied_tick INTEGER,
    effect JSONB,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dispatch_events (
    run_id TEXT NOT NULL,
    policy TEXT NOT NULL,
    sim_time_s DOUBLE PRECISION NOT NULL,
    vehicle_id TEXT,
    kind TEXT NOT NULL,
    target TEXT,
    reason TEXT,
    detail JSONB,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def sim_ts(t: float) -> datetime:
    return SCENARIO_EPOCH + timedelta(seconds=t)


class Telemetry:
    def __init__(self, engine):
        self.engine = engine
        self.url = os.environ.get("DATABASE_URL")
        self.q: queue.Queue = queue.Queue(maxsize=300)
        self.state = {"configured": bool(self.url), "connected": False, "schema_ready": False,
                      "writes": 0, "rows": 0, "dropped": 0, "last_error": None, "last_write_s": None}
        self._last_log_t: dict[str, float] = {}
        if self.url:
            engine.listeners.append(self.on_event)
            threading.Thread(target=self._worker, daemon=True, name="telemetry").start()
            self.on_event("run", {})  # the engine's initial run started before this listener existed

    def status(self) -> dict:
        return {**self.state, "available": self.state["connected"] and self.state["schema_ready"],
                "queue": self.q.qsize()}

    # --------------------------------------------------- engine-side (fast)
    def on_event(self, kind: str, payload: dict):
        e = self.engine
        if kind == "run":
            self._last_log_t = {}
            inputs = {"scenario": e.scenario, "params": e.params}
            if e.forecast is not None:
                inputs["weather"] = e.forecast.provenance()
            self._put(("run", e.run_id, e.scenario["id"], e.version, inputs))
        elif kind == "checkpoint":
            snap = e.snapshot()
            rows = []
            closed = {c["segment_id"] for c in snap["env"]["closures"]}
            ts = e.forecast.start_at + timedelta(seconds=e.t) if e.forecast is not None else sim_ts(e.t)
            for policy, w in snap["policies"].items():
                for sid, (depth, last) in w["segments"].items():
                    rows.append((ts, e.t, e.run_id, policy, sid, depth, sid in closed, last))
            events = []
            for policy, w in e.worlds.items():
                since = self._last_log_t.get(policy, -1)
                for ev in w.log:
                    if ev["t"] > since and ev.get("kind") in ("assign", "service", "reroute"):
                        events.append((e.run_id, policy, ev["t"], ev.get("vehicle_id"), ev["kind"], ev.get("target"),
                                       ev.get("reason"), json.dumps(ev, default=str)))
                if w.log:
                    self._last_log_t[policy] = max(ev["t"] for ev in w.log)
            self._put(("checkpoint", e.run_id, e.tick, e.t, ts, json.dumps(snap, default=str), rows, events))
        elif kind == "observation_applied":
            obs, sid = payload["observation"], payload["segment_id"]
            app = obs["applications"][-1]
            self._put(("observation", obs["observation_id"], obs["run_id"], obs.get("frame_id"), obs.get("source_kind"),
                       obs.get("observed_at"), json.dumps(obs.get("result")), sid, app["tick"],
                       json.dumps(app["effect"])))

    def _put(self, item):
        try:
            self.q.put_nowait(item)
        except queue.Full:
            self.state["dropped"] += 1

    # ------------------------------------------------------------- worker
    def _connect(self):
        import psycopg
        return psycopg.connect(self.url, connect_timeout=10, application_name="SnowTwin-telemetry")

    def _worker(self):
        conn = None
        while True:
            item = self.q.get()
            for attempt in range(2):
                try:
                    if conn is None or conn.closed:
                        conn = self._connect()
                        self.state["connected"] = True
                        if not self.state["schema_ready"]:
                            with conn.transaction():
                                conn.execute(SCHEMA)
                            self.state["schema_ready"] = True
                    self._write(conn, item)
                    self.state["writes"] += 1
                    self.state["last_write_s"] = time.time()
                    self.state["last_error"] = None
                    break
                except Exception as ex:
                    self.state["last_error"] = type(ex).__name__
                    self.state["connected"] = False
                    try:
                        if conn is not None:
                            conn.close()
                    except Exception:
                        pass
                    conn = None
                    time.sleep(1.0)

    def _write(self, conn, item):
        kind = item[0]
        with conn.transaction():
            if kind == "run":
                _, run_id, scenario_id, version, params = item
                conn.execute("INSERT INTO runs (run_id, scenario_id, scenario_version, params) VALUES (%s,%s,%s,%s) "
                             "ON CONFLICT (run_id) DO NOTHING", (run_id, scenario_id, version, json.dumps(params, default=str)))
            elif kind == "checkpoint":
                _, run_id, tick, t, ts, state, rows, events = item
                conn.execute("INSERT INTO comparison_snapshots (run_id, tick, sim_time_s, sim_ts, state) "
                             "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (run_id, tick) DO NOTHING",
                             (run_id, tick, t, ts, state))
                with conn.cursor() as cur:
                    with cur.copy("COPY road_segment_telemetry (sim_ts, sim_time_s, run_id, policy, segment_id, "
                                  "snow_depth_in, closed, last_service_s) FROM STDIN") as cp:
                        for r in rows:
                            cp.write_row(r)
                    if events:
                        cur.executemany("INSERT INTO dispatch_events (run_id, policy, sim_time_s, vehicle_id, kind, "
                                        "target, reason, detail) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", events)
                self.state["rows"] += len(rows) + len(events) + 1
            elif kind == "observation":
                conn.execute("INSERT INTO observations (observation_id, run_id, frame_id, source_kind, observed_at, "
                             "result, segment_id, applied_tick, effect) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", item[1:])

    # ------------------------------------------------------------ queries
    def _query(self, sql: str, args: tuple):
        import psycopg
        with psycopg.connect(self.url, connect_timeout=10,
                             options="-c default_transaction_read_only=on -c statement_timeout=8000") as c:
            return c.execute(sql, args).fetchall()

    def list_checkpoints(self, run_id: str) -> list[dict]:
        rows = self._query("SELECT tick, sim_time_s FROM comparison_snapshots WHERE run_id=%s ORDER BY tick", (run_id,))
        return [{"tick": r[0], "sim_time_s": r[1]} for r in rows]

    def get_checkpoint(self, run_id: str, tick: int) -> dict | None:
        rows = self._query("SELECT state FROM comparison_snapshots WHERE run_id=%s AND tick=%s", (run_id, tick))
        return rows[0][0] if rows else None

    def segment_history(self, run_id: str, segment_id: str) -> dict:
        rows = self._query(
            "SELECT policy, sim_time_s, snow_depth_in, closed FROM road_segment_telemetry "
            "WHERE run_id=%s AND segment_id=%s ORDER BY sim_ts", (run_id, segment_id))
        out = {"fixed": [], "adaptive": []}
        for policy, t, d, closed in rows:
            out.setdefault(policy, []).append([t, d, closed])
        return out

    def recent_runs(self, limit: int = 10) -> list[dict]:
        rows = self._query(
            "SELECT r.run_id, r.scenario_id, r.created_at, count(s.tick), max(s.sim_time_s) FROM runs r "
            "LEFT JOIN comparison_snapshots s USING (run_id) GROUP BY r.run_id ORDER BY r.created_at DESC LIMIT %s",
            (limit,))
        return [{"run_id": r[0], "scenario_id": r[1], "created_at": r[2].isoformat(), "checkpoints": r[3],
                 "max_sim_time_s": r[4]} for r in rows]
