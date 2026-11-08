import { useEffect, useRef, useState } from "react";
import MapPane, { DEPTH_STOPS, SNOWFALL_STOPS } from "./MapPane";
import type { SnowfallAreas, SnowfallField } from "./MapPane";

const FIXED = "#f59e0b";
const ADAPT = "#22d3ee";
const FORECAST_SCENARIO = "nws_forecast";
const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const forecastTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

type ForecastWeather = {
  source: "nws";
  issued_at: string;
  valid_at: string;
  areas: SnowfallAreas;
  max_rate_in_hr: number;
};

async function api(path: string, body?: any) {
  const r = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : r.statusText || `Request failed (${r.status})`);
  return j;
}

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `T+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export default function App() {
  const [network, setNetwork] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [frames, setFrames] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const maps = useRef<Record<string, any>>({});
  const [cam, setCam] = useState<string | null>(null);
  const [hist, setHist] = useState<any>(null);  // stored Tiger Data checkpoint shown instead of live state
  const [showSnowfall, setShowSnowfall] = useState(true);

  useEffect(() => {
    api("/api/network").then(setNetwork).catch((e) => setErr(String(e)));
    api("/api/scenarios").then(setScenarios).catch(() => {});
    const loadFrames = () => api("/api/frames").then(setFrames).catch(() => {});
    loadFrames();
    const framesTimer = setInterval(loadFrames, 60_000);
    let alive = true;
    const poll = async () => {
      try { const s = await api("/api/state"); if (alive) { setState(s); setErr(null); } }
      catch (e) { if (alive) setErr("Backend unreachable"); }
      if (alive) setTimeout(poll, 500);
    };
    poll();
    return () => { alive = false; clearInterval(framesTimer); };
  }, []);
  const reloadFrames = () => api("/api/frames").then(setFrames).catch(() => {});

  if (!network || !state) return <div className="loading">{err || "Loading SnowTwin…"}</div>;

  const view = hist && hist.run_id === state.run_id ? hist : null;
  const snapshot = view || state;
  const P = snapshot.policies;
  const weather: ForecastWeather | null = snapshot.weather?.source === "nws" ? snapshot.weather : null;
  const isForecast = snapshot.scenario.id === FORECAST_SCENARIO;
  const field: SnowfallField | null = weather ? null : snapshot.band?.field ?? null;
  const snowfall = showSnowfall ? (weather?.areas ?? (field ? null : legacySnowfall(snapshot.band))) : null;
  const snowfallField = showSnowfall && field && field.max_rate_in_hr > 0 ? field : null;
  const rate = weather?.max_rate_in_hr ?? field?.max_rate_in_hr ?? snapshot.band?.rate_in_hr;
  const camState = cameraStates(state, frames);
  return (
    <div className="app">
      <Header state={state} err={err} />
      <div className="body">
        <div className={isForecast ? "maps with-forecast" : "maps"}>
          {isForecast && <ForecastStatus weather={weather} shown={showSnowfall} />}
          <MapPane title="FIXED-ORDER LOOP (comparison)" accent={FIXED} network={network} world={P.fixed}
                   snowfall={snowfall} snowfallField={snowfallField} env={snapshot.env} syncKey="fixed" maps={maps}
                   frames={frames} selectedCam={cam} onCameraClick={setCam} camState={camState} />
          <MapPane title="ADAPTIVE (SnowTwin)" accent={ADAPT} network={network} world={P.adaptive}
                   snowfall={snowfall} snowfallField={snowfallField} env={snapshot.env} syncKey="adaptive" maps={maps}
                   frames={frames} selectedCam={cam} onCameraClick={setCam} camState={camState} />
          <Legend rate={rate} forecast={isForecast}
                  headingDeg={snowfallField ? snapshot.scenario.band?.heading_deg : undefined}
                  shown={showSnowfall} onToggle={setShowSnowfall} />
          {view && (
            <div className="histbanner">
              🗄 Viewing stored checkpoint {fmtClock(view.sim_time_s)} from Tiger Data (read-only) · run {view.run_id}
              <button onClick={() => setHist(null)}>Back to live</button>
            </div>
          )}
          {cam && frames.find((f: any) => f.frame_id === cam) && (
            <CameraViewer state={state} network={network} frame={frames.find((f: any) => f.frame_id === cam)}
                          onClose={() => setCam(null)} />
          )}
        </div>
        <aside className="side">
          <Proposals state={state} frames={frames} network={network} onOpen={setCam} />
          <Controls state={state} scenarios={scenarios} />
          <Metrics state={state} />
          <Camera state={state} frames={frames} network={network} reloadFrames={reloadFrames} selected={cam} onSelect={setCam} />
          <Log state={state} />
          <History state={state} onShow={setHist} showing={view} />
        </aside>
      </div>
    </div>
  );
}

function Header({ state, err }: any) {
  const pct = Math.min(100, (100 * state.sim_time_s) / state.duration_s);
  const I = state.integrations;
  const badge = (label: string, on: boolean, text: string) => (
    <span className={`badge ${on ? "on" : "off"}`} title={text}>{label}: {text}</span>
  );
  return (
    <header>
      <div className="brand">❄ SnowTwin <b>WNY</b></div>
      <div className="clock">
        <span className="t">{fmtClock(state.sim_time_s)}</span>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <span className="muted">{state.scenario.label} · {state.playback_status}</span>
      </div>
      <div className="badges">
        <span className="badge warn" title={state.scenario.provenance}>
          {state.scenario.id === FORECAST_SCENARIO ? "NWS forecast" : "Synthetic storm"}
        </span>
        {badge("Gemini", I.gemini.verified, I.gemini.verified ? `verified ${I.gemini.last_model}` : I.gemini.configured ? (I.gemini.last_error ? `error ${I.gemini.last_error}` : "configured, not yet verified") : "no key")}
        {badge("Tiger Data", I.tiger.available, I.tiger.available ? `${I.tiger.rows} rows` : I.tiger.configured ? (I.tiger.last_error || "connecting") : "off")}
        {badge("Voice", I.voice.verified, I.voice.verified ? "ElevenLabs verified" : I.voice.configured ? (I.voice.last_error ? `error ${I.voice.last_error}` : "ElevenLabs configured") : "browser TTS fallback")}
        {err && <span className="badge off">{err}</span>}
      </div>
    </header>
  );
}

function legacySnowfall(band: any): SnowfallAreas | null {
  if (!(band?.rate_in_hr > 0) || !(band.polygon?.length >= 3)) return null;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature", properties: { rate_in_hr: band.rate_in_hr, outline: true },
      geometry: { type: "Polygon", coordinates: [[...band.polygon, band.polygon[0]]] },
    }],
  };
}

function forecastTimestamp(iso: string) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? <time dateTime={iso}>{forecastTime.format(ms)}</time> : "Unavailable";
}

function ForecastStatus({ weather, shown }: { weather: ForecastWeather | null; shown: boolean }) {
  const status = weather ? weather.max_rate_in_hr === 0
    ? "No snowfall forecast (0 in/h)" : "Snowfall forecast loaded"
    : "Forecast data unavailable";
  return (
    <div className="forecast-strip">
      <b>NWS forecast</b>
      <strong role="status">{status}</strong>
      {weather && <>
        <span>Valid {forecastTimestamp(weather.valid_at)} · Issued {forecastTimestamp(weather.issued_at)}</span>
        <span>{shown ? `Dashed lines show ${weather.areas.features.length} forecast grids` : "Weather layer hidden"}</span>
      </>}
    </div>
  );
}

function Legend({ rate, forecast, headingDeg, shown, onToggle }: {
  rate?: number; forecast: boolean; headingDeg?: number;
  shown: boolean; onToggle: (shown: boolean) => void;
}) {
  const rateLabel = Number.isFinite(rate) ? rate === 0
    ? "No simulated snowfall (0 in/h)"
    : `Max ${rate < 0.01 ? "<0.01" : Number(rate.toFixed(2))} in/h`
    : "Snowfall rate unavailable";
  return (
    <div className="legend" role="group" aria-label="Map legend">
      <div className="legend-row">
        <b>Estimated road depth (in)</b>
        {DEPTH_STOPS.map(([v, c]) => <span key={v} className="sw"><i style={{ background: c }} />{v}</span>)}
        <span className="sw"><i className="thick" /> critical corridor</span>
        <span className="sw"><i className="closed" /> closed</span>
        <span className="sw"><i className="vdot heavy" /> heavy plow</span>
        <span className="sw"><i className="vdot compact" /> compact blower</span>
      </div>
      <div className="legend-row snowfall-legend">
        <label className="sw"><input type="checkbox" checked={shown} onChange={(e) => onToggle(e.target.checked)} /> Show snowfall</label>
        <b>Snowfall rate (in/h)</b>
        {SNOWFALL_STOPS.map(([v, color, opacity], i) => (
          <span key={v} className="sw">
            <i className="snowfall-swatch" style={{ background: color, opacity }} />
            {v}{i === SNOWFALL_STOPS.length - 1 ? "+" : ""}
          </span>
        ))}
        {(!forecast || (rate ?? 0) > 0) && <span className="snowfall-rate">{rateLabel}</span>}
        {headingDeg !== undefined && <span>Synthetic snow · Band flow {COMPASS_POINTS[Math.round(headingDeg / 22.5) % 16]} ({Math.round(headingDeg)}°)</span>}
      </div>
    </div>
  );
}

function Controls({ state, scenarios }: any) {
  const [draft, setDraft] = useState<{ runId: string; band: any } | null>(null);
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [restartError, setRestartError] = useState<string | null>(null);
  const sid = state.scenario.id;
  const band = draft?.runId === state.run_id ? draft.band : state.scenario.band;
  const busy = loadingScenario !== null;

  const restart = async (scenarioId: string, b: any) => {
    setLoadingScenario(scenarioId);
    setRestartError(null);
    try { await api("/api/scenario", { scenario_id: scenarioId, band: b, autoplay: true }); }
    catch (e) { setRestartError(e instanceof Error ? e.message : "Unable to start this scenario"); }
    finally { setLoadingScenario(null); }
  };
  const ctl = (action: string, speed?: number) => api("/api/control", { action, speed_multiplier: speed });
  const slider = (key: string, label: string, min: number, max: number, step: number, unit: string) => (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={band[key]}
             disabled={busy} onChange={(e) => setDraft({ runId: state.run_id, band: { ...band, [key]: Number(e.target.value) } })} />
      <b>{band[key]}{unit}</b>
    </label>
  );
  return (
    <section>
      <h3>Scenario & playback</h3>
      <div className="row">
        {state.playback_status === "playing"
          ? <button disabled={busy} onClick={() => ctl("pause")}>⏸ Pause</button>
          : <button className="primary" disabled={busy} onClick={() => ctl("play")}>▶ Play</button>}
        {[1, 2, 4, 8].map((s) => (
          <button key={s} disabled={busy} className={state.speed === s ? "sel" : ""} onClick={() => ctl(state.playback_status === "playing" ? "play" : "pause", s)}>{s}×</button>
        ))}
        <button onClick={() => restart(state.scenario.id, null)} disabled={busy}>↺ Reset</button>
      </div>
      <select aria-label="Scenario" value={loadingScenario ?? sid} disabled={busy} onChange={(e) => restart(e.target.value, null)}>
        {!scenarios.some((s: any) => s.id === sid) && <option value={sid}>{state.scenario.label}</option>}
        {scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      {busy && <p className="muted small scenario-message" role="status">{loadingScenario === FORECAST_SCENARIO ? "Loading NWS forecast…" : "Starting scenario…"}</p>}
      {restartError && <p className="bad small scenario-message" role="alert">{restartError} <span className="muted">Still showing {state.scenario.label}.</span></p>}
      <p className="muted small">{state.scenario.description}</p>
      {sid === FORECAST_SCENARIO && <p className="muted small">Road snow starts at an assumed {state.scenario.initial_depth_in ?? 0} in. The simulation adds forecast snowfall from that point.</p>}
      {band && sid !== FORECAST_SCENARIO && <details>
        <summary>Steer the snowband (resets both policies together)</summary>
        <p className="muted small">Patches of light snow can fall outside the main band. Wobble shifts the band sideways.</p>
        {slider("rate_in_hr", "Peak rate", 0, 6, 0.5, " in/hr")}
        {slider("heading_deg", "Flow toward", 0, 355, 5, "°")}
        {slider("width_m", "Width", 400, 5000, 100, " m")}
        {slider("offset_m", "Start offset", -4000, 4000, 100, " m")}
        {slider("wobble_amp_m", "Wobble", 0, 4000, 100, " m")}
        <button className="primary" disabled={busy} onClick={() => restart(sid, band)}>Apply & restart both</button>
      </details>}
    </section>
  );
}

const ROWS: [string, string, "low" | "high", (v: any) => string][] = [
  ["critical_exposure_min", "Critical-segment exposure (min > threshold)", "low", (v) => v.toFixed(0)],
  ["critical_over_now", "Critical segments over threshold now", "low", (v) => String(v)],
  ["avg_critical_depth_in", "Avg critical depth (in)", "low", (v) => v.toFixed(2)],
  ["exposure_min", "All-segment exposure (min)", "low", (v) => v.toFixed(0)],
  ["distance_km", "Distance driven (km)", "low", (v) => v.toFixed(1)],
  ["deadhead_pct", "Deadhead (travel not plowing, %)", "low", (v) => v.toFixed(0)],
  ["services", "Completed service passes", "high", (v) => String(v)],
  ["reaccumulations", "Re-accumulations after service", "low", (v) => String(v)],
  ["crew_hours", "Active crew-hours", "low", (v) => v.toFixed(1)],
  ["inch_km_per_crew_hour", "Snow cleared per crew-hour (in·km)", "high", (v) => v.toFixed(1)],
];

function Metrics({ state }: any) {
  const f = state.policies.fixed.metrics, a = state.policies.adaptive.metrics;
  const thr = state.scenario.params.threshold_in;
  return (
    <section>
      <h3>Same storm, same fleet — measured</h3>
      <table className="metrics">
        <thead><tr><th /><th style={{ color: FIXED }}>Fixed</th><th style={{ color: ADAPT }}>Adaptive</th><th>Δ</th></tr></thead>
        <tbody>
          {ROWS.map(([k, label, dir, fmt]) => {
            const fv = f[k] ?? 0, av = a[k] ?? 0;
            const better = dir === "low" ? av < fv : av > fv;
            const same = av === fv;
            const delta = fv !== 0 ? `${av - fv > 0 ? "+" : ""}${(((av - fv) / Math.abs(fv)) * 100).toFixed(0)}%` : `${av - fv > 0 ? "+" : ""}${fmt(av - fv)}`;
            return (
              <tr key={k}>
                <td>{label}</td><td>{fmt(fv)}</td><td>{fmt(av)}</td>
                <td className={same ? "" : better ? "good" : "bad"}>{same ? "—" : delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Threshold {thr} in is illustrative, not a safety standard. Simulated results under the stated scenario assumptions; run {state.run_id} · v{state.scenario_version}.</p>
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  live_inference: "LIVE GEMINI", recorded_inference: "RECORDED GEMINI RESULT", synthetic_fixture: "SYNTHETIC FIXTURE",
};

function Camera({ state, frames, network, reloadFrames, selected, onSelect }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ny = state.integrations.ny511;
  const refresh511 = async () => {
    setRefreshing(true); setMsg(null);
    try { const r = await api("/api/cameras/refresh", {}); setMsg(`511NY: ${r.updated.length} camera(s) refreshed`); await reloadFrames(); }
    catch (e: any) { setMsg(e.message); }
    finally { setRefreshing(false); }
  };
  const ago = (ts: number | null) => ts ? `${Math.round((Date.now() / 1000 - ts) / 60)} min ago` : "never";
  return (
    <section>
      <h3>Road cameras (click 📹 on the map)</h3>
      <div className="row small" style={{ alignItems: "center" }}>
        <button onClick={refresh511} disabled={!ny.configured || refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh 511NY"}</button>
        <span className="muted">
          {ny.configured ? `auto every ${Math.round(ny.interval_s / 60)} min · last ${ago(ny.last_refresh)}${ny.last_error ? " · " + ny.last_error : ""}`
                         : "511NY key not configured — showing stored media"}
        </span>
      </div>
      {msg && <div className="small">{msg}</div>}
      <AddFrame network={network} onAdded={async (f: any) => { await reloadFrames(); onSelect(f.frame_id); }} />
      <div className="thumbs">
        {frames.map((f: any) => (
          <button key={f.frame_id} className={selected === f.frame_id ? "sel" : ""} onClick={() => onSelect(f.frame_id)}>
            {f.media_type === "video" ? "🎞" : "📷"} {f.title}<br />
            <span className="small muted">{f.media_type === "video" ? "video" : "image"} · {f.source}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function cameraStates(state: any, frames: any[]) {
  const out: Record<string, string> = {};
  const an: Record<string, any> = {};
  for (const x of state.camera?.analyses || []) an[x.frame_id] = x;
  for (const f of frames) {
    const x = an[f.frame_id];
    if (!x || x.status === "processing") { out[f.frame_id] = "processing"; continue; }
    if (x.status !== "done" || !x.result) { out[f.frame_id] = "failed"; continue; }
    if (x.reference_only) { out[f.frame_id] = "reference"; continue; }
    const d = state.camera?.decisions?.[`${f.frame_id}@${x.version}`];
    const kind = x.proposed_effect?.kind;
    out[f.frame_id] = d ? (d.decision === "approve" ? "approved" : "rejected") : kind && kind !== "none" ? "pending" : "clear";
  }
  return out;
}

const effectText = (eff: any) =>
  eff?.kind === "closure" ? "close segment → units detour" : eff?.kind === "slowdown" ? `speed ×${eff.factor} on segment` : "no change needed";

function Decision({ state, analysis, frame, network }: any) {
  const [msg, setMsg] = useState<string | null>(null);
  const d = state.camera?.decisions?.[`${frame.frame_id}@${analysis.version}`];
  const seg = network.segments.find((x: any) => x.segment_id === frame.segment_ids[0]);
  const decide = async (decision: string) => {
    setMsg(null);
    try { await api("/api/proposals/decide", { run_id: state.run_id, frame_id: frame.frame_id, version: analysis.version, decision }); }
    catch (e: any) { setMsg(e.message); }
  };
  if (analysis.reference_only) return <div className="small muted">Reference only for this forecast time.</div>;
  if (!analysis.proposed_effect || analysis.proposed_effect.kind === "none") return null;
  return (
    <div className="decision">
      <div className="small">Proposed: <b>{effectText(analysis.proposed_effect)}</b> on {seg?.name || seg?.highway} ({frame.segment_ids[0]})</div>
      {d ? (
        <div className={`small ${d.decision === "approve" ? "good" : "muted"}`}>
          {d.decision === "approve" ? `✔ Approved at ${fmtClock(d.sim_time_s)} — applied to both worlds` : `✖ Rejected at ${fmtClock(d.sim_time_s)}`}
        </div>
      ) : (
        <div className="row">
          <button className="approve" onClick={() => decide("approve")}>✔ Approve</button>
          <button className="reject" onClick={() => decide("reject")}>✖ Reject</button>
        </div>
      )}
      {msg && <div className="bad small">{msg}</div>}
    </div>
  );
}

function AnalysisView({ analysis }: any) {
  const ts = (x: string) => x.slice(0, 16).replace("T", " ") + " UTC";
  if (!analysis || analysis.status === "processing") return <div className="small muted">⏳ Gemini analyzing automatically…</div>;
  if (analysis.status === "failed") return <div className="bad small">{analysis.error}</div>;
  return (
    <div className="obs">
      <span className={`tag ${analysis.source_kind}`}>{KIND_LABEL[analysis.source_kind] || analysis.source_kind}</span>
      <span className="small muted">
        {analysis.model_id || ""}{analysis.recorded_at ? ` · recorded ${ts(analysis.recorded_at)}` : analysis.analyzed_at ? ` · analyzed ${ts(analysis.analyzed_at)}` : ""}
      </span>
      {analysis.note && <span className="small" style={{ color: "#fbbf24" }}>{analysis.note}</span>}
      <div>Surface <b>{analysis.result.surface_class}</b> · Visibility <b>{analysis.result.visibility_class}</b> · Obstruction <b>{String(analysis.result.obstruction_detected ?? "unknown")}</b></div>
      <div className="small muted">“{analysis.result.evidence_summary}”</div>
    </div>
  );
}

function Proposals({ state, frames, network, onOpen }: any) {
  const items = (state.camera?.analyses || [])
    .filter((a: any) => a.status === "done" && !a.reference_only && a.proposed_effect && a.proposed_effect.kind !== "none")
    .map((a: any) => ({ a, f: frames.find((f: any) => f.frame_id === a.frame_id) }))
    .filter((x: any) => x.f);
  if (!items.length) return null;
  const pending = items.filter((x: any) => !state.camera.decisions[`${x.f.frame_id}@${x.a.version}`]).length;
  return (
    <section className="proposals">
      <h3>Camera alerts — dispatcher decision {pending > 0 && <span className="pill">{pending} pending</span>}</h3>
      {items.map(({ a, f }: any) => (
        <div key={f.frame_id} className="proposal">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <b>📹 {f.title}</b>
            <button className="small" onClick={() => onOpen(f.frame_id)}>View</button>
          </div>
          <div className="small">
            <span className={`tag ${a.source_kind}`}>{KIND_LABEL[a.source_kind] || a.source_kind}</span>{" "}
            {a.result.obstruction_detected ? "Obstruction detected" : `Visibility ${a.result.visibility_class}`} — “{a.result.evidence_summary}”
          </div>
          <Decision state={state} analysis={a} frame={f} network={network} />
        </div>
      ))}
    </section>
  );
}

function CameraViewer({ state, frame, network, onClose }: any) {
  const analysis = (state.camera?.analyses || []).find((a: any) => a.frame_id === frame.frame_id);
  const segName = (sid: string) => {
    const s = network.segments.find((x: any) => x.segment_id === sid);
    return s ? `${s.name || s.highway} (${sid})` : sid;
  };
  const rerun = () => api(`/api/analyses/${frame.frame_id}/rerun`, {}).catch(() => {});
  return (
    <div className="viewer">
      <div className="viewer-head">
        <b>📹 {frame.title}</b>
        <button onClick={onClose}>✕</button>
      </div>
      {frame.media_type === "video"
        ? <video key={frame.media_url} src={frame.media_url} autoPlay muted loop playsInline controls />
        : <img src={frame.media_url} alt={frame.title} />}
      <div className="small muted">
        {frame.source_url ? <a href={frame.source_url} target="_blank" rel="noreferrer">{frame.source}</a> : frame.source}
        {frame.license_note ? ` · ${frame.license_note}` : ""}
      </div>
      <div className="small">
        <b>Captured:</b> {frame.observed_at || "unknown"}{frame.observed_at_precision ? ` (${frame.observed_at_precision})` : ""} · <b>Archive footage</b>, not a live feed
      </div>
      <div className="small muted">
        {frame.relation === "adjacent" ? "Adjacent camera (visibility only) near" : "Mapped to"} {frame.segment_ids.map(segName).join(", ")}{frame.mapping_note ? ` — ${frame.mapping_note}` : ""}
      </div>
      {frame.weather_context?.length > 0 && (
        <details className="small context">
          <summary>🌨 Historical weather context for {frame.observed_at.slice(0, 10)} (not road depth)</summary>
          <ul className="wx">
            {frame.weather_context.map((r: any, i: number) => (
              <li key={i}><b>{r.value_in} in</b> {r.kind === "snow_depth" ? "snow depth" : "daily snowfall"} · {r.station} · {r.when} · <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> <span className="muted">({r.use})</span></li>
            ))}
          </ul>
          <div className="muted">{frame.weather_note}</div>
        </details>
      )}
      <AnalysisView analysis={analysis} />
      {analysis?.status === "done" && <Decision state={state} analysis={analysis} frame={frame} network={network} />}
      {analysis?.status === "done" && !analysis.reference_only && analysis.proposed_effect?.kind === "none" && <div className="small muted">No action proposed for this camera.</div>}
      <div><button className="small" onClick={rerun} disabled={!analysis || analysis.status === "processing"}>↻ Re-analyze</button></div>
    </div>
  );
}

const SOURCES = ["511NY capture (NYSDOT)", "NITTEC capture", "BTPM Live Roof Cam", "Team photo", "Other"];

function AddFrame({ network, onAdded }: any) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [observed, setObserved] = useState("");
  const [segment, setSegment] = useState("");
  const [relation, setRelation] = useState("on_segment");
  const [msg, setMsg] = useState<string | null>(null);
  const segs = [...network.segments].sort((a: any, b: any) => (a.name || a.highway).localeCompare(b.name || b.highway) || a.segment_id.localeCompare(b.segment_id));
  const submit = async () => {
    if (!file || !title || !segment) { setMsg("Image, title and segment are required"); return; }
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title); fd.append("source", source);
    fd.append("segment_id", segment); fd.append("relation", relation);
    if (observed) fd.append("observed_at", new Date(observed).toISOString());
    const r = await fetch("/api/frames/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.detail || "Upload failed"); return; }
    setMsg(null); setOpen(false); setFile(null); setTitle("");
    onAdded(j);
  };
  if (!open) return <button className="small" onClick={() => setOpen(true)} style={{ marginBottom: 6 }}>＋ Add camera image/video (any source)</button>;
  return (
    <div className="addframe">
      <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <input placeholder="Title (e.g. NY 33 at Grider St)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
      <label className="small muted">Capture time (local) <input type="datetime-local" value={observed} onChange={(e) => setObserved(e.target.value)} /></label>
      <select value={segment} onChange={(e) => setSegment(e.target.value)}>
        <option value="">Mapped segment…</option>
        {segs.map((s: any) => <option key={s.segment_id} value={s.segment_id}>{s.name || s.highway} ({s.segment_id}){s.critical ? " · critical" : ""}</option>)}
      </select>
      <select value={relation} onChange={(e) => setRelation(e.target.value)}>
        <option value="on_segment">Camera views this segment directly</option>
        <option value="adjacent">Adjacent camera (e.g. highway) — visibility only</option>
      </select>
      <div className="row"><button className="primary" onClick={submit}>Upload</button><button onClick={() => setOpen(false)}>Cancel</button></div>
      {msg && <div className="bad small">{msg}</div>}
    </div>
  );
}

function Log({ state }: any) {
  const [tab, setTab] = useState<"adaptive" | "fixed">("adaptive");
  const log = state.policies[tab].log;
  return (
    <section>
      <h3>Dispatch decisions</h3>
      <Radio state={state} />
      {state.alerts.length > 0 && (
        <div className="alerts">{state.alerts.slice(0, 3).map((a: any) => <div key={a.alert_id}>📻 {fmtClock(a.sim_time_s)} {a.text}</div>)}</div>
      )}
      <div className="row">
        <button className={tab === "adaptive" ? "sel" : ""} onClick={() => setTab("adaptive")}>Adaptive</button>
        <button className={tab === "fixed" ? "sel" : ""} onClick={() => setTab("fixed")}>Fixed</button>
      </div>
      <div className="vehicles">
        {state.policies[tab].vehicles.map((v: any) => (
          <div key={v.vehicle_id} className="small">
            <b>{v.vehicle_id}</b> {v.label} · {v.status}{v.explanation?.target_name ? ` → ${v.explanation.target_name}` : ""}
            <div className="muted">{v.explanation?.reason}</div>
          </div>
        ))}
      </div>
      <ul className="log">
        {log.slice(0, 12).map((e: any, i: number) => (
          <li key={i} className={e.kind}>
            <span className="muted">{fmtClock(e.t)}</span> <b>{e.vehicle_id}</b> {e.kind === "assign" ? `→ ${e.target_name}` : e.kind === "service" ? `cleared ${e.target_name}` : e.kind}
            <span className="muted"> — {e.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Radio({ state }: any) {
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const played = useRef<Set<string>>(new Set());
  const queue = useRef<any[]>([]);
  const busy = useRef(false);

  const speakBrowser = (text: string) => new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.onend = () => resolve(); u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const a = queue.current.shift();
      try {
        const r = await fetch(`/api/voice/${a.alert_id}`);
        if (r.ok && (r.headers.get("content-type") || "").includes("audio")) {
          const url = URL.createObjectURL(await r.blob());
          setMode("ElevenLabs");
          await new Promise<void>((resolve) => { const au = new Audio(url); au.onended = () => resolve(); au.onerror = () => resolve(); au.play().catch(() => resolve()); });
          URL.revokeObjectURL(url);
        } else {
          setMode("browser TTS fallback");
          await speakBrowser(a.text);
        }
      } catch { setMode("browser TTS fallback"); await speakBrowser(a.text); }
    }
    busy.current = false;
  };
  useEffect(() => {
    if (!on) { for (const a of state.alerts) played.current.add(a.alert_id); return; }
    const fresh = [...state.alerts].reverse().filter((a: any) => !played.current.has(a.alert_id));
    for (const a of fresh) { played.current.add(a.alert_id); queue.current.push(a); }
    if (fresh.length) pump();
  }, [state.alerts, on]);
  return (
    <div className="row small" style={{ alignItems: "center" }}>
      <button className={on ? "sel" : ""} onClick={() => setOn(!on)}>{on ? "🔊 Radio on" : "🔈 Radio off"}</button>
      <span className="muted">{on ? `new dispatch alerts are spoken${mode ? ` · ${mode}` : ""}` : "click to hear dispatch alerts"}</span>
    </div>
  );
}

function History({ state, onShow, showing }: any) {
  const [cps, setCps] = useState<any[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [snap, setSnap] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const tiger = state.integrations.tiger;
  useEffect(() => { setCps(null); setSnap(null); setMsg(null); }, [state.run_id]);
  const load = async () => {
    setMsg(null);
    try { const c = await api(`/api/runs/${state.run_id}/checkpoints`); setCps(c); setIdx(Math.max(0, c.length - 1)); if (!c.length) setMsg("No checkpoints stored yet (one every 15 simulated minutes)."); }
    catch (e: any) { setMsg(e.message); }
  };
  const fetchCp = async (i: number) => {
    setIdx(i);
    try { setSnap(await api(`/api/runs/${state.run_id}/checkpoints/${cps[i].tick}`)); } catch (e: any) { setMsg(e.message); }
  };
  const f = snap?.policies?.fixed?.metrics, a = snap?.policies?.adaptive?.metrics;
  return (
    <section>
      <h3>History (Tiger Data)</h3>
      {!tiger.available ? <div className="small muted">Database not connected{tiger.last_error ? ` (${tiger.last_error})` : ""}.</div> : (
        <>
          <div className="row small" style={{ alignItems: "center" }}>
            <button onClick={load}>Load stored checkpoints</button>
            <span className="muted">{tiger.rows} rows written this session</span>
          </div>
          {cps && cps.length > 0 && (
            <>
              <label className="slider">
                <span>Checkpoint</span>
                <input type="range" min={0} max={cps.length - 1} value={idx} onChange={(e) => fetchCp(Number(e.target.value))} />
                <b>{fmtClock(cps[idx].sim_time_s)}</b>
              </label>
              {!snap && <button className="small" onClick={() => fetchCp(idx)}>Read checkpoint</button>}
            </>
          )}
          {snap && f && a && (
            <div className="small">
              Stored at {fmtClock(snap.sim_time_s)}: critical exposure fixed <b>{f.critical_exposure_min}</b> vs adaptive <b>{a.critical_exposure_min}</b> min ·
              distance {f.distance_km} vs {a.distance_km} km
              <div className="row" style={{ marginTop: 4 }}>
                {showing ? <button onClick={() => onShow(null)}>Back to live</button> : <button className="primary" onClick={() => onShow(snap)}>Show this checkpoint on the maps</button>}
              </div>
            </div>
          )}
          {msg && <div className="small muted">{msg}</div>}
        </>
      )}
    </section>
  );
}
