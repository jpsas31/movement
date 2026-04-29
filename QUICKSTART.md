# Quick Start

## Windows (one-click)

Double-click **`start-windows.bat`** in the project folder. First run installs Node.js + uv via `winget`, downloads a small (~40 MB) Vosk model, and launches the dev server. Subsequent runs just launch.

Requirements: Windows 10 (1809+) or Windows 11 with `winget` (App Installer). If `start-windows.bat` is blocked, right-click it → **Properties** → check **Unblock** → OK.

Then open `http://localhost:5173` in your browser.

## Prerequisites

- **Node.js** (v18+) — for the frontend
- **Python 3.12+** and **[uv](https://docs.astral.sh/uv/getting-started/installation/)** — for the backend

## 1. Install dependencies

```bash
# Frontend
npm install

# Backend (uv creates the venv automatically)
uv sync
```

## 2. Run

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend** (Vite dev server): `http://localhost:5173`
- **Backend** (FastAPI): `http://localhost:8080`

Or run them separately:

```bash
npm run dev:frontend   # Vite only
npm run dev:backend    # FastAPI only
```

## 3. Use it

Open `http://localhost:5173` in your browser, click the screen, and grant microphone access.

**Key bindings:**

| Key | Action |
|-----|--------|
| `A` | Toggle mic / audio file input |
| `N` / `B` / click | Next / previous preset |
| `R` | Toggle auto-cycle presets (20s interval) |
| `Y` | Cycle intensity: mild → normal → hot |
| `M` | Switch between Butterchurn / Mold mode |
| `C` | Toggle combined mode (both layered) |
| `G` / `F` | Ghost / Freeze mode |
| `V` / `K` | Load video file / toggle camera feed |
| `Q` | Toggle low-res quality |
| `I` | Toggle preset name label |
| `O` | Toggle options HUD |
| `[` `]` `.` `,` | Adjust opacity |

## Speaker-locked keyword recognition (default)

The backend now uses a template-matching pipeline locked to a single speaker. It replaces Vosk for normal use; the Vosk path is preserved behind `RECOGNIZER=vosk`.

### Enroll the target speaker

1. Place 3–5 `.wav` recordings (16 kHz mono preferred — any rate works, librosa resamples) into one directory per phrase trigger:

   ```
   backend/enroll/audio/
     te_amo/{1,2,3,4,5}.wav
     mi_amor/{1,2,3,4,5}.wav
     pensar_en_ti/...
     ...
   ```

   Subdirectory name = trigger key sent over the WebSocket. Match the keys used in `backend/main.py` `TRIGGERS` (e.g. `te_amo`, `enamorada`, `tristeza`, `dejar_ir`, `futuro`, `amor`, `compartimos`, `ensenaste`, `extrano`, `felicidad`, `conectar`, `abrazo`, `pensar_en_ti`).

2. (Optional but recommended) Pull a noise corpus for enrollment-time augmentation:

   ```bash
   uv run python backend/download_noise.py            # ESC-50 (~600 MB single zip, default)
   uv run python backend/download_noise.py --source musan   # MUSAN (11 GB tar; only noise/ kept ~200 MB)
   ```

   Files land in `backend/noise/`. Enrollment mixes each clean take with random noise at 5/10/15 dB SNR to widen DTW matching basins.

3. Build templates + speaker embedding:

   ```bash
   uv run python backend/enroll.py                    # noise-augmented (3 variants per clean)
   uv run python backend/enroll.py --no-augment       # clean-only
   uv run python backend/enroll.py --aug-per 5        # more augmentation per clean take
   ```

   Outputs `backend/templates/speaker.npy` and `backend/templates/phrases.npz`.

4. Start the backend normally — `RECOGNIZER=template` is the default.

   Tunable env vars (matcher only): `VAD_THRESHOLD` (default 0.5), `SPEAKER_THRESHOLD` (default 0.65).

### Fall back to Vosk

```bash
RECOGNIZER=vosk npm run dev:backend
```

## Other commands

```bash
npm run build          # Production build to dist/
npm run typecheck      # TypeScript check
npm run test           # Run tests
npm run lint           # ESLint
```
