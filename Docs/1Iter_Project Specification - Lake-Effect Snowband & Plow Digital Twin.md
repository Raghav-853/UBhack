# SnowTwin WNY: Predictive Lake-Effect Snowband & Fleet Digital Twin
**Event:** UB Hacking 2026 (24-Hour Hackathon)  
**Primary Track:** Radial Atoms (Physical Telemetry, Computer Vision & Real-Time Simulation)  
**Sponsor Tracks:** Google Gemini API, Tiger Data (Timescale/PostgreSQL), ElevenLabs  

---

## 1. Executive Summary
During severe Western New York lake-effect events, snow bands measuring just $10\text{--}20\text{ miles}$ wide can drop $3\text{--}4\text{ inches}$ of snow per hour while areas two miles away remain completely clear. As these bands oscillate ("wobble") across the metro area, freshly plowed streets become impassable again within $20\text{ minutes}$, stranding motorists and blocking emergency corridors to trauma centers like ECMC and the Buffalo Niagara Medical Campus (BNMC).

**SnowTwin WNY** is a closed-loop physical digital twin that fuses live NYSDOT traffic camera vision, meteorological snowband polygons, and a time-series road-state simulation to dynamically route Buffalo's heterogeneous winter fleet before streets lock up.

---

## 2. How We Differ from Current Systems

Existing municipal and state winter tools operate in isolated silos and rely on **reactive historical tracking** rather than **predictive physical state modeling**.

| Feature / Capability | Current Systems (City of Buffalo & NYSDOT 511NY) | SnowTwin WNY (Our Digital Twin) |
| :--- | :--- | :--- |
| **Road Condition Tracking** | **Reactive GPS Breadcrumbs:** The City of Buffalo Snow Tracker only colors a street based on *elapsed time since a plow last passed*, assuming a plowed street remains clear. | **Predictive Re-Accumulation State:** Calculates real-time snow depth and passability decay on every road segment based on active snowband intensity and time since last service. |
| **Traffic Camera Usage** | **Passive Human Viewing:** 511NY streams hundreds of raw camera feeds that dispatchers must manually inspect one by one. | **Automated Vision Telemetry:** Gemini 2.5 Flash continuously analyzes live camera frames to output structured JSON on snow cover, visibility, and stranded/illegally parked cars. |
| **Weather Integration** | **Decoupled Forecasts:** NWS Lake-Effect Warning polygons sit on weather maps, completely disconnected from fleet routing software. | **Spatial-Temporal Coupling:** Weather polygons directly drive the edge-weight decay function on the street graph in real time. |
| **Fleet Routing Strategy** | **Static Tiered Routes:** Plows follow fixed Primary, Secondary, and Residential loops regardless of where the narrow lake-effect band is wobbling. | **Dynamic Heterogeneous Dispatch:** Matches specific vehicle types (heavy plows, compact John Deere snow blowers, tow trucks) to street widths, obstructions, and hospital priority corridors. |
| **Dispatcher Alerts** | **Manual Radio Reports:** Drivers call in blocked side streets after getting stuck. | **Proactive AI Voice Dispatch:** ElevenLabs generates automated CB-radio style alerts when vision or simulation thresholds breach safety limits. |

### Deep Dive: Why Current Buffalo Systems Fall Short
1. **The "Plowed $\neq$ Passable" Fallacy:** In the City of Buffalo's 2026–2027 tracker upgrade, a street plowed $35\text{ minutes}$ ago shows up as "Recently Serviced." However, under a $3.5\text{ in/hr}$ lake-effect band, that street already has over $2\text{ inches}$ of fresh accumulation and drifting. SnowTwin models the **actual physical snow depth** on the asphalt, not just vehicle history.
2. **The "Snowband Wobble" Blind Spot:** Because lake-effect bands pivot north and south off Lake Erie, static district assignments leave plows circulating in dry zones while adjacent neighborhoods get buried. Our graph router continuously shifts fleet capacity toward the active snowband vector.
3. **Heterogeneous Fleet Constraints:** Buffalo's 2026–2027 Winter Plan introduced five compact John Deere blower tractors specifically for narrow residential streets alongside heavy salt trucks and tow-truck strike teams. Current trackers treat all plows identically; our digital twin enforces physical street-width constraints on graph edges so heavy plows are never routed down tight side streets obstructed by parked cars.

---

## 3. 24-Hour Hackathon Scope ("Corridor + Storm Replay" MVP)

To guarantee a polished, end-to-end working demo within $24\text{ hours}$, we are scoping the physical simulation to a high-impact **Medical & University Corridor** rather than the entire county:

* **Bounded Street Graph (~120 Edges):** Extracted via `OSMnx` covering the Main Street spine from **UB South Campus**, past **ECMC** (Level 1 Trauma Center), down to the **Buffalo Niagara Medical Campus (BNMC)**, including adjacent narrow residential side streets in the Masten and University districts.
* **Dual-Mode Operation (Live + Interactive Simulator):**
  * **Live Telemetry Mode:** Pulls current NYSDOT 511NY camera snapshots and live NOAA wind/radar data for Buffalo.
  * **Interactive "Storm Replay" Mode:** Allows hackathon judges to drag, rotate, and intensify a synthetic $4\text{ in/hr}$ lake-effect snowband across the 3D map, immediately triggering camera condition overrides, rapid road decay, dynamic fleet re-routing, and ElevenLabs voice dispatches.

