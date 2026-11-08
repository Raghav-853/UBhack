import { useEffect, useRef, useState } from "react";
import MapPane, { DEPTH_STOPS, SNOWFALL_STOPS } from "./MapPane";
import { Icon } from "./icons";
import { cameraDecisionKey, playbackAnalysis } from "./cameraAnalysis";
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

const fmtCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

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
  const selectCamera = (id: string) => setCam(id);

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
  const selectedCam = cam;
  const selectedFrame = frames.find((f: any) => f.frame_id === selectedCam);
  return (
    <div className="app">
      <Header state={state} err={err} />
      <div className="body">
        <div className={isForecast ? "maps with-forecast" : "maps"}>
          {isForecast && <ForecastStatus weather={weather} shown={showSnowfall} />}
          <MapPane title={`BASELINE: ${BASELINE_LABEL[state.scenario.params.baseline_policy] || "fixed"}`} accent={FIXED} network={network} world={P.fixed}
                   snowfall={snowfall} snowfallField={snowfallField} env={snapshot.env} syncKey="fixed" maps={maps}
                   frames={frames} selectedCam={selectedCam} onCameraClick={selectCamera} camState={camState} />
          <MapPane title="ADAPTIVE (SnowTwin)" accent={ADAPT} network={network} world={P.adaptive}
                   snowfall={snowfall} snowfallField={snowfallField} env={snapshot.env} syncKey="adaptive" maps={maps}
                   frames={frames} selectedCam={selectedCam} onCameraClick={selectCamera} camState={camState} />
          <Legend rate={rate} forecast={isForecast}
                  headingDeg={snowfallField ? snapshot.scenario.band?.heading_deg : undefined}
                  shown={showSnowfall} onToggle={setShowSnowfall} />
          {view && (
            <div className="histbanner">
              <Icon name="db" /> Stored checkpoint {fmtClock(view.sim_time_s)} <span className="muted" title={`Read-only, from Tiger Data · run ${view.run_id}`}>read-only</span>
              <button onClick={() => setHist(null)}>Back to live</button>
            </div>
          )}
          {selectedFrame && <CameraViewer key={selectedFrame.frame_id} state={state} network={network}
            frame={selectedFrame} onClose={() => setCam(null)} />}
        </div>
        <aside className="side">
          <Proposals state={state} frames={frames} network={network} onOpen={selectCamera} />
          <Controls state={state} scenarios={scenarios} network={network} />
          <Metrics state={state} />
          <Camera state={state} frames={frames} network={network} reloadFrames={reloadFrames} selected={selectedCam} onSelect={selectCamera} />
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
  // Short label on the badge; full status in the hover tooltip.
  const badge = (label: string, level: "on" | "off" | "err", short: string, detail: string) => (
    <span className={`badge ${level}`} title={`${label}: ${detail}`}>
      <i className="dot" />{label}{short && <span className="muted"> {short}</span>}
    </span>
  );
  const hasSaved = (state.camera?.analyses || []).some((x: any) => x.source_kind === "recorded_inference");
  const g = I.gemini, t = I.tiger, v = I.voice;
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
        {badge("Gemini", g.verified ? "on" : g.last_error ? "err" : "off",
          g.verified ? "" : g.configured ? (g.last_error ? "error" : hasSaved ? "saved" : "") : "off",
          g.verified ? `verified (${g.last_model})` : g.configured ? (g.last_error ? `error ${g.last_error}` : hasSaved ? "showing saved results; unchanged videos are analyzed once" : "configured, not yet verified") : "no API key")}
        {badge("Tiger", t.available ? "on" : t.last_error ? "err" : "off",
          t.available ? fmtCount(t.rows) : t.configured ? (t.last_error ? "error" : "…") : "off",
          t.available ? `${t.rows} rows written` : t.configured ? (t.last_error || "connecting") : "DATABASE_URL not set")}
        {badge("Voice", v.verified ? "on" : v.last_error ? "err" : "off",
          v.verified ? "" : v.configured ? (v.last_error ? "error" : "") : "browser",
          v.verified ? "ElevenLabs verified" : v.configured ? (v.last_error ? `error ${v.last_error}` : "ElevenLabs configured, not yet verified") : "no key; using browser speech")}
        {err && <span className="badge err"><i className="dot" />{err}</span>}
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
    ? "No snow forecast" : `Up to ${Number(weather.max_rate_in_hr.toFixed(2))} in/h`
    : "Forecast unavailable";
  return (
    <div className="forecast-strip"
         title={weather ? `${weather.areas.features.length} NWS grid cells (dashed lines)${shown ? "" : "; layer hidden"}` : undefined}>
      <b>NWS</b>
      <strong role="status">{status}</strong>
      {weather && <span className="muted">for {forecastTimestamp(weather.valid_at)} · issued {forecastTimestamp(weather.issued_at)}</span>}
    </div>
  );
}

function Legend({ rate, forecast, headingDeg, shown, onToggle }: {
  rate?: number; forecast: boolean; headingDeg?: number;
  shown: boolean; onToggle: (shown: boolean) => void;
}) {
  const rateLabel = Number.isFinite(rate) ? rate === 0
    ? "no snow"
    : `max ${rate < 0.01 ? "<0.01" : Number(rate.toFixed(2))}`
    : "n/a";
  return (
    <div className="legend" role="group" aria-label="Map legend">
      <div className="legend-row">
        <b title="Estimated snow depth on the road, inches">Road depth (in)</b>
        {DEPTH_STOPS.map(([v, c]) => <span key={v} className="sw"><i style={{ background: c }} />{v}</span>)}
        <span className="sep" />
        <span className="sw" title="Critical corridor (thicker line)"><i className="thick" /> critical</span>
        <span className="sw"><i className="closed" /> closed</span>
        <span className="sw"><i className="vdot heavy" /> heavy</span>
        <span className="sw"><i className="vdot compact" /> compact</span>
        <span className="sw" title="Snow Plan facilities: H hospital, P police, F fire">
          <i className="fac" style={{ background: "#db2777" }} /><i className="fac" style={{ background: "#2563eb" }} /><i className="fac" style={{ background: "#ea580c" }} /> facilities
        </span>
      </div>
      <div className="legend-row snowfall-legend">
        <label className="sw"><input type="checkbox" checked={shown} onChange={(e) => onToggle(e.target.checked)} /> <b>Snowfall (in/h)</b></label>
        {SNOWFALL_STOPS.map(([v, color, opacity], i) => (
          <span key={v} className="sw">
            <i className="snowfall-swatch" style={{ background: color, opacity }} />
            {v}{i === SNOWFALL_STOPS.length - 1 ? "+" : ""}
          </span>
        ))}
        {!forecast && <span className="sw" title="Snow edge contour, 0.25 in/h"><i className="contour-edge" /> edge</span>}
        {!forecast && <span className="sw" title="Heavy core contour, 2 in/h"><i className="contour-core" /> core</span>}
        {(!forecast || (rate ?? 0) > 0) && <span className="snowfall-rate">{rateLabel}</span>}
        {headingDeg !== undefined && <span title={`Synthetic band flowing toward ${Math.round(headingDeg)}°`}>→ {COMPASS_POINTS[Math.round(headingDeg / 22.5) % 16]}</span>}
      </div>
    </div>
  );
}

function Controls({ state, scenarios, network }: any) {
  const [draft, setDraft] = useState<{ runId: string; band: any } | null>(null);
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [restartError, setRestartError] = useState<string | null>(null);
  const sid = state.scenario.id;
  const band = draft?.runId === state.run_id ? draft.band : state.scenario.band;
  const busy = loadingScenario !== null;

  const restart = async (scenarioId: string, b: any, overrides: any = null) => {
    setLoadingScenario(scenarioId);
    setRestartError(null);
    try { await api("/api/scenario", { scenario_id: scenarioId, band: b, autoplay: true, overrides }); }
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
      <h3>Playback</h3>
      <div className="row">
        {state.playback_status === "playing"
          ? <button disabled={busy} onClick={() => ctl("pause")}><Icon name="pause" /> Pause</button>
          : <button className="primary" disabled={busy} onClick={() => ctl("play")}><Icon name="play" /> Play</button>}
        {[1, 2, 4, 8].map((s) => (
          <button key={s} disabled={busy} className={state.speed === s ? "sel" : ""} onClick={() => ctl(state.playback_status === "playing" ? "play" : "pause", s)}>{s}×</button>
        ))}
        <button onClick={() => restart(state.scenario.id, sid === FORECAST_SCENARIO ? null : state.scenario.band, currentOverrides(state))} disabled={busy} title="Restart both policies with the same inputs"><Icon name="reset" /> Reset</button>
      </div>
      <select aria-label="Scenario" value={loadingScenario ?? sid} disabled={busy} onChange={(e) => restart(e.target.value, null)}
              title={state.scenario.description}>
        {!scenarios.some((s: any) => s.id === sid) && <option value={sid}>{state.scenario.label}</option>}
        {scenarios.map((s: any) => <option key={s.id} value={s.id} title={s.description}>{s.label}</option>)}
      </select>
      {busy && <p className="muted small scenario-message" role="status">{loadingScenario === FORECAST_SCENARIO ? "Loading NWS forecast…" : "Starting…"}</p>}
      {restartError && <p className="bad small scenario-message" role="alert" title={`Still showing ${state.scenario.label}`}>{restartError}</p>}
      <p className="muted small clamp1" title={sid === FORECAST_SCENARIO
        ? `${state.scenario.description} Road snow starts at an assumed ${state.scenario.initial_depth_in ?? 0} in.`
        : state.scenario.description}>{state.scenario.description}</p>
      {band && sid !== FORECAST_SCENARIO && <details>
        <summary title="Restarts both policies with the same storm. Wobble shifts the band sideways; light snow can fall outside it.">Steer snowband</summary>
        {slider("rate_in_hr", "Peak rate", 0, 6, 0.5, " in/hr")}
        {slider("heading_deg", "Flow toward", 0, 355, 5, "°")}
        {slider("width_m", "Width", 400, 5000, 100, " m")}
        {slider("offset_m", "Start offset", -4000, 4000, 100, " m")}
        {slider("wobble_amp_m", "Wobble", 0, 4000, 100, " m")}
        <button className="primary" disabled={busy} onClick={() => restart(sid, band, currentOverrides(state))}>Apply & restart</button>
      </details>}
      <Experiment state={state} network={network} busy={busy}
                  onApply={(ov: any) => restart(sid, sid === FORECAST_SCENARIO ? null : band, ov)} />
    </section>
  );
}

