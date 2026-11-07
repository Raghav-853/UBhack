# SnowTwin WNY — Demo Script (3 min)

**Setup (before judges arrive):** `.\run.ps1`, open http://127.0.0.1:8000, wait until all three camera cards show a Gemini result. Select **Moving band (wobble)**, press **Reset**, leave paused. Turn **🔊 Radio on** (needs one click for audio).

| Time | Do | Say |
|---|---|---|
| 0:00 | Point at the two maps | "In a lake-effect storm a narrow band dumps 3–4 inches an hour and moves. A street plowed 30 minutes ago can be impassable again. Service history doesn't tell you where to send the same fleet next." |
| 0:20 | Press **Play 4×** | "Same Buffalo corridor, UB South to ECMC to the Medical Campus. Same synthetic storm, same two units — one heavy plow, one compact. Left is a fixed service loop, right is SnowTwin." |
| 0:45 | Open a 📹 icon (Main St, Cold Spring) | "These are real December 2022 blizzard clips from Main Street and Laurel Street, archive footage with capture dates. Gemini analyzed each clip automatically: snow-covered, poor visibility, no blocked lane." |
| 1:05 | Click **Approve** | "The dispatcher stays in control: approve or reject. Approving applies a conservative speed penalty to that segment in both worlds at the same tick, and the units replan." |
| 1:30 | Point at metrics + dispatch log | "Each assignment shows why: predicted depth in 30 minutes, critical corridor, travel cost. Here's the measured difference, including where adaptive is worse." |
| 2:00 | **Steer the snowband** → move offset → Apply | "Judges can move the band; both policies restart together on identical inputs." |
| 2:20 | History panel → Load → Show checkpoint | "Every run is written to Tiger Data as time-series telemetry; this view is read back from the database." |
| 2:40 | Close | "What's simulated: the storm and the depth model. What's real: the Buffalo road network, the archive footage, the Gemini observations, and the measured comparison. Next step is calibration with city road-condition data." |

**Have ready:** `Docs/RESULTS.md` numbers (simulated, synthetic storm). Answers: depth is modeled, not read from video; the fixed loop is our baseline, not the City's software; images inform slowdowns/closures only after approval.

**If something fails:** Gemini down → cards show RECORDED GEMINI RESULT (genuine earlier output). DB down → History says not connected; simulation keeps running. Audio blocked → alerts stay visible as text.
