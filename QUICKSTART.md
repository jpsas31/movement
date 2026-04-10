# Quick Start

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

## Other commands

```bash
npm run build          # Production build to dist/
npm run typecheck      # TypeScript check
npm run test           # Run tests
npm run lint           # ESLint
```
