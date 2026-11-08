import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Coordinates, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
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
export const SNOWFALL_STOPS: [rate: number, color: string, opacity: number][] = [
  [0, "#60a5fa", 0], [0.1, "#60a5fa", 0.15], [0.25, "#60a5fa", 0.21], [1, "#60a5fa", 0.28],
  [2, "#60a5fa", 0.36], [4, "#93c5fd", 0.50], [8, "#dbeafe", 0.62],
];
const snowfallColor: ExpressionSpecification = [
  "interpolate", ["linear"], ["number", ["get", "rate_in_hr"], 0], ...SNOWFALL_STOPS.flatMap(([rate, color]) => [rate, color]),
];
const snowfallOpacity: ExpressionSpecification = [
  "interpolate", ["linear"], ["number", ["get", "rate_in_hr"], 0], ...SNOWFALL_STOPS.flatMap(([rate, , opacity]) => [rate, opacity]),
];
export type SnowfallAreas = FeatureCollection<Polygon | MultiPolygon, { rate_in_hr: number; grid_id?: string; outline?: boolean }>;
export type SnowfallField = {
  corners: [number, number][];
  width: number;
  height: number;
  rates_in_hr: number[];
  max_rate_in_hr: number;
  contours?: { level: number; label: string; lines: [number, number][][] }[];
};
const NO_SNOWFALL: SnowfallAreas = { type: "FeatureCollection", features: [] };
const FIELD_ID = "snowfall-field";
const fieldImages = new WeakMap<SnowfallField, string>();
const snowfallRgbaStops = SNOWFALL_STOPS.map(([rate, color, opacity]) => {
  const rgb = Number.parseInt(color.slice(1), 16);
  return [rate, rgb >> 16, (rgb >> 8) & 255, rgb & 255, opacity * 255];
});

type Props = {
  title: string;
  accent: string;
  network: any;
  world: any;
  snowfall: SnowfallAreas | null;
  snowfallField?: SnowfallField | null;
  env: any;
  syncKey: string;
  maps: React.MutableRefObject<Record<string, maplibregl.Map>>;
  frames: any[];
  selectedCam: string | null;
  onCameraClick: (id: string) => void;
  camState: Record<string, string>;
};

export default function MapPane({ title, accent, network, world, snowfall, snowfallField, env, syncKey, maps, frames, selectedCam, onCameraClick, camState }: Props) {
  const camMarkers = useRef<Record<string, maplibregl.Marker>>({});
  const clickRef = useRef(onCameraClick);
  clickRef.current = onCameraClick;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const [basemap, setBasemap] = useState("loading");
  const latest = useRef({ world, snowfall, snowfallField, env });
  latest.current = { world, snowfall, snowfallField, env };

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
    const resizeObserver = new ResizeObserver(() => m.resize());
    resizeObserver.observe(el.current!);
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
      updateSnowfallField(m, latest.current.snowfallField);
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
    // Snow Plan critical facilities (hospitals, police, fire): streets around them are tier-1 priority.
    const icon: Record<string, string> = { hospital: "H", police: "P", fire: "F", critical: "C" };
    for (const f of network.facilities || []) {
      const d = document.createElement("div");
      d.className = `facility ${f.kind}`;
      d.textContent = icon[f.kind] || "•";
      d.title = `${f.name} — ${f.address} (Snow Plan critical facility)`;
      new maplibregl.Marker({ element: d }).setLngLat(f.lonlat).addTo(m);
    }
    return () => { clearTimeout(timer); resizeObserver.disconnect(); delete maps.current[syncKey]; m.remove(); };
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
        // Same stroke "video" icon as the side panel; focusable so keyboard users can open it.
        d.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h12v10H3zM15 10l6-3v10l-6-3"/></svg>';
        d.tabIndex = 0;
        d.setAttribute("role", "button");
        d.addEventListener("click", (e) => { e.stopPropagation(); clickRef.current(f.frame_id); });
        d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickRef.current(f.frame_id); } });
        mk = new maplibregl.Marker({ element: d }).setLngLat(f.lonlat).addTo(m);
        camMarkers.current[f.frame_id] = mk;
      }
      mk.setLngLat(f.lonlat);
      mk.getElement().title = camState[f.frame_id] === "reference" ? f.title + " · Reference only" : f.title;
      mk.getElement().setAttribute("aria-label", `Open camera: ${f.title}`);
      mk.getElement().classList.toggle("sel", f.frame_id === selectedCam);
      mk.getElement().dataset.state = camState?.[f.frame_id] || "";
    }
    for (const id of Object.keys(camMarkers.current)) if (!seen.has(id)) { camMarkers.current[id].remove(); delete camMarkers.current[id]; }
  }, [frames, selectedCam, camState]);

  useEffect(() => {
    if (map.current && ready.current) update(map.current, network, { world, snowfall, env }, markers.current);
  }, [world, snowfall, env]);

  useEffect(() => {
    if (map.current && ready.current) updateSnowfallField(map.current, snowfallField);
  }, [snowfallField]);

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
  m.addSource("snowfall", { type: "geojson", data: NO_SNOWFALL });
  m.addSource("roads", { type: "geojson", data: roadsFC(network, null, null) });
  m.addLayer({ id: "snowfall-fill", type: "fill", source: "snowfall", paint: {
    "fill-color": snowfallColor, "fill-opacity": snowfallOpacity, "fill-antialias": false,
  } });
  m.addLayer({ id: "band-line", type: "line", source: "snowfall", filter: ["==", ["get", "outline"], true], paint: {
    "line-color": "#93c5fd", "line-opacity": snowfallOpacity, "line-dasharray": [2, 2],
  } });
  m.addSource("snowfall-contours", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
  // Dark halo under the dashes keeps the snowband boundary readable on any basemap.
  m.addLayer({ id: "contour-halo", type: "line", source: "snowfall-contours", layout: { "line-join": "round" }, paint: {
    "line-color": "#0b1220", "line-opacity": 0.55, "line-width": ["case", [">=", ["get", "level"], 2], 4.5, 3.5],
  } });
  // line-dasharray cannot be data-driven in MapLibre 4, so edge and core are separate layers.
  m.addLayer({ id: "contour-edge", type: "line", source: "snowfall-contours", filter: ["<", ["get", "level"], 2],
    layout: { "line-join": "round" }, paint: { "line-color": "#7dd3fc", "line-width": 1.6, "line-dasharray": [4, 3] } });
  m.addLayer({ id: "contour-core", type: "line", source: "snowfall-contours", filter: [">=", ["get", "level"], 2],
    layout: { "line-join": "round" }, paint: { "line-color": "#f0f9ff", "line-width": 2.2, "line-dasharray": [2, 1.5] } });
  m.addLayer({ id: "nws-grid-boundaries", type: "line", source: "snowfall", filter: ["has", "grid_id"], paint: {
    "line-color": "#9fb1cb", "line-opacity": 0.7, "line-width": 1.2, "line-dasharray": [3, 2],
  } });
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

function snowfallPixels(rates: number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(rates.length * 4);
  const last = snowfallRgbaStops.length - 1;
  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i];
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const upper = snowfallRgbaStops.findIndex(([stop], j) => j > 0 && rate <= stop);
    const to = snowfallRgbaStops[upper < 0 ? last : upper];
    const from = upper < 0 ? to : snowfallRgbaStops[upper - 1];
    const ratio = upper < 0 ? 0 : (rate - from[0]) / (to[0] - from[0]);
    for (let channel = 1; channel <= 4; channel++) {
      pixels[i * 4 + channel - 1] = from[channel] + (to[channel] - from[channel]) * ratio;
    }
  }
  return pixels;
}

