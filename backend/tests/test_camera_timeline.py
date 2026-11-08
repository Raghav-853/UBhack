"""Offline checks for timestamped inference, replay, and accepted sample identity."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from app.vision import CameraObservation, CameraTimeline, Vision, normalize, provider_schema, scene_context, sha1


def observation(offset=0, **changes):
    return {"offset_s": offset, "surface_class": "snow_covered", "visibility_class": "poor",
            "obstruction": "no", "snow_depth_cm": 8, "depth_confidence_pct": 45,
            "evidence_summary": "Uncertain visual estimate from the visible road.", **changes}


class TimelineTests(unittest.TestCase):
    def test_weather_context_matches_capture_date_not_current_weather(self):
        archived = scene_context({"title": "Archive", "observed_at": "2022-12-24T11:30:00-05:00"})
        self.assertTrue(archived["weather_context"])
        self.assertTrue(all(r["date"] == "2022-12-24" for r in archived["weather_context"]))
        self.assertIn("not measured depth", archived["weather_context_note"])
        self.assertNotIn("weather_context", scene_context({"observed_at": "2026-11-07"}))
        self.assertNotIn("weather_context", scene_context({}))

    def test_timeline_schema_is_accepted_by_installed_gemini_sdk(self):
        from google import genai
        from google.genai import _transformers

        with genai.Client(api_key="offline-schema-test") as client:
            schema = _transformers.t_schema(client, CameraTimeline)
        self.assertIn("samples", schema.properties)

    def test_offsets_must_be_contiguous_not_repeated_or_future_only(self):
        for offsets in ([5], [0, 0], [0, 10], [0, 6], [5, 0]):
            with self.subTest(offsets=offsets), self.assertRaises(ValidationError):
                CameraTimeline(samples=[observation(t) for t in offsets])
        self.assertEqual([s.offset_s for s in CameraTimeline(samples=[observation(0), observation(5)]).samples], [0, 5])

    def test_required_numbers_reject_missing_null_and_invalid_values(self):
        for fields in ({"snow_depth_cm": -1}, {"snow_depth_cm": float("nan")},
                       {"depth_confidence_pct": 101}, {"depth_confidence_pct": -1},
                       {"snow_depth_cm": None}, {"depth_confidence_pct": None}):
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                CameraObservation.model_validate(observation(**fields))
        for missing in ("snow_depth_cm", "depth_confidence_pct"):
            data = observation()
            data.pop(missing)
            with self.assertRaises(ValidationError):
                CameraObservation.model_validate(data)
        self.assertEqual(CameraObservation.model_validate(observation(depth_confidence_pct=0)).depth_confidence_pct, 0)
        # Legacy replay normalization must not manufacture numbers absent from old results.
        self.assertIsNone(normalize(observation(snow_depth_cm=None))["depth_confidence_pct"])

    def test_new_recordings_preserve_legacy_results_and_bind_to_media_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            media = folder / "clip.webm"
            media.write_bytes(b"original-media")
            legacy = folder / "CAM.json"
            legacy.write_text(json.dumps({"media_sha1": sha1(media), "result": {"surface_class": "snow_covered"}}))
            before = legacy.read_bytes()
            vision = Vision()
            vision.frames = {"CAM": {"media": "clip.webm"}}
            with patch("app.vision.FRAMES_DIR", folder), patch("app.vision.RECORDED_DIR", folder):
                result = {"samples": [{"offset_s": 0, "result": normalize(observation())}]}
                vision._record("CAM", media, result, "test-model")
                self.assertEqual(vision.recording("CAM")["result"], result)
                self.assertEqual(legacy.read_bytes(), before)
                media.write_bytes(b"changed-media")
                self.assertIsNone(vision.recording("CAM"))

    def test_model_request_uses_five_second_timestamps_and_video_schema(self):
        from types import SimpleNamespace
        from app.vision import CameraTimeline

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clip.webm"
            path.write_bytes(b"test-media")
            captured = {}
            def generate(**kwargs):
                captured.update(kwargs)
                return SimpleNamespace(parsed=CameraTimeline(samples=[observation(0), observation(5)]))
            vision = Vision()
            vision._client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
            result = vision._gemini(path, "test-model")
            self.assertIsNone(captured["contents"][0].video_metadata)
            self.assertEqual(captured["config"].response_json_schema, provider_schema(CameraTimeline))
            self.assertNotIn("$ref", json.dumps(captured["config"].response_json_schema))
            self.assertNotIn("maxLength", json.dumps(captured["config"].response_json_schema))
            self.assertIn("ALWAYS return your best-effort numeric estimate", captured["contents"][1])
            self.assertIn("0, 5, 10, 15", captured["contents"][1])
            self.assertEqual([s["offset_s"] for s in result["samples"]], [0, 5])
            self.assertEqual(result["samples"][1]["result"]["snow_depth_cm"], 8)
            vision.frames = {"CAM": {"media": "clip.webm", "duration_s": 11}}
            with patch("app.vision.FRAMES_DIR", path.parent):
                with self.assertRaisesRegex(ValueError, "every required timestamp"):
                    vision._gemini(path, "test-model")
            self.assertIn("Required offset_s values: [0, 5, 10]", captured["contents"][1])

    def test_startup_reuses_legacy_recording_without_charging_for_upgrade(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "clip.webm").write_bytes(b"test-media")
            vision = Vision()
            vision.key = "offline-test-key"
            vision.frames = {"CAM": {"media": "clip.webm", "segment_ids": ["S000"]}}
            rec = {"model_id": "old-model", "recorded_at": "2026-11-07", "result": {"surface_class": "snow_covered"}}
            with patch("app.vision.FRAMES_DIR", folder), patch.object(vision, "recording", return_value=rec), \
                    patch.object(vision, "_gemini_with_fallback", side_effect=AssertionError("No startup provider call")):
                for mode in ("cached", "auto", "live", "replay"):
                    self.assertEqual(vision.analyze("CAM", mode)["source_kind"], "recorded_inference")

    def test_concurrent_requests_and_restart_reuse_one_successful_analysis(self):
        from concurrent.futures import ThreadPoolExecutor

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "clip.webm").write_bytes(b"single-video")
            vision = Vision()
            vision.key = "offline-test-key"
            vision.frames = {"CAM": {"media": "clip.webm", "segment_ids": ["S000"]}}
            with patch("app.vision.FRAMES_DIR", folder), patch("app.vision.RECORDED_DIR", folder), \
                    patch.object(vision, "_gemini_with_fallback", return_value=(normalize(observation()), "test-model")) as provider:
                with ThreadPoolExecutor(max_workers=3) as executor:
                    results = list(executor.map(lambda mode: vision.analyze("CAM", mode), ["auto", "live", "cached"]))
                self.assertEqual(provider.call_count, 1)
                self.assertTrue(all(r["status"] == "done" for r in results))
                restarted = Vision()
                restarted.frames = vision.frames
                restarted.key = "offline-test-key"
                with patch.object(restarted, "_gemini_with_fallback", side_effect=AssertionError("Must replay")):
                    self.assertEqual(restarted.analyze("CAM", "auto")["source_kind"], "recorded_inference")

    def test_both_models_rate_limited_stop_other_video_requests(self):
        class RateLimited(Exception):
            code = 429

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "first.webm").write_bytes(b"first-video")
            (folder / "second.webm").write_bytes(b"second-video")
            vision = Vision()
            vision.key = "offline-test-key"
            vision.frames = {k: {"media": f"{p}.webm", "segment_ids": ["S000"]} for k, p in [("A", "first"), ("B", "second")]}
            with patch("app.vision.FRAMES_DIR", folder), patch("app.vision.RECORDED_DIR", folder), \
                    patch.object(vision, "_gemini", side_effect=RateLimited()) as provider:
                self.assertEqual(vision.analyze("A")["status"], "failed")
                self.assertEqual(vision.analyze("A")["status"], "failed")
                self.assertIn("429", vision.analyze("B")["error"])
                self.assertEqual(provider.call_count, 2)

    def test_primary_quota_uses_lite_and_skips_exhausted_primary_for_next_video(self):
        class RateLimited(Exception):
            code = 429

        vision = Vision()
        calls = []
        def generate(path, model):
            calls.append(model)
            if model == vision.model:
                raise RateLimited()
            return normalize(observation())
        with patch.object(vision, "_gemini", side_effect=generate):
            self.assertEqual(vision._gemini_with_fallback(Path("first.webm"))[1], vision.fallback_model)
            self.assertEqual(vision._gemini_with_fallback(Path("second.webm"))[1], vision.fallback_model)
        self.assertEqual(calls, [vision.model, vision.fallback_model, vision.fallback_model])


class DecisionTests(unittest.TestCase):
    def test_approval_uses_selected_sample_and_deduplicates_it(self):
        # Importing the API must not connect to real providers using local credentials.
        with patch.dict(os.environ, {k: "" for k in ["DATABASE_URL", "GEMINI_API_KEY", "GOOGLE_API_KEY", "ELEVENLABS_API_KEY", "NY511_API_KEY"]}):
            from app import main
        from app.simulation import Engine
        from types import SimpleNamespace

        engine = Engine()
        engine.camera_triggered["CAM"] = {"sim_time_s": 0, "depth_in": 2.0}
        sid = next(iter(engine.net.segments))
        clean = normalize(observation(visibility_class="good", snow_depth_cm=0))
        poor = normalize(observation(5))
        analysis = {"status": "done", "version": 0, "source_kind": "synthetic_fixture",
                    "result": {**clean, "samples": [{"offset_s": 0, "result": clean}, {"offset_s": 5, "result": poor}]}}
        vision = SimpleNamespace(frames={"CAM": {"version": 0, "segment_ids": [sid]}})
        with patch.object(main, "engine", engine), patch.object(main, "vision", vision), patch.object(main, "analyses", {"CAM": analysis}):
            body = main.DecideIn(run_id=engine.run_id, frame_id="CAM", version=0, decision="approve", sample_offset_s=5)
            decision = main.decide(body)
            self.assertEqual(decision["effect"]["kind"], "slowdown")
            self.assertEqual(decision["sample_offset_s"], 5)
            self.assertEqual(main.decide(body), decision)
            self.assertEqual(len(engine.pending_apply), 1)
            saved = next(iter(engine.observations.values()))
            self.assertEqual(saved["result"], poor)
            with self.assertRaises(main.HTTPException):
                main.decide(body.model_copy(update={"sample_offset_s": 10}))


if __name__ == "__main__":
    unittest.main()
