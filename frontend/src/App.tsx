import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MapPane from "./MapPane";
import { Icon } from "./icons";
import { cameraDecisionKey, playbackAnalysis } from "./cameraAnalysis";
import type { SnowfallAreas, SnowfallField } from "./MapPane";

const FIXED = "#f59e0b";
const ADAPT = "#ffffff";
const FORECAST_SCENARIO = "nws_forecast";
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
  const [showSummary, setShowSummary] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);  // end-of-run results popup (side panel tucked away)
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
    setResultsOpen(true);
  }, [state?.run_id]);

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

  const snapshot = state;
  const P = snapshot.policies;
  const weather: ForecastWeather | null = snapshot.weather?.source === "nws" ? snapshot.weather : null;
  const isForecast = snapshot.scenario.id === FORECAST_SCENARIO;
  const field: SnowfallField | null = weather ? null : snapshot.band?.field ?? null;
  const snowfall = weather?.areas ?? (field ? null : legacySnowfall(snapshot.band));
  const snowfallField = field && field.max_rate_in_hr > 0 ? field : null;
  const camState = cameraStates(state, frames);
  const selectedCam = cam;
  const finished = state.playback_status === "finished";
  // End-of-run summary (exposure-share map + banner) is switched off for now; flip to true to restore.
  const SUMMARY_ENABLED = false;
  const summaryOn = SUMMARY_ENABLED && finished && showSummary;
  const selectedFrame = frames.find((f: any) => f.frame_id === selectedCam);
  const endLayout = finished && resultsOpen;

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
      />
      <div className={endLayout ? "body ended" : "body"}>
        <div className="map-stage">
          {isForecast && <ForecastStatus weather={weather} shown={true} />}
          {SUMMARY_ENABLED && finished && (
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
                <button className="small primary" onClick={() => setShowSummary(!showSummary)}>
                  {summaryOn ? "Show final road depth" : "Show storm exposure share"}
                </button>
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
              progress={state.duration_s ? state.sim_time_s / state.duration_s : 0}
              maps={maps}
              summary={summaryOn}
              inset={endLayout ? "right" : null}
              frames={frames}
              selectedCam={selectedCam}
              onCameraClick={selectCamera}
              camState={camState}
            />
            <MapPane
              tag="SNOWBULL"
              title="SnowBull routing"
              accent={ADAPT}
              network={network}
              world={P.adaptive}
              snowfall={snowfall}
              snowfallField={snowfallField}
              env={snapshot.env}
              syncKey="adaptive"
              progress={state.duration_s ? state.sim_time_s / state.duration_s : 0}
              maps={maps}
              summary={summaryOn}
              inset={endLayout ? "left" : null}
              frames={frames}
              selectedCam={selectedCam}
              onCameraClick={selectCamera}
              camState={camState}
            />

            {endLayout && (
              <div className="results-popup" role="dialog" aria-label="Results">
                <div className="results-popup-head">
                  <span>RESULTS</span>
                  <button className="icon-btn" onClick={() => setResultsOpen(false)} title="Close results">×</button>
                </div>
                <Metrics state={state} highlight />
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
        </div>

        <aside className="side" aria-label="Operations Console">
          <Metrics state={state} />
        </aside>
      </div>
    </div>
  );
}

function Header({ state, scenarios, err, busy, loadingScenario, restartError, onRestart }: any) {
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

// [key, short label, tooltip, lower/higher is better, format]
const ROWS: [string, string, string, "low" | "high", (v: any) => string][] = [
  ["inch_km_per_crew_hour", "Snow cleared per crew-hour", "Snow cleared per active crew-hour (in·km)", "high", (v) => v.toFixed(1)],
  ["exposure_min", "Unsafe time, all roads (min)", "Minutes all segments spent above the threshold", "low", (v) => v.toFixed(0)],
  ["critical_exposure_min", "Unsafe time, critical roads (min)", "Minutes critical segments spent above the depth threshold", "low", (v) => v.toFixed(0)],
  ["avg_critical_depth_in", "Snow on critical roads (in)", "Average snow depth on critical segments", "low", (v) => v.toFixed(2)],
  ["distance_km", "Distance driven (km)", "Total distance driven", "low", (v) => v.toFixed(1)],
  ["deadhead_pct", "Driving without plowing (%)", "Share of travel spent not plowing", "low", (v) => v.toFixed(0)],
  ["services", "Plow passes", "Completed plowing passes", "high", (v) => String(v)],
  ["reaccumulations", "Roads snowed in again", "Segments that filled back in after service", "low", (v) => String(v)],
  ["crew_hours", "Crew-hours", "Active crew-hours", "low", (v) => v.toFixed(1)],
];

const KEY_ORDER = ["inch_km_per_crew_hour", "exposure_min", "critical_exposure_min"];
const KEY_METRICS = new Set(KEY_ORDER);

function Metrics({ state, highlight = false }: any) {
  const f = state.policies.fixed.metrics, a = state.policies.adaptive.metrics;
  const [promoted, setPromoted] = useState(false);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setPromoted(true), 500);
    return () => clearTimeout(id);
  }, [highlight]);

  const rowEls = useRef<Record<string, HTMLTableRowElement | null>>({});
  const lastTops = useRef<Record<string, number>>({});
  const ordered = highlight && promoted
    ? [...KEY_ORDER.map((k) => ROWS.find((r) => r[0] === k)).filter(Boolean) as typeof ROWS,
       ...ROWS.filter((r) => !KEY_METRICS.has(r[0]))]
    : ROWS;

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
  }, [promoted]);

  const thr = state.scenario.params.threshold_in;
  // Hero: snow cleared per crew-hour (higher is better).
  const fv = f.inch_km_per_crew_hour ?? 0, av = a.inch_km_per_crew_hour ?? 0;
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
        <div className="hero-banner" title="Snow cleared per active crew-hour (in·km), SnowBull vs baseline">
          <div className="hero-stat">
            <span className={pct >= 0 ? "hero-num" : "hero-num worse"}>{pct > 0 ? "+" : ""}{pct}%</span>
            <span className="hero-label">
              {pct >= 0 ? "more" : "less"} snow cleared per crew-hour
            </span>
          </div>
        </div>
      )}

      <table className="metrics">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="col-baseline">Baseline</th>
            <th className="col-adaptive">SnowBull</th>
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
        <span className="muted" title={`Simulated results. The ${thr} in threshold is illustrative, not a safety standard. Run ${state.run_id} · v${state.scenario_version}`}>
          Simulated · Unsafe means &gt; {thr} in
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
