import asyncio
import json
import logging
import os
from collections import deque
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = BASE_DIR / "backend" / "models" / "vosk-model-es-0.42"
MODEL_DIR = Path(os.getenv("VOSK_MODEL", str(DEFAULT_MODEL_DIR)))
TEMPLATES_DIR = BASE_DIR / "backend" / "templates"
SAMPLE_RATE = 16000

# RECOGNIZER selects the WS pipeline:
#   "vosk"     (default) - Vosk grammar only, fastest, no speaker verification
#   "hybrid"   - Vosk grammar + Resemblyzer speaker gate (slower)
#   "template" - DTW path on MFCC templates (slowest, channel-sensitive)
RECOGNIZER = os.getenv("RECOGNIZER", "vosk").lower()
SPEAKER_THRESHOLD = float(os.getenv("SPEAKER_THRESHOLD", "0.50"))

# Flat grammar vocab. KaldiRecognizer grammar mode restricts recognition to these tokens,
# slashing latency and false positives vs open dictation. "[unk]" lets Vosk label
# out-of-vocab speech as unknown instead of snapping to the closest trigger word.
GRAMMAR_WORDS = [
    "me", "te", "en", "el", "mi",
    "siento", "enamorada", "enamorado",
    "compartimos", "pensar", "ti", "enseñaste",
    "lloro", "tristeza", "extraño", "felicidad",
    "dejar", "ir", "amo", "conectar", "amor",
    "abrazo", "futuro",
    "recuerdo", "acuerdo", "nostalgia",
    "[unk]",
]
GRAMMAR_JSON = json.dumps(GRAMMAR_WORDS, ensure_ascii=False)

# (phrase tokens in spoken order) -> trigger key sent over WS.
# Sorted longest-first so "te amo" wins over bare "amo" / "amor".
TRIGGERS: list[tuple[tuple[str, ...], str]] = sorted(
    [
        (("pensar", "en", "ti"), "pensar_en_ti"),
        (("me", "siento"), "siento"),
        (("me", "acuerdo"), "recuerdo"),
        (("dejar", "ir"), "dejar_ir"),
        (("te", "amo"), "te_amo"),
        (("el", "futuro"), "futuro"),
        (("mi", "amor"), "amor"),
        (("compartimos",), "compartimos"),
        (("enamorada",), "enamorada"),
        (("enamorado",), "enamorada"),
        (("enseñaste",), "ensenaste"),
        (("lloro",), "tristeza"),
        (("tristeza",), "tristeza"),
        (("extraño",), "extrano"),
        (("felicidad",), "felicidad"),
        (("conectar",), "conectar"),
        (("amor",), "amor"),
        (("abrazo",), "abrazo"),
        (("futuro",), "futuro"),
        (("siento",), "siento"),
        (("recuerdo",), "recuerdo"),
        (("nostalgia",), "nostalgia"),
    ],
    key=lambda p: -len(p[0]),
)

GRAMMAR_PATH = TEMPLATES_DIR / "grammar.json"


def _merge_observed_grammar() -> None:
    """Load backend/templates/grammar.json (built by build_grammar.py) and merge
    into module-level GRAMMAR_WORDS, GRAMMAR_JSON, TRIGGERS, MAX_PHRASE_LEN.

    Captures whatever Vosk actually transcribes on the enrollment .wavs — including
    misheard variants — so runtime grammar mode accepts and routes them.
    """
    global GRAMMAR_WORDS, GRAMMAR_JSON, TRIGGERS, MAX_PHRASE_LEN
    if not GRAMMAR_PATH.exists():
        return
    data = json.loads(GRAMMAR_PATH.read_text(encoding="utf-8"))
    obs_words = data.get("words", [])
    obs_pairs: list[tuple[tuple[str, ...], str]] = []
    for key, seqs in data.get("phrases", {}).items():
        for seq in seqs:
            if seq:
                obs_pairs.append((tuple(seq), key))
    if not obs_words and not obs_pairs:
        return
    GRAMMAR_WORDS = sorted(set(GRAMMAR_WORDS) | set(obs_words))
    GRAMMAR_JSON = json.dumps(GRAMMAR_WORDS, ensure_ascii=False)
    merged = sorted(set(TRIGGERS) | set(obs_pairs), key=lambda p: -len(p[0]))
    TRIGGERS = merged
    MAX_PHRASE_LEN = max(len(p[0]) for p in TRIGGERS)
    logger.info(
        "Grammar augmented from %s: total=%d words, %d trigger sequences",
        GRAMMAR_PATH, len(GRAMMAR_WORDS), len(TRIGGERS),
    )


