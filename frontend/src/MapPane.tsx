import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const BLANK: any = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1220" } }],
};

export const DEPTH_STOPS: [number, string][] = [
  [0, "#22c55e"], [0.75, "#a3e635"], [1.25, "#facc15"], [1.75, "#f97316"], [3, "#ef4444"], [4, "#991b1b"],
];

type Props = {
  title: string;
  accent: string;
  network: any;
  world: any;
  band: any;
  env: any;
  syncKey: string;
  maps: React.MutableRefObject<Record<string, maplibregl.Map>>;
  frames: any[];
  selectedCam: string | null;
  onCameraClick: (id: string) => void;
};

export default function MapPane({ title, accent, network, world, band, env, syncKey, maps, frames, selectedCam, onCameraClick }: Props) {
  const camMarkers = useRef<Record<string, maplibregl.Marker>>({});
  const clickRef = useRef(onCameraClick);
  clickRef.current = onCameraClick;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const [basemap, setBasemap] = useState("loading");
  const latest = useRef({ world, band, env });
  latest.current = { world, band, env };

  useEffect(() => {
    const b = network.bounds;
    const m = new maplibregl.Map({
      container: el.current!,
      style: STYLE,
      bounds: [[b[0], b[1]], [b[2], b[3]]],
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true, customAttribution: "Road network © OpenStreetMap contributors (ODbL)" },
    });
    map.current = m;
    maps.current[syncKey] = m;
    let styled = false;
    const fallback = () => {
      if (styled) return;
      styled = true;
      setBasemap("offline");
      m.setStyle(BLANK);
    };
    const timer = setTimeout(fallback, 7000);
    m.on("error", () => { if (!ready.current) fallback(); });
    m.on("style.load", () => {
      if (m.getStyle().layers.length > 1) { styled = true; setBasemap("carto"); }
      clearTimeout(timer);
      addLayers(m, network);
      ready.current = true;
      update(m, network, latest.current, markers.current);
    });
    // camera sync between the paired maps
    m.on("move", (e: any) => {
      if (!e.originalEvent) return;
      for (const [k, other] of Object.entries(maps.current)) {
        if (k !== syncKey) other.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() });
      }
    });
    for (const [name, ll] of Object.entries<any>(network.landmarks)) {
      const d = document.createElement("div");
      d.className = "landmark";
      d.innerHTML = `<span class="star">✚</span>${name}`;
      new maplibregl.Marker({ element: d, anchor: "left" }).setLngLat(ll).addTo(m);
    }
    return () => { clearTimeout(timer); delete maps.current[syncKey]; m.remove(); };
  }, [network]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const f of frames || []) {
      if (!f.lonlat) continue;
      seen.add(f.frame_id);
      let mk = camMarkers.current[f.frame_id];
      if (!mk) {
        const d = document.createElement("div");
        d.className = "cctv";
        d.textContent = "📹";
        d.addEventListener("click", (e) => { e.stopPropagation(); clickRef.current(f.frame_id); });
        mk = new maplibregl.Marker({ element: d }).setLngLat(f.lonlat).addTo(m);
        camMarkers.current[f.frame_id] = mk;
      }
      mk.setLngLat(f.lonlat);
      mk.getElement().title = f.title;
      mk.getElement().classList.toggle("sel", f.frame_id === selectedCam);
    }
    for (const id of Object.keys(camMarkers.current)) if (!seen.has(id)) { camMarkers.current[id].remove(); delete camMarkers.current[id]; }
  }, [frames, selectedCam]);

  useEffect(() => {
    if (map.current && ready.current) update(map.current, network, { world, band, env }, markers.current);
  }, [world, band, env]);

  return (
    <div className="pane">
      <div className="pane-title" style={{ borderColor: accent }}>
        <span style={{ color: accent }}>{title}</span>
        {basemap === "offline" && <span className="muted"> · basemap offline (local geometry only)</span>}
      </div>
      <div ref={el} className="map" />
    </div>
  );
}