---

## 4. Physical Simulation & Mathematical Model

Each street segment in our OpenStreetMap graph is modeled as a directed edge $e \in E$ with physical attributes (length $L_e$, width $W_e$, priority tier $P_e \in \{1, 2, 3\}$, and emergency hospital corridor flag $H_e \in \{0, 1\}$).

### Snow Accumulation & Vision Fusion
At every simulation tick $\Delta t$, the estimated snow depth $S_e(t + \Delta t)$ (in inches) on road edge $e$ updates according to:

$$S_e(t + \Delta t) = \left(1 - \alpha_e\right) \left[ S_e(t) + R_{\text{band}}(e, t) \cdot \Delta t \right] + \alpha_e \cdot S_{\text{vision}}(e, t)$$

Where:
* $R_{\text{band}}(e, t)$ is the snowfall rate ($\text{in/hr}$) at edge $e$ based on its spatial intersection with the active lake-effect polygon.
* $S_{\text{vision}}(e, t)$ is the ground-truth snow depth proxy extracted by **Gemini Vision** from the nearest 511NY traffic camera.
* $\alpha_e \in [0, 1]$ is the camera confidence weighting factor ($\alpha_e = 0.7$ for edges with an active camera feed; $\alpha_e = 0$ for unmonitored side streets).

### Edge Traversal Cost & Fleet Assignment
A street's passability score $C_e(t) \in [0, 100]$ decays as snow depth $S_e(t)$ increases. For dynamic routing, each edge is assigned an urgency weight $U_e(t)$:

$$U_e(t) = S_e(t)^2 \cdot \left(1 + \beta H_e\right) \cdot \frac{1}{P_e}$$

Where $\beta = 3.0$ heavily prioritizes keeping ambulance routes to ECMC and BNMC below a critical threshold ($S_e(t) < 1.5\text{ inches}$).

* **Vehicle Dispatch Rules:**
  * **Heavy Arterial Plows:** Assigned to edges with width $W_e \ge 28\text{ ft}$ and $P_e \in \{1, 2\}$.
  * **Compact John Deere Blowers:** Assigned to narrow residential edges where $W_e < 28\text{ ft}$ and $S_e(t) > 3.0\text{ inches}$.
  * **Tow Truck Strike Team:** Dispatched immediately when Gemini Vision detects an obstruction (`obstruction_detected == true`) on an emergency corridor.

---

## 5. System Architecture & Tech Stack

1. **Physical Perception Layer (Gemini API + 511NY):**
   * Python worker fetches live keyframes from NYSDOT 511NY traffic cameras along Main St, Kensington Expy (Rt 33), and I-190.
   * Sends frames to `gemini-2.5-flash` with Structured Outputs enabled to return `{ "snow_coverage_pct": int, "visibility_score": int, "obstruction_detected": bool, "recommended_unit": str }`.
2. **Time-Series State Engine (Tiger Data / TimescaleDB):**
   * Stores road network topology and a hypertable `road_segment_telemetry (timestamp, edge_id, snow_depth_in, passability_score, active_unit_id)`.
   * Enables instant time-travel slider queries so judges can scrub backward and forward through a 6-hour storm window.
3. **Simulation & Routing Backend (FastAPI + OSMnx + NetworkX):**
   * Runs the tick loop every $2\text{ seconds}$ (representing $5\text{ minutes}$ of storm time in Simulator Mode).
   * Solves greedy capacitated arc routing for each active plow unit to maximize total urgency $U_e(t)$ cleared per tick.
4. **Command Center UI & Voice Dispatch (React + Deck.gl + ElevenLabs):**
   * 3D dark-mode map rendering road segments color-coded from emerald green ($S_e < 0.5\text{ in}$) to crimson red ($S_e > 4.0\text{ in}$).
   * Interactive draggable Lake Erie snowband polygon overlay.
   * **ElevenLabs API** synthesizes realistic radio dispatch audio whenever an emergency corridor crosses critical snow depth or a camera detects a stranded vehicle.

---

## 6. 24-Hour Hackathon Build Schedule

* **Phase 1: Foundation & Data Ingestion (Hours 1–6)**
  * Extract the UB South $\rightarrow$ ECMC $\rightarrow$ BNMC street graph using `OSMnx` and export as GeoJSON.
  * Spin up **Tiger Data** PostgreSQL instance and create the `road_segment_telemetry` hypertable.
  * Build the Gemini Vision pipeline to parse 511NY camera images into structured JSON.
* **Phase 2: Simulation Loop & Heterogeneous Router (Hours 6–12)**
  * Implement the snowband polygon intersection math and snow accumulation formula in FastAPI.
  * Write the multi-vehicle routing algorithm (Heavy Plows vs. Compact Blowers vs. Tow Trucks).
* **Phase 3: Interactive Digital Twin Frontend (Hours 12–18)**
  * Build the React + Mapbox/Deck.gl dashboard with animated plow icons and real-time color-coded street edges.
  * Add the draggable "Lake-Effect Band Controller" so users can steer the storm in real time.
* **Phase 4: Voice Dispatch, Polish & Pitch Prep (Hours 18–24)**
  * Connect **ElevenLabs** audio streaming for automated dispatch callouts.
  * Record fallback demo video, finalize Devpost submission, and rehearse the 3-minute live judge demo.