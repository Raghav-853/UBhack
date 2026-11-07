# SnowTwin WNY — Implementation Audit and Remaining Work

**Last verified:** November 7, 2026, approximately 5:16 PM America/New_York.  
**Current reference commit:** `e4a253345b240a12e2a81d21a995f32880aadc54`. Initial audit: `d6bd01271b83bc175c706232f6fa104cd33e9e2a`.  
**Immediate deadline:** draft submission by **11:00 PM tonight**; aim to save it by 10:00 PM.  
**Baseline:** [Master execution plan](MASTER_EXECUTION_PLAN.md), with the user's scope decisions recorded below.  
**Status:** merge-conflict source recovery verified; simulation restored and all backend modules pass Python syntax parsing. Application runtime/build readiness, provider operations, and benchmark results remain unverified. Requirements below are assessed against the current reference, with the initial broken revision retained as history.

## 1. Address these first

1. **Verify the recovered shared build.** Commit `e4a2533` restores `simulation.py` and removes the remaining conflict markers. All backend modules now pass Python syntax parsing, and no conflict markers were found in backend, frontend source, scripts, or data. Source recovery is closed; dependency installation, frontend build, backend startup, and a dashboard smoke test are still required before calling the application runnable.
2. **Finish the actual archived-data path.** Video handling and model-response replay have been written, but the checked-in registry still contains three synthetic SVG fixtures. None of the three selected Buffalo videos or genuine saved responses was present under `data/frames` during inspection.
3. **Align fleet and equipment rules.** All four scenarios still have two heavy plows plus one compact blower. The confirmed target is one of each. The compact currently services narrow roads and wide segments unreachable by heavy plows, rather than being allowed to compete for all compatible wide-road work.
4. **Do not treat the city road dataset as width measurements.** Its inspected schema has road classes and geometry but no measured width field. Use documented equipment classes for this demo; do not add a citywide geometry/width project to tonight's work.
5. **Prove sponsor use through actual behavior.** Gemini, Tiger Data, and ElevenLabs are intended sponsor integrations. Adapters, configured-key badges, and browser TTS do not establish successful provider use. The current frontend has no history view or audio playback caller.
6. **Prepare the draft alongside implementation.** The 11 PM deadline is a draft deadline, not a reason to wait for all integrations before saving the submission. Record what works and what is planned, then update claims as evidence becomes available.

## 2. Confirmed scope

| Decision | Accepted baseline |
| :--- | :--- |
| Product | Camera-informed snow-response planning simulator for a bounded Buffalo corridor, comparing fixed and adaptive dispatch under the same conditions |
| Routing | Simplified bidirectional graph. Respect connectivity, equipment restrictions, closures, travel time, and distance within that graph. Do not claim real-world one-way/turn-restriction compliance. |
| Fleet | Exactly one heavy plow and one compact unit in each policy world; identical starts, speeds, work rules, and budgets between policies |
| Equipment choice | Heavy plow restricted to modeled wide roads. Compact may service either road class, subject to reachability and travel/work cost. Explain the selected unit; class labels are assumptions unless measured data supports them. |
| Primary imagery | Main Street on December 24, Laurel Street on December 23, and Laurel Street on December 24, 2022; the three source videos linked in master-plan Section 8 |
| Historical weather | Context for the dates and approximate regional conditions; not numerical road-depth ground truth |
| Storm | Keep the moving snowband synthetic. Scheduling archived observations in the scenario does not make the complete simulation a historical reconstruction. |
| Sponsor targets | Genuine Gemini media analysis; Tiger Data write and application read; ElevenLabs generation and playback associated with a real application event |
| Secondary imagery | Optional 511NY live inspection after the core proof and submission preparation. A clear-weather clip/frame may demonstrate no snow and no unnecessary event if time allows. |
| Architecture | Keep FastAPI/NetworkX and React/MapLibre. No Deck.gl migration or file-layout rewrite is needed to meet acceptance. |

Calling the compact vehicle a blower is an existing modeling choice, not a verified description of Buffalo's purchased equipment. Use a consistent prototype label and disclose assumed capabilities and work speeds.

## 3. Evidence and limitations

