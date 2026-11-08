# SnowTwin WNY weather handoff

This work started from `main` at `33e75e4` on November 7, 2026. It adds a live forecast input and revises the synthetic storm used for the demo. Both policies still receive the same snowfall input for each road segment and simulation step.

## Run and inspect

From the repository root on Windows, `.\run.ps1` builds the dashboard and starts FastAPI at `http://127.0.0.1:8000`. Use `.\run.ps1 -Dev` for the Vite UI on port 5173. With an existing environment, `npm.cmd run build` in `frontend` updates `frontend/dist`, which FastAPI serves on the next page load. Backend changes require a server restart.

- **Moving band (wobble) → Play** shows heavier snowfall cells moving downwind through a band that shifts sideways. Faint blue patches show lighter snow in other parts of the Buffalo area. **Flow toward** sets the cells' travel bearing. **Wobble** moves the main band across that direction.
- **NWS Forecast** fetches one forecast snapshot for the run. The strip above the maps shows when the forecast was issued and which forecast time the simulation is displaying. Dashed lines mark the five fetched grid cells. At 0 in/h the snowfall fill is transparent and the strip reads **No snowfall forecast (0 in/h)**.
- The blue overlay encodes **falling snow in inches per hour**. Colored road lines encode **estimated snow depth in inches** after simulated accumulation and plowing.
- The FastAPI process needs outbound HTTPS to `api.weather.gov`. The generic retrieval error was reproduced when the local server ran with outbound access blocked. With network access, the same code received all five responses and `POST /api/scenario` successfully switched to `nws_forecast`. Use `GET /api/state` to check `scenario.id`, `weather.source`, `weather.areas`, and `weather.max_rate_in_hr` without changing the run.

NWS uses a public feed. Optional Gemini, Tiger Data, and ElevenLabs settings belong in the ignored `.env.local`. `.env.example` lists the variable names.

## Data flow and files

| Files | What they do |
| --- | --- |
| `backend/app/nws.py`, `data/scenarios/nws_forecast.json` | Fetch five Buffalo NWS grid cells. Validate polygons, millimeter units, and snowfall window coverage for six simulated hours plus the adaptive policy's 30-minute look-ahead. Map each road segment midpoint to a cell. |
| `backend/app/main.py` | Fetch and validate before switching scenarios. Preserve the active run on a fetch failure and reject a stale switch if another run started while the fetch was in flight. Archived camera footage remains visible for reference. Applying a camera observation to an NWS run requires a capture timestamp within the 30 minutes leading up to the forecast cursor. |
| `backend/app/simulation.py` | Use forecast accumulation intervals for NWS runs. For synthetic runs, the versioned `advecting-cells-regional-v2` field combines moving heavy cells with wider, weaker showers. Use the same rate model for both policies, look-ahead, and the sampled map raster. |
| `backend/app/telemetry.py` | Include NWS forecast inputs in run provenance and use the forecast cursor for checkpoint timestamps. |
| `frontend/src/App.tsx`, `MapPane.tsx`, `styles.css` | Render one snowfall field on both maps. NWS uses GeoJSON cells with dashed boundaries. Synthetic storms use a translucent raster below the road layers. Legacy checkpoints can use their saved band polygon. |

The NWS mode starts from an assumed road depth of 0 inches. It distributes each supported published snowfall total uniformly over its valid interval. The result is a grid-scale, period-average forecast used to drive modeled road accumulation. Archived camera clips are reference material for this mode. [NWS API documentation](https://www.weather.gov/documentation/services-web-api) · [NDFD snowfall metadata](https://www.weather.gov/gis/ndfd_metadata.html)

## Verification and follow-up

- The production frontend built with `npm.cmd run build`. The updated bundle was served by the local dashboard. Focused checks covered the NWS status for zero, positive, missing, and hidden data, plus the grid filter for zero snowfall. Interactive browser rendering remains to be checked.
- The November 7 live fetch mapped all 118 corridor segments to five NWS cells. At verification, the six-hour window showed 0 in/h across the covered cells. A later run will fetch its own snapshot.
- Synthetic checks confirmed positive light snowfall beyond the main band, transparent raster margins, and matching map and road rates. Two runs of each of the four synthetic scenarios produced identical metrics and scheduled events.
- [`RESULTS.md`](RESULTS.md) and [`results.json`](results.json) are archived from `8415fe0` and describe the earlier storm model. Before using a benchmark number for the current demo, rerun `.venv\Scripts\python.exe scripts\benchmark.py` from the repository root. That command rewrites both results files.
