import { useEffect, useRef, useState } from "react";
import MapPane, { DEPTH_STOPS } from "./MapPane";

const FIXED = "#f59e0b";
const ADAPT = "#22d3ee";

async function api(path: string, body?: any) {
  const r = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
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

  useEffect(() => {
    api("/api/network").then(setNetwork).catch((e) => setErr(String(e)));
    api("/api/scenarios").then(setScenarios).catch(() => {});
    api("/api/frames").then(setFrames).catch(() => {});
    let alive = true;
    const poll = async () => {
      try { const s = await api("/api/state"); if (alive) { setState(s); setErr(null); } }
      catch (e) { if (alive) setErr("Backend unreachable"); }
      if (alive) setTimeout(poll, 500);
    };
    poll();
    return () => { alive = false; };
  }, []);

  if (!network || !state) return <div className="loading">{err || "Loading SnowTwin…"}</div>;

  const P = state.policies;
  return (
    <div className="app">
      <Header state={state} err={err} />
      <div className="body">
        <div className="maps">
          <MapPane title="FIXED-ORDER LOOP (comparison)" accent={FIXED} network={network} world={P.fixed}
                   band={state.band} env={state.env} syncKey="fixed" maps={maps} />
          <MapPane title="ADAPTIVE (SnowTwin)" accent={ADAPT} network={network} world={P.adaptive}
                   band={state.band} env={state.env} syncKey="adaptive" maps={maps} />
          <Legend />
        </div>
        <aside className="side">
          <Controls state={state} scenarios={scenarios} />
          <Metrics state={state} />
          <Camera state={state} frames={frames} network={network} />
          <Log state={state} />
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
        <span className="badge warn" title={state.scenario.provenance}>Synthetic storm</span>
        {badge("Gemini", I.gemini.available, I.gemini.available ? `live ${I.gemini.model}` : "fixture (no key)")}
        {badge("Tiger Data", I.tiger.available, I.tiger.available ? `${I.tiger.rows} rows` : I.tiger.configured ? (I.tiger.last_error || "connecting") : "off")}
        {badge("Voice", I.voice.available, I.voice.available ? "ElevenLabs" : "browser TTS (mock)")}
        {err && <span className="badge off">{err}</span>}
      </div>
    </header>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>Estimated depth:</span>
      {DEPTH_STOPS.map(([v, c]) => <span key={v} className="sw"><i style={{ background: c }} />{v}″</span>)}
      <span className="sw"><i className="thick" /> critical corridor</span>
      <span className="sw"><i style={{ background: "#93c5fd", opacity: 0.5 }} /> snowband</span>
      <span className="sw"><i className="closed" /> closed</span>
      <span className="sw"><i className="vdot heavy" /> heavy plow</span>
      <span className="sw"><i className="vdot compact" /> compact blower</span>
    </div>
  );
}