This is a moving shared workspace. The current reference above provides a reproducible boundary. The initial `d6bd012` audit found an empty simulation module and committed conflicts. `e2d2421` repaired `main.py`; `e4a2533` restored the simulation and removed the remaining source conflicts. The latest recheck closes those syntax/source-loss findings, not application startup or end-to-end integration. Do not overwrite a teammate's repair or restore an older file wholesale merely to match this report. Recheck the current revision before assigning or closing any item.

Checks performed:

- Inspected the master plan, README, provider adapters, API, dashboard, graph builder, network fixture, scenario JSON, and media registry.
- Parsed every current backend module with `ast.parse` without importing providers or starting background services: all pass; the empty `__init__.py` is an expected package marker. `simulation.py` is restored and nonempty.
- Scanned backend, frontend source, scripts, and data for merge markers: none found. The initial `d6bd012` counts (27 in `main.py`, 24 in `vision.py`, 24 in `App.tsx`, 6 in `MapPane.tsx`, 6 in `styles.css`) are historical and no longer active defects.
- Inspected the `e4a2533` recovery diff and current simulation/media/proposal code. Video support, hashed saved responses, camera viewer/markers, and approve/reject source now exist without merge markers; successful runtime behavior still needs verification.
- Counted 113 modeled segments: 85 wide-class and 28 narrow-class. The fixture includes Main Street, but no named Laurel Street or Maryland Street segments.
- Inspected all four scenario fleets and scheduled observation inputs. Scheduled obstruction inputs remain explicitly synthetic.
- Retrieved the public road-dataset schema during the initial audit; no new remote-schema check was needed for this code-only recheck.

Not performed or not established:

- No frontend build or end-to-end runtime test: this checkout still has no `frontend/node_modules` or local `.venv`, and required runtime dependencies are absent from the available system Python. Dependency setup was not changed for this documentation recheck. Syntax success is not a successful startup/build.
- The available system Python is 3.13; README/run script request Python 3.12. NetworkX, psycopg, and dotenv were absent from that system interpreter. Another teammate's environment may differ; dependency installation success was not assessed.
- No API keys, credential-file contents, remote account state, real inference, database connection/write, audio generation, or Devpost submission was inspected or executed. Intended sponsor participation is not evidence of working credentials.
- No policy improvement, image accuracy, snow-depth accuracy, or completed submission is claimed.

## 4. Requirement-to-implementation assessment

| Requirement | Evidence in the reference source | Remaining acceptance work |
| :--- | :--- | :--- |
| Connected corridor and equipment metadata | `data/corridor.geojson`, `network.py`, and graph builder exist; 113 segments with OSM provenance and local metric projection metadata | Check connectivity after any local extension; inspect actual camera field of view; retain assumptions and attribution |
| Synthetic moving band | Current restored simulation implements fixed substeps, drifting/wobbling band, and scenario inputs; syntax passes | Verify accumulation units, deterministic reset, and paired clocks on the current build |
| Exactly two units | Four JSON scenarios currently contain P1, P2, B1 | Use one heavy and one compact everywhere, including clear/stationary/obstruction scenarios, README, UI, benchmark fixtures, and saved results |
| Equipment feasibility | `network.py` separates transit/service permissions; compact transit already reaches all graph roads | Allow compact service on wide roads too; preserve heavy restrictions over the entire access path; confirm reservation prevents duplicate assignments |
| Fixed/adaptive paired comparison | Current restored engine has separate snow state, shared environment events, metrics, and a versioned scenario | Verify behavior; freeze two-unit inputs; do not reuse three-unit measurements |
| Archived videos and mappings | Current source contains video upload/display and model file handling; registry still holds SVG illustrations | Register/download all three selected clips, capture metadata, license links, and verified segment mappings. Extend a small connected pocket for Laurel if necessary; never map it to Kensington because it is convenient. |
| Genuine Gemini result and replay | Current source records results with a media hash and exposes live/replay paths; no genuine recording files found | Run real requests on registered media; retain model/time/media provenance; make replay selectable and accurately labeled in the demo |
| Operator approval and physical consequence | Current API/UI source has automatic analysis and approve/reject proposals; engine has per-run decisions | Keep one coherent acceptance path; prove exactly-once application to both worlds, rejection without mutation, stale-result handling, and visible slowdown/detour consequence |
| Historical weather context | Sources and example readings exist in the master plan; no `data/weather` fixture exists | Create a small cited context fixture or static evidence card. Keep daily snowfall distinct from snow depth and identify station/report-time mismatch. |
| Tiger Data | Schema, background writer, checkpoint/history endpoints, and read-only readiness script exist | Demonstrate connection, paired checkpoint/telemetry write, read-back, and a small UI view that actually loads a stored checkpoint; no arbitrary resume needed |
| ElevenLabs | `voice.py` and `/api/voice/{alert_id}` exist, with per-alert in-memory audio caching | Add user-gesture-enabled play control and text; call the endpoint and play actual generated audio; verify one event does not generate overlapping duplicate calls |
| Dashboard and failure states | Paired maps, controls, metrics, proposals, camera markers/video viewer, and basemap fallback are present; merge markers removed | Run the frontend build; check reset/pause, provider timeout, archive/live labels, actual playback, and judging-machine behavior |
| Reproducible benchmark/evidence | Scenarios and internal metrics exist; no `scripts/benchmark.py`, `Docs/RESULTS.md`, or `Docs/DEMO_SCRIPT.md` found | Export the frozen two-unit scenario, complete observation schedule, commit, assumptions, raw metrics for both policies, and a rerun comparison; write short demo script and capture backup video |
| Acceptance checks | No `backend/tests` or shared contract fixture found | Add focused checks for physics, world isolation, equipment restrictions, observation integrity, and deterministic replay; a valid example snapshot may be exported instead of redesigning schemas |
| 511NY | Adapter and refresh controls exist; `live_cameras.json` has no mapped cameras | Leave disabled/secondary until core gates pass. If used, verify access, capture freshness semantics, explicit mapping, permissions, and graceful failure; no snowy live view is required |
| Draft submission | Not verifiable from local source | Assign submission owner now, save draft before 11 PM, and reopen it to confirm persistence and accessible links |

