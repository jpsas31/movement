"""Auto-build observed-vocabulary grammar + trigger map from enrollment audio.

Each .wav under backend/enroll/audio/<phrase_key>/ is run through Vosk's open
Spanish ASR; whatever token sequences come out are mapped to that phrase_key
and added to the grammar. Captures every way Vosk hears each phrase — including
misheard variants like "ciento" -> siento or "de harry" -> dejar_ir — so
runtime grammar mode recognizes them and routes correctly.

Outputs backend/templates/grammar.json. main.py loads it at startup and merges
into hardcoded GRAMMAR_WORDS + TRIGGERS.

Run:
    uv run python backend/build_grammar.py
"""
from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

from vosk import KaldiRecognizer, Model

BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "enroll" / "audio"
DEFAULT_MODEL_DIR = BASE_DIR / "models" / "vosk-model-es-0.42"
SMALL_MODEL_DIR = BASE_DIR / "models" / "vosk-model-small-es-0.42"
OUT = BASE_DIR / "templates" / "grammar.json"


def _pick_model_dir() -> Path:
    if DEFAULT_MODEL_DIR.is_dir():
        return DEFAULT_MODEL_DIR
    if SMALL_MODEL_DIR.is_dir():
        return SMALL_MODEL_DIR
    raise SystemExit(
        f"No Vosk model found at {DEFAULT_MODEL_DIR} or {SMALL_MODEL_DIR}. "
        "Stage one before running this script."
    )


def _transcribe(rec: KaldiRecognizer, wav_path: Path) -> str:
    with wave.open(str(wav_path), "rb") as w:
        while True:
            chunk = w.readframes(4000)
            if not chunk:
                break
            rec.AcceptWaveform(chunk)
        return json.loads(rec.FinalResult()).get("text", "")


def main() -> int:
    if not AUDIO_DIR.is_dir():
        print(f"No enrollment audio at {AUDIO_DIR}.", file=sys.stderr)
        return 1
    model_dir = _pick_model_dir()
    print(f"[grammar] using Vosk model {model_dir.name}")
    model = Model(str(model_dir))

    phrases: dict[str, list[list[str]]] = {}
    words: set[str] = set()
    for pdir in sorted(AUDIO_DIR.iterdir()):
        if not pdir.is_dir() or pdir.name.startswith("."):
            continue
        key = pdir.name
        seqs: set[tuple[str, ...]] = set()
        for wav in sorted(pdir.glob("*.wav")):
            with wave.open(str(wav), "rb") as w:
                rec = KaldiRecognizer(model, w.getframerate())
            text = _transcribe(rec, wav)
            tokens = tuple(text.split())
            if tokens:
                seqs.add(tokens)
                words.update(tokens)
        if not seqs:
            print(f"  {key}: no transcripts")
            continue
        sorted_seqs = sorted(seqs, key=lambda t: (-len(t), t))
        phrases[key] = [list(t) for t in sorted_seqs]
        print(f"  {key}: {len(sorted_seqs)} unique -> {phrases[key]}")

    if not phrases:
        print("No phrases produced any transcripts.", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"phrases": phrases, "words": sorted(words)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nWrote {OUT}: {len(phrases)} phrases, {len(words)} unique words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
