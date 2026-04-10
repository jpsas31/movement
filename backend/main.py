import logging
import os
import subprocess
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    import sounddevice as sd
except Exception:
    sd = None  # audio capture unavailable in this environment

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

BASE_DIR = Path(__file__).resolve().parent.parent

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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        print(data)


def generate_cert(cert_file="cert.pem", key_file="key.pem"):
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            key_file,
            "-out",
            cert_file,
            "-days",
            "365",
            "-nodes",
            "-subj",
            "/CN=localhost",
        ],
        check=True,
        capture_output=True,
    )


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