function addLayers(m: maplibregl.Map, network: any) {
  if (m.getSource("roads")) return;
  m.addSource("band", { type: "geojson", data: emptyFC() });
  m.addSource("roads", { type: "geojson", data: roadsFC(network, null, null) });
  m.addLayer({ id: "band-fill", type: "fill", source: "band", paint: { "fill-color": "#60a5fa", "fill-opacity": 0.16 } });
  m.addLayer({ id: "band-line", type: "line", source: "band", paint: { "line-color": "#93c5fd", "line-opacity": 0.6, "line-dasharray": [2, 2] } });
  m.addLayer({
    id: "roads-casing", type: "line", source: "roads", filter: ["==", ["get", "critical"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-opacity": 0.22, "line-width": 9 },
  });
  const ramp: any[] = ["interpolate", ["linear"], ["get", "depth"]];
  DEPTH_STOPS.forEach(([v, c]) => ramp.push(v, c));
  m.addLayer({
    id: "roads", type: "line", source: "roads",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ramp as any,
      "line-width": ["case", ["get", "critical"], 5, ["==", ["get", "width"], "narrow"], 2, 3.2],
    },
  });
  m.addLayer({
    id: "roads-route", type: "line", source: "roads", filter: ["==", ["get", "route"], true],
    paint: { "line-color": "#ffffff", "line-width": 1.6, "line-dasharray": [1.5, 1.5] },
  });
  m.addLayer({
    id: "roads-slow", type: "line", source: "roads", filter: ["==", ["get", "slow"], true],
    paint: { "line-color": "#c084fc", "line-width": 8, "line-opacity": 0.55, "line-dasharray": [0.6, 1.2] },
  });
  m.addLayer({
    id: "roads-closed", type: "line", source: "roads", filter: ["==", ["get", "closed"], true],
    paint: { "line-color": "#f43f5e", "line-width": 8, "line-dasharray": [1, 1] },
  });
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
  m.on("mousemove", "roads", (e: any) => {
    m.getCanvas().style.cursor = "pointer";
    const p = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(
      `<b>${p.name || p.highway}</b> <span class="muted">${p.sid}</span><br/>` +
      `Est. depth <b>${Number(p.depth).toFixed(1)} in</b>${p.critical ? " · critical" : ""}<br/>` +
      `${p.width === "narrow" ? "Narrow (compact blower)" : "Wide (heavy plow)"}` +
      `${p.closed ? "<br/><b style='color:#f43f5e'>Closed (accepted camera event)</b>" : ""}`
    ).addTo(m);
  });
  m.on("mouseleave", "roads", () => { m.getCanvas().style.cursor = ""; popup.remove(); });
}

function emptyFC() {
  return { type: "FeatureCollection", features: [] } as any;
}

function roadsFC(network: any, world: any, env: any) {
  const closed = new Set((env?.closures || []).map((c: any) => c.segment_id));
  const slow = new Set((env?.slowdowns || []).map((c: any) => c.segment_id));
  const route = new Set<string>();
  for (const v of world?.vehicles || []) for (const s of v.route_segments || []) route.add(s);
  return {
    type: "FeatureCollection",
    features: network.segments.map((s: any) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: s.coords },
      properties: {
        sid: s.segment_id, name: s.name, highway: s.highway, critical: s.critical, width: s.width_class,
        depth: world ? world.segments[s.segment_id][0] : 0,
        closed: closed.has(s.segment_id), slow: slow.has(s.segment_id), route: route.has(s.segment_id),
      },
    })),
  } as any;
}

function update(m: maplibregl.Map, network: any, data: any, markers: Record<string, maplibregl.Marker>) {
  const { world, band, env } = data;
  if (!world) return;
  (m.getSource("roads") as maplibregl.GeoJSONSource)?.setData(roadsFC(network, world, env));
  if (band?.polygon && band.rate_in_hr > 0) {
    (m.getSource("band") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...band.polygon, band.polygon[0]]] } }],
    } as any);
  } else {
    (m.getSource("band") as maplibregl.GeoJSONSource)?.setData(emptyFC());
  }
  const seen = new Set<string>();
  for (const v of world.vehicles) {
    seen.add(v.vehicle_id);
    let mk = markers[v.vehicle_id];
    if (!mk) {
      const d = document.createElement("div");
      d.className = `veh ${v.type}`;
      d.textContent = v.vehicle_id;
      mk = new maplibregl.Marker({ element: d }).setLngLat(v.lonlat).addTo(m);
      markers[v.vehicle_id] = mk;
    }
    mk.setLngLat(v.lonlat);
    mk.getElement().dataset.status = v.status;
    mk.getElement().title = `${v.label} · ${v.status}${v.explanation?.target_name ? " → " + v.explanation.target_name : ""}`;
  }
  for (const id of Object.keys(markers)) if (!seen.has(id)) { markers[id].remove(); delete markers[id]; }
}