function Controls({ state, scenarios }: any) {
  const [sid, setSid] = useState(state.scenario.id);
  const [band, setBand] = useState<any>(state.scenario.band);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(state.run_id);
  useEffect(() => {
    if (runRef.current !== state.run_id) { runRef.current = state.run_id; setSid(state.scenario.id); setBand(state.scenario.band); }
  }, [state.run_id]);

  const restart = async (scenarioId: string, b: any) => {
    setBusy(true);
    try { await api("/api/scenario", { scenario_id: scenarioId, band: b, autoplay: true }); } finally { setBusy(false); }
  };
  const ctl = (action: string, speed?: number) => api("/api/control", { action, speed_multiplier: speed });
  const slider = (key: string, label: string, min: number, max: number, step: number, unit: string) => (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={band[key]}
             onChange={(e) => setBand({ ...band, [key]: Number(e.target.value) })} />
      <b>{band[key]}{unit}</b>
    </label>
  );
  return (
    <section>
      <h3>Scenario & playback</h3>
      <div className="row">
        {state.playback_status === "playing"
          ? <button onClick={() => ctl("pause")}>⏸ Pause</button>
          : <button className="primary" onClick={() => ctl("play")}>▶ Play</button>}
        {[1, 2, 4, 8].map((s) => (
          <button key={s} className={state.speed === s ? "sel" : ""} onClick={() => ctl(state.playback_status === "playing" ? "play" : "pause", s)}>{s}×</button>
        ))}
        <button onClick={() => restart(state.scenario.id, null)} disabled={busy}>↺ Reset</button>
      </div>
      <select value={sid} onChange={(e) => {
        setSid(e.target.value);
        const sc = scenarios.find((s: any) => s.id === e.target.value);
        if (sc) setBand(sc.band);
        restart(e.target.value, null);
      }}>
        {scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <p className="muted small">{state.scenario.description}</p>
      <details>
        <summary>Steer the snowband (resets both policies together)</summary>
        {slider("rate_in_hr", "Rate", 0, 6, 0.5, " in/hr")}
        {slider("heading_deg", "Band axis", 0, 180, 5, "°")}
        {slider("width_m", "Width", 400, 5000, 100, " m")}
        {slider("offset_m", "Start offset", -4000, 4000, 100, " m")}
        {slider("wobble_amp_m", "Wobble", 0, 4000, 100, " m")}
        <button className="primary" disabled={busy} onClick={() => restart(sid, band)}>Apply & restart both</button>
      </details>
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

function Camera({ state, frames, network }: any) {
  const [sel, setSel] = useState<string | null>(null);
  const [obs, setObs] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const frame = frames.find((f: any) => f.frame_id === sel);
  const segName = (sid: string) => {
    const s = network.segments.find((x: any) => x.segment_id === sid);
    return s ? `${s.name || s.highway} (${sid})` : sid;
  };
  useEffect(() => { setObs(null); setMsg(null); }, [state.run_id, sel]);

  const analyze = async () => {
    setMsg(null);
    try {
      let o = await api("/api/observations/analyze", { run_id: state.run_id, frame_id: sel });
      setObs(o);
      for (let i = 0; i < 60 && o.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 500));
        o = await api(`/api/observations/${o.observation_id}`);
        setObs(o);
      }
    } catch (e: any) { setMsg(e.message); }
  };
  const apply = async (sid: string) => {
    try {
      const r = await api("/api/observations/apply", { run_id: state.run_id, observation_id: obs.observation_id, segment_id: sid });
      setMsg(`Accepted → applied to both worlds at tick ${r.apply_tick} (${r.effect.kind}).`);
    } catch (e: any) { setMsg(e.message); }
  };
  const kindLabel: Record<string, string> = {
    live_inference: "LIVE GEMINI", recorded_inference: "RECORDED GEMINI RESULT", synthetic_fixture: "SYNTHETIC FIXTURE",
  };
  return (
    <section>
      <h3>Camera observations → dispatch</h3>
      <div className="thumbs">
        {frames.map((f: any) => (
          <button key={f.frame_id} className={sel === f.frame_id ? "sel" : ""} onClick={() => setSel(f.frame_id)}>
            {f.frame_id}<br /><span className="small">{f.title}</span>
          </button>
        ))}
      </div>
      {frame && (
        <div className="cam">
          <img src={frame.image_url} alt={frame.title} />
          <div className="small muted">
            Source: {frame.source} · captured: {frame.observed_at || "unknown"} · maps to {frame.segment_ids.map(segName).join(", ")}
          </div>
          <button className="primary" onClick={analyze} disabled={obs?.status === "processing"}>
            {obs?.status === "processing" ? "Analyzing…" : frame.live_capable ? "Analyze with Gemini" : "Analyze (fixture — no live Gemini)"}
          </button>
          {obs?.status === "done" && obs.result && (
            <div className="obs">
              <span className={`tag ${obs.source_kind}`}>{kindLabel[obs.source_kind] || obs.source_kind}</span>
              {obs.model_id && <span className="small muted"> {obs.model_id}</span>}
              <div>Surface <b>{obs.result.surface_class}</b> · Visibility <b>{obs.result.visibility_class}</b> · Obstruction <b>{String(obs.result.obstruction_detected ?? "unknown")}</b></div>
              <div className="small muted">“{obs.result.evidence_summary}”</div>
              <div className="small">Proposed effect: <b>{obs.proposed_effect?.kind === "closure" ? "close segment (detour)" :
                obs.proposed_effect?.kind === "slowdown" ? `speed ×${obs.proposed_effect.factor}` : "none — no change needed"}</b></div>
              {obs.proposed_effect?.kind !== "none" && frame.segment_ids.map((sid: string) => (
                <button key={sid} onClick={() => apply(sid)}>Accept for {segName(sid)}</button>
              ))}
            </div>
          )}
          {obs?.status === "failed" && <div className="bad small">{obs.error}</div>}
          {msg && <div className="small">{msg}</div>}
        </div>
      )}
    </section>
  );
}

function Log({ state }: any) {
  const [tab, setTab] = useState<"adaptive" | "fixed">("adaptive");
  const log = state.policies[tab].log;
  return (
    <section>
      <h3>Dispatch decisions</h3>
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
