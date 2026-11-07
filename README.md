# SnowTwin WNY

Camera-informed snow-response simulator for Buffalo's UB South -> ECMC -> BNMC medical corridor.
One synthetic lake-effect band, one fleet, two dispatch policies (fixed-order loop vs adaptive) run
side by side under identical conditions, with measured results.

## Run it (Windows)

Requires Python 3.12 (`py -3.12`) and Node 18+.

```powershell
.\run.ps1          # installs, builds, serves http://127.0.0.1:8000
.\run.ps1 -Dev     # hot-reload UI on http://127.0.0.1:5173 (API stays on :8000)
```

Optional keys go in `.env.local` (see `.env.example`). Without them:

| Integration | With key | Without key |
|---|---|---|
| Gemini | Real image analysis of JPG/PNG frames in `data/frames` | Recorded result labeled **SYNTHETIC FIXTURE** |
| Tiger Data | Checkpoints + segment telemetry written to TimescaleDB; history endpoints work | Simulation runs in memory only |
| ElevenLabs | Generated dispatch audio | Browser TTS, labeled mock |

## Demo flow

1. Pick **Moving band (wobble)** and press Play (4x-8x).
2. Watch both maps: same storm, same three vehicles, different decisions. Metrics panel shows the difference.
3. Camera panel -> **CAM-K1** -> Analyze -> Accept: Kensington Ave near ECMC closes in both worlds and units reroute.
4. Open **Steer the snowband**, change it, and both policies restart together.

## Layout

| Path | Purpose |
|---|---|
| `backend/app/simulation.py` | Storm band, accumulation, vehicles, paired worlds, metrics |
| `backend/app/routing.py` | Legal shortest paths, fixed and adaptive policies |
| `backend/app/vision.py` | Gemini structured image classification + labeled fallback |
| `backend/app/telemetry.py` | Tiger Data schema, async writer, history queries |
| `backend/app/main.py` | FastAPI endpoints; serves `frontend/dist` |
| `frontend/src/` | React + MapLibre dashboard |
| `data/corridor.geojson` | 113-segment corridor from OpenStreetMap (`scripts/build_corridor.py`) |
| `data/scenarios/` | Scenario definitions |
| `data/frames/` | Camera frames registry. **Replace the SVG fixtures with permitted JPG/PNG captures** |

## Adding a real camera frame

1. Save a permitted capture as `data/frames/cam-K1.jpg` (note the source and capture time).
2. In `data/frames/frames.json`, set `"image": "cam-K1.jpg"`, `"source"`, `"observed_at"`, `"license_note"`.
3. With `GEMINI_API_KEY` set, Analyze sends the image to Gemini and labels the result **LIVE GEMINI**.

## Modeling assumptions (shared by both policies)

- Snowband is synthetic (not a historical replay); a segment receives the band rate when its midpoint is inside the band.
- 10 s simulation substep. Service clears a segment to 0.2 in; work is eligible from 1.0 in; 1.5 in exposure threshold is illustrative.
- Width class comes from OSM road class (not measured width). Heavy plows use wide roads only; compact blowers handle narrow streets.
- Critical corridor = Main Street plus wide roads within 450 m of ECMC/BNMC (a modeled designation).
- Adaptive policy uses the scenario's declared band motion for a 30-minute look-ahead (known-scenario planning, not a weather forecast).
- The fixed policy is the team's comparison loop, not a reconstruction of the City of Buffalo's dispatch.

Road data (c) OpenStreetMap contributors (ODbL). Basemap (c) CARTO.
