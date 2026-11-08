# SnowTwin WNY — Master Execution Plan

**Event:** UB Hacking 2026, November 7–8, 2026  
**Repository:** [Raghav-853/UBhack](https://github.com/Raghav-853/UBhack)  
**Prepared:** November 7, 2026  
**Primary target:** Radial Atoms  
**Secondary targets:** General Hack and AI/ML; genuine completed sponsor integrations  
**Status:** Partial implementation; source recovery verified at commit `e4a2533` on November 7, approximately 5:16 PM America/New_York. The simulation is restored, all backend modules pass Python syntax parsing, and the scanned application source has no merge-conflict markers. Runtime/build readiness, sponsor operations, and performance results remain unverified. The scenarios still contain three vehicles, compact equipment is still excluded from most wide-road service, and the registry still contains synthetic media; these remain implementation gaps against the confirmed scope below. Use [Implementation audit and remaining work](IMPLEMENTATION_AUDIT_AND_REMAINING_WORK.md) for current evidence, verification history, and the active backlog.

**Confirmed delivery baseline:** draft submission by **11:00 PM tonight**; exactly one heavy plow and one compact unit per policy; simplified bidirectional routing; the three archived Main/Laurel Street videos as primary imagery; Gemini, Tiger Data, and ElevenLabs as selected sponsor targets. Compact equipment may service either modeled road class; heavy equipment stays on wide roads. 511NY is secondary and time permitting. Historical snowfall is context, not measured road depth.

> **Build a camera-informed snow-response simulator that shows where roads will accumulate snow again, assigns compatible vehicles, and measures the difference against a fixed-route comparison policy.**

This plan refines [the first-iteration specification](1Iter_Project%20Specification%20-%20Lake-Effect%20Snowband%20%26%20Plow%20Digital%20Twin.md). Its scope, measurement rules, and modeling corrections are the recommended implementation baseline. Winning is the objective, not a guaranteed outcome.

## 1. The strategy

Win through one coherent proof: **a local physical problem, an observable AI contribution, a working feedback loop, and an honest comparison.** A judge should understand the problem within 15 seconds and see the system respond within the next minute.

The product question is: **“With the same fleet, how should dispatch change when a narrow snowband moves?”**

The public-facing distinction is service history versus scenario-based planning. Buffalo's published snow plan explicitly says its public map records service timing and does not establish that a road is safe or clear. Present SnowTwin as a planning prototype that adds estimated re-accumulation and policy comparison. Do not attribute an unsupported assumption or an inferior operational algorithm to the city. [City winter plan](https://www.buffalony.gov/DocumentCenter/View/18119/SNOW-PLAN_26-27_FINAL-compressed)

### Prize priorities

| Priority | Category | The proof to show | Investment rule |
| :--- | :--- | :--- | :--- |
| 1 | Radial Atoms | AI observation changes a simulated physical system; Buffalo/WNY use case | Protect this complete causal loop first |
| 2 | General Hack / AI/ML | Useful problem, functioning software, constrained dispatch, reproducible comparison | Spend remaining core engineering time here |
| 3 | Gemini API | Real image input, validated structured output, visible downstream consequence | An image caption alone is insufficient for our internal standard |
| 4 | Tiger Data | Actual time-series writes and a history/comparison query used by the application | Finish after the in-memory loop works |
| 5 | UI/UX | Understandable map, explanations, units, controls, and degraded states | Polish the existing workflow |
| 6 | ElevenLabs | Actual generated dispatch audio tied to a deduplicated event | Selected sponsor target; integrate after the physical/image loop, with operation-level evidence |

The official Radial Atoms prompt permits hardware, sensors, data, or simulation; hardware is optional, and Buffalo/WNY benefit may receive extra consideration. It lists one $1,000 winner. General Hack lists $1,500, $1,000, and $500 places. The site requires explicit Devpost opt-in and a usage explanation for each intended MLH sponsor category. These facts support the priorities above; the priorities are our strategy, not official judging weights. [Official event](https://ubhacking.cse.buffalo.edu/)

Do not add unrelated blockchain, a space theme, or extra providers to increase category count. Confirm category compatibility before assuming multiple awards can be combined.

## 2. Deadlines and the first 45 minutes

### Published schedule

Times below are interpreted as **America/New_York local time** from the Buffalo venue. The official page does not explicitly label a timezone and says Discord carries the latest changes. Reconfirm with organizers at kickoff. [Schedule](https://ubhacking.cse.buffalo.edu/)

| Event | Published time | Team action |
| :--- | :--- | :--- |
| Opening / team formation | Sat Nov 7, 12:30–1:15 PM / 1:15 PM | Confirm permitted coding window and assign owners |
| Radial workshop | Sat Nov 7, 4:15–5:15 PM | One representative attends if useful; others preserve integration progress |
| Devpost draft | **Sat Nov 7, 11:00 PM** | Internal target: a valid draft by 10:00 PM |
| Pitch workshop | Sun Nov 8, 10:00–11:00 AM | Presenter attends only if submission preparation is on track |
| Final submission | **Sun Nov 8, 12:30 PM** | Internal target: complete submission by 11:30 AM |
| Judging | Sun Nov 8, 1:45–4:45 PM | Working demo, backup video, and evidence ready |

**H0 means the team's actual authorized development start.** It does not mean midnight or imply that 24 hours remain. Absolute deadlines override every relative milestone below. Reserve at least 90 minutes before the official final cutoff for submission and recovery.

### Kickoff checklist

- [ ] Record the current time, remaining build time, coding cutoff, and final submission cutoff.
- [ ] Obtain the current Devpost link and confirm team-size limits, AI-assistance rules, award compatibility, and required video/pitch length. These details were not verified from the public 2026 page; do not import 2025 rules.
- [ ] Assign one integration lead and one submission owner. Both responsibilities can belong to a builder.
- [ ] Inspect the latest remote changes before creating feature branches; teammates may already have started.
- [ ] Freeze the MVP in Section 3 and agree the contracts in Section 6.
- [ ] Check local frontend/backend execution and make one real provider request if credentials are available.
- [ ] Start with the archived Buffalo footage in Section 8: register permitted frames, original capture metadata, and explicit visible-segment mappings. Test whether a genuine result supports an obstruction event or a visibility-based speed adjustment. Choose the truthful downstream role before committing to the demo; do not force a detection. Live 511NY access is not a kickoff dependency.
- [ ] Start the Devpost draft immediately with title, problem, team, and planned stack; update claims as features become real.
- [ ] Select a connected corridor, two feasible vehicle start locations, and one reproducible storm scenario.

Use a 15-minute investigation limit for any individual provider-access problem. A recorded, permitted image or a clearly labeled fixture can keep development moving. A fixture is not proof of a working sponsor integration.

## 3. Scope that can finish

### Must ship

1. One connected Buffalo medical-corridor road graph, roughly 60–120 modeled service segments, with source attribution and documented assumptions.
2. One synthetic moving snowband with configurable rate, heading, width, and speed.
3. Exactly two simulated vehicles in each policy world: one heavy plow and one compact unit, with explicit travel/service times. Heavy equipment is restricted to modeled wide roads; compact equipment may service either class when reachable and useful. Use identical fleets and starts across policies.
4. A complete loop: accumulation → observation/event → dispatch decision → feasible movement in the simplified bidirectional graph → service → reduced snow → updated decision.
5. A feasible fixed-order policy and an adaptive policy running under identical scenario conditions.
6. A dashboard showing road estimates, both policies' results, vehicles, reasons for reassignment, and measurement units.
7. Register the three archived Buffalo videos in Section 8 as the primary development/demo inputs. Analyze them with Gemini, retaining genuine saved results and provenance for replay. At least one supported result must have a visible, bounded role in the loop; other clips may truthfully produce no event or `unknown`. Until available, label AI integration incomplete.
8. Repeatable reset, a saved scenario definition, benchmark output, and a recorded demonstration.

### Add after the core gate passes

Tiger Data and ElevenLabs are selected sponsor targets, sequenced after the working core. A configured key is not completion: retain real write/read or generation/playback evidence. If either remains incomplete, the submission must say so. 511NY and extra visual polish remain optional.

| Addition | Acceptance evidence | Cut condition |
| :--- | :--- | :--- |
| Tiger Data persistence | Both policies' telemetry written; read-only history view loads a stored checkpoint | Database setup threatens core integration or submission buffer |
| ElevenLabs dispatch | One real event produces one playable generated callout | Core demo, measurements, or video incomplete |
| 511NY live camera layer (last optional addition) | After the core demo, evidence, and submission preparation are complete: authorized retrieval, source/capture metadata, failure handling, and visibly separate live inspection | Skip if access takes more than 15 minutes, coverage is unsuitable, or the feature threatens the freeze/submission buffer |
| Map basemap / extra visual polish | Works on the judging laptop with correct attribution | Token, tiles, GPU, or network dependence makes the demo fragile |

### Defer

County-wide coverage; actual municipal fleet integration; automated real-world dispatch; live radar-to-snowfall inference; tow-truck simulation; salt chemistry; drifting and pavement thermodynamics; complex 3D terrain; arbitrary time-travel branching; custom model training; production authentication and multi-tenant infrastructure.

Hospital locations provide context and scenario priorities. A “critical corridor” is a modeled designation. Do not claim ambulance access or lives saved without separately computing and validating those outcomes.

## 4. The demonstration to build backward from

**Opening line:** “A plow just passed. A narrow snowband moves back over the road. Which streets should the same fleet service next?”

| Demo beat | Action | Evidence on screen |
| :--- | :--- | :--- |
| Establish the problem | Load the medical-corridor scenario | Recognizable location labels, storm band, two vehicle types |
| Create pressure | Start the moving-band scenario | Estimated depth rises; the simulated clock advances |
| Establish the comparison | Show the fixed and adaptive policies | Same scenario ID, time, fleet budget, and physical rules |
| Show AI's role | Analyze an approved sample or replay a labeled genuine result | Image, classification, provenance, event ID, and a supported route or travel-time consequence |
| Close the physical loop | Follow one vehicle through service | Real graph travel; only serviced segments lose snow |
| Show the result | Display comparison metrics | Measured critical-segment exposure, distance, and completed work |
| Hand over control | Let a judge change the band | Both policies reset together to the new comparison run |

Use a planned scenario for the measured comparison. Free exploration is a separate interaction; changing the storm must not leave one policy's old result beside the other's new result.

## 5. Architecture and repository ownership

**Implementation stack:** React + TypeScript + MapLibre for the dashboard; FastAPI + NetworkX for simulation/API; preprocessed OSM geometry; Gemini behind the backend; Tiger Data for time-series persistence; ElevenLabs for event-linked audio. Keep the Python/React split and verify actual provider operations before claiming completed integrations.

Keep the implemented MapLibre road, vehicle, and band layers; installing Deck.gl is not a requirement. Verify the pinned packages and local-geometry fallback on the judging laptop. If map integration stalls, a projected SVG view of the same geometry is acceptable. Tiles must not be required to understand the road network.

```text
Scenario + road graph + timestamped observation events
                         |
             Deterministic simulation engine
                 /                   \
        Fixed-order policy      Adaptive policy
                 \                   /
             Atomic comparison snapshot
                    /           \
             React dashboard   Telemetry writer
                                   |
                           Tiger Data history

Gemini -> validated observation queue -> both policy worlds
Domain event -> ElevenLabs adapter -> audio + text
```

### Proposed files

This is the original responsibility map, not a current file inventory. Several modules now exist; API/schema code may remain in `main.py`, and existing MapLibre components satisfy rendering responsibilities. Do not create separate files merely to match this table. See the audit for current evidence and missing artifacts.

| Location | Owner | Responsibility |
| :--- | :--- | :--- |
| `backend/app/main.py`, `api.py`, `schemas.py` | Integration lead | FastAPI application, contracts, atomic snapshots |
| `backend/app/simulation.py`, `routing.py` | Simulation owner | Clock, road state, vehicle movement, both policies |
| `backend/app/vision.py`, `telemetry.py`, `voice.py` | Data/AI owner | Validated adapters, persistence, event-linked sponsor audio |
| `backend/tests/` | Simulation owner with reviewer | Physical invariants, policy fairness, replay, API validation |
| `backend/requirements.txt` | Integration lead | Tested, pinned Python dependencies |
| `frontend/src/` | UI owner | Map, controls, comparisons, event explanations |
| `frontend/package.json`, lockfile | UI owner | Reproducible frontend commands and dependencies |
| `data/corridor.geojson`, `data/scenarios/` | Simulation + data owners | Network fixture, scenarios, provenance, assumptions |
| `data/observations/`, `data/weather/` | Data/AI owner | Registered archival frames and license manifest; historical station observations with units, report times, coordinates, and source provenance; independent image labels |
| `contracts/state.example.json` | Integration lead | Shared valid response fixture for parallel work |
| `scripts/benchmark.py` | Simulation owner | Repeatable policy comparison and evidence export |
| `Docs/RESULTS.md`, `Docs/DEMO_SCRIPT.md` | Evidence/pitch owner | Actual outcomes and final presentation |
| `README.md`, `.env.example`, `.gitignore` | Integration lead | Setup, configuration, provenance, local run instructions |

Do not introduce a separate forecasting service, broker, cache cluster, or orchestration platform for this graph size. Keep providers outside the simulation tick loop.

## 6. Shared contracts: agree before parallel implementation

### Identifiers and time

- `run_id`: new ID for every scenario reset; shared by the paired policy worlds.
- `scenario_version`: stable identifier/hash of graph, parameters, weather script, observation schedule, and policy configuration.
- `tick`: integer simulation step; `sim_time_s`: elapsed simulated seconds.
- `observed_at`: original frame capture time where known; `received_at`: ingestion time. Never fabricate a capture timestamp.
- `segment_id`: physical modeled service segment. In the simplified bidirectional graph, identify a travel leg by segment ID plus from/to nodes; a separate directed `arc_id` is not required. Preserve OSM provenance and distinct parallel segments where available.
- `policy`: exactly `fixed` or `adaptive`; provider state and fixture provenance are explicit fields.

### API v1

| Endpoint | Input | Required behavior |
| :--- | :--- | :--- |
| `GET /api/health` | None | Report process readiness and separate vision/database/voice availability |
| `GET /api/network` | None | Return immutable geometry, segment IDs, travel arcs, priorities, and capability metadata |
| `GET /api/state` | None | Return one atomic snapshot containing both policies at the same completed tick |
| `POST /api/scenario` | `scenario_id`, band parameters, optional seed | Validate; create a new paired run; reset clock, observations, vehicles, and metrics |
| `POST /api/control` | `action: play or pause`, optional positive `speed_multiplier` | Change wall-clock playback only; preserve simulated physics |
| `POST /api/observations/analyze` | `run_id`, registered `frame_id` | Bind analysis to the requested active run; analyze outside the tick loop; return `observation_id` and processing state |
| `POST /api/observations/apply` | `run_id`, `observation_id`, mapped `segment_id` | Validate the candidate; derive its allowed effect; schedule atomic application to both worlds at the next tick; return that tick |
| `GET /api/runs/{run_id}/checkpoints` | Run ID | When persistence is connected, list stored checkpoint ticks and simulation times |
| `GET /api/runs/{run_id}/checkpoints/{tick}` | Run ID and saved tick | Return the stored atomic comparison snapshot; inspection does not mutate the active run |

The shared state fixture must contain:

| Field | Minimum contents |
| :--- | :--- |
| Envelope | `schema_version`, `run_id`, `scenario_version`, `tick`, `sim_time_s`, `playback_status` |
| Scenario | Band geometry/rate/motion, parameter assumptions, input provenance |
| `policies.fixed`, `policies.adaptive` | Segments, vehicles, metrics, current assignment explanations |
| Segment state | `segment_id`, `estimated_snow_depth_in`, `last_service_sim_s`, `obstruction_state` |
| Vehicle state | `vehicle_id`, type, current segment/progress, `status`, target segment, route legs referencing segment/from/to IDs |
| Observations/events | IDs, source kind, capture/ingestion/application times, result or failure state |
| Integrations | Actual availability and whether displayed data is live, recorded, or synthetic |

Start with frontend polling at approximately one-second intervals. Rendering can interpolate between snapshots. Do not add WebSockets unless polling demonstrably prevents the required interaction.

Scenario edits commit on control release, not every pointer movement. Start a new paired run after the edit. Reject invalid rates, unknown IDs, and unreachable assignments without corrupting the current run. Late results belonging to an old run must not change the new run. Repeated analysis requests for the same frame/run reuse or deduplicate the existing observation. Applying an observation rejects old-run, unknown, stale, unsupported, or unmapped candidates and deduplicates repeated acceptance. The server chooses the shared application tick and applies the event once to each world. Only the backend calls providers; credentials never enter committed files or the frontend bundle.

## 7. Physical model and dispatch rules

### Explicit modeling assumptions

- Use meters for length, seconds for time, and inches for modeled snow depth.
- A segment represents one **lane-equivalent service area**. A completed modeled pass clears that service area, not necessarily every real lane or the entire street.
- Directed travel arcs can reference the same physical segment. Store accumulation and metrics once per segment; do not clear or count it twice merely because the graph has reverse arcs.
- Road width and equipment compatibility are scenario classifications unless supported by documented data. Missing OSM width is not a measured 28-foot width.
- Bidirectional travel is an accepted MVP simplification; real one-way and turn restrictions are not modeled. Feasibility means connectivity, equipment access, and accepted closures within this model, not real-world legal routing.
- The [city Highways and Roadways schema](https://data.buffalony.gov/api/views/dbwm-jgtt.json), inspected November 7, contains road geometry/classification/routing fields but no measured width field. Its centerline length is not street width. Keep a documented road-class proxy or explicit scenario override for the selected streets; a citywide replacement graph or clearance-calibration project is deferred.
- The snowband is a synthetic scenario input. Warning polygons do not automatically provide calibrated segment-level snowfall rates.
- Snow density, salt, drifting, pavement temperature, and full vehicle dynamics are outside the MVP.

### Accumulation and removal

For each segment, over a simulated interval `dt_s`:

```text
snowfall_increment_in = band_rate_in_per_hour(segment, time) * dt_s / 3600
depth_before_service_in = max(0, depth_in + snowfall_increment_in)
removal_in = validated_service_removal(segment, completed_service_events)
next_depth_in = max(0, depth_before_service_in - removal_in)
```

Start with a fixed 10-second simulated substep. Faster playback processes more substeps; it does not enlarge a step until travel and service disappear. For the MVP, a segment receives the band rate when its midpoint lies inside the polygon and zero otherwise. Apply this approximation identically to both policies. Retain geographic coordinates for display, but compute graph lengths and motion using a documented metric projection; longitude/latitude degrees are not meters.

For the smallest complete service rule, apply removal at completion of a compatible service traversal, reducing the segment toward a configured residual depth. Residual, work speed, and any depth-dependent work duration are scenario assumptions shared by both policies. If multiple events complete in one step, process them deterministically and never subtract more snow than exists.

### Vehicle movement

Use `idle -> traveling -> servicing -> idle` with optional `blocked`. Advance along connected, compatible, open travel legs in the bidirectional model using length and configured speed. Transit consumes time and distance; work consumes time and produces the service event. Reserve the current target to prevent both units selecting it at once.

Check compatibility on the complete access path as well as the target. A heavy plow cannot reach an eligible arterial by passing through a forbidden narrow link. If no feasible work exists, remain idle with an explanation. Replan at service completion or a valid new event; do not teleport an in-transit vehicle. A newly blocked arc ahead can cause a detour at the next reachable node; an obstacle on the current arc requires a defined stop behavior.

Both policies use the same service-eligibility floor: `estimated_depth_in >= min_service_depth_in`, with the configured floor strictly above the service residual. A forecast can rank eligible targets but cannot create fictitious work on a clear road. If no target qualifies, stay idle. Reevaluate idle units every 30 simulated seconds and on new events so they resume as snow accumulates. Record both threshold and residual before benchmarking.

### Fixed comparison policy

Use a documented priority-ordered feasible service loop per vehicle. Select its next eligible target in that order, using the same model-feasible shortest-path travel and obstruction handling as the adaptive policy. Allow closure detours. This is the team's comparison policy, **not a reconstruction of Buffalo's dispatch software**.

### Adaptive policy

Use a transparent heuristic rather than an optimizer the team cannot finish:

```text
predicted_depth = max(0, current_depth + expected_snowfall_over_horizon)
priority = predicted_depth^2 * corridor_multiplier / priority_tier
score = priority / max(estimated_travel_seconds + estimated_service_seconds, 1)
```

Choose the highest-scoring feasible unreserved target; use a stable ID tie-breaker. Document the forecast horizon and corridor multiplier as tunable scenario parameters. Use the scenario's declared band motion for the short look-ahead; label this known-scenario planning, not an independently validated weather forecast. Both policies receive the same weather information, while differing in how they choose work.

Explain each assignment with target, expected depth, priority, feasibility, and travel/work cost. The heuristic is not a claim of optimal capacitated arc routing. Add a short reassignment cooldown if necessary to prevent thrashing, and record its value.

## 8. Make Gemini useful without inventing measurements

Gemini supports image inputs and schema-constrained responses; application validation is still required. At implementation time, choose a currently available image-capable model through `GEMINI_MODEL`, perform a real request with the chosen SDK, and pin the working combination. The specification's model name is a proposal, not an availability check. [Image inputs](https://ai.google.dev/gemini-api/docs/image-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Use a compact observation schema:

```text
run_id, observation_id, frame_id, camera_id, segment_ids
source_kind: live_inference | recorded_inference | synthetic_fixture
observed_at: timestamp or unknown
surface_class: dry | wet | snow_covered | unknown
visibility_class: good | reduced | poor | unknown
obstruction_detected: true | false | unknown
snow_depth_cm: required best-effort numeric AI estimate for fresh demo analyses
depth_confidence_pct: required self-reported, uncalibrated 0–100 for fresh demo analyses
video samples: offset_s at 0, 5, 10, ... with separate results
evidence_summary, model_id, received_at
```

An image classification does not supply calibrated snow depth. For the approved demo, request a best-effort numeric Gemini estimate in centimeters and self-reported confidence for every sample, clearly labeled uncalibrated. When visual evidence is weak or absent, the explanation must disclose assumptions and confidence should be low or zero. Supplied scene/weather context is background, not measured road depth. Keep estimates separate from physical-model depth and do not overwrite simulated inches with them. Treat apparent disagreement as a discrepancy flag. Confidence is not a validated accuracy score. Use 5-second video samples synchronized to playback, including after seeking/looping, with sample-specific approval and an info button for Gemini's explanation. Preserve older recordings; do not fabricate absent values locally or describe assumption-based estimates as observed measurements.

**Required AI proof:** identifiable archived media produces a validated observation; an operator applies a supported candidate event through the acceptance endpoint; a bounded physical/planning consequence becomes visible. Select one path at the early input-feasibility gate: (a) an observed obstacle supports a simulated closure and model-feasible detour/reassignment, or (b) observed reduced visibility applies a configured conservative speed penalty to the mapped segments, updating travel time and assignment costs. The penalty is a scenario assumption, not a measured speed estimate. Apply the same accepted event to both policy worlds at the same simulated tick. The fixed policy still handles the changed constraints while preserving its work order.

A correct result of no obstruction or good visibility remains valid and need not change the route. If the available genuine result supports no consequential event, revise the demonstration input or reduce the AI claim; never alter the model output to force the planned story.

Apply each accepted segment observation once, deduplicating by run, observation, and segment. Separate frame age from ingestion time and configure a maximum age for live frames. For recorded scenario inputs, retain the original capture date as provenance; the scenario's scheduled tick determines applicability, rather than treating archival imagery as current or rejecting it solely because it is old. A clear old frame must not overwrite accumulating snow every tick. Registered camera-to-segment mappings are explicit; the nearest camera is not automatically representative of every neighboring road.

Store the actual response, frame source/license or permission, capture time if known, model identifier, and application event. A genuine result from archived imagery can be replayed reproducibly with its original provenance. Manual scenario obstacles remain visibly synthetic. Failure, poor visibility, or ambiguous classification produces `unknown`/review status rather than an invented successful detection. The first vision integration gate is causal and inspectable; accuracy claims require separate labeled evaluation.

### Archived Buffalo imagery first; optional live inspection last

**Decision, November 7, 2026:** use archived local imagery for development and the judged demonstration. Add a 511NY live layer only after the complete recorded-input loop, measurements, backup video, and submission preparation are ready, and only before feature freeze. The core application must work without live camera access.

The following are identified source assets, not yet downloaded, visually assessed for model suitability, or analyzed by Gemini:

| Asset | Capture metadata available from the source | Intended role |
| :--- | :--- | :--- |
| [Main Street, Cold Spring, December 24, 2022](https://commons.wikimedia.org/wiki/File:Main_Street_in_Cold_Spring,_Buffalo,_New_York_during_December_2022_blizzard_-_20221224_-_01.webm) | 34-second video; description places capture at approximately 11:30 AM local | Main-street surface/visibility observation |
| [Laurel Street, December 23, 2022](https://commons.wikimedia.org/wiki/File:Laurel_Street_during_December_2022_Buffalo,_New_York_blizzard_-_20221223_-_02.webm) | 16-second video from a house balcony; evening, exact time unknown | Residential-street observation during blowing snow |
| [Laurel Street, December 24, 2022](https://commons.wikimedia.org/wiki/File:Laurel_Street_during_December_2022_Buffalo,_New_York_blizzard_-_20221224_-_02.webm) | 20-second video; description places capture at approximately 11:30 AM local | Residential-street observation on the following day |
| [Maryland Street, Allentown, January 2015](https://commons.wikimedia.org/wiki/File:Allentown_Winter_Scene,_Maryland_Street,_Buffalo,_New_York,_January_2015.jpg) | Still image; month known, exact day/time unknown | Optional additional residential example; exclude from exact-date weather matching |

These assets are credited to Andre Carrotflower under CC BY-SA 4.0 on their individual file pages. Preserve creator, source link, license link, and change/extraction notices; distribute adapted media under the required license. Register each frame with its parent asset and video offset. Approximate times remain approximate; an upload timestamp is not a capture timestamp. Confirm the actual field of view before mapping a frame to a service segment. Road width and equipment compatibility remain documented scenario classifications, not inferred measurements from these clips.

Sample a few useful frames from each clip for inference and optionally play the original clip alongside them. Show the original capture date and an **archived footage** label. The clips are sparse observations, not a continuous recording of the storm; footage from different days must not be presented as a continuous real-time sequence. Retain the synthetic moving-band scenario for the fair dispatch comparison and schedule archival observations at explicit scenario ticks. Label any historically inspired weather input and its temporal/spatial assumptions separately.

For optional live inspection, use the [511NY developer access process](https://prod-ny.ibi511.com/developers/resources) and [camera API documentation](https://prod-ny.ibi511.com/developers/help/api/get-api-getcameras_key_format). Documentation was indexed during research, but direct requests returned HTTP 503; approved credentials, retrieval, usage permissions, and useful coverage remain unverified. Keep current live inspection separate from archived demo playback. A live result enters a simulated run only through explicit operator acceptance and a valid segment mapping; version/reset the paired run if its input schedule changes. Highway observations do not establish conditions on surrounding residential roads. Unobserved streets retain simulated estimates.

### Historical snow evidence: available context, limited ground truth

**Historical measurements exist for the December 23–24 footage dates, but no co-located, time-matched measurement of snow depth on the visible Main/Laurel road surfaces has been verified.** Regional station observations can support storm context and plausibility checks; they cannot validate inches inferred from an image or establish the amount remaining on a plowed/drifted street.

| Evidence | Verified observation | Appropriate use |
| :--- | :--- | :--- |
| Buffalo airport daily snowfall, December 23, 2022 | 22.3 inches for the calendar day; [NWS climate report archived by Iowa State](https://mesonet2.agron.iastate.edu/wx/afos/p.php?e=202212240652&pil=CLIBUF) | Historical snowfall context; not road depth or snowfall accumulated by an earlier frame time |
| Buffalo airport daily snowfall, December 24, 2022 | 17.9 inches for the calendar day; [NWS climate report archived by Iowa State](https://mesonet2.agron.iastate.edu/wx/afos/p.php?e=202212250623&pil=CLIBUF) | Historical context; the complete daily total includes snow after the approximately 11:30 AM clips |
| Kenmore 0.3 ESE, NY-ER-59 | 18 inches snow depth at December 24, 13:00 UTC (8:00 AM EST); coordinates 42.96316, -78.86690 | Nearby point observation; source labels reports unofficial/provisional |
| Snyder 0.6 SW, NY-ER-203 | 25 inches snow depth at December 24, 13:00 UTC (8:00 AM EST); coordinates 42.95979, -78.79337 | Nearby point observation; source labels reports unofficial/provisional |
| Cheektowaga 2.4 NW, NY-ER-122 | 18 inches snow depth at December 24, 12:00 UTC (7:00 AM EST); coordinates 42.93457, -78.78295 | Nearby point observation; source labels reports unofficial/provisional |

The three station-depth rows come from the [NOHRSC observation table](https://www.nohrsc.noaa.gov/nsa/reports.html?dd=25&dm=12&dy=2022&filter=0&region=Southern_Great_Lakes&sort=value&units=e&var=snowdepth) and its [coordinate-bearing text export](https://www.nohrsc.noaa.gov/nsa/discussions_text/Southern_Great_Lakes/snowdepth/202212/snowdepth_2022122506_e.txt). The report-page date is December 25, but these individual station readings are from December 24; preserve each row's actual report time. They are reference sites, not a verified nearest-station selection for each camera.

For a machine-readable historical subset, start with [NCEI station USW00014733](https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND:USW00014733/detail), listed at 42.93998, -78.73606, and the [GHCN-Daily format documentation](https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt). Retrieve only the required dates/elements, keeping `SNOW` (new snowfall) separate from `SNWD` (snow depth). Raw GHCN-Daily uses millimeters for both; convert explicitly to inches, retain missing/trace/quality flags, and preserve observation periods where available. The source records above were inspected; a local weather fixture and reconciled GHCN subset still need to be created.

Snowfall over an interval and snow depth at an observation time are different measurements; settling, melting, blowing/drifting, and removal affect the comparison. [NWS measurement guidance](https://www.weather.gov/jkl/snow_measurement) explains the distinction. Do not sum daily snowfall and label it road depth, divide a daily total into a claimed observed hourly rate, or substitute water-equivalent precipitation for snowfall. If a uniform rate is derived for a scenario, label that temporal distribution as synthetic. Future daily totals can appear in retrospective context but must not be passed to a model as knowledge available at an earlier capture time.

### Check what the vision model can actually verify

1. Create a small frame set with source IDs, offsets, capture-time precision, and confirmed visible segments. Include independent dry/wet examples if available; snow-only footage cannot establish performance across all classes.
2. Have a teammate label surface class, visibility class, and visible obstacles before seeing Gemini output. Agree a short labeling guide, allow `unknown`, and record disagreements. Poor visibility or a blocked camera view is not automatically a blocked road; visible parked/buried cars do not alone prove impassability.
3. Keep a held-out subset out of prompt tuning; prefer holding out an entire clip/location where feasible. Report the number of frames and distinct clips/locations because adjacent frames are correlated. Keep weather totals out of image-only evaluation prompts to avoid revealing the expected class.
4. Compare predictions with independent labels: record per-class example counts, unknown/abstention counts, and representative errors. A small confusion matrix is optional when the sample supports it. A tiny sample is a demo sanity check, not a general accuracy claim. Keep weather station measurements alongside as context, with coordinates, time offsets, and camera-to-station distance once camera location is established; do not use them as image-class labels.
5. Numerical road-depth validation remains deferred until co-located, time-matched road-depth measurements or a calibrated measurement method exist. Physics/unit tests validate accumulation arithmetic; they do not establish that a historical street had the simulated depth. Preserve one frozen scenario and the same accepted observation schedule for both policies.

## 9. Tiger Data and the evidence pipeline

Keep the active simulation in memory. Write telemetry asynchronously so database latency cannot stall movement. Reuse ordinary PostgreSQL concepts and the deployed TimescaleDB version's supported hypertable syntax; verify extension availability and one insert/query before building a history panel. [Hypertables](https://docs.timescale.com/docs/learn/hypertables/understand-hypertables), [current operations documentation](https://www.tigerdata.com/docs/learn/hypertables/optimize-data-in-hypertables)

Proposed tables:

| Table | Minimum content |
| :--- | :--- |
| `runs` | Run ID, scenario version, parameters, graph/input hashes, policy configs, creation time |
| `road_segment_telemetry` | Simulation timestamp, elapsed seconds, run ID, policy, segment ID, depth estimate, service status, ingestion timestamp |
| `observations` | Observation/frame IDs, source, capture time, raw validated result, acceptance/application tick |
| `dispatch_events` | Run, policy, tick, unit, target, reason, outcome |
| `comparison_snapshots` | Run, tick, simulation timestamp, and the complete atomic state as JSONB, including both worlds' vehicle positions/progress and cumulative metrics |

Use a scenario epoch plus elapsed simulation time for the telemetry time axis; keep actual ingestion time separate. Include the hypertable time column in any unique key. Sample both policies at the same simulated intervals and retain significant events. Begin with one sample per simulated minute; continuous aggregates and large-volume performance claims are unnecessary for this MVP.

At each saved checkpoint, write the atomic comparison snapshot and its telemetry in one transaction. The first history feature is read-only: select a saved checkpoint through the history endpoints and inspect both policies' road estimates, vehicles, and cumulative metrics. Resuming from arbitrary historical states is deferred. Prove sponsor use with a real write, a query, and an application view backed by that query. A JSON fallback keeps the demonstration usable but does not count as a functioning Tiger Data integration.

## 10. Measurement: prove exactly what happened

Freeze a small scenario suite before tuning for the demonstration:

| Scenario | Purpose |
| :--- | :--- |
| Clear weather | Check that dispatch does not invent snow or unnecessary work |
| Stationary band | Establish behavior when geographic demand stays stable |
| Moving band | Test whether adaptive reassignment helps under shifting demand |
| Moving band plus obstruction, if time permits | Show observation-to-route causality and feasible detours within the bidirectional model |

For every pair, use the same graph, initial snow, fleet types/count/starts, rates, band motion, observation schedule, speed/work model, thresholds, and duration. Clone initial state into independent policy worlds. One world's service must not clear the other's snow.

| Metric | Definition | Permitted interpretation |
| :--- | :--- | :--- |
| Critical-segment exposure | Sum `dt_s / 60` over critical segments whose estimated depth exceeds the configured threshold | Simulated critical-segment-minutes above an illustrative threshold |
| Distance | Sum actual travel and work-traversal distance | Movement cost under the shared model |
| Completed service | Count completed service events, plus unique segments serviced | Work done, without hiding repeated passes |
| Re-accumulation | Segments that cross the threshold again after service, with elapsed time | Why service history alone does not describe the scenario's later state |

Keep the segmentation identical between policies and reports. Do not call exposure “hospital disconnection” without an actual origin-to-hospital graph connectivity calculation. The specification's 1.5-inch threshold can be an explicitly illustrative parameter; it is not a certified safety limit.

Export scenario ID/version, assumptions, raw metric values for both policies, difference, and run identifiers. Compute relative reduction only when the baseline value is nonzero; otherwise show absolute differences. Report unfavorable or neutral outcomes too. Do not promise a percentage improvement in advance or describe synthetic weather as a historical storm replay. If archived storm data is later used, identify exactly which inputs are historical and which remain modeled.

**Evidence gate:** repeat a saved run and obtain identical metrics within a stated numeric tolerance. Record the final commit and configuration with the results. Compare policies on that final implementation, not on results from abandoned code.

## 11. People, branches, and integration

Team size and availability are unconfirmed. Assign these roles to actual people at kickoff; one person may own multiple roles.

| Team | Assignment |
| :--- | :--- |
| 4 people | A: simulation/routing; B: UI; C: vision/data; D: integration, measurement, submission/pitch |
| 3 people | A: simulation/API; B: UI; C: vision/data and submission; appoint one integration lead |
| 2 people | A: simulation/API; B: UI/integration; sequence vision and persistence after the shared loop; defer voice and extra live feeds |
| Solo / severely reduced availability | One small corridor, comparison first, one genuine image result if available; avoid simultaneous optional integrations |

The integration lead owns schema changes; the UI owner consumes the shared fixture until the API is ready. Agree schema changes before parallel edits. Everyone owns the behavior of their vertical slice and supplies a short acceptance demonstration.

Use short-lived branches such as `feat/simulation`, `feat/dashboard`, and `feat/observations`. Pull before starting; merge small working slices through the team's agreed PR/review process. Avoid simultaneous ownership of shared schemas and lockfiles. Do not rewrite shared history. One designated integrator resolves overlapping contract changes.

Check in every 60–90 minutes with three facts: what works, what blocks integration, and the next observable result. Keep a working integration branch available. Providers and polish must not hold the core graph/simulation/UI integration hostage.

## 12. Build order and acceptance gates

The active remaining-work sequence and tonight's checkpoints are in [the implementation audit](IMPLEMENTATION_AUDIT_AND_REMAINING_WORK.md#7-work-order-and-ownership). Save and reopen a valid draft by 10:00 PM internally, protecting the user-confirmed 11:00 PM draft deadline. The H0 table below is the original sequencing estimate, not a fresh schedule or proof that a row is complete. Every row must fit before the absolute feature freeze.

| Window | Deliverable / owner | Dependencies | Pass condition |
| :--- | :--- | :--- | :--- |
| H0–1 | Contract, corridor fixture, runnable shells, archival input feasibility / lead + owners | Kickoff decisions | UI reads the API example state; health works; permitted Buffalo frame, provenance, mapping, and honest downstream role identified; no live-feed dependency |
| H1–3 | First physical loop / simulation + UI | Network and schemas | A band increases depth, one unit travels, one completed pass reduces local depth on screen |
| H3–5 | Paired policy worlds / simulation + UI | Working loop | Same scenario initializes both; metrics differ only through policy behavior |
| H5–8 | Adaptive rules and model-feasible movement / simulation | Feasible fixed loop | Heavy/compact constraints hold; moving-band scenario completes with explanations |
| H8–11 | Genuine archival observation path / data + UI | Stable events and feasible mapped sample | One real archived-media result is validated; accepted event causes a traceable route or travel-time change; small independently labeled check recorded; weather evidence is context |
| H11–14 | Persistence and benchmark report / data + evidence | Stable runs | Actual insert/read when connected; frozen scenario suite produces saved comparison results |
| H14–16 | Usability and judging-laptop run / UI + lead | Core acceptance gates | A teammate starts it from README; reset, pause, labels, and fallbacks work |
| H16–18 | Selected ElevenLabs proof, recording, rehearsal / presenter + owners | Working core and submission draft preparation | One genuine event-linked audio playback; complete recorded demo and timed pitch; failures remain explicitly reported |
| Spare time before freeze only | Optional 511NY live inspection / data + UI | Core gates, benchmark evidence, backup video, and submission preparation complete | Authorized current-frame retrieval and failure state; separate live/archive labels; stop after 15 minutes if access fails |
| Remaining time | Fix defects and finalize submission / all | Feature freeze | Final package submitted and re-opened for verification |

### Absolute internal checkpoints

- **Saturday 10:00 PM:** valid Devpost draft; working-loop status and scope cuts recorded.
- **Sunday 9:30 AM:** feature freeze, or earlier if fewer than three hours remain before submission.
- **Sunday 10:30 AM:** final measurements, screenshots, and backup video complete; defect fixes only.
- **Sunday 11:00 AM:** start final upload/submission work at the latest, preserving the 90-minute recovery window.
- **Sunday 11:30 AM:** submit complete package, then re-open it and verify links, media, team, and categories.
- **Sunday 12:30 PM:** published final cutoff; do not budget this minute for uploading.

If joining after an internal checkpoint, skip to the remaining-time policy rather than following expired milestones.

| Build time left after reserving submission buffer | Scope decision |
| :--- | :--- |
| More than 12 hours | Full core scope; attempt database integration after the paired loop |
| 6–12 hours | Fixture graph, paired policies, one genuine image result, basic metrics; no live radar/voice work |
| 3–6 hours | Preserve an existing working loop and comparison; use labeled recorded results where available; record immediately |
| Under 3 hours | Freeze architecture and providers; fix only demo/submission blockers and accurately report incomplete features |

## 13. Verification and failure handling

The following are implementation acceptance checks, **not tests already run**. Automate physical/contract invariants; check provider and presentation behavior with direct observations.

| Check | Required evidence |
| :--- | :--- |
| Units and accumulation | With removal disabled, 4 inches/hour adds 1 inch in 900 simulated seconds, within tolerance |
| Service locality | Only a completed compatible service event reduces its modeled segment's depth |
| Movement | A vehicle cannot traverse more distance than its configured speed and elapsed time allow |
| Compatibility and unreachable work | Forbidden transit/work arcs are rejected; vehicle remains in a defined state |
| Idle behavior | Both policies leave dry/below-floor targets unserviced, then resume when shared eligibility conditions are met |
| World independence | Service in `adaptive` does not change `fixed` road state |
| Observation integrity | Duplicate/stale/unknown observations do not silently erase snow; old-run responses cannot mutate a reset run |
| Replay and fairness | Same versioned inputs reproduce metrics; both policies use the same physical parameters and observation schedule |
| UI consistency | Snapshot shows both policies at one tick; scenario edits reset both |
| Provider failure | API timeout leaves simulation running, with accurate integration status |
| Persistence | A stored run/checkpoint can be read back through the intended application path |
| Presentation | Full demo and reset succeed twice consecutively on the actual judging laptop |

### Time-boxed fallback decisions

| Failure | Trigger | Response |
| :--- | :--- | :--- |
| OSM extraction / connectivity | No usable graph after 30 minutes | Use a smaller documented extract; mark manually authored fallback geometry synthetic |
| Archival asset suitability | No useful permitted frame or defensible segment mapping after 15 minutes | Select another registered archival asset; keep source/capture metadata and supported AI role explicit |
| Optional 511NY access / coverage | No authorized useful live frame after 15 minutes, or feature freeze reached | Omit live layer; continue with the complete archived-input demonstration |
| Gemini / quota | Request fails or is too slow for demo | Replay a labeled genuine saved response if available; otherwise mark synthetic fixture and remove completed-integration claims |
| Database | Connection unavailable during integration gate | Keep in-memory state and JSON export; show degraded persistence and omit a completed Tiger Data claim |
| Tiles / GPU | Map does not render reliably | Render local geometry standalone or in SVG; preserve units, IDs, attribution, and metrics |
| Voice | Timeout, overlap, or browser audio restriction | Use visible text callout; stop retries and preserve interaction |
| Adaptive underperforms | Frozen comparison shows weak/negative results | Report it; inspect travel/service costs and priority logic; present measured strengths and limits without handicapping the baseline |
| Time shortage | A gate threatens submission buffer | Cut the lowest-priority incomplete integration; keep one working causal loop |

No provider request should block the tick loop. Bound retries and deduplicate domain/audio events. Avoid dense repeated alerts. Demo audio starts after a user gesture; text remains available. Preserve API results and scenario fixtures needed for replay, with attribution and without secrets.

## 14. Interface and presentation quality

Prioritize one readable screen: map, compact comparison panel, event/observation details, and a small scenario-control area. Use consistent units, an explicit simulated clock, vehicle-type labels, and a clear road-state legend. Reinforce color with text or line styling. An empty/loading/error state should retain enough context for the presenter to continue.

Data status must be understandable: synthetic storm, estimated depth, archived image with capture time/precision, current inference, or recorded inference. A fresh Gemini response to an old frame is still an inference on archived imagery. Historical weather observations show their station/location, measurement type, units, and report time and are labeled context rather than measured street depth. These distinctions affect how users interpret the result. Label historical inspection separately from the active run; put optional 511NY live inspection in a separate mode/panel. Keep the main screen focused on planning decisions rather than provider logos or configuration.

Use actual OSM provenance and attribution on the map and in the README. Verify applicable data/image permissions before packaging assets. Map data licensing is separate from the application's eventual code license. [OpenStreetMap attribution and license](https://www.openstreetmap.org/copyright/en)

### Three-minute rehearsal structure

This is an internal rehearsal target, not a verified official pitch length. Prepare a 60-second version as well and adapt to the confirmed judging format.

| Time | Presenter action |
| :--- | :--- |
| 0:00–0:20 | State the local problem: snow re-accumulates after service as demand moves |
| 0:20–0:45 | Show the corridor, shared scenario, and two compatible units |
| 0:45–1:30 | Demonstrate accumulation, AI observation, assignment, movement, and service |
| 1:30–2:10 | Show actual fixed/adaptive comparison results and reset under changed band conditions |
| 2:10–2:40 | Explain the physical model, genuine AI contribution, and any functioning database integration |
| 2:40–3:00 | State the demonstrated benefit and current modeling limits; invite one question |

Keep answers ready for: Why Gemini? What is simulated? How is depth derived? What is the comparison baseline? What changes when the band moves? What happens when a feed fails? What evidence supports the result? What would a city pilot need next?

A defensible next step is calibration with observed road conditions and municipal feedback, not immediate operational deployment. Do not claim a deployment relationship, field validation, statewide novelty, or measured accuracy that the team has not established.

## 15. Submission package and finish line

### Devpost narrative

1. **Problem:** narrow moving snowbands change where service is needed; service history alone is not a future-state estimate.
2. **What we built:** a bounded Buffalo corridor simulator with camera-informed events and compatible fleet assignment.
3. **How it works:** explicit accumulation/removal, feasible movement in a simplified bidirectional graph, fixed/adaptive policies, actual provider roles.
4. **Evidence:** recorded demonstration, reproducible scenarios, real measured comparisons, and important assumptions.
5. **What remains:** validated snowfall estimation, calibrated road-state models, and operational integration.

### Final checklist

- [ ] Product title, concise description, actual team members, and repository link are correct.
- [ ] Current competition rules and required video/pitch format have been confirmed.
- [ ] Each intended sponsor category is selected and supported by actual completed usage.
- [ ] README starts the final build on a teammate's machine and explains environment variables without credentials.
- [ ] Graph/image sources, collaborators, libraries, and AI assistance are credited as required by the event.
- [ ] Results identify final commit, scenario/configuration, input provenance, assumptions, and both policies' raw metrics.
- [ ] Video and screenshots show the submitted build and accurately label synthetic/recorded/live inputs.
- [ ] No placeholder percentage, fictitious measured depth, or unsupported city-system comparison remains.
- [ ] A backup demonstration video is playable locally; required submission media is accessible from the submitted link.
- [ ] The judging laptop can start/reset the demo; charger, local assets, and fallback instructions are ready.
- [ ] Submission is completed before the internal target and re-opened to verify saved content and links.

**Done means:** a judge can see the entire physical feedback loop, identify AI's actual contribution, inspect a fair measured comparison, and access a complete truthful submission. Optional integrations do not replace any of these requirements.

## 16. Evidence and open decisions

Sources were checked during planning on November 7, 2026. External schedules, provider documentation, and availability can change; the implementation owners must verify the working versions and access they actually use.

| Evidence / decision | Status |
| :--- | :--- |
| Official Radial Atoms fit, listed prizes, draft/final deadlines | Verified from [current event page](https://ubhacking.cse.buffalo.edu/) |
| Team's current coding start, remaining hours, team size, current Devpost URL, detailed rubric, AI-assistance policy, award compatibility, video length | Unconfirmed; submission owner resolves at kickoff |
| Public snow-map semantics | Verified from [city winter plan](https://www.buffalony.gov/DocumentCenter/View/18119/SNOW-PLAN_26-27_FINAL-compressed); not a full audit of municipal operations |
| Smaller equipment for narrow streets and tracking improvements | Supported by [city equipment announcement](https://www.buffalony.gov/m/newsflash/Home/Detail/1659); use general fleet context rather than an exact disputed equipment count |
| Current 511NY programmatic retrieval, camera coverage, image permissions | Not operationally verified; existing documentation routes changed during earlier checks; live access is an implementation spike |
| Archived Buffalo footage strategy | Selected as the development/demo baseline; Main/Laurel videos and Maryland Street still identified in Section 8 with CC BY-SA 4.0 file-page licensing; local assets, visible-segment mappings, and model suitability still to verify |
| December 23–24, 2022 historical snow context | NWS airport daily snowfall and NOHRSC nearby station-depth reports verified in Section 8; not co-located road-depth ground truth; local fixture and image-label evaluation remain implementation work |
| 511NY priority and mode | Last optional addition after the recorded-input demo/evidence/submission preparation; separate live inspection; omit if access/time fails |
| Camera-based road-surface classification | Prior work exists in [NWS-hosted research abstracts](https://www.weather.gov/media/aly/NROW/NROW23/Book%20of%20Abstracts.pdf); differentiation must rest on our complete planning/comparison workflow |
| Gemini image/schema capabilities | Documentation verified; credentials, chosen model/SDK, semantic quality, and real request remain unverified |
| Tiger Data and map integration | Documentation verified; dependencies, service access, performance, and app integration remain unverified |
| Forecast horizon, service residual, vehicle speeds, width/capability labels, priority multiplier, depth threshold | Scenario assumptions to record before benchmarking |
| Performance benefit, accuracy, deployment readiness | Unmeasured; replace assumptions with actual evidence as implementation proceeds |

Maintain this plan when a material fact changes. Record the decision, owner, and reason; keep the remaining work aligned with the next acceptance gate and the absolute submission deadline.