// [key, short label, tooltip, lower/higher is better, format, shown by default]
const ROWS: [string, string, string, "low" | "high", (v: any) => string, boolean][] = [
  ["critical_exposure_min", "Critical exposure (min)", "Minutes critical segments spent above the depth threshold", "low", (v) => v.toFixed(0), true],
  ["avg_critical_depth_in", "Critical depth (in)", "Average snow depth on critical segments", "low", (v) => v.toFixed(2), true],
  ["distance_km", "Distance (km)", "Total distance driven", "low", (v) => v.toFixed(1), true],
  ["inch_km_per_crew_hour", "Cleared / crew-hr", "Snow cleared per active crew-hour (in·km)", "high", (v) => v.toFixed(1), true],
  ["critical_over_now", "Critical over now", "Critical segments above the threshold right now", "low", (v) => String(v), false],
  ["exposure_min", "All exposure (min)", "Minutes all segments spent above the threshold", "low", (v) => v.toFixed(0), false],
  ["deadhead_pct", "Deadhead (%)", "Share of travel spent not plowing", "low", (v) => v.toFixed(0), false],
  ["services", "Service passes", "Completed plowing passes", "high", (v) => String(v), false],
  ["reaccumulations", "Re-accumulations", "Segments that filled back in after service", "low", (v) => String(v), false],
  ["crew_hours", "Crew-hours", "Active crew-hours", "low", (v) => v.toFixed(1), false],
];

function Metrics({ state }: any) {
  const [all, setAll] = useState(false);
  const f = state.policies.fixed.metrics, a = state.policies.adaptive.metrics;
  const thr = state.scenario.params.threshold_in;
  return (
    <section>
      <h3 title="Same storm, same fleet, both policies measured side by side">Results</h3>
      <table className="metrics">
        <thead><tr><th /><th style={{ color: FIXED }}>Baseline</th><th style={{ color: ADAPT }}>Adaptive</th><th>Δ</th></tr></thead>
        <tbody>
          {ROWS.filter((r) => all || r[5]).map(([k, label, tip, dir, fmt]) => {
            const fv = f[k] ?? 0, av = a[k] ?? 0;
            const better = dir === "low" ? av < fv : av > fv;
            const same = av === fv;
            const delta = fv !== 0 ? `${av - fv > 0 ? "+" : ""}${(((av - fv) / Math.abs(fv)) * 100).toFixed(0)}%` : `${av - fv > 0 ? "+" : ""}${fmt(av - fv)}`;
            return (
              <tr key={k}>
                <td title={tip}>{label}</td><td>{fmt(fv)}</td><td>{fmt(av)}</td>
                <td className={same ? "" : better ? "good" : "bad"}>{same ? "—" : delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row small between">
        <button className="link" onClick={() => setAll(!all)}>{all ? "Fewer metrics" : `More metrics (${ROWS.length - ROWS.filter((r) => r[5]).length})`}</button>
        <span className="muted" title={`Simulated results. The ${thr} in threshold is illustrative, not a safety standard. Run ${state.run_id} · v${state.scenario_version}`}>
          Simulated · threshold {thr} in ⓘ
        </span>
      </div>
    </section>
  );
}

// Short tag text plus a tooltip. "Fresh" means a new Gemini call, not a live camera feed.
const KIND_LABEL: Record<string, [string, string]> = {
  live_inference: ["GEMINI · FRESH", "Fresh Gemini analysis made this session (the footage itself may be archived)"],
  recorded_inference: ["GEMINI · SAVED", "Saved result from an earlier genuine Gemini call on this same media"],
  synthetic_fixture: ["SYNTHETIC", "Synthetic fixture, not a model output"],
};
const SourceTag = ({ kind }: { kind: string }) => (
  <span className={`tag ${kind}`} title={KIND_LABEL[kind]?.[1]}>{KIND_LABEL[kind]?.[0] || kind}</span>
);

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
  const nyTip = ny.configured
    ? `511NY auto-refresh every ${Math.round(ny.interval_s / 60)} min · last ${ago(ny.last_refresh)}${ny.last_error ? " · " + ny.last_error : ""}`
    : "511NY key not configured; showing stored media";
  return (
    <section>
      <h3 title="Or click a camera marker on the map">Cameras</h3>
      <div className="thumbs">
        {frames.map((f: any) => <button key={f.frame_id} className={selected === f.frame_id ? "sel" : ""}
          onClick={() => onSelect(f.frame_id)}><Icon name={f.media_type === "video" ? "video" : "image"} /> {f.title}</button>)}
      </div>
      <details className="small"><summary>Camera sources & uploads</summary>
      <div className="row small" style={{ alignItems: "center", marginTop: 6 }}>
        <AddFrame network={network} onAdded={async (f: any) => { await reloadFrames(); onSelect(f.frame_id); }} />
        <button onClick={refresh511} disabled={!ny.configured || refreshing} title={nyTip}>{refreshing ? "Refreshing…" : "↻ 511NY"}</button>
        {ny.last_error && <span className="bad">511NY error</span>}
      </div>
      {msg && <div className="small">{msg}</div>}
      </details>
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
    const d = state.camera?.decisions?.[cameraDecisionKey(f, x)];
    const kind = x.proposed_effect?.kind;
    out[f.frame_id] = d ? (d.decision === "approve" ? "approved" : "rejected") : kind && kind !== "none" ? "pending" : "clear";
  }
  return out;
}

const effectText = (eff: any) =>
  eff?.kind === "closure" ? "Close road" : eff?.kind === "slowdown" ? `Slow to ×${eff.factor}` : "No change";
const effectTip = (eff: any) =>
  eff?.kind === "closure" ? "Close the segment; units detour around it" : eff?.kind === "slowdown" ? `Units drive this segment at ${eff.factor}× speed` : "";

function Decision({ state, analysis, frame, network }: any) {
  const [msg, setMsg] = useState<string | null>(null);
  const d = state.camera?.decisions?.[cameraDecisionKey(frame, analysis)];
  const seg = network.segments.find((x: any) => x.segment_id === frame.segment_ids[0]);
  const decide = async (decision: string) => {
    setMsg(null);
    try { await api("/api/proposals/decide", { run_id: state.run_id, frame_id: frame.frame_id, version: analysis.version,
      decision, sample_offset_s: analysis.sample_offset_s }); }
    catch (e: any) { setMsg(e.message); }
  };
  if (analysis.reference_only) return <div className="small muted" title="Archived footage can't be applied to this forecast time">Reference only</div>;
  if (!analysis.proposed_effect || analysis.proposed_effect.kind === "none") return null;
  const eff = analysis.proposed_effect;
  return (
    <div className="decision">
      <div className="row center">
        <span className="small grow" title={`${effectTip(eff)} · ${seg?.name || seg?.highway} (${frame.segment_ids[0]})`}>
          <b>{effectText(eff)}</b> <span className="muted">· {seg?.name || seg?.highway}</span>
        </span>
        {d ? (
          <span className={`small ${d.decision === "approve" ? "good" : "muted"}`}
                title={d.decision === "approve" ? "Applied to both policies at the same tick" : undefined}>
            {d.decision === "approve" ? "✔ Approved" : "✖ Rejected"} {fmtClock(d.sim_time_s)}
          </span>
        ) : <>
          <button className="approve" onClick={() => decide("approve")} title="Apply to both policies">✔ Approve</button>
          <button className="reject" onClick={() => decide("reject")}>✖</button>
        </>}
      </div>
      {msg && <div className="bad small">{msg}</div>}
    </div>
  );
}

function AnalysisView({ analysis }: any) {
  if (!analysis || analysis.status === "processing") return <div className="small muted" role="status">Analyzing…</div>;
  if (analysis.status !== "done" || !analysis.result) return <div className="small warn-text" role="status"><Icon name="alert" /> {analysis.error || "Analysis unavailable"}</div>;
  const r = analysis.result;
  const depthKnown = typeof r.snow_depth_cm === "number" && Number.isFinite(r.snow_depth_cm);
  const confidenceKnown = depthKnown && typeof r.depth_confidence_pct === "number" && Number.isFinite(r.depth_confidence_pct);
  const visibility = ["good", "reduced", "poor"].includes(r.visibility_class) ? r.visibility_class : "unknown";
  const obstruction = r.obstruction_detected === true ? "Detected" : r.obstruction_detected === false ? "Not detected" : "Unknown";
  return (
    <div className="camera-analysis-cards">
      <div className="row center between tight">
        <SourceTag kind={analysis.source_kind} />
        <details className="analysis-info">
          <summary aria-label="Show Gemini explanation" title="Gemini explanation"><Icon name="info" size={19} /></summary>
          <div className="analysis-explanation">
            <b>Gemini’s explanation</b><p>{r.evidence_summary || "No explanation returned."}</p>
            <div className="small muted">{analysis.model_id} · {analysis.recorded_at ? `Saved ${analysis.recorded_at}` : "Fresh inference"}</div>
          </div>
        </details>
      </div>
      {analysis.note && <span className="small warn-text">{analysis.note}</span>}
      <div className="analysis-card snow-card">
        <div className="analysis-card-label"><Icon name="snow" size={17} /> Snow · AI estimate</div>
        <div className="snow-depth-value">{depthKnown ? <>{r.snow_depth_cm.toFixed(1)}<span> cm</span></> : <span className="unavailable-value">No saved estimate</span>}</div>
        <div className="confidence-line">{confidenceKnown ? <><b>{Math.round(r.depth_confidence_pct)}%</b> self-reported confidence</> : "Not included in saved analysis"}</div>
        {confidenceKnown && <div className="confidence-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, r.depth_confidence_pct))}%` }} /></div>}
      </div>
      <div className="analysis-card-pair">
        <div className={`analysis-card status-${visibility}`}><div className="analysis-card-label">Visibility</div><strong>{visibility}</strong><span className="status-indicator" aria-hidden="true" /></div>
        <div className={`analysis-card status-${r.obstruction_detected === true ? "poor" : r.obstruction_detected === false ? "good" : "unknown"}`}>
          <div className="analysis-card-label">Obstruction</div><strong>{obstruction}</strong><span className="status-indicator" aria-hidden="true" />
        </div>
      </div>
      <p className="estimate-note">Uncalibrated visual estimate · not measured road depth.</p>
      {analysis.clip_summary_only && <p className="small warn-text">Saved clip summary only. Depth and timed samples were not included in this recording.</p>}
    </div>
  );
}

function Proposals({ state, frames, network, onOpen }: any) {
  const items = (state.camera?.analyses || [])
    .filter((a: any) => a.status === "done" && !a.reference_only && a.proposed_effect && a.proposed_effect.kind !== "none")
    .map((a: any) => ({ a, f: frames.find((f: any) => f.frame_id === a.frame_id) }))
    .filter((x: any) => x.f);
  if (!items.length) return null;
  const pending = items.filter((x: any) => !state.camera.decisions[cameraDecisionKey(x.f, x.a)]).length;
  return (
    <section className="proposals">
      <h3><Icon name="alert" /> Camera alerts {pending > 0 && <span className="pill">{pending} pending</span>}</h3>
      {items.map(({ a, f }: any) => (
        <div key={f.frame_id} className="proposal">
          <div className="row center between tight">
            <button className="link" onClick={() => onOpen(f.frame_id)} title="Open video and full Gemini result">
              <Icon name="video" /> {f.title}
            </button>
            <span className="small">
              {a.result.obstruction_detected ? <b className="bad">Obstruction</b> : <>Visibility <b>{a.result.visibility_class}</b></>}
              {" "}<SourceTag kind={a.source_kind} />
            </span>
          </div>
          <Decision state={state} analysis={a} frame={f} network={network} />
        </div>
      ))}
    </section>
  );
}

function CameraViewer({ state, frame, network, onClose }: any) {
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>();
  const [requestError, setRequestError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); closeAction.current(); } };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); if (previous?.isConnected) previous.focus(); };
  }, []);
  const original = (state.camera?.analyses || []).find((a: any) => a.frame_id === frame.frame_id);
  const analysis = frame.media_type === "video" ? playbackAnalysis(original, playbackTime, duration) : original;
  const segName = (sid: string) => {
    const s = network.segments.find((x: any) => x.segment_id === sid);
    return s ? `${s.name || s.highway} (${sid})` : sid;
  };
  const rerun = async () => {
    setRequestError(null);
    try { await api(`/api/analyses/${frame.frame_id}/rerun`, {}); }
    catch (e: any) { setRequestError(e.message); }
  };
  return (
    <div className={`viewer camera-popup ${analysisExpanded ? "analysis-expanded" : "analysis-collapsed"}`}
         role="dialog" aria-labelledby={`camera-title-${frame.frame_id}`}>
      <div className="viewer-head">
        <b id={`camera-title-${frame.frame_id}`}><Icon name="video" /> {frame.title}</b>
        <button ref={closeButton} className="icon-btn" onClick={onClose} aria-label="Close camera viewer"><Icon name="x" /></button>
      </div>
      <div className="camera-popup-body">
        <aside className="popup-analysis" aria-label="Gemini analysis">
          <div className="popup-analysis-head">
            {analysisExpanded && <div><span className="camera-eyebrow">GEMINI VISION</span><h2>Camera analysis</h2></div>}
            <button className="icon-btn camera-toggle" aria-expanded={analysisExpanded} aria-controls="popup-analysis-content"
              aria-label={analysisExpanded ? "Collapse camera analysis" : "Expand camera analysis"}
              onClick={() => setAnalysisExpanded(!analysisExpanded)}>
              {analysisExpanded ? "‹" : <Icon name="camera" size={20} />}
            </button>
          </div>
          {analysisExpanded && <div id="popup-analysis-content" className="popup-analysis-content">
            <AnalysisView analysis={analysis} />
            {analysis?.status === "done" && <Decision state={state} analysis={analysis} frame={frame} network={network} />}
            {analysis?.status === "done" && !analysis.reference_only && analysis.proposed_effect?.kind === "none" && <div className="small muted">No action needed.</div>}
            <button className="small" onClick={rerun} disabled={!analysis || analysis.status === "processing"}
              title="Reuse saved analysis; only new media is sent to Gemini"><Icon name="refresh" /> {original?.status === "done" ? "Use saved analysis" : "Analyze once"}</button>
            {requestError && <p className="small bad" role="alert">{requestError}</p>}
          </div>}
        </aside>
        <div className="camera-media">
      {frame.media_type === "video"
        ? <video key={frame.media_url} src={frame.media_url} autoPlay muted loop playsInline controls
                 onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                 onSeeked={(e) => setPlaybackTime(e.currentTarget.currentTime)}
                 onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setPlaybackTime(0); }} />
        : <img src={frame.media_url} alt={frame.title} />}
      {frame.media_type === "video" && <div className="sample-clock"><span>PLAYBACK {playbackTime.toFixed(1)}s</span>
        <span>{analysis?.sample_offset_s !== undefined ? `FRAME ${analysis.sample_offset_s}s · 5s interval`
          : original?.status === "processing" ? "Analyzing…" : "No timed samples saved"}</span></div>}
      <div className="small">
        <span className="tag archive">ARCHIVE</span>{" "}
        Captured <b>{frame.observed_at ? frame.observed_at.slice(0, 10) : "unknown"}</b>
        {frame.observed_at_precision ? <span className="muted"> ({frame.observed_at_precision})</span> : ""}
        <span className="muted"> · {frame.relation === "adjacent" ? "near" : "on"} {frame.segment_ids.map(segName).join(", ")}</span>
      </div>
      <details className="small">
        <summary>Source, mapping & weather</summary>
        <div className="muted">
          {frame.source_url ? <a href={frame.source_url} target="_blank" rel="noreferrer">{frame.source}</a> : frame.source}
          {frame.license_note ? ` · ${frame.license_note}` : ""}
        </div>
        <div className="muted">Archive footage, not a live feed.{frame.relation === "adjacent" ? " Adjacent camera: visibility only." : ""}{frame.mapping_note ? ` ${frame.mapping_note}` : ""}</div>
        {frame.weather_context?.length > 0 && <div className="context">
          <b>Weather {frame.observed_at.slice(0, 10)}</b> <span className="muted">(context, not road depth)</span>
          <ul className="wx">
            {frame.weather_context.map((r: any, i: number) => (
              <li key={i}><b>{r.value_in} in</b> {r.kind === "snow_depth" ? "snow depth" : "daily snowfall"} · {r.station} · {r.when} · <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> <span className="muted">({r.use})</span></li>
            ))}
          </ul>
          <div className="muted">{frame.weather_note}</div>
        </div>}
      </details>
        </div>
      </div>
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
  if (!open) return <button className="small" onClick={() => setOpen(true)} title="Upload a camera image or video from any source"><Icon name="plus" /> Add media</button>;
  return (
    <div className="addframe" style={{ flexBasis: "100%" }}>
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
      <div className="row center between tight">
        <h3>Dispatch</h3>
        <Radio state={state} />
      </div>
      {state.alerts.length > 0 && (
        <div className="alerts" role="status">
          <span className="muted">{fmtClock(state.alerts[0].sim_time_s)}</span> {state.alerts[0].text}
          {state.alerts.length > 1 && (
            <details className="small"><summary>{state.alerts.length - 1} earlier</summary>
              {state.alerts.slice(1, 4).map((a: any) => <div key={a.alert_id}><span className="muted">{fmtClock(a.sim_time_s)}</span> {a.text}</div>)}
            </details>
          )}
        </div>
      )}
      <div className="seg" role="tablist" aria-label="Policy">
        <button role="tab" aria-selected={tab === "adaptive"} className={tab === "adaptive" ? "sel" : ""} onClick={() => setTab("adaptive")}>Adaptive</button>
        <button role="tab" aria-selected={tab === "fixed"} className={tab === "fixed" ? "sel" : ""} onClick={() => setTab("fixed")}>Baseline</button>
      </div>
      <div className="vehicles">
        {state.policies[tab].vehicles.map((v: any) => (
          <div key={v.vehicle_id} className="vrow" title={v.explanation?.reason}>
            <span className={`veh-chip ${v.type || ""}`} title={v.label}>{v.vehicle_id}</span>
            <span className={`status ${v.status}`}>{v.status}</span>
            <span className="grow ellipsis">{v.explanation?.target_name || <span className="muted">—</span>}</span>
          </div>
        ))}
      </div>
      <ul className="log">
        {log.slice(0, 8).map((e: any, i: number) => (
          <li key={i} className={e.kind} title={e.reason}>
            <span className="muted mono">{fmtClock(e.t)}</span> <b>{e.vehicle_id}</b>{" "}
            {e.kind === "assign" ? `→ ${e.target_name}` : e.kind === "service" ? `cleared ${e.target_name}` : e.kind}
            {e.reason && <div className="muted ellipsis">{e.reason}</div>}
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
    <button className={`small ${on ? "sel" : ""}`} onClick={() => setOn(!on)} aria-pressed={on}
            title={on ? `New dispatch alerts are spoken${mode ? ` (${mode})` : ""}` : "Speak new dispatch alerts aloud"}>
      <Icon name={on ? "volume" : "mute"} /> Radio {on ? "on" : "off"}
    </button>
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
    try { const c = await api(`/api/runs/${state.run_id}/checkpoints`); setCps(c); setIdx(Math.max(0, c.length - 1)); if (!c.length) setMsg("None yet. One is saved every 15 sim-minutes."); }
    catch (e: any) { setMsg(e.message); }
  };
  const fetchCp = async (i: number) => {
    setIdx(i);
    try { setSnap(await api(`/api/runs/${state.run_id}/checkpoints/${cps[i].tick}`)); } catch (e: any) { setMsg(e.message); }
  };
  const f = snap?.policies?.fixed?.metrics, a = snap?.policies?.adaptive?.metrics;
  return (
    <section>
      <h3 title="Checkpoints read back from Tiger Data"><Icon name="db" /> History</h3>
      {!tiger.available ? <div className="small muted">Database not connected{tiger.last_error ? ` (${tiger.last_error})` : ""}</div> : (
        <>
          <div className="row small center">
            <button onClick={load}>{cps ? "Reload" : "Load checkpoints"}</button>
            <span className="muted">{fmtCount(tiger.rows)} rows saved</span>
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
              <table className="metrics compact">
                <thead><tr><th>{fmtClock(snap.sim_time_s)}</th><th style={{ color: FIXED }}>Baseline</th><th style={{ color: ADAPT }}>Adaptive</th></tr></thead>
                <tbody>
                  <tr><td>Critical exposure (min)</td><td>{Number(f.critical_exposure_min).toFixed(0)}</td><td>{Number(a.critical_exposure_min).toFixed(0)}</td></tr>
                  <tr><td>Distance (km)</td><td>{Number(f.distance_km).toFixed(1)}</td><td>{Number(a.distance_km).toFixed(1)}</td></tr>
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 6 }}>
                {showing ? <button onClick={() => onShow(null)}>Back to live</button> : <button className="primary" onClick={() => onShow(snap)}>Show on maps</button>}
              </div>
            </div>
          )}
          {msg && <div className="small muted">{msg}</div>}
        </>
      )}
    </section>
  );
}