function updateContours(m: maplibregl.Map, field?: SnowfallField | null) {
  const src = m.getSource("snowfall-contours") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const features = (field?.contours || []).flatMap((c) => c.lines.map((line) => ({
    type: "Feature", properties: { level: c.level, label: c.label }, geometry: { type: "LineString", coordinates: line },
  })));
  src.setData({ type: "FeatureCollection", features } as any);
}

function updateSnowfallField(m: maplibregl.Map, field?: SnowfallField | null) {
  updateContours(m, field);
  const source = m.getSource<maplibregl.ImageSource>(FIELD_ID);
  if (!field || !(field.max_rate_in_hr > 0) || field.corners.length !== 4 ||
    !Number.isInteger(field.width) || field.width <= 0 || !Number.isInteger(field.height) ||
    field.height <= 0 || field.rates_in_hr.length !== field.width * field.height) {
    if (source) m.setLayoutProperty(FIELD_ID, "visibility", "none");
    return;
  }
  let url = fieldImages.get(field);
  if (!url) {
    const canvas = document.createElement("canvas");
    canvas.width = field.width;
    canvas.height = field.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(field.width, field.height);
    image.data.set(snowfallPixels(field.rates_in_hr));
    context.putImageData(image, 0, 0);
    url = canvas.toDataURL("image/png");
    fieldImages.set(field, url);
  }
  const coordinates = field.corners as Coordinates;
  if (source) {
    if (source.url !== url || coordinates.some(([lon, lat], i) => lon !== source.coordinates[i][0] || lat !== source.coordinates[i][1])) {
      source.updateImage({ url, coordinates });
    }
    m.setLayoutProperty(FIELD_ID, "visibility", "visible");
  } else {
    m.addSource(FIELD_ID, { type: "image", url, coordinates });
    m.addLayer({
      id: FIELD_ID, type: "raster", source: FIELD_ID,
      paint: { "raster-resampling": "linear", "raster-fade-duration": 0 },
    }, "roads-casing");
  }
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

function update(m: maplibregl.Map, network: any, data: { world: any; snowfall: SnowfallAreas | null; env: any }, markers: Record<string, maplibregl.Marker>) {
  const { world, snowfall, env } = data;
  if (!world) return;
  (m.getSource("snowfall") as maplibregl.GeoJSONSource)?.setData(snowfall ?? NO_SNOWFALL);
  (m.getSource("roads") as maplibregl.GeoJSONSource)?.setData(roadsFC(network, world, env));
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
