"""Optional ElevenLabs dispatch audio. Without a key the UI falls back to visible text + browser TTS."""

from __future__ import annotations

import json
import os
import urllib.request


class Voice:
    def __init__(self):
        self.key = os.environ.get("ELEVENLABS_API_KEY")
        self.voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
        self.model = os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5")
        self.cache: dict[str, bytes] = {}
        self.last_error: str | None = None

    def status(self) -> dict:
        return {"available": bool(self.key), "mode": "elevenlabs" if self.key else "browser_tts_mock",
                "last_error": self.last_error}

    def synthesize(self, alert_id: str, text: str) -> bytes | None:
        if not self.key:
            return None
        if alert_id in self.cache:
            return self.cache[alert_id]
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}?output_format=mp3_44100_64",
            data=json.dumps({"text": text, "model_id": self.model}).encode(),
            headers={"xi-api-key": self.key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                audio = r.read()
            self.cache[alert_id] = audio
            self.last_error = None
            return audio
        except Exception as e:
            self.last_error = type(e).__name__
            return None
