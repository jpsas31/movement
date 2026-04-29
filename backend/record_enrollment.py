"""Record enrollment samples directly through the system mic at 16 kHz.

Why this exists: templates and runtime audio must traverse the same channel
(mic + room + codec). Phone-recorded enrollment .m4a files don't match the
laptop-mic spectrum at runtime, which causes the matcher's MFCC distances
to balloon. Re-recording via the same mic eliminates that mismatch.

Usage:
    uv run python backend/record_enrollment.py
    uv run python backend/record_enrollment.py --phrases te_amo amor          # subset
    uv run python backend/record_enrollment.py --takes 5 --duration 2.0
    uv run python backend/record_enrollment.py --no-backup                    # overwrite existing
    uv run python backend/record_enrollment.py --device 1                     # explicit input device
    uv run python backend/record_enrollment.py --list-devices                 # list devices and exit

By default, existing wavs in backend/enroll/audio/<key>/ are moved to
backend/enroll/audio_backup_<timestamp>/ before recording fresh ones.
After recording, run:  uv run python backend/enroll.py
"""
from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf

SAMPLE_RATE = 16000

# (key, prompt-label). Defaults to current TRIGGERS set.
PHRASES: list[tuple[str, str]] = [
    ("te_amo", "te amo"),
    ("amor", "mi amor / amor"),
    ("siento", "siento"),
    ("recuerdo", "recuerdo / me acuerdo"),
    ("nostalgia", "nostalgia"),
    ("tristeza", "tristeza / lloro"),
    ("extrano", "extraño"),
    ("felicidad", "felicidad"),
    ("conectar", "conectar"),
    ("abrazo", "abrazo"),
    ("pensar_en_ti", "pensar en ti"),
    ("dejar_ir", "dejar ir"),
    ("futuro", "(el) futuro"),
    ("compartimos", "compartimos"),
    ("ensenaste", "enseñaste"),
]

BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "enroll" / "audio"


def list_devices() -> None:
    print(sd.query_devices())


def record_one(duration: float, device: int | str | None) -> np.ndarray:
    rec = sd.rec(
        int(duration * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        device=device,
    )
    sd.wait()
    return rec.squeeze()


def backup_existing() -> Path | None:
    if not AUDIO_DIR.is_dir():
        return None
    has_content = any(p.is_dir() and any(p.glob("*.wav")) for p in AUDIO_DIR.iterdir())
    if not has_content:
        return None
    stamp = time.strftime("%Y%m%d_%H%M%S")
    dst = BASE_DIR / "enroll" / f"audio_backup_{stamp}"
    shutil.copytree(AUDIO_DIR, dst)
    print(f"[backup] copied existing wavs to {dst}")
    return dst


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--takes", type=int, default=5)
    parser.add_argument("--duration", type=float, default=2.0)
    parser.add_argument("--phrases", nargs="*", default=None,
                        help="subset of phrase keys to record (default = all)")
    parser.add_argument("--device", default=None,
                        help="sounddevice input device index or substring")
    parser.add_argument("--list-devices", action="store_true")
    parser.add_argument("--no-backup", action="store_true",
                        help="skip backup of existing samples (will overwrite)")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return 0

    selected = PHRASES
    if args.phrases:
        wanted = set(args.phrases)
        selected = [(k, lbl) for k, lbl in PHRASES if k in wanted]
        missing = wanted - {k for k, _ in selected}
        if missing:
            print(f"[warn] unknown keys ignored: {sorted(missing)}", file=sys.stderr)

    device: int | str | None = args.device
    if isinstance(device, str) and device.isdigit():
        device = int(device)

    print(f"Sample rate: {SAMPLE_RATE} Hz, take duration: {args.duration} s, "
          f"takes per phrase: {args.takes}")
    print(f"Phrases ({len(selected)}): {', '.join(k for k, _ in selected)}")

    if not args.no_backup:
        backup_existing()

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    for key, label in selected:
        target = AUDIO_DIR / key
        if target.exists():
            for f in target.glob("*.wav"):
                f.unlink()
        target.mkdir(parents=True, exist_ok=True)
        print(f"\n=== {key}  ('{label}') ===")
        for i in range(1, args.takes + 1):
            try:
                input(f"  ENTER to record take {i}/{args.takes} (~{args.duration:.1f} s) ... ")
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.")
                return 1
            print(f"  recording...", end=" ", flush=True)
            audio = record_one(args.duration, device)
            out = target / f"{i}.wav"
            sf.write(str(out), audio, SAMPLE_RATE, subtype="PCM_16")
            peak = float(np.max(np.abs(audio.astype(np.int32)))) / 32768.0
            rms = float(np.sqrt(np.mean((audio.astype(np.float32) / 32768.0) ** 2)))
            print(f"saved {out.name} (peak={peak:.2f}, rms={rms:.3f})")
            if peak < 0.05:
                print("    [warn] very quiet — speak louder or check input device")

    print("\nDone. Now re-enroll:")
    print("    uv run python backend/enroll.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
