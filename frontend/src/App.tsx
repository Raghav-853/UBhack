import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MapPane, { DEPTH_STOPS, SNOWFALL_STOPS, UNSAFE_SHARE_STOPS } from "./MapPane";
import { Icon } from "./icons";
import { cameraDecisionKey, playbackAnalysis } from "./cameraAnalysis";
import type { SnowfallAreas, SnowfallField } from "./MapPane";

const FIXED = "#e59934";
const ADAPT = "#38bdf8";
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

type OpsTab = "dispatch" | "cameras" | "storm" | "history";

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
  const [showSummary, setShowSummary] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [hist, setHist] = useState<any>(null);
  const [showSnowfall, setShowSnowfall] = useState(true);
  const [activeTab, setActiveTab] = useState<OpsTab>("dispatch");
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [restartError, setRestartError] = useState<string | null>(null);

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

  useEffect(() => {
    setShowSummary(true);
    setResultsOpen(false);
  }, [state?.run_id]);

  const reloadFrames = () => api("/api/frames").then(setFrames).catch(() => {});
  const selectCamera = (id: string) => setCam(id);

  const restartScenario = async (scenarioId: string, b: any, overrides: any = null) => {
    setLoadingScenario(scenarioId);
    setRestartError(null);
    try {
      await api("/api/scenario", { scenario_id: scenarioId, band: b, autoplay: true, overrides });
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : "Unable to start this scenario");
    } finally {
      setLoadingScenario(null);
    }
  };

  if (!network || !state) {
    return (
      <div className="loading">
        <div className="loading-box">
          <span className="loading-tag">SNOWTWIN // WNY</span>
          <div className="loading-msg">{err || "Initializing corridor telemetry & road network…"}</div>
        </div>
      </div>
    );
  }

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
  const finished = state.playback_status === "finished" && !view;
  const summaryOn = finished && showSummary;
  const endLayout = finished && resultsOpen;
  const selectedFrame = frames.find((f: any) => f.frame_id === selectedCam);
  const pendingCamCount = Object.values(camState).filter((s) => s === "pending").length;

  return (
    <div className="app">
      <Header
        state={state}
        scenarios={scenarios}
        err={err}
        busy={loadingScenario !== null}
        loadingScenario={loadingScenario}
        restartError={restartError}
        onRestart={restartScenario}
        onOpenStormTab={() => setActiveTab("storm")}
      />
      <div className="body">
        <div className="map-stage">
          {isForecast && <ForecastStatus weather={weather} shown={showSnowfall} />}
          {finished && (
            <div className="stage-banner summary-banner">
              <div className="stage-banner-left">
                <span className="banner-pill">RUN COMPLETE</span>
                <span>
                  {summaryOn
                    ? <>Map color shows share of storm each road spent above <b>{state.scenario.params.threshold_in} in</b></>
                    : <>Map color shows final road snow depth at <b>{fmtClock(state.sim_time_s)}</b></>}
                </span>
              </div>
              <div className="stage-banner-actions">
                <button className="small" onClick={() => setShowSummary(!showSummary)}>
                  {summaryOn ? "Show final road depth" : "Show storm exposure share"}
                </button>
                <button className="small primary" onClick={() => setResultsOpen(!resultsOpen)}>
                  {resultsOpen ? "Hide summary overlay" : "Full storm report"}
                </button>
              </div>
            </div>
          )}
          {view && (
            <div className="stage-banner hist-banner">
              <div className="stage-banner-left">
                <span className="banner-pill">CHECKPOINT REPLAY</span>
                <span>
                  <Icon name="db" /> Viewing stored Tiger Data snapshot at <b>{fmtClock(view.sim_time_s)}</b>
                  <span className="muted"> · read-only (run {view.run_id})</span>
                </span>
              </div>
              <div className="stage-banner-actions">
                <button className="small primary" onClick={() => setHist(null)}>Back to live</button>
              </div>
            </div>
          )}

          <div className="maps-grid">
            <MapPane
              tag="BASELINE"
              title={BASELINE_LABEL[state.scenario.params.baseline_policy] || "Fixed route"}
              accent={FIXED}
              network={network}
              world={P.fixed}
              snowfall={snowfall}
              snowfallField={snowfallField}
              env={snapshot.env}
              syncKey="fixed"
              maps={maps}
              summary={summaryOn}
              inset={null}
              frames={frames}
              selectedCam={selectedCam}
              onCameraClick={selectCamera}
              camState={camState}
            />
            <MapPane
              tag="SNOWTWIN"
              title="Adaptive look-ahead routing"
              accent={ADAPT}
              network={network}
              world={P.adaptive}
              snowfall={snowfall}
              snowfallField={snowfallField}
              env={snapshot.env}
              syncKey="adaptive"
              maps={maps}
              summary={summaryOn}
              inset={null}
              frames={frames}
              selectedCam={selectedCam}
              onCameraClick={selectCamera}
              camState={camState}
            />

            {endLayout && (
              <div className="results-popup" role="dialog" aria-label="Results">
                <div className="results-popup-head">
                  <span>POST-STORM EVALUATION REPORT</span>
                  <button className="icon-btn" onClick={() => setResultsOpen(false)} title="Close overlay">
                    <Icon name="x" />
                  </button>
                </div>
                <Metrics state={state} defaultAll highlight />
              </div>
            )}

            {selectedFrame && (
              <CameraViewer
                key={selectedFrame.frame_id}
                state={state}
                network={network}
                frame={selectedFrame}
                onClose={() => setCam(null)}
              />
            )}
          </div>

          <Legend
            rate={rate}
            forecast={isForecast}
            summary={summaryOn}
            threshold={state.scenario.params.threshold_in}
            headingDeg={snowfallField ? snapshot.scenario.band?.heading_deg : undefined}
            shown={showSnowfall}
            onToggle={setShowSnowfall}
          />
        </div>

        <aside className="side" aria-label="Operations Console">
          <Proposals state={state} frames={frames} network={network} onOpen={selectCamera} />
          <Metrics state={state} />

          <div className="console-tabs" role="tablist" aria-label="Operations Console Views">
            <button
              role="tab"
              aria-selected={activeTab === "dispatch"}
              className={`console-tab ${activeTab === "dispatch" ? "active" : ""}`}
              onClick={() => setActiveTab("dispatch")}
            >
              <Icon name="truck" size={13} />
              <span>Dispatch</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "cameras"}
              className={`console-tab ${activeTab === "cameras" ? "active" : ""}`}
              onClick={() => setActiveTab("cameras")}
            >
              <Icon name="video" size={13} />
              <span>Cameras</span>
              {pendingCamCount > 0 ? (
                <span className="tab-badge alert">{pendingCamCount}</span>
              ) : (
                <span className="tab-badge">{frames.length}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "storm"}
              className={`console-tab ${activeTab === "storm" ? "active" : ""}`}
              onClick={() => setActiveTab("storm")}
            >
              <Icon name="sliders" size={13} />
              <span>Steer & Lab</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "history"}
              className={`console-tab ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              <Icon name="db" size={13} />
              <span>History</span>
            </button>
          </div>

          <div className="console-tab-panel">
            {activeTab === "dispatch" && <Log state={state} />}
            {activeTab === "cameras" && (
              <Camera
                state={state}
                frames={frames}
                network={network}
                camState={camState}
                reloadFrames={reloadFrames}
                selected={selectedCam}
                onSelect={selectCamera}
              />
            )}
            {activeTab === "storm" && (
              <Controls
                state={state}
                scenarios={scenarios}
                network={network}
                busy={loadingScenario !== null}
                loadingScenario={loadingScenario}
                restartError={restartError}
                onRestart={restartScenario}
              />
            )}
            {activeTab === "history" && <History state={state} onShow={setHist} showing={view} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Header({ state, scenarios, err, busy, loadingScenario, restartError, onRestart, onOpenStormTab }: any) {
  const pct = Math.min(100, (100 * state.sim_time_s) / state.duration_s);
  const I = state.integrations;
  const sid = state.scenario.id;
  const ctl = (action: string, speed?: number) => api("/api/control", { action, speed_multiplier: speed });

  const badge = (label: string, level: "on" | "off" | "err", short: string, detail: string) => (
    <span className={`badge ${level}`} title={`${label}: ${detail}`}>
      <i className="dot" />
      <span className="badge-name">{label}</span>
      {short && <span className="badge-meta">{short}</span>}
    </span>
  );
  const hasSaved = (state.camera?.analyses || []).some((x: any) => x.source_kind === "recorded_inference");
  const g = I.gemini, t = I.tiger, v = I.voice;

  return (
    <header className="command-bar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">ST</div>
        <div className="brand-copy">
          <div className="brand">SnowTwin <b>WNY</b></div>
          <div className="brand-sub">BUFFALO CORRIDOR OPS</div>
        </div>
      </div>

      <div className="transport-deck" role="group" aria-label="Simulation playback controls">
        {state.playback_status === "playing" ? (
          <button className="transport-btn active" disabled={busy} onClick={() => ctl("pause")}>
            <Icon name="pause" /> Pause
          </button>
        ) : (
          <button className="transport-btn primary" disabled={busy} onClick={() => ctl("play")}>
            <Icon name="play" /> Play
          </button>
        )}

        <div className="speed-group" role="group" aria-label="Simulation speed">
          {[1, 2, 4, 8, 64].map((s) => (
            <button
              key={s}
              disabled={busy}
              className={`speed-btn ${state.speed === s ? "sel" : ""}`}
              onClick={() => ctl(state.playback_status === "playing" ? "play" : "pause", s)}
              title={`Run at ${s}× speed`}
            >
              {s}×
            </button>
          ))}
        </div>

        <button
          className="transport-btn"
          onClick={() => onRestart(sid, sid === FORECAST_SCENARIO ? null : state.scenario.band, currentOverrides(state))}
          disabled={busy}
          title="Restart both policies with the same inputs"
        >
          <Icon name="reset" /> Reset
        </button>
      </div>

      <div className="clock-deck">
        <div className="clock-top">
          <span className="clock-time">{fmtClock(state.sim_time_s)}</span>
          <span className="clock-total">/ {fmtClock(state.duration_s)}</span>
          <span className={`playback-pill status-${state.playback_status}`}>{state.playback_status}</span>
        </div>
        <div className="bar" title={`${Math.round(pct)}% of simulation elapsed`}>
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="scenario-deck">
        <select
          aria-label="Scenario"
          className="header-scenario-select"
          value={loadingScenario ?? sid}
          disabled={busy}
          onChange={(e) => onRestart(e.target.value, null)}
          title={state.scenario.description}
        >
          {!scenarios.some((s: any) => s.id === sid) && <option value={sid}>{state.scenario.label}</option>}
          {scenarios.map((s: any) => (
            <option key={s.id} value={s.id} title={s.description}>{s.label}</option>
          ))}
        </select>
        <button
          className="transport-btn"
          onClick={onOpenStormTab}
          title="Configure storm snowband and fleet parameters"
        >
          <Icon name="sliders" /> Steer
        </button>
        <Radio state={state} />
      </div>

      <div className="badges">
        {restartError && (
          <span className="badge err" role="alert" title={restartError}>
            <i className="dot" />{restartError}
          </span>
        )}
        <span className="badge warn" title={state.scenario.provenance}>
          {state.scenario.id === FORECAST_SCENARIO ? "NWS FORECAST" : "SYNTHETIC"}
        </span>
        {badge("Gemini", g.verified ? "on" : g.last_error ? "err" : "off",
          g.verified ? "LIVE" : g.configured ? (g.last_error ? "ERR" : hasSaved ? "SAVED" : "") : "OFF",
          g.verified ? `verified (${g.last_model})` : g.configured ? (g.last_error ? `error ${g.last_error}` : hasSaved ? "showing saved results; unchanged videos are analyzed once" : "configured, not yet verified") : "no API key")}
        {badge("Tiger", t.available ? "on" : t.last_error ? "err" : "off",
          t.available ? fmtCount(t.rows) : t.configured ? (t.last_error ? "ERR" : "…") : "OFF",
          t.available ? `${t.rows} rows written` : t.configured ? (t.last_error || "connecting") : "DATABASE_URL not set")}
        {badge("Voice", v.verified ? "on" : v.last_error ? "err" : "off",
          v.verified ? "11LABS" : v.configured ? (v.last_error ? "ERR" : "") : "TTS",
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
      <span className="banner-pill">NWS GRID</span>
      <strong role="status">{status}</strong>
      {weather && <span className="muted">valid {forecastTimestamp(weather.valid_at)} · issued {forecastTimestamp(weather.issued_at)}</span>}
    </div>
  );
}

function Legend({ rate, forecast, headingDeg, shown, onToggle, summary = false, threshold = 1.5 }: {
  rate?: number; forecast: boolean; headingDeg?: number; summary?: boolean; threshold?: number;
  shown: boolean; onToggle: (shown: boolean) => void;
}) {
  const rateLabel = Number.isFinite(rate) ? rate === 0
    ? "0.0 in/h"
    : `peak ${rate! < 0.01 ? "<0.01" : Number(rate!.toFixed(2))} in/h`
    : "n/a";
  return (
    <div className="legend" role="group" aria-label="Map legend">
      <div className="legend-group">
        {summary ? (
          <>
            <span className="legend-title" title={`Share of the whole run each road spent above ${threshold} in`}>
              TIME &gt; {threshold}″
            </span>
            <div className="scale-bar">
              {UNSAFE_SHARE_STOPS.map(([v, c]) => (
                <span key={v} className="sw">
                  <i style={{ background: c }} />
                  {Math.round(v * 100)}%
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="legend-title" title="Estimated snow depth on the road, inches">
              ROAD DEPTH (IN)
            </span>
            <div className="scale-bar">
              {DEPTH_STOPS.map(([v, c]) => (
                <span key={v} className="sw">
                  <i style={{ background: c }} />
                  {v}″
                </span>
              ))}
            </div>
          </>
        )}
        <span className="sep" />
        <span className="sw" title="Critical corridor (thicker line with casing)"><i className="thick" /> Critical</span>
        <span className="sw" title="Closed road segment"><i className="closed" /> Closed</span>
        <span className="sw" title="Heavy arterial plow"><i className="vdot heavy" /> Heavy plow</span>
        <span className="sw" title="Compact residential blower"><i className="vdot compact" /> Compact unit</span>
      </div>

      <div className="legend-group snowfall-legend">
        <label className="sw toggle-label">
          <input type="checkbox" checked={shown} onChange={(e) => onToggle(e.target.checked)} />
          <span className="legend-title">SNOWFALL (IN/H)</span>
        </label>
        <div className="scale-bar">
          {SNOWFALL_STOPS.map(([v, color, opacity], i) => (
            <span key={v} className="sw">
              <i className="snowfall-swatch" style={{ background: color, opacity }} />
              {v}{i === SNOWFALL_STOPS.length - 1 ? "+" : ""}
            </span>
          ))}
        </div>
        {!forecast && <span className="sw" title="Snow edge contour, 0.25 in/h"><i className="contour-edge" /> Edge</span>}
        {!forecast && <span className="sw" title="Heavy core contour, 2 in/h"><i className="contour-core" /> Core</span>}
        {(!forecast || (rate ?? 0) > 0) && <span className="snowfall-rate">{rateLabel}</span>}
        {headingDeg !== undefined && (
          <span className="band-vector" title={`Synthetic band flowing toward ${Math.round(headingDeg)}°`}>
            → {COMPASS_POINTS[Math.round(headingDeg / 22.5) % 16]}
          </span>
        )}
      </div>
    </div>
  );
}

function Controls({ state, scenarios, network, busy, loadingScenario, restartError, onRestart }: any) {
  const [draft, setDraft] = useState<{ runId: string; band: any } | null>(null);
  const sid = state.scenario.id;
  const band = draft?.runId === state.run_id ? draft.band : state.scenario.band;

  const slider = (key: string, label: string, min: number, max: number, step: number, unit: string) => (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={band[key]}
        disabled={busy}
        onChange={(e) => setDraft({ runId: state.run_id, band: { ...band, [key]: Number(e.target.value) } })}
      />
      <b className="mono">{band[key]}{unit}</b>
    </label>
  );

  return (
    <div className="controls-panel">
      <div className="subpanel">
        <div className="subpanel-head">
          <h4>Scenario Selection</h4>
          <span className="mono muted small">v{state.scenario_version}</span>
        </div>
        <select
          aria-label="Scenario"
          value={loadingScenario ?? sid}
          disabled={busy}
          onChange={(e) => onRestart(e.target.value, null)}
          title={state.scenario.description}
        >
          {!scenarios.some((s: any) => s.id === sid) && <option value={sid}>{state.scenario.label}</option>}
          {scenarios.map((s: any) => <option key={s.id} value={s.id} title={s.description}>{s.label}</option>)}
        </select>
        {busy && (
          <p className="muted small scenario-message" role="status">
            {loadingScenario === FORECAST_SCENARIO ? "Loading NWS forecast…" : "Starting scenario…"}
          </p>
        )}
        {restartError && (
          <p className="bad small scenario-message" role="alert" title={`Still showing ${state.scenario.label}`}>
            {restartError}
          </p>
        )}
        <p className="muted small scenario-desc">
          {sid === FORECAST_SCENARIO
            ? `${state.scenario.description} Road snow starts at an assumed ${state.scenario.initial_depth_in ?? 0} in.`
            : state.scenario.description}
        </p>
      </div>

      {band && sid !== FORECAST_SCENARIO && (
        <div className="subpanel">
          <div className="subpanel-head">
            <h4>Steer Snowband</h4>
            <span className="muted small">Applies to both worlds</span>
          </div>
          {slider("rate_in_hr", "Peak rate", 0, 6, 0.5, " in/hr")}
          {slider("heading_deg", "Flow toward", 0, 355, 5, "°")}
          {slider("width_m", "Width", 400, 5000, 100, " m")}
          {slider("offset_m", "Start offset", -4000, 4000, 100, " m")}
          {slider("wobble_amp_m", "Wobble", 0, 4000, 100, " m")}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="primary"
              disabled={busy}
              onClick={() => onRestart(sid, band, currentOverrides(state))}
            >
              Apply & restart
            </button>
            {draft?.runId === state.run_id && (
              <button disabled={busy} onClick={() => setDraft(null)}>Reset sliders</button>
            )}
          </div>
        </div>
      )}

      <Experiment
        state={state}
        network={network}
        busy={busy}
        onApply={(ov: any) => onRestart(sid, sid === FORECAST_SCENARIO ? null : band, ov)}
      />
    </div>
  );
}

// [key, short label, tooltip, lower/higher is better, format, shown by default]
const ROWS: [string, string, string, "low" | "high", (v: any) => string, boolean][] = [
  ["critical_exposure_min", "Unsafe time, critical roads (min)", "Minutes critical segments spent above the depth threshold", "low", (v) => v.toFixed(0), true],
  ["avg_critical_depth_in", "Snow on critical roads (in)", "Average snow depth on critical segments", "low", (v) => v.toFixed(2), true],
  ["distance_km", "Distance driven (km)", "Total distance driven", "low", (v) => v.toFixed(1), true],
  ["inch_km_per_crew_hour", "Snow cleared per crew-hour", "Snow cleared per active crew-hour (in·km)", "high", (v) => v.toFixed(1), true],
  ["exposure_min", "Unsafe time, all roads (min)", "Minutes all segments spent above the threshold", "low", (v) => v.toFixed(0), false],
  ["deadhead_pct", "Driving without plowing (%)", "Share of travel spent not plowing", "low", (v) => v.toFixed(0), false],
  ["services", "Plow passes", "Completed plowing passes", "high", (v) => String(v), false],
  ["reaccumulations", "Roads snowed in again", "Segments that filled back in after service", "low", (v) => String(v), false],
  ["crew_hours", "Crew-hours", "Active crew-hours", "low", (v) => v.toFixed(1), false],
];

const KEY_ORDER = ["critical_exposure_min", "exposure_min", "inch_km_per_crew_hour"];
const KEY_METRICS = new Set(KEY_ORDER);

function Metrics({ state, defaultAll = false, highlight = false }: any) {
  const [all, setAll] = useState(defaultAll);
  const f = state.policies.fixed.metrics, a = state.policies.adaptive.metrics;
  const [promoted, setPromoted] = useState(false);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setPromoted(true), 500);
    return () => clearTimeout(id);
  }, [highlight]);

  const rowEls = useRef<Record<string, HTMLTableRowElement | null>>({});
  const lastTops = useRef<Record<string, number>>({});
  const visible = ROWS.filter((r) => all || r[5]);
  const ordered = highlight && promoted
    ? [...KEY_ORDER.map((k) => visible.find((r) => r[0] === k)).filter(Boolean) as typeof ROWS,
       ...visible.filter((r) => !KEY_METRICS.has(r[0]))]
    : visible;

  useLayoutEffect(() => {
    const tops: Record<string, number> = {};
    for (const [k, el] of Object.entries(rowEls.current)) if (el) tops[k] = el.getBoundingClientRect().top;
    for (const [k, el] of Object.entries(rowEls.current)) {
      const prev = lastTops.current[k];
      if (!el || prev === undefined || prev === tops[k]) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${prev - tops[k]}px)`;
      void el.getBoundingClientRect();
      el.style.transition = "transform 650ms cubic-bezier(.2,.8,.2,1)";
      el.style.transform = "";
    }
    lastTops.current = tops;
  }, [promoted, all]);

  const thr = state.scenario.params.threshold_in;
  const fv = f.critical_exposure_min ?? 0, av = a.critical_exposure_min ?? 0;
  const hasHero = fv > 0;
  const pct = hasHero ? Math.round(((av - fv) / fv) * 100) : 0;

  return (
    <section className="metrics-section">
      <div className="section-header">
        <h3 title="Same storm, same fleet, both policies measured side by side">Policy Comparison</h3>
        <span className="section-meta" title={`Threshold: ${thr} in · Run ${state.run_id}`}>
          THR &gt; {thr}″
        </span>
      </div>

      {hasHero && (
        <div className="hero-banner" title="Critical exposure: minutes Main Street and hospital approaches spent above the threshold">
          <div className="hero-stat">
            <span className={pct <= 0 ? "hero-num" : "hero-num worse"}>{pct > 0 ? "+" : ""}{pct}%</span>
            <span className="hero-label">
              {pct <= 0 ? "reduction" : "increase"} in unsafe time on Main St &amp; hospital approaches
            </span>
          </div>
        </div>
      )}

      <table className="metrics">
        <thead>
          <tr>
            <th>Metric</th>
            <th style={{ color: FIXED }}>Baseline</th>
            <th style={{ color: ADAPT }}>Adaptive</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(([k, label, tip, dir, fmt]) => {
            const fVal = f[k] ?? 0, aVal = a[k] ?? 0;
            const better = dir === "low" ? aVal < fVal : aVal > fVal;
            const same = aVal === fVal;
            const delta = fVal !== 0
              ? `${aVal - fVal > 0 ? "+" : ""}${(((aVal - fVal) / Math.abs(fVal)) * 100).toFixed(0)}%`
              : `${aVal - fVal > 0 ? "+" : ""}${fmt(aVal - fVal)}`;
            return (
              <tr key={k} ref={(el) => { rowEls.current[k] = el; }} className={highlight && KEY_METRICS.has(k) ? "key-row" : undefined}>
                <td title={tip}>{label}</td>
                <td className="mono">{fmt(fVal)}</td>
                <td className="mono">{fmt(aVal)}</td>
                <td className={`mono ${same ? "muted" : better ? "good" : "bad"}`}>{same ? "—" : delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="row small between metrics-footer">
        <button className="link" onClick={() => setAll(!all)}>
          {all ? "Fewer metrics" : `More metrics (+${ROWS.length - ROWS.filter((r) => r[5]).length})`}
        </button>
        <span className="muted" title={`Simulated results. The ${thr} in threshold is illustrative, not a safety standard. Run ${state.run_id} · v${state.scenario_version}`}>
          Simulated · Unsafe &gt; {thr} in
        </span>
      </div>
    </section>
  );
}

const KIND_LABEL: Record<string, [string, string]> = {
  live_inference: ["GEMINI · FRESH", "Fresh Gemini analysis made this session (the footage itself may be archived)"],
  recorded_inference: ["GEMINI · SAVED", "Saved result from an earlier genuine Gemini call on this same media"],
  synthetic_fixture: ["SYNTHETIC", "Synthetic fixture, not a model output"],
};
const SourceTag = ({ kind }: { kind: string }) => (
  <span className={`tag ${kind}`} title={KIND_LABEL[kind]?.[1]}>{KIND_LABEL[kind]?.[0] || kind}</span>
);

function Camera({ state, frames, network, camState, reloadFrames, selected, onSelect }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ny = state.integrations.ny511;

  const refresh511 = async () => {
    setRefreshing(true); setMsg(null);
    try {
      const r = await api("/api/cameras/refresh", {});
      setMsg(`511NY: ${r.updated.length} camera(s) refreshed`);
      await reloadFrames();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const ago = (ts: number | null) => ts ? `${Math.round((Date.now() / 1000 - ts) / 60)} min ago` : "never";
  const nyTip = ny.configured
    ? `511NY auto-refresh every ${Math.round(ny.interval_s / 60)} min · last ${ago(ny.last_refresh)}${ny.last_error ? " · " + ny.last_error : ""}`
    : "511NY key not configured; showing stored media";

  const anById: Record<string, any> = {};
  for (const x of state.camera?.analyses || []) anById[x.frame_id] = x;

  const segLabel = (sid: string) => {
    const s = network.segments.find((x: any) => x.segment_id === sid);
    return s ? (s.name || s.highway) : sid;
  };

  return (
    <div className="cameras-panel">
      <div className="subpanel">
        <div className="subpanel-head">
          <h4>Corridor Camera Feeds ({frames.length})</h4>
          <button
            className="small"
            onClick={refresh511}
            disabled={!ny.configured || refreshing}
            title={nyTip}
          >
            <Icon name="refresh" size={12} /> {refreshing ? "Refreshing…" : "Refresh 511NY"}
          </button>
        </div>
        {msg && <div className="small muted" style={{ marginBottom: 6 }}>{msg}</div>}
        {ny.last_error && <div className="small bad" style={{ marginBottom: 6 }}>511NY error: {ny.last_error}</div>}

        <div className="camera-feed-list">
          {frames.map((f: any) => {
            const st = camState?.[f.frame_id] || "clear";
            const a = anById[f.frame_id];
            const r = a?.result;
            const isSel = selected === f.frame_id;
            return (
              <div
                key={f.frame_id}
                className={`camera-feed-item state-${st} ${isSel ? "selected" : ""}`}
                onClick={() => onSelect(f.frame_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(f.frame_id); } }}
              >
                <div className="camera-feed-top">
                  <span className="camera-feed-title">
                    <Icon name="video" size={13} /> {f.title}
                  </span>
                  <span className={`cam-status-pill state-${st}`}>{st.toUpperCase()}</span>
                </div>
                <div className="camera-feed-meta">
                  <span>{f.segment_ids.map(segLabel).join(", ")}</span>
                  {r && (
                    <span className="mono">
                      {typeof r.snow_depth_cm === "number" ? `${r.snow_depth_cm.toFixed(1)}cm` : "—"}
                      {" · "}
                      {r.visibility_class || "—"}
                      {r.obstruction_detected ? " · OBSTRUCTED" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="subpanel">
        <div className="subpanel-head">
          <h4>Media Upload</h4>
        </div>
        <AddFrame network={network} onAdded={async (f: any) => { await reloadFrames(); onSelect(f.frame_id); }} />
      </div>
    </div>
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
    const triggered = !!state.camera?.triggered?.[f.frame_id];
    out[f.frame_id] = d ? (d.decision === "approve" ? "approved" : "rejected") : triggered && kind && kind !== "none" ? "pending" : "clear";
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
    try {
      await api("/api/proposals/decide", {
        run_id: state.run_id, frame_id: frame.frame_id, version: analysis.version,
        decision, sample_offset_s: analysis.sample_offset_s,
      });
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  if (analysis.reference_only) return <div className="small muted" title="Archived footage can't be applied to this forecast time">Reference only</div>;
  if (!analysis.proposed_effect || analysis.proposed_effect.kind === "none") return null;
  const eff = analysis.proposed_effect;
  return (
    <div className="decision">
      <div className="row center tight">
        <span className="small grow" title={`${effectTip(eff)} · ${seg?.name || seg?.highway} (${frame.segment_ids[0]})`}>
          <b>{effectText(eff)}</b> <span className="muted">· {seg?.name || seg?.highway}</span>
        </span>
        {d ? (
          <span className={`small mono ${d.decision === "approve" ? "good" : "muted"}`}
                title={d.decision === "approve" ? "Applied to both policies at the same tick" : undefined}>
            {d.decision === "approve" ? "Approved" : "Rejected"} {fmtClock(d.sim_time_s)}
          </span>
        ) : (
          <div className="decision-btns">
            <button className="approve small" onClick={() => decide("approve")} title="Apply to both policies">Approve</button>
            <button className="reject small" onClick={() => decide("reject")}>Reject</button>
          </div>
        )}
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
          <summary aria-label="Show Gemini explanation" title="Gemini explanation"><Icon name="info" size={16} /></summary>
          <div className="analysis-explanation">
            <b>Gemini’s explanation</b>
            <p>{r.evidence_summary || "No explanation returned."}</p>
            <div className="small muted mono">{analysis.model_id} · {analysis.recorded_at ? `Saved ${analysis.recorded_at}` : "Fresh inference"}</div>
          </div>
        </details>
      </div>
      {analysis.note && <span className="small warn-text">{analysis.note}</span>}
      <div className="analysis-card snow-card">
        <div className="analysis-card-label"><Icon name="snow" size={14} /> EST. SURFACE SNOW DEPTH</div>
        <div className="snow-depth-value">
          {depthKnown ? <>{r.snow_depth_cm.toFixed(1)}<span> cm</span></> : <span className="unavailable-value">No saved estimate</span>}
        </div>
        <div className="confidence-line">
          {confidenceKnown ? <><b>{Math.round(r.depth_confidence_pct)}%</b> model confidence</> : "Not included in saved analysis"}
        </div>
        {confidenceKnown && (
          <div className="confidence-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, r.depth_confidence_pct))}%` }} />
          </div>
        )}
      </div>
      <div className="analysis-card-pair">
        <div className={`analysis-card status-${visibility}`}>
          <div className="analysis-card-label">VISIBILITY</div>
          <strong>{visibility}</strong>
          <span className="status-indicator" aria-hidden="true" />
        </div>
        <div className={`analysis-card status-${r.obstruction_detected === true ? "poor" : r.obstruction_detected === false ? "good" : "unknown"}`}>
          <div className="analysis-card-label">OBSTRUCTION</div>
          <strong>{obstruction}</strong>
          <span className="status-indicator" aria-hidden="true" />
        </div>
      </div>
      {r.evidence_summary && (
        <div className="analysis-evidence-box">
          <div className="analysis-card-label">OBSERVATION SUMMARY</div>
          <p>{r.evidence_summary}</p>
        </div>
      )}
      <p className="estimate-note">Uncalibrated visual estimate · not measured road depth.</p>
      {analysis.clip_summary_only && <p className="small warn-text">Saved clip summary only. Depth and timed samples were not included in this recording.</p>}
    </div>
  );
}

function Proposals({ state, frames, network, onOpen }: any) {
  const items = (state.camera?.analyses || [])
    .filter((a: any) => a.status === "done" && !a.reference_only && a.proposed_effect && a.proposed_effect.kind !== "none"
      && state.camera?.triggered?.[a.frame_id])
    .map((a: any) => ({ a, f: frames.find((f: any) => f.frame_id === a.frame_id) }))
    .filter((x: any) => x.f);
  if (!items.length) return null;
  const pending = items.filter((x: any) => !state.camera.decisions[cameraDecisionKey(x.f, x.a)]).length;
  return (
    <section className={`proposals ${pending > 0 ? "has-pending" : ""}`}>
      <div className="section-header">
        <h3>
          <Icon name="alert" size={14} /> Camera Incidents
          {pending > 0 && <span className="pill">{pending} pending</span>}
        </h3>
      </div>
      {items.map(({ a, f }: any) => (
        <div key={f.frame_id} className="proposal">
          <div className="row center between tight">
            <button className="link" onClick={() => onOpen(f.frame_id)} title="Open video and full Gemini result">
              <Icon name="video" size={13} /> {f.title}
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
    <div
      className={`viewer camera-popup ${analysisExpanded ? "analysis-expanded" : "analysis-collapsed"}`}
      role="dialog"
      aria-labelledby={`camera-title-${frame.frame_id}`}
    >
      <div className="viewer-head">
        <b id={`camera-title-${frame.frame_id}`}><Icon name="video" /> {frame.title}</b>
        <button ref={closeButton} className="icon-btn" onClick={onClose} aria-label="Close camera viewer"><Icon name="x" /></button>
      </div>
      <div className="camera-popup-body">
        <aside className="popup-analysis" aria-label="Gemini analysis">
          <div className="popup-analysis-head">
            {analysisExpanded && (
              <div>
                <span className="camera-eyebrow">GEMINI VISION TELEMETRY</span>
                <h2>Camera analysis</h2>
              </div>
            )}
            <button
              className="icon-btn camera-toggle"
              aria-expanded={analysisExpanded}
              aria-controls="popup-analysis-content"
              aria-label={analysisExpanded ? "Collapse camera analysis" : "Expand camera analysis"}
              onClick={() => setAnalysisExpanded(!analysisExpanded)}
            >
              {analysisExpanded ? "‹" : <Icon name="camera" size={18} />}
            </button>
          </div>
          {analysisExpanded && (
            <div id="popup-analysis-content" className="popup-analysis-content">
              <AnalysisView analysis={analysis} />
              {analysis?.status === "done" && <Decision state={state} analysis={analysis} frame={frame} network={network} />}
              {analysis?.status === "done" && !analysis.reference_only && analysis.proposed_effect?.kind === "none" && (
                <div className="small muted">No dispatch intervention required.</div>
              )}
              <button
                className="small"
                onClick={rerun}
                disabled={!analysis || analysis.status === "processing"}
                title="Reuse saved analysis; only new media is sent to Gemini"
              >
                <Icon name="refresh" /> {original?.status === "done" ? "Use saved analysis" : "Analyze once"}
              </button>
              {requestError && <p className="small bad" role="alert">{requestError}</p>}
            </div>
          )}
        </aside>
        <div className="camera-media">
          {frame.media_type === "video" ? (
            <video
              key={frame.media_url}
              src={frame.media_url}
              autoPlay
              muted
              loop
              playsInline
              controls
              onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setPlaybackTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setPlaybackTime(0); }}
            />
          ) : (
            <img src={frame.media_url} alt={frame.title} />
          )}
          {frame.media_type === "video" && (
            <div className="sample-clock">
              <span>PLAYBACK {playbackTime.toFixed(1)}s</span>
              <span>
                {analysis?.sample_offset_s !== undefined
                  ? `FRAME ${analysis.sample_offset_s}s · 5s interval`
                  : original?.status === "processing"
                  ? "Analyzing…"
                  : "No timed samples saved"}
              </span>
            </div>
          )}
          <div className="small">
            <span className="tag archive">ARCHIVE</span>{" "}
            Captured <b className="mono">{frame.observed_at ? frame.observed_at.slice(0, 10) : "unknown"}</b>
            {frame.observed_at_precision ? <span className="muted"> ({frame.observed_at_precision})</span> : ""}
            <span className="muted"> · {frame.relation === "adjacent" ? "near" : "on"} {frame.segment_ids.map(segName).join(", ")}</span>
          </div>
          <details className="small">
            <summary>Source, mapping &amp; weather context</summary>
            <div className="muted">
              {frame.source_url ? <a href={frame.source_url} target="_blank" rel="noreferrer">{frame.source}</a> : frame.source}
              {frame.license_note ? ` · ${frame.license_note}` : ""}
            </div>
            <div className="muted">
              Archive footage, not a live feed.{frame.relation === "adjacent" ? " Adjacent camera: visibility only." : ""}{frame.mapping_note ? ` ${frame.mapping_note}` : ""}
            </div>
            {frame.weather_context?.length > 0 && (
              <div className="context">
                <b>Weather {frame.observed_at.slice(0, 10)}</b> <span className="muted">(context, not road depth)</span>
                <ul className="wx">
                  {frame.weather_context.map((r: any, i: number) => (
                    <li key={i}>
                      <b>{r.value_in} in</b> {r.kind === "snow_depth" ? "snow depth" : "daily snowfall"} · {r.station} · {r.when} ·{" "}
                      <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> <span className="muted">({r.use})</span>
                    </li>
                  ))}
                </ul>
                <div className="muted">{frame.weather_note}</div>
              </div>
            )}
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
  const segs = [...network.segments].sort((a: any, b: any) =>
    (a.name || a.highway).localeCompare(b.name || b.highway) || a.segment_id.localeCompare(b.segment_id)
  );
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
  if (!open) {
    return (
      <button className="small" onClick={() => setOpen(true)} title="Upload a camera image or video from any source">
        <Icon name="plus" /> Add media
      </button>
    );
  }
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
    <div className="dispatch-panel">
      {state.alerts.length > 0 && (
        <div className="alerts" role="status">
          <div className="alert-latest">
            <span className="mono muted">{fmtClock(state.alerts[0].sim_time_s)}</span>{" "}
            <span>{state.alerts[0].text}</span>
          </div>
          {state.alerts.length > 1 && (
            <details className="small">
              <summary>{state.alerts.length - 1} earlier alert(s)</summary>
              {state.alerts.slice(1, 5).map((a: any) => (
                <div key={a.alert_id} className="alert-item">
                  <span className="mono muted">{fmtClock(a.sim_time_s)}</span> {a.text}
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      <div className="subpanel">
        <div className="subpanel-head">
          <h4>Fleet Assignments &amp; Telemetry</h4>
          <div className="seg" role="tablist" aria-label="Policy">
            <button role="tab" aria-selected={tab === "adaptive"} className={tab === "adaptive" ? "sel" : ""} onClick={() => setTab("adaptive")}>
              Adaptive
            </button>
            <button role="tab" aria-selected={tab === "fixed"} className={tab === "fixed" ? "sel" : ""} onClick={() => setTab("fixed")}>
              Baseline
            </button>
          </div>
        </div>

        <div className="vehicles">
          {state.policies[tab].vehicles.map((v: any) => (
            <div key={v.vehicle_id} className="unit-card">
              <div className="vrow">
                <span className={`veh-chip ${v.type || ""}`} title={v.label}>{v.vehicle_id}</span>
                <span className={`status ${v.status}`}>{v.status}</span>
                <span className="grow ellipsis unit-target">{v.explanation?.target_name || <span className="muted">Standby</span>}</span>
              </div>
              {v.explanation?.reason && (
                <div className="unit-reason muted">{v.explanation.reason}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="subpanel">
        <div className="subpanel-head">
          <h4>Chronological Dispatch Log</h4>
          <span className="mono muted small">{tab.toUpperCase()}</span>
        </div>
        <ul className="log">
          {log.slice(0, 12).map((e: any, i: number) => (
            <li key={i} className={e.kind} title={e.reason}>
              <div className="log-head">
                <span className="muted mono">{fmtClock(e.t)}</span>
                <b>{e.vehicle_id}</b>
                <span className="log-action">
                  {e.kind === "assign" ? `→ ${e.target_name}` : e.kind === "service" ? `cleared ${e.target_name}` : e.kind}
                </span>
              </div>
              {e.reason && <div className="muted ellipsis log-reason">{e.reason}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
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
    <button
      className={`transport-btn ${on ? "sel" : ""}`}
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={on ? `New dispatch alerts are spoken${mode ? ` (${mode})` : ""}` : "Speak new dispatch alerts aloud"}
    >
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
    try {
      const c = await api(`/api/runs/${state.run_id}/checkpoints`);
      setCps(c);
      setIdx(Math.max(0, c.length - 1));
      if (!c.length) setMsg("None yet. One is saved every 15 sim-minutes.");
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  const fetchCp = async (i: number) => {
    setIdx(i);
    try { setSnap(await api(`/api/runs/${state.run_id}/checkpoints/${cps![i].tick}`)); } catch (e: any) { setMsg(e.message); }
  };
  const f = snap?.policies?.fixed?.metrics, a = snap?.policies?.adaptive?.metrics;
  return (
    <div className="history-panel">
      <div className="subpanel">
        <div className="subpanel-head">
          <h4 title="Checkpoints read back from Tiger Data"><Icon name="db" size={13} /> Tiger Data Time-Series Store</h4>
          {tiger.available && <span className="mono muted small">{fmtCount(tiger.rows)} rows</span>}
        </div>
        {!tiger.available ? (
          <div className="small muted">Database not connected{tiger.last_error ? ` (${tiger.last_error})` : ""}</div>
        ) : (
          <>
            <div className="row small center">
              <button onClick={load}>{cps ? "Reload checkpoints" : "Load checkpoints"}</button>
              <span className="muted mono">{fmtCount(tiger.rows)} rows saved</span>
            </div>
            {cps && cps.length > 0 && (
              <>
                <label className="slider">
                  <span>Checkpoint</span>
                  <input type="range" min={0} max={cps.length - 1} value={idx} onChange={(e) => fetchCp(Number(e.target.value))} />
                  <b className="mono">{fmtClock(cps[idx].sim_time_s)}</b>
                </label>
                {!snap && <button className="small" onClick={() => fetchCp(idx)}>Read checkpoint</button>}
              </>
            )}
            {snap && f && a && (
              <div className="small" style={{ marginTop: 8 }}>
                <table className="metrics compact">
                  <thead>
                    <tr>
                      <th className="mono">{fmtClock(snap.sim_time_s)}</th>
                      <th style={{ color: FIXED }}>Baseline</th>
                      <th style={{ color: ADAPT }}>Adaptive</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Critical exposure (min)</td>
                      <td className="mono">{Number(f.critical_exposure_min).toFixed(0)}</td>
                      <td className="mono">{Number(a.critical_exposure_min).toFixed(0)}</td>
                    </tr>
                    <tr>
                      <td>Distance (km)</td>
                      <td className="mono">{Number(f.distance_km).toFixed(1)}</td>
                      <td className="mono">{Number(a.distance_km).toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="row" style={{ marginTop: 8 }}>
                  {showing ? (
                    <button onClick={() => onShow(null)}>Back to live</button>
                  ) : (
                    <button className="primary" onClick={() => onShow(snap)}>Show on maps</button>
                  )}
                </div>
              </div>
            )}
            {msg && <div className="small muted">{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}

const BASELINE_LABEL: Record<string, string> = {
  city_priority: "City snow plan routes",
  service_history: "Oldest-plowed first",
  fixed_loop: "Fixed loop",
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
    <div className="subpanel">
      <div className="subpanel-head">
        <h4>Experiment &amp; Fleet Parameters</h4>
      </div>
      <label className="slider wide">
        <span>Baseline</span>
        <select value={v.baseline_policy} disabled={busy} onChange={(e) => setDraft({ ...v, baseline_policy: e.target.value })}>
          <option value="city_priority">City published priority</option>
          <option value="service_history">Service history (oldest first)</option>
          <option value="fixed_loop">Fixed service loop</option>
        </select>
        <b />
      </label>
      <label className="slider wide">
        <span>Heavy plows</span>
        <select value={heavy.length} disabled={busy} onChange={(e) => setFleet(Number(e.target.value), compact.length)}>
          {[1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <b />
      </label>
      <label className="slider wide">
        <span>Heavy start</span>
        <select value={heavy[0]?.start} disabled={busy} onChange={(e) => setFleet(heavy.length, compact.length, e.target.value)}>
          {starts.map((n) => <option key={n}>{n}</option>)}
        </select>
        <b />
      </label>
      <label className="slider wide">
        <span>Compact units</span>
        <select value={compact.length} disabled={busy} onChange={(e) => setFleet(heavy.length, Number(e.target.value))}>
          {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <b />
      </label>
      {compact.length > 0 && (
        <label className="slider wide">
          <span>Compact start</span>
          <select value={compact[0]?.start} disabled={busy} onChange={(e) => setFleet(heavy.length, compact.length, undefined, e.target.value)}>
            {starts.map((n) => <option key={n}>{n}</option>)}
          </select>
          <b />
        </label>
      )}
      <label className="slider">
        <span>Look-ahead</span>
        <input type="range" min={0} max={7200} step={300} value={v.params.horizon_s} disabled={busy} onChange={(e) => setParam("horizon_s", Number(e.target.value))} />
        <b className="mono">{Math.round(v.params.horizon_s / 60)} min</b>
      </label>
      <label className="slider">
        <span>Critical weight</span>
        <input type="range" min={0} max={6} step={0.5} value={v.params.corridor_beta} disabled={busy} onChange={(e) => setParam("corridor_beta", Number(e.target.value))} />
        <b className="mono">1+{v.params.corridor_beta}</b>
      </label>
      <label className="slider">
        <span>Threshold</span>
        <input type="range" min={0.5} max={4} step={0.25} value={v.params.threshold_in} disabled={busy} onChange={(e) => setParam("threshold_in", Number(e.target.value))} />
        <b className="mono">{v.params.threshold_in} in</b>
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={busy} onClick={() => onApply(v)}>Apply &amp; restart</button>
        {draft && <button disabled={busy} onClick={() => setDraft(null)}>Discard</button>}
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        Tiers from the City Snow Plan{cp.source_urls?.[0] && <> (<a href={cp.source_urls[0]} target="_blank" rel="noreferrer">source</a>)</>}.
        Start points are assumptions. Set look-ahead or weight to 0 to ablate.
      </p>
    </div>
  );
}