The engine is now restored in the current source. Its implementation can be reviewed directly; it is no longer an empty-module blocker. No source-only feature in this table is counted as operational without a corresponding runtime or provider check.

## 5. Road-data finding and equipment classification

The supplied [Highways and Roadways dataset](https://data.buffalony.gov/Infrastructure/Highways-and-Roadways/dbwm-jgtt/about_data) is a vector **line** dataset. Its [metadata API](https://data.buffalony.gov/api/views/dbwm-jgtt.json) was retrieved during this audit. Fields include `completestreetname`, `nysstreetid`, `fcc` (feature class), `acc` (arterial classification), `speed` (mph), `oneway`, routing costs, geometry, and `shape_stlength`. **No road-width, lane-width, lane-count, or curb-to-curb field was present in the returned schema.** Line length is not width.

Use the current OSM road-class proxy for the initial demonstration. Add explicit per-segment equipment-class overrides for the few demo streets if needed, with `classification_source` and a note identifying a scenario assumption. If incorporating the city data, first inspect its class-code definitions and match the relevant geometry; do not assume that a street name or class code directly measures clearance. Do not replace the complete graph tonight just to change the data source.

The dispatch explanation should say which units are compatible, whether each can reach the target, and the chosen travel/service cost. With compact service permitted on both classes, faster heavy service on a wide road is a model preference; compact access to a narrow road is a model constraint. Actual available clearance, parked cars, maneuvering, and real equipment dimensions remain unvalidated.

## 6. Correctness checks on the restored implementation

These are targeted review findings and required checks, not runtime failures already reproduced:

- **Observation timing:** the current engine's `schedule_apply` returns `tick + 1`, while the application record is written using the pre-increment tick. Make promised and recorded application ticks agree and test that both worlds observe the same event at that tick.
- **Run/version isolation:** approve/reject currently checks the run before mutation and uses the first mapped segment. Recheck the active run under the engine lock, bind the immutable media hash/version and selected segment to the observation, validate mappings, and reject obsolete analyses. Do not recompute an old analysis against a replacement frame's metadata.
- **Reproducibility:** current scenario hashing includes scenario/params/network, but manual acceptance timing is not itself a frozen scenario input. Export actual accepted results and application ticks for replay; include equipment speeds and policy settings in version provenance. A cached model response alone does not make operator timing reproducible.
- **Analysis versus input freshness:** the UI label `LIVE GEMINI` describes a fresh request, not a live camera capture. Show archival capture date independently. HTTP `Last-Modified` is modification metadata, not verified camera exposure time. Unknown capture time remains unknown; enforce an explicit policy for live-frame freshness.
- **Failed versus clear:** the current `cameraStates` helper can classify a failed analysis without an effect as `clear`. Failure/unknown must not turn into a clear-road claim or erase modeled snow.
- **Closure while in motion:** the current engine allows a vehicle already inside a newly closed segment to continue until a node. Choose and disclose a bounded stop/egress behavior; never teleport or clear through an obstacle merely to complete the demo.
- **Persistence completeness:** telemetry is written at checkpoint callbacks; current cadence is 900 simulated seconds, despite a one-minute proposal in the plan. Choose/document a single cadence. Persist the final comparison even if the run ends between checkpoints. Bounded dispatch logs can lose events between writes; complete event logging is needed only if claims depend on it.
- **Provider status:** Gemini/voice `available` currently follows key presence. Show configured separately from last successful operation and preserve error state; do not count configuration as integration completion.
- **Audio configuration:** a blank `ELEVENLABS_VOICE_ID` from `.env.example` does not trigger `os.environ.get`'s default. Resolve empty values before the real call and provide a repeatable playback check.
- **Gemini configuration:** `vision.py` defaults to `gemini-3.5-flash`, while `.env.example` specifies `gemini-2.5-flash`. Choose one explicitly through `GEMINI_MODEL` and verify a real request. This audit establishes configuration divergence, not availability or quality of either model.
- **No-snow case:** with zero snowfall and below-floor initial depth, neither policy should manufacture plowing work. A dry image may support a no-event result; it must not continuously overwrite accumulating simulation depth.

Minimum automated checks should cover: 4 in/hr adds 1 inch in 900 seconds with removal off; only completed local service reduces depth; movement respects distance/time; heavy cannot traverse/service a narrow link; compact can service both classes; shared eligibility/reservations; independent worlds; duplicate/rejected/stale/old-run observations; and repeatable two-unit metrics with the same saved observation schedule.

## 7. Work order and ownership

Owners are roles for the active team to claim, not assumptions about team size. Start submission work immediately while builders verify the recovered application and close the remaining requirements.

| Priority | Work | Suggested owner | Pass condition |
| :--- | :--- | :--- | :--- |
| P0 | Verify runtime/build after completed source recovery | One integration lead | Source recovery closed at `e4a2533`; dependency setup, backend imports/health, frontend build, and dashboard load still need successful evidence |
| P0 | Freeze the two-unit fleet and compact-on-wide rule | Simulation owner | All four scenarios have exactly one of each; eligibility/reachability tests pass; UI explains assignment |
| P0 | Register three archive clips and real camera-to-street mapping | Data/AI owner | Files play locally, capture precision/source/license recorded, expected visible segments present and connected |
| P0 | Demonstrate genuine Gemini observation -> approval -> consequence | Data + simulation + UI | Real saved output; accepted slowdown or supported obstacle applies once to both worlds; no forced classification |
| P0 | Save Devpost draft | Submission owner | Saved before 11 PM and reopened; title/team/repository/media as required by organizers; claims match evidence |
| P1 | Freeze scenario and export comparison/replay evidence | Simulation/evidence owner | Same two-unit inputs reproduce raw metrics and observation ticks; report neutral/negative outcomes too |
| P1 | Complete Tiger Data proof | Data + UI owner | Real write plus queried checkpoint displayed through the application; failure leaves simulation usable |
| P1 | Complete ElevenLabs proof | UI/integration owner | One event produces real generated audio playable after a user gesture, with visible text and no overlap |
| P1 | Correct provenance/status labels and add small image-label check | Data + UI owner | Archive dates visible, failure distinct from clear, independent frame labels/errors recorded, weather labeled context |
| P1 | Prepare results, demo script, and backup recording | Evidence/submission owner | Actual commit/config/results saved; short demo and reset work twice on judging laptop |
| P2 | Optional clear-weather 511NY view or recorded sample | Data owner | Only after P0/P1 proof and draft preparation; valid mapping/permission and accurate live/recorded labels |

### Tonight's checkpoints

Times are proposed internal targets in America/New_York on November 7; the user-confirmed external requirement here is the 11 PM draft.

- **Now:** assign integration and submission owners; begin the draft immediately. Source conflicts are repaired; verify startup/build before resuming optional features.
- **By 6:00 PM:** verified runnable shared build plus a frozen two-unit scenario. If startup/build is still incomplete, dependency and integration checks take priority over new UI controls.
- **By 7:30 PM:** registered archival media and at least one genuine Gemini result with a supported downstream consequence. All three clips remain the target; do not fake missing analyses to hit this checkpoint.
- **By 9:00 PM:** evidence for the core comparison and actual sponsor operations, or a truthful list of unverified integrations in the draft. The draft need not wait for the final benchmark/video.
- **By 10:00 PM:** save and reopen a valid draft. Remaining time protects corrections and required submission fields.
- **By 11:00 PM:** draft submission confirmed. Follow organizer coding/final-submission rules for overnight work; do not assume this is the final feature cutoff.

Sunday deadlines in the master plan remain organizer-dependent; reconfirm them before treating the overnight schedule as authoritative. Tonight's core/sponsor work must not consume the final submission/recovery buffer.

## 8. Scope boundaries and plan corrections

Keep: bidirectional graph, 113-segment scale, two vehicle types, fixed/adaptive comparison, three archival clips, operator acceptance, genuine Gemini replay, a small history view, and one event-linked ElevenLabs callout.

Defer: citywide camera/road coverage, measured road-width inference from centerlines, calibrated road-depth estimation, historical storm reconstruction, new rendering libraries, custom model training, automatic real-world dispatch, arbitrary history resume, continuous frame-by-frame video inference, and extra camera sources.

Automatic analysis and camera markers can be useful presentation choices; they are not inherently scope creep. Finish and verify the existing path rather than adding another parallel workflow. If automatic analysis prevents an offline deterministic replay or introduces unbounded provider calls, keep a bounded analyze-once/replay path for the demo.

The master plan needs these reconciliations:

- Keep the plan's current implementation status aligned with the recheck: source recovery is complete; runtime, sponsor, and comparison evidence remain outstanding.
- Record the approved bidirectional assumption; replace claims of real-world legal routing with feasibility within the model.
- Keep exactly one heavy and one compact; record compact eligibility for either class.
- Record the three primary videos and keep 511NY secondary. Preserve the distinction between archived media, a fresh request, a saved response, and a synthetic fixture.
- Treat Gemini, Tiger Data, and ElevenLabs as selected sponsor targets with operation-level evidence, implemented in that order after the working physical loop.
- Accept MapLibre and the current module/API organization where behavior meets the contract. Do not make creating `api.py`/`schemas.py` or installing Deck.gl a completion requirement.
- Replace H0 estimates as the active work tracker with tonight's checkpoints and this prioritized backlog; retain final event deadlines subject to organizer confirmation.
- Keep weather context small. A confusion matrix is optional if the sample cannot support one; independently labeled examples and disclosed errors are sufficient for a demo sanity check, not accuracy claims.

## 9. Updating this audit during team changes

Before closing an item, record current commit, owner, acceptance evidence, and timestamp. A teammate's local success should identify the environment and revision. A changed file or merged commit alone does not close a behavior-level requirement.

After each integration: check conflict markers and syntax, build the frontend, smoke-test health/network/state/reset, then run only the affected invariant/provider checks. Before final evidence: rerun the frozen comparison, refresh the results commit/config, and rehearse reset plus the full demonstration twice.

The only remaining organizational unknowns are role ownership and external evidence of provider/submission success. Those do not prevent work on this backlog. If the implementation changes after this reference commit, supersede affected findings with concrete current evidence rather than deleting their audit history.

### Verification history

| Revision | Verified change | Still not established |
| :--- | :--- | :--- |
| `d6bd012` | Initial audit found committed conflicts and an empty engine | Runnable application and remaining product requirements |
| `e2d2421` | Main API module conflict removal and syntax recovery | Remaining source recovery and runtime readiness |
| `e4a2533` | Simulation restored; all backend modules parse; scanned source/data have no merge markers | Dependency setup, frontend build, end-to-end run, two-unit/equipment-rule alignment, real archive inputs, sponsor operations, and saved benchmarks |
