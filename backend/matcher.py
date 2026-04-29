"""Streaming keyword matcher: silero-vad endpointing, speaker-gated DTW.

Pipeline per WS chunk:
    raw int16 LE 16k mono PCM bytes
        -> silero-vad (512-sample fixed chunks)
            -> on completed segment: Resemblyzer speaker gate
                -> per-phrase DTW match against templates
                    -> trigger key (or None)

The `RECOGNIZER` flag in main.py routes WS connections here when set to "template"
(the default). Vosk path is preserved for `RECOGNIZER=vosk`.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np
from resemblyzer import VoiceEncoder

from backend.enroll import (
    SAMPLE_RATE,
    dtw_distance,
    log_mel,
)

logger = logging.getLogger(__name__)

# silero-vad hard-requires 512 samples per chunk @ 16 kHz (32 ms).
VAD_CHUNK_SAMPLES = 512
VAD_CHUNK_BYTES = VAD_CHUNK_SAMPLES * 2

VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "0.5"))
SILENCE_HANG_MS = 400
MIN_SEGMENT_MS = 250
MAX_SEGMENT_MS = 3500

SPEAKER_THRESHOLD = float(os.getenv("SPEAKER_THRESHOLD", "0.50"))  # mic noise drops live scores ~10-20 pts vs clean
# Relative-margin classifier: a phrase wins if its DTW distance is at least
# RELATIVE_MARGIN times smaller than the runner-up. Sidesteps absolute-threshold
# brittleness when live mic produces distances at a different scale than clean
# enrollment templates — only the *gap* between top-1 and top-2 matters.
RELATIVE_MARGIN = float(os.getenv("RELATIVE_MARGIN", "0.92"))
# Hard upper bound on best distance — guards against the matcher firing on
# pure noise where every phrase has high but similar distance.
MAX_ACCEPTABLE_DIST = float(os.getenv("MAX_ACCEPTABLE_DIST", "75.0"))


def _int16_to_float32(buf: bytes) -> np.ndarray:
    return np.frombuffer(buf, dtype=np.int16).astype(np.float32) / 32768.0


class TemplateMatcher:
    def __init__(self, templates_dir: Path) -> None:
        speaker_path = templates_dir / "speaker.npy"
        phrases_path = templates_dir / "phrases.npz"
        if not speaker_path.exists() or not phrases_path.exists():
            raise RuntimeError(
                f"Templates missing in {templates_dir}. "
                "Run `uv run python backend/enroll.py` after placing samples in "
                "backend/enroll/audio/<phrase_key>/."
            )

        self.speaker_emb: np.ndarray = np.load(speaker_path)
        npz = np.load(phrases_path)

        bundles: dict[str, dict] = {}
        for key in npz.files:
            phrase_key, _, suffix = key.rpartition("__")
            bundle = bundles.setdefault(phrase_key, {"templates": [], "threshold": None})
            if suffix == "thr":
                bundle["threshold"] = float(npz[key])
            elif suffix.startswith("t"):
                bundle["templates"].append(npz[key])
        self.phrases = bundles

        self.encoder = VoiceEncoder(verbose=False)

        # Sanity-check feature dims: a stale templates.npz from a previous
        # feature-extractor version will explode in DTW with cdist column-mismatch.
        sample_dummy = np.zeros(SAMPLE_RATE, dtype=np.float32)
        sample_dummy[100:200] = 0.1  # avoid pure-zero corner cases in mfcc
        live_dim = log_mel(sample_dummy).shape[0]
        first_template = next(iter(self.phrases.values()))["templates"][0]
        tmpl_dim = first_template.shape[0]
        if live_dim != tmpl_dim:
            raise RuntimeError(
                f"Feature dim mismatch: templates have {tmpl_dim}-dim, "
                f"current log_mel() produces {live_dim}-dim. "
                "Re-run `uv run python backend/enroll.py` to rebuild templates."
            )

        logger.info(
            "Loaded %d phrases (%d templates total, feat_dim=%d) from %s",
            len(self.phrases),
            sum(len(b["templates"]) for b in self.phrases.values()),
            tmpl_dim,
            templates_dir,
        )

    def match(self, segment_pcm: np.ndarray) -> str | None:
        """segment_pcm: float32 [-1,1] @ 16 kHz mono. Returns phrase_key or None."""
        # Speaker gate
        try:
            emb = self.encoder.embed_utterance(segment_pcm)
        except Exception as exc:
            logger.info("segment: speaker embed failed: %s", exc)
            return None
        emb = emb / (np.linalg.norm(emb) + 1e-8)
        sim = float(np.dot(emb, self.speaker_emb))

        # Compute distance to every phrase, then top-2 for relative-margin classifier.
        # template = query (X), segment = reference (Y) for subseq DTW.
        seg_mel = log_mel(segment_pcm)
        scored: list[tuple[float, str]] = []
        for phrase_key, bundle in self.phrases.items():
            d = min(dtw_distance(t, seg_mel) for t in bundle["templates"])
            scored.append((d, phrase_key))
        scored.sort()
        best_dist, best_key = scored[0]
        runner_dist, runner_key = (scored[1] if len(scored) > 1 else (float("inf"), None))

        gate_ok = sim >= SPEAKER_THRESHOLD
        gap_ratio = (best_dist / runner_dist) if runner_dist > 0 else 0.0
        gap_ok = gap_ratio <= RELATIVE_MARGIN
        sane_dist = best_dist <= MAX_ACCEPTABLE_DIST
        phrase_ok = gap_ok and sane_dist

        logger.info(
            "segment: speaker=%.3f (gate %s) best=%s dist=%.3f runner=%s dist=%.3f ratio=%.3f (gap %s, dist<=%.0f %s)",
            sim, "OK" if gate_ok else "FAIL",
            best_key, best_dist, runner_key, runner_dist, gap_ratio,
            "OK" if gap_ok else "FAIL", MAX_ACCEPTABLE_DIST, "OK" if sane_dist else "FAIL",
        )
        if gate_ok and phrase_ok:
            return best_key
        return None


class StreamingSegmenter:
    """silero-vad endpointing. Buffers 512-sample chunks; emits speech segments."""

    def __init__(self) -> None:
        from silero_vad import load_silero_vad  # type: ignore[import-not-found]

        self._vad_model = load_silero_vad(onnx=True)
        self._vad_reset()
        self._byte_buf = bytearray()
        self._speech_buf: list[np.ndarray] = []
        self._silence_samples = 0
        self._segment_samples = 0
        self._in_speech = False
        self._chunks_seen = 0
        self._max_prob_window = 0.0
        self._max_abs_window = 0.0

    def _vad_reset(self) -> None:
        # silero exposes reset_states on the underlying ONNX wrapper.
        if hasattr(self._vad_model, "reset_states"):
            self._vad_model.reset_states()

    def push(self, data: bytes) -> list[np.ndarray]:
        """Append PCM bytes. Returns zero or more completed segments as float32 arrays."""
        import torch  # type: ignore[import-not-found]

        self._byte_buf.extend(data)
        completed: list[np.ndarray] = []
        silence_hang = SAMPLE_RATE * SILENCE_HANG_MS // 1000
        max_seg = SAMPLE_RATE * MAX_SEGMENT_MS // 1000
        min_seg = SAMPLE_RATE * MIN_SEGMENT_MS // 1000

        while len(self._byte_buf) >= VAD_CHUNK_BYTES:
            chunk_bytes = bytes(self._byte_buf[:VAD_CHUNK_BYTES])
            del self._byte_buf[:VAD_CHUNK_BYTES]
            chunk = _int16_to_float32(chunk_bytes)

            with torch.no_grad():
                prob = float(
                    self._vad_model(torch.from_numpy(chunk), SAMPLE_RATE).item()
                )
            is_speech = prob >= VAD_THRESHOLD

            # Periodic heartbeat so we can see whether audio is flowing at all.
            # Every ~2 s of audio (~62 chunks @ 32 ms) log peak VAD prob + peak amplitude.
            self._chunks_seen += 1
            if prob > self._max_prob_window:
                self._max_prob_window = prob
            chunk_peak = float(np.max(np.abs(chunk)))
            if chunk_peak > self._max_abs_window:
                self._max_abs_window = chunk_peak
            if self._chunks_seen % 62 == 0:
                logger.info(
                    "audio: chunks=%d peak_amp=%.3f peak_vad_prob=%.3f (threshold>=%.2f)",
                    self._chunks_seen, self._max_abs_window, self._max_prob_window, VAD_THRESHOLD,
                )
                self._max_prob_window = 0.0
                self._max_abs_window = 0.0

            if is_speech:
                self._speech_buf.append(chunk)
                self._segment_samples += VAD_CHUNK_SAMPLES
                self._silence_samples = 0
                self._in_speech = True
                if self._segment_samples >= max_seg:
                    completed.append(self._flush(min_seg))
            elif self._in_speech:
                # Trailing silence — keep so context isn't clipped.
                self._speech_buf.append(chunk)
                self._segment_samples += VAD_CHUNK_SAMPLES
                self._silence_samples += VAD_CHUNK_SAMPLES
                if self._silence_samples >= silence_hang:
                    seg = self._flush(min_seg)
                    if seg is not None:
                        completed.append(seg)
        return [s for s in completed if s is not None]

    def _flush(self, min_seg: int) -> np.ndarray | None:
        speech_only = self._segment_samples - self._silence_samples
        buf = self._speech_buf
        self._speech_buf = []
        self._silence_samples = 0
        self._segment_samples = 0
        self._in_speech = False
        self._vad_reset()
        if speech_only < min_seg or not buf:
            logger.info(
                "segment dropped: speech_only=%d samples (<min %d), buf=%d",
                speech_only, min_seg, len(buf),
            )
            return None
        seg = np.concatenate(buf, axis=0)
        logger.info(
            "segment captured: %d samples (~%.2f s, speech %d)",
            len(seg), len(seg) / SAMPLE_RATE, speech_only,
        )
        return seg