MAX_PHRASE_LEN = max(len(p[0]) for p in TRIGGERS)
DEBOUNCE_SECONDS = 2.0
# Hard cap on a single WS audio frame. The frontend worklet ships 3200-byte
# chunks (1600 samples @ int16 16 kHz, ~100 ms). 65 KB ≈ 2 s of audio — anything
# larger is a misbehaving client and wastes Kaldi CPU.
MAX_WS_FRAME_BYTES = 65_536
_merge_observed_grammar()

app = FastAPI()

static_dir = BASE_DIR / "static"
if static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def read_root():
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/debug")
def read_debug():
    return FileResponse(BASE_DIR / "static" / "debug.html")


# Lazy-init recognizer state. Whichever pipeline is active is built once at import.
_vosk_model = None
_template_matcher = None
_speaker_emb = None
_voice_encoder = None


def _load_vosk_model():
    from vosk import Model
    if not MODEL_DIR.is_dir():
        raise RuntimeError(
            f"Vosk model not found at {MODEL_DIR}. "
            "Download vosk-model-es-0.42 from https://alphacephei.com/vosk/models "
            f"and extract to {DEFAULT_MODEL_DIR}, or set VOSK_MODEL env var."
        )
    logger.info("Loading Vosk model from %s", MODEL_DIR)
    m = Model(str(MODEL_DIR))
    logger.info("Vosk model loaded")
    return m


def _load_speaker_assets():
    import numpy as np
    from resemblyzer import VoiceEncoder
    speaker_path = TEMPLATES_DIR / "speaker.npy"
    if not speaker_path.exists():
        raise RuntimeError(
            f"Speaker embedding not found at {speaker_path}. "
            "Run `uv run python backend/enroll.py` to build it."
        )
    emb = np.load(speaker_path)
    enc = VoiceEncoder(verbose=False)
    logger.info("Speaker embedding loaded (%s)", emb.shape)
    return emb, enc


if RECOGNIZER == "vosk":
    _vosk_model = _load_vosk_model()
elif RECOGNIZER == "template":
    from backend.matcher import StreamingSegmenter, TemplateMatcher
    logger.info("Loading template matcher from %s", TEMPLATES_DIR)
    _template_matcher = TemplateMatcher(TEMPLATES_DIR)
    logger.info("Template matcher loaded")
elif RECOGNIZER == "hybrid":
    _vosk_model = _load_vosk_model()
    _speaker_emb, _voice_encoder = _load_speaker_assets()
else:
    raise RuntimeError(
        f"Unknown RECOGNIZER={RECOGNIZER!r} (expected 'hybrid', 'template', or 'vosk')"
    )


def _tokens_from_text(text: str) -> list[str]:
    return [w for w in text.split() if w not in ("[unk]", "<unk>")]


def _match_trigger_at_tail(tokens: list[str]) -> str | None:
    for phrase, key in TRIGGERS:
        n = len(phrase)
        if len(tokens) >= n and tuple(tokens[-n:]) == phrase:
            return key
    return None


async def _vosk_loop(websocket: WebSocket, emit) -> None:
    """Trigger only on Vosk's own endpointer (AcceptWaveform=True).

    AcceptWaveform/Result are CPU-bound and would otherwise block the asyncio
    event loop, starving other WS connections; running them in a worker thread
    keeps the loop responsive.
    """
    from vosk import KaldiRecognizer
    rec = KaldiRecognizer(_vosk_model, SAMPLE_RATE, GRAMMAR_JSON)
    final_tokens: deque[str] = deque(maxlen=MAX_PHRASE_LEN)
    bytes_seen = 0

    while True:
        data = await websocket.receive_bytes()
        if len(data) > MAX_WS_FRAME_BYTES:
            logger.warning("vosk: dropping oversize frame (%d bytes)", len(data))
            continue
        bytes_seen += len(data)
        if bytes_seen >= SAMPLE_RATE * 2 * 2:
            logger.info("vosk: heartbeat (%.1f s audio received)", bytes_seen / (SAMPLE_RATE * 2))
            bytes_seen = 0

        if await asyncio.to_thread(rec.AcceptWaveform, data):
            result = await asyncio.to_thread(rec.Result)
            text = json.loads(result).get("text", "")
            if text:
                logger.info("vosk: final='%s'", text)
            for w in _tokens_from_text(text):
                final_tokens.append(w)
                key = _match_trigger_at_tail(list(final_tokens))
                if key:
                    await emit(key)


