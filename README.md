# Movement

**Real-time audio-reactive visualizer** — stream your microphone or system audio into a full-screen WebGL rendering engine powered by MilkDrop (Butterchurn) and a physarum mold simulation (p5.js).

![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- Real-time audio visualization driven by microphone or system audio
- MilkDrop/Butterchurn preset engine with 100+ stock presets
- Physarum mold simulation mode and combined overlay mode
- Custom preset system with intensity tiers (mild / normal / hot)
- Ghost and freeze variants of any Butterchurn preset
- Auto-cycle through presets on a timer
- Low-resolution mode for performance-constrained devices
- Live options HUD with full session state



## Installation

```bash
# 1. Clone the repo
git clone <repo-url>
cd movement

# 2. Install Python dependencies
uv sync

# 3. Install Node dependencies
npm install
```

---

## Running Locally

`npm run dev` starts both the Vite dev server and the FastAPI backend concurrently:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser (Vite's default port).


### Production build

```bash
npm run build        # outputs to dist/
uv run python main.py  # serves dist/ as static files on :8080
```

---

## Audio Input

On first load, click the screen to grant microphone access. The visualizer starts with **microphone** input by default.


---

## Key Controls

| Key | Action |
|-----|--------|
| `A` | Toggle audio input (microphone ↔ audio file) |
| `M` | Switch visualization mode (Butterchurn ↔ Mold) |
| `C` | Toggle combined mode (Butterchurn + Mold overlay) |
| `N` | Next preset |
| `B` | Previous preset |
| Click | Next preset (Butterchurn mode only) |
| `R` | Toggle auto-cycle presets (every 20 s) |
| `Y` | Cycle intensity: mild → normal → hot |
| `G` | Toggle ghost mode |
| `F` | Toggle freeze mode |
| `I` | Toggle preset name label |
| `O` | Toggle live options HUD |
| `Q` | Toggle low-resolution mode |
| `.` | Increase Butterchurn opacity (+0.1) |
| `,` | Decrease Butterchurn opacity (−0.1) |
| `]` | Increase Mold opacity (+0.1) |
| `[` | Decrease Mold opacity (−0.1) |

---

## Performance

On lower-end devices or when frame rate drops, press **`Q`** to enable low-resolution mode. This renders the Butterchurn canvas at 50% of native resolution, substantially reducing GPU load.

---

## Presets

See **[PRESET_GUIDE.md](PRESET_GUIDE.md)** for full documentation on authoring custom presets, the MilkDrop equation system, and how audio intensity tiers work.

---