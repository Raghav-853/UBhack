# SnowTwin WNY

Weather-driven snow-response simulator for Buffalo's UB South -> ECMC -> BNMC medical corridor.
Choose a synthetic lake-effect band or a National Weather Service snowfall forecast. One fleet (one heavy plow + one compact unit)
and two dispatch policies (fixed-order loop vs adaptive) run side by side under identical conditions.
Camera input is archived December 2022 Buffalo blizzard footage analyzed by Gemini; a dispatcher
approves or rejects each proposed effect.

## Run it (Windows)

Requires Python 3.12 (`py -3.12`) and Node 18+.

```powershell
.\run.ps1          # installs, builds, serves http://127.0.0.1:8000
.\run.ps1 -Dev     # hot-reload UI on http://127.0.0.1:5173 (API stays on :8000)
```

Optional keys go in `.env.local` (see `.env.example`). Without them:

| Integration | With key | Without key |
|---|---|---|
| Gemini | Automatic analysis of each camera video/image (`GEMINI_MODEL`, falls back to `GEMINI_FALLBACK_MODEL`); every live result is saved in `data/frames/recorded/`. On restart the saved result for the same media is reused (no model call); **↻ Re-analyze** forces a live call | Saved result replayed, labeled **RECORDED GEMINI RESULT** |
| Tiger Data | Checkpoints + segment telemetry written to TimescaleDB; history endpoints work | Simulation runs in memory only |
| ElevenLabs | Generated dispatch audio | Text alerts (browser TTS fallback) |

## Demo flow

1. Pick **Moving band (wobble)** and press Play (4x-8x).
2. Watch both maps: same storm, same two vehicles, different decisions. Metrics panel shows the difference.
3. **Camera alerts** (top of sidebar) or a 📹 icon on the map: each archive clip has already been analyzed by Gemini.
   Approve the Main St (Cold Spring) proposal: a visibility slowdown applies to both worlds at the same tick.
4. Open **Steer the snowband**, change it, and both policies restart together (decisions reset per run).

In synthetic storms, faint blue shows patches of light snow across the Buffalo area, including places beyond
the main band. Brighter blue shows heavier snowfall. **Flow toward** sets the direction of the heavy cells and
**Wobble** shifts the band sideways. The same simulated rates drive the map and road accumulation. Archived
results in `Docs/RESULTS.md` use the storm model identified by the scenario versions in that report.

## NWS forecast and snowfall overlay

Select **NWS Forecast** to fetch a six-hour forecast for the five NWS cells covering the corridor. Each run uses one snapshot
for both policies. The maps display forecast snowfall intensity in inches per hour as a translucent area layer.
Dashed lines mark the forecast grid boundaries. At 0 in/h the snowfall fill is transparent and the status above the maps shows the zero forecast.
Road lines show the modeled snow remaining on the road, which changes after plowing.

This mode starts from an assumed 0 inches of road snow. It spreads each supported NWS snowfall total uniformly across
its valid period, so the overlay shows a period-average rate. Missing coverage or unsupported accumulation windows
leave the active run in place and display an error. NWS is a public feed and requires an internet connection.
The camera viewer keeps archived footage available for reference. For a camera observation to affect a forecast run,
its capture time must fall within the 30 minutes leading up to the forecast cursor.

Sources: [NWS API](https://www.weather.gov/documentation/services-web-api) and [NDFD snowfall metadata](https://www.weather.gov/gis/ndfd_metadata.html).

See [the weather handoff](Docs/WEATHER_HANDOFF.md) for the data flow, verification, and demo checks.

## Layout

| Path | Purpose |
|---|---|
| `backend/app/simulation.py` | Storm band, accumulation, vehicles, paired worlds, metrics |
| `backend/app/nws.py` | NWS grid lookup, validation, and snowfall forecast snapshots |
| `backend/app/routing.py` | Legal shortest paths, fixed and adaptive policies |
| `backend/app/vision.py` | Gemini structured image classification + labeled fallback |
| `backend/app/telemetry.py` | Tiger Data schema, async writer, history queries |
| `backend/app/main.py` | FastAPI endpoints; serves `frontend/dist` |
| `frontend/src/` | React + MapLibre dashboard |
| `data/corridor.geojson` | 118-segment corridor from OpenStreetMap incl. Laurel St (`scripts/build_corridor.py`, stable segment IDs) |
| `data/scenarios/` | Scenario definitions |
| `data/frames/frames.json`, `clips/` | Archived Main St / Laurel St blizzard videos (Wikimedia Commons, CC BY-SA 4.0, see `clips/ATTRIBUTION.md`) |
| `data/frames/recorded/` | Saved genuine Gemini results (per media hash) for replay |

## Adding camera media

- Shared: put the file in `data/frames/clips/` and add an entry to `data/frames/frames.json`
  (`frame_id`, `title`, `media`, `source`, `source_url`, `license_note`, `observed_at`, `observed_at_precision`,
  `segment_ids`, `relation: on_segment|adjacent`, `mapping_note`).
- Local only: dashboard -> Road cameras -> **＋ Add camera image/video** (uploads are git-ignored).
- Gemini analyzes new media automatically; the dispatcher only approves or rejects the proposal.

## Modeling assumptions (shared by both policies)

- Synthetic scenarios sample the modeled snowfall field at each segment midpoint. NWS runs use the forecast of the grid cell containing the midpoint.
- 10 s simulation substep. Service clears a segment to 0.2 in; work is eligible from 1.0 in; 1.5 in exposure threshold is illustrative.
- Width class comes from OSM road class (not measured width; the city road dataset has no width field). Heavy plow: wide roads only. Compact unit: may service either class.
- Bidirectional travel is an MVP simplification; one-way and turn restrictions are not modeled.
- A vehicle already inside a newly closed segment continues to the next node, then replans.
- Critical corridor = Main Street plus wide roads within 450 m of ECMC/BNMC (a modeled designation).
- Adaptive policy uses a 30-minute look-ahead from the active scenario's snowfall source.
- The fixed policy is the team's comparison loop, not a reconstruction of the City of Buffalo's dispatch.

Road data (c) OpenStreetMap contributors (ODbL). Basemap (c) CARTO.