async def _template_loop(websocket: WebSocket, emit) -> None:
    segmenter = StreamingSegmenter()
    while True:
        data = await websocket.receive_bytes()
        if len(data) > MAX_WS_FRAME_BYTES:
            logger.warning("template: dropping oversize frame (%d bytes)", len(data))
            continue
        # silero-vad runs torch ops; offload so async loop stays free.
        segments = await asyncio.to_thread(segmenter.push, data)
        for segment in segments:
            # Resemblyzer + DTW are the heavy CPU stage; thread them too.
            key = await asyncio.to_thread(_template_matcher.match, segment)
            if key:
                await emit(key)


def _speaker_match(audio_bytes: bytes) -> tuple[bool, float]:
    """Run Resemblyzer on a raw int16 LE 16k mono buffer; return (passes_gate, cos)."""
    import numpy as np
    if len(audio_bytes) < SAMPLE_RATE:  # need >= ~1 s for stable embed
        return False, -1.0
    audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    try:
        emb = _voice_encoder.embed_utterance(audio)
    except Exception as exc:
        logger.info("hybrid: speaker embed failed: %s", exc)
        return False, -1.0
    emb = emb / (np.linalg.norm(emb) + 1e-8)
    cos = float(np.dot(emb, _speaker_emb))
    return cos >= SPEAKER_THRESHOLD, cos


async def _hybrid_loop(websocket: WebSocket, emit) -> None:
    """Vosk identifies phrase via grammar; Resemblyzer verifies it's the target speaker."""
    from vosk import KaldiRecognizer
    rec = KaldiRecognizer(_vosk_model, SAMPLE_RATE, GRAMMAR_JSON)
    final_tokens: deque[str] = deque(maxlen=MAX_PHRASE_LEN)
    last_partial_token_count = 0
    # Rolling audio buffer covering the current utterance + a short tail of the
    # previous one — Resemblyzer needs ~1 s of audio for a stable embedding,
    # which a partial-fired trigger may not have on its own.
    utterance_bytes = bytearray()
    rolling_max = SAMPLE_RATE * 2 * 6  # ~6 s of int16 16 kHz audio

    async def maybe_emit(key: str) -> None:
        ok, cos = await asyncio.to_thread(_speaker_match, bytes(utterance_bytes))
        logger.info("hybrid: phrase=%s speaker_cos=%.3f gate=%s", key, cos, "OK" if ok else "FAIL")
        if ok:
            await emit(key)

    while True:
        data = await websocket.receive_bytes()
        if len(data) > MAX_WS_FRAME_BYTES:
            logger.warning("hybrid: dropping oversize frame (%d bytes)", len(data))
            continue
        utterance_bytes.extend(data)
        if len(utterance_bytes) > rolling_max:
            del utterance_bytes[: len(utterance_bytes) - rolling_max]

        if await asyncio.to_thread(rec.AcceptWaveform, data):
            result = await asyncio.to_thread(rec.Result)
            text = json.loads(result).get("text", "")
            for w in _tokens_from_text(text):
                final_tokens.append(w)
                key = _match_trigger_at_tail(list(final_tokens))
                if key:
                    await maybe_emit(key)
            last_partial_token_count = 0
            # Keep the last ~1 s of audio so a partial-fired trigger on the next
            # utterance still has speaker context if the user speaks fast.
            keep = min(len(utterance_bytes), SAMPLE_RATE * 2)
            del utterance_bytes[: len(utterance_bytes) - keep]
        else:
            partial_raw = await asyncio.to_thread(rec.PartialResult)
            partial_text = json.loads(partial_raw).get("partial", "")
            partial_tokens = _tokens_from_text(partial_text)
            if len(partial_tokens) <= last_partial_token_count:
                continue
            last_partial_token_count = len(partial_tokens)
            combined = list(final_tokens) + partial_tokens
            tail = combined[-MAX_PHRASE_LEN:]
            key = _match_trigger_at_tail(tail)
            if key:
                await maybe_emit(key)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    last_fire: dict[str, float] = {}
    loop = asyncio.get_running_loop()

    async def emit(trigger: str) -> None:
        now = loop.time()
        if now - last_fire.get(trigger, -1e9) < DEBOUNCE_SECONDS:
            return
        last_fire[trigger] = now
        await websocket.send_json({"trigger": trigger})
        logger.info("trigger: %s", trigger)

    try:
        if RECOGNIZER == "vosk":
            await _vosk_loop(websocket, emit)
        elif RECOGNIZER == "hybrid":
            await _hybrid_loop(websocket, emit)
        else:
            await _template_loop(websocket, emit)
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    ssl_cert = os.getenv("SSL_CERT")
    ssl_key = os.getenv("SSL_KEY")
    # Same as: uv run uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
    # Use import string so reload works. HTTPS: pass ssl_keyfile/ssl_certfile (see generate_cert).
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=True,
        ssl_certfile=ssl_cert or None,
        ssl_keyfile=ssl_key or None,
    )
