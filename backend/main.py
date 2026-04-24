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
from vosk import KaldiRecognizer, Model

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = BASE_DIR / "backend" / "models" / "vosk-model-es-0.42"
MODEL_DIR = Path(os.getenv("VOSK_MODEL", str(DEFAULT_MODEL_DIR)))
SAMPLE_RATE = 16000

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
    "[unk]",
]
GRAMMAR_JSON = json.dumps(GRAMMAR_WORDS, ensure_ascii=False)

# (phrase tokens in spoken order) -> trigger key sent over WS.
# Sorted longest-first so "te amo" wins over bare "amo" / "amor".
TRIGGERS: list[tuple[tuple[str, ...], str]] = sorted(
    [
        (("pensar", "en", "ti"), "pensar_en_ti"),
        (("me", "siento"), "enamorada"),
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
    ],
    key=lambda p: -len(p[0]),
)

MAX_PHRASE_LEN = max(len(p[0]) for p in TRIGGERS)
DEBOUNCE_SECONDS = 2.0

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


if not MODEL_DIR.is_dir():
    raise RuntimeError(
        f"Vosk model not found at {MODEL_DIR}. "
        "Download vosk-model-es-0.42 from https://alphacephei.com/vosk/models "
        f"and extract to {DEFAULT_MODEL_DIR}, or set VOSK_MODEL env var."
    )
logger.info("Loading Vosk model from %s", MODEL_DIR)
_model = Model(str(MODEL_DIR))
logger.info("Vosk model loaded")


def _tokens_from_text(text: str) -> list[str]:
    return [w for w in text.split() if w not in ("[unk]", "<unk>")]


def _match_trigger_at_tail(tokens: list[str]) -> str | None:
    for phrase, key in TRIGGERS:
        n = len(phrase)
        if len(tokens) >= n and tuple(tokens[-n:]) == phrase:
            return key
    return None


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    rec = KaldiRecognizer(_model, SAMPLE_RATE, GRAMMAR_JSON)
    # Tokens finalized by AcceptWaveform; kept only so trigger phrases can span
    # an utterance boundary + the next partial.
    final_tokens: deque[str] = deque(maxlen=MAX_PHRASE_LEN)
    last_fire: dict[str, float] = {}
    last_partial_token_count = 0
    loop = asyncio.get_running_loop()

    async def emit(trigger: str) -> None:
        now = loop.time()
        if now - last_fire.get(trigger, -1e9) < DEBOUNCE_SECONDS:
            return
        last_fire[trigger] = now
        await websocket.send_json({"trigger": trigger})
        logger.info("trigger: %s", trigger)

    try:
        while True:
            data = await websocket.receive_bytes()
            if rec.AcceptWaveform(data):
                # Utterance finalized. Append each new word then match its tail —
                # matching per-append avoids re-matching the same tail on later chunks.
                text = json.loads(rec.Result()).get("text", "")
                for w in _tokens_from_text(text):
                    final_tokens.append(w)
                    key = _match_trigger_at_tail(list(final_tokens))
                    if key:
                        await emit(key)
                last_partial_token_count = 0
            else:
                # PartialResult repeats the growing hypothesis each chunk. Only match
                # when the partial has actually gained a new token — otherwise we'd
                # fire repeatedly on the same still-trailing trigger word (debounce
                # masks some, but the fix is to not re-match unchanged text).
                partial_text = json.loads(rec.PartialResult()).get("partial", "")
                partial_tokens = _tokens_from_text(partial_text)
                if len(partial_tokens) <= last_partial_token_count:
                    continue
                last_partial_token_count = len(partial_tokens)
                combined = list(final_tokens) + partial_tokens
                tail = combined[-MAX_PHRASE_LEN:]
                key = _match_trigger_at_tail(tail)
                if key:
                    await emit(key)
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