const BASELINE_LABEL: Record<string, string> = {
  city_priority: "CITY PUBLISHED PRIORITY",
  service_history: "SERVICE HISTORY (oldest first)",
  fixed_loop: "FIXED SERVICE LOOP",
};

function currentOverrides(state: any) {
  const p = state.scenario.params;
  return {
    fleet: state.scenario.fleet,
    baseline_policy: p.baseline_policy,
    params: { horizon_s: p.horizon_s, corridor_beta: p.corridor_beta, min_service_depth_in: p.min_service_depth_in, threshold_in: p.threshold_in },
  };
}

function Experiment({ state, network, busy, onApply }: any) {
  const base = currentOverrides(state);
  const [draft, setDraft] = useState<any>(null);
  const runRef = useRef(state.run_id);
  useEffect(() => { if (runRef.current !== state.run_id) { runRef.current = state.run_id; setDraft(null); } }, [state.run_id]);
  const v = draft || base;
  const starts = Object.keys(network.start_points || {});
  const heavy = v.fleet.filter((f: any) => f.type === "heavy_plow");
  const compact = v.fleet.filter((f: any) => f.type === "compact_blower");
  const setFleet = (nh: number, nc: number, hStart?: string, cStart?: string) => {
    const hs = hStart ?? heavy[0]?.start ?? starts[0], cs = cStart ?? compact[0]?.start ?? starts[1];
    const fleet = [
      ...Array.from({ length: nh }, (_, i) => ({ id: `P${i + 1}`, type: "heavy_plow", start: i === 0 ? hs : (heavy[i]?.start ?? hs) })),
      ...Array.from({ length: nc }, (_, i) => ({ id: `B${i + 1}`, type: "compact_blower", start: i === 0 ? cs : (compact[i]?.start ?? cs) })),
    ];
    setDraft({ ...v, fleet });
  };
  const setParam = (k: string, val: number) => setDraft({ ...v, params: { ...v.params, [k]: val } });
  const cp = network.city_priority || {};
  return (
    <details>
      <summary title="Both policies restart with identical inputs">Experiment settings</summary>
      <label className="slider wide"><span>Baseline</span>
        <select value={v.baseline_policy} disabled={busy} onChange={(e) => setDraft({ ...v, baseline_policy: e.target.value })}>
          <option value="city_priority">City published priority</option>
          <option value="service_history">Service history (oldest first)</option>
          <option value="fixed_loop">Fixed service loop</option>
        </select><b /></label>
      <label className="slider wide"><span>Heavy plows</span>
        <select value={heavy.length} disabled={busy} onChange={(e) => setFleet(Number(e.target.value), compact.length)}>
          {[1, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select><b /></label>
      <label className="slider wide"><span>Heavy start</span>
        <select value={heavy[0]?.start} disabled={busy} onChange={(e) => setFleet(heavy.length, compact.length, e.target.value)}>
          {starts.map((n) => <option key={n}>{n}</option>)}</select><b /></label>
      <label className="slider wide"><span>Compact units</span>
        <select value={compact.length} disabled={busy} onChange={(e) => setFleet(heavy.length, Number(e.target.value))}>
          {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select><b /></label>
      {compact.length > 0 && <label className="slider wide"><span>Compact start</span>
        <select value={compact[0]?.start} disabled={busy} onChange={(e) => setFleet(heavy.length, compact.length, undefined, e.target.value)}>
          {starts.map((n) => <option key={n}>{n}</option>)}</select><b /></label>}
      <label className="slider"><span>Look-ahead</span>
        <input type="range" min={0} max={7200} step={300} value={v.params.horizon_s} disabled={busy} onChange={(e) => setParam("horizon_s", Number(e.target.value))} />
        <b>{Math.round(v.params.horizon_s / 60)} min</b></label>
      <label className="slider"><span>Critical weight</span>
        <input type="range" min={0} max={6} step={0.5} value={v.params.corridor_beta} disabled={busy} onChange={(e) => setParam("corridor_beta", Number(e.target.value))} />
        <b>1+{v.params.corridor_beta}</b></label>
      <label className="slider"><span>Threshold</span>
        <input type="range" min={0.5} max={4} step={0.25} value={v.params.threshold_in} disabled={busy} onChange={(e) => setParam("threshold_in", Number(e.target.value))} />
        <b>{v.params.threshold_in} in</b></label>
      <div className="row"><button className="primary" disabled={busy} onClick={() => onApply(v)}>Apply & restart</button>
        {draft && <button disabled={busy} onClick={() => setDraft(null)}>Discard</button>}</div>
      <p className="muted small">
        Tiers from the City Snow Plan{cp.source_urls?.[0] && <> (<a href={cp.source_urls[0]} target="_blank" rel="noreferrer">source</a>)</>}.
        Start points are assumptions. Set look-ahead or weight to 0 to ablate.
      </p>
    </details>
  );
}
