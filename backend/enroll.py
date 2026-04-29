"""Enrollment: build per-phrase log-mel templates + speaker embedding from .wav samples.

Layout:
    backend/enroll/audio/<phrase_key>/*.wav   # 3-5 takes per phrase from target speaker
    backend/noise/*.wav                       # optional noise corpus for augmentation
Outputs:
    backend/templates/speaker.npy             # mean Resemblyzer embedding (256,)
    backend/templates/phrases.npz             # per-phrase: log-mel templates + threshold

Run:
    uv run python backend/enroll.py
    uv run python backend/enroll.py --no-augment    # skip noise augmentation
    uv run python backend/enroll.py --aug-per 3     # 3 noise variants per clean (default)
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import librosa
import numpy as np
import scipy.signal
from resemblyzer import VoiceEncoder, preprocess_wav

SAMPLE_RATE = 16000
N_MELS = 40
N_MFCC = 13
HOP_LENGTH = 160      # 10 ms @ 16 kHz
WIN_LENGTH = 400      # 25 ms @ 16 kHz
N_FFT = 512
THRESHOLD_MARGIN = 1.05  # tight: MFCC+delta features discriminate, so spread = signal
SNR_DB_CHOICES = (5.0, 10.0, 15.0)
SILENCE_TRIM_DB = 30.0  # trim leading/trailing samples below this dB vs peak

BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "enroll" / "audio"
NOISE_DIR = BASE_DIR / "noise"
TEMPLATES_DIR = BASE_DIR / "templates"


def trim_silence(y: np.ndarray) -> np.ndarray:
    """Drop leading/trailing samples below SILENCE_TRIM_DB vs peak. Robust to VAD pad."""
    if y.size == 0:
        return y
    yt, _ = librosa.effects.trim(y, top_db=SILENCE_TRIM_DB, frame_length=2048, hop_length=512)
    return yt if yt.size >= SAMPLE_RATE // 10 else y  # fall back if trim ate too much


def log_mel(y: np.ndarray) -> np.ndarray:
    """16 kHz float32 mono -> MFCC + Δ + ΔΔ (39, T) with cepstral mean normalization.

    Name kept as `log_mel` for backwards compatibility with existing imports.
    Features picked for discriminative phrase content (MFCCs encode phonemes;
    deltas encode dynamics) — replaces prior raw log-mel + CMVN which smeared
    phonetic shape and made DTW behave near-randomly across phrases.
    """
    y = trim_silence(y)
    mfcc = librosa.feature.mfcc(
        y=y, sr=SAMPLE_RATE, n_mfcc=N_MFCC, n_fft=N_FFT,
        hop_length=HOP_LENGTH, win_length=WIN_LENGTH, n_mels=N_MELS,
    )
    delta = librosa.feature.delta(mfcc, order=1)
    delta2 = librosa.feature.delta(mfcc, order=2)
    feat = np.vstack([mfcc, delta, delta2])  # (39, T)
    # CMN only (subtract mean) — preserves dynamics; removes channel/mic offset.
    feat = feat - feat.mean(axis=1, keepdims=True)
    return feat.astype(np.float32)


def dtw_distance(template: np.ndarray, segment: np.ndarray) -> float:
    """Subsequence DTW cost: template matched against best-aligning window of segment.

    Asymmetric on purpose — the template (short, clean phrase) is the query,
    the segment (longer, possibly with leading/trailing silence) is the reference.
    librosa returns cost matrix; min over last row = best-ending alignment.
    Normalized by template width so distances are comparable across phrases.
    """
    # Pad segment to at least template length (subseq mode requires len(Y) >= len(X)).
    if segment.shape[1] < template.shape[1]:
        pad = template.shape[1] - segment.shape[1]
        segment = np.pad(segment, ((0, 0), (0, pad)), mode="edge")
    D, _ = librosa.sequence.dtw(X=template, Y=segment, metric="euclidean", subseq=True)
    end_col = int(np.argmin(D[-1, :]))
    return float(D[-1, end_col] / template.shape[1])


def mix_at_snr(clean: np.ndarray, noise: np.ndarray, snr_db: float) -> np.ndarray:
    """Scale `noise` to match target SNR vs `clean`, sum. Same length assumed."""
    p_clean = float(np.mean(clean ** 2))
    p_noise = float(np.mean(noise ** 2))
    if p_clean <= 1e-10 or p_noise <= 1e-10:
        return clean
    target_p_noise = p_clean / (10.0 ** (snr_db / 10.0))
    scale = (target_p_noise / p_noise) ** 0.5
    mixed = clean + noise * scale
    peak = np.max(np.abs(mixed))
    if peak > 0.99:
        mixed = mixed * (0.99 / peak)
    return mixed.astype(np.float32)


def channel_augment(y: np.ndarray, n_variants: int, rng: np.random.Generator) -> list[np.ndarray]:
    """Synthesize plausible mic/codec channels on a clean template.

    Each variant applies a random subset of: band-pass (mimics narrow-band mic
    or telephony codec), gain shift (different mic sensitivity), and short
    decaying-noise reverb (different room acoustics). Templates trained on
    just one channel (phone .m4a) end up matching whatever laptop mic the
    runtime user happens to use.
    """
    variants: list[np.ndarray] = []
    for _ in range(n_variants):
        z = y.astype(np.float32, copy=True)
        # Random band-pass: simulate mic frequency response / phone codec.
        if rng.random() < 0.7:
            low = float(rng.uniform(120.0, 500.0))
            high = float(rng.uniform(2800.0, 7000.0))
            sos = scipy.signal.butter(4, [low, high], btype="band", fs=SAMPLE_RATE, output="sos")
            z = scipy.signal.sosfilt(sos, z).astype(np.float32)
        # Random gain ±6 dB.
        gain_db = float(rng.uniform(-6.0, 6.0))
        z = z * (10.0 ** (gain_db / 20.0))
        # Short room reverb via convolution with a decaying-noise IR.
        if rng.random() < 0.5:
            ir_len = int(rng.integers(800, 4000))
            decay = float(rng.uniform(20.0, 200.0))
            ir = rng.standard_normal(ir_len).astype(np.float32) * np.exp(-np.arange(ir_len) / decay)
            peak = float(np.max(np.abs(ir)))
            if peak > 0:
                ir /= peak
            z = scipy.signal.fftconvolve(z, ir, mode="same").astype(np.float32)
        # Peak limit so augmented audio doesn't clip the int16 quantizer at runtime parity.
        peak = float(np.max(np.abs(z)))
        if peak > 0.99:
            z = z * (0.99 / peak)
        variants.append(z.astype(np.float32))
    return variants


def _fit_noise(noise: np.ndarray, length: int) -> np.ndarray:
    if len(noise) >= length:
        start = random.randint(0, len(noise) - length)
        return noise[start:start + length]
    # Tile + trim if noise shorter than clean.
    reps = (length // len(noise)) + 1
    return np.tile(noise, reps)[:length]


def _load_noise_pool() -> list[np.ndarray]:
    if not NOISE_DIR.is_dir():
        return []
    pool: list[np.ndarray] = []
    for nf in sorted(NOISE_DIR.glob("*.wav")):
        try:
            y, _ = librosa.load(str(nf), sr=SAMPLE_RATE, mono=True)
            if len(y) >= SAMPLE_RATE // 2:  # at least 0.5 s usable
                pool.append(y.astype(np.float32))
        except Exception:
            continue
    return pool


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-augment", action="store_true",
                        help="skip noise augmentation even if noise/ has wavs")
    parser.add_argument("--aug-per", type=int, default=3,
                        help="noise-augmented variants per clean template (default 3)")
    parser.add_argument("--ch-aug", type=int, default=4,
                        help="synthetic channel-augmented variants per clean template (default 4). "
                             "Set 0 to disable. Variants apply random band-pass, gain, and reverb "
                             "to span mic/codec diversity at runtime.")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)
    np.random.seed(args.seed)

    if not AUDIO_DIR.is_dir():
        print(f"Missing {AUDIO_DIR}. Create per-phrase subdirs with .wav samples.", file=sys.stderr)
        return 1

    phrase_dirs = sorted(p for p in AUDIO_DIR.iterdir() if p.is_dir() and not p.name.startswith("."))
    if not phrase_dirs:
        print(f"No phrase subdirs found in {AUDIO_DIR}.", file=sys.stderr)
        return 1

    noise_pool = [] if args.no_augment else _load_noise_pool()
    if args.no_augment:
        print("Augmentation disabled (--no-augment).")
    elif not noise_pool:
        print(f"No noise files found in {NOISE_DIR}. Run backend/download_noise.py first, "
              "or pass --no-augment to enroll on clean templates only.")
    else:
        print(f"Noise pool: {len(noise_pool)} clips.")

    encoder = VoiceEncoder()
    all_speaker_wavs: list[np.ndarray] = []
    phrase_templates: dict[str, list[np.ndarray]] = {}
    phrase_thresholds: dict[str, float] = {}

    for pdir in phrase_dirs:
        wavs = sorted(pdir.glob("*.wav"))
        if len(wavs) < 2:
            print(f"  skip {pdir.name}: need >=2 samples, got {len(wavs)}", file=sys.stderr)
            continue

        clean_wavs: list[np.ndarray] = []
        templates: list[np.ndarray] = []
        for w in wavs:
            y, _ = librosa.load(str(w), sr=SAMPLE_RATE, mono=True)
            clean_wavs.append(y.astype(np.float32))
            templates.append(log_mel(y))
            all_speaker_wavs.append(preprocess_wav(str(w), source_sr=SAMPLE_RATE))

        # Noise augmentation: mix each clean wav w/ random noise at random SNR.
        # Adds templates only — speaker embedding still uses clean takes.
        aug_count = 0
        if noise_pool:
            for clean in clean_wavs:
                for _ in range(args.aug_per):
                    noise = random.choice(noise_pool)
                    noise = _fit_noise(noise, len(clean))
                    snr = random.choice(SNR_DB_CHOICES)
                    mixed = mix_at_snr(clean, noise, snr)
                    templates.append(log_mel(mixed))
                    aug_count += 1

        # Channel augmentation: synthesize different mic/codec/room paths on
        # each clean wav so DTW basin spans whatever channel runtime uses.
        ch_count = 0
        if args.ch_aug > 0:
            for clean in clean_wavs:
                for v in channel_augment(clean, args.ch_aug, rng):
                    templates.append(log_mel(v))
                    ch_count += 1
        phrase_templates[pdir.name] = templates

        # Per-phrase threshold from intra-template DTW spread.
        intra: list[float] = []
        for i in range(len(templates)):
            for j in range(i + 1, len(templates)):
                intra.append(dtw_distance(templates[i], templates[j]))
        max_intra = max(intra) if intra else 1.0
        phrase_thresholds[pdir.name] = max_intra * THRESHOLD_MARGIN
        print(f"  {pdir.name}: clean={len(clean_wavs)} noise_aug={aug_count} ch_aug={ch_count} "
              f"total={len(templates)} max_intra={max_intra:.3f} "
              f"threshold={phrase_thresholds[pdir.name]:.3f}")

    if not phrase_templates:
        print("No phrases enrolled.", file=sys.stderr)
        return 1

    # Speaker embedding: mean over all clean enrollment utterances (no augmented audio).
    speaker_emb = np.mean(
        np.stack([encoder.embed_utterance(w) for w in all_speaker_wavs]), axis=0
    )
    speaker_emb /= np.linalg.norm(speaker_emb) + 1e-8

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    np.save(TEMPLATES_DIR / "speaker.npy", speaker_emb)

    payload: dict[str, np.ndarray] = {}
    for key, tmpls in phrase_templates.items():
        for i, t in enumerate(tmpls):
            payload[f"{key}__t{i}"] = t
        payload[f"{key}__thr"] = np.asarray(phrase_thresholds[key], dtype=np.float32)
    np.savez_compressed(TEMPLATES_DIR / "phrases.npz", **payload)

    print(f"\nWrote {TEMPLATES_DIR / 'speaker.npy'} ({speaker_emb.shape})")
    print(f"Wrote {TEMPLATES_DIR / 'phrases.npz'} "
          f"({len(phrase_templates)} phrases, "
          f"{sum(len(v) for v in phrase_templates.values())} templates)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
