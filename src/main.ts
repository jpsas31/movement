import butterchurn from "butterchurn";
import butterchurnPresets from "butterchurn-presets";
import { createAudioAnalyserRig, formatAudioInputLabel } from "./audio-input";
import {
  createMoldSketch,
  MOLD_COUNT_DEFAULT,
  MOLD_COUNT_LOW,
} from "./mold-sketch";
import { handleSharedMovementKeys } from "./movement-keys";
import { buildRows, createOptionsSummaryHud } from "./options-summary-hud";
import {
  applyGhostFreeze,
  clonePresetGraphForButterchurn,
  type PresetWithBase,
} from "./preset-variants";
import {
  CUSTOM_PRESET_REGISTRY,
  getCustomPresetEntry,
  rebuildAllCustomSlots,
} from "./presets/custom-registry";
import {
  MANDELVERSE_PACK_PRESET_KEY,
  mandelversePackPreset,
} from "./presets/mandelverse-pack-preset";
import {
  nextVizIntensity,
  VIZ_AUDIO_GAIN,
  type VizIntensity,
} from "./viz-intensity";
import { butterchurnQualityOpts, displayPixelRatio } from "./viz-quality";

/** Replacing avoids stacked canvases after Vite HMR (second WebGL canvas often stays black). */
const BUTTERCHURN_CANVAS_ID = "movement-butterchurn-canvas";

let lowRes = false;

function syncButterchurnCanvasSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (lowRes) {
    canvas.width = Math.max(1, Math.floor(w * 0.5));
    canvas.height = Math.max(1, Math.floor(h * 0.5));
  } else {
    const dpr = displayPixelRatio();
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }
}

// --- Butterchurn canvas ---
document.getElementById(BUTTERCHURN_CANVAS_ID)?.remove();
const canvas = document.createElement("canvas");
canvas.id = BUTTERCHURN_CANVAS_ID;
canvas.style.cssText =
  "position:fixed; inset:0; width:100vw; height:100vh; display:block; z-index:0;";
document.body.appendChild(canvas);

let visualizer: ReturnType<typeof butterchurn.createVisualizer> | null = null;

// --- Mold container (p5 renders into this) ---
const moldContainer = document.createElement("div");
moldContainer.style.cssText = "position:fixed; inset:0; display:none;";
document.body.appendChild(moldContainer);

// --- Preset name label ---
const presetLabel = document.createElement("div");
presetLabel.style.cssText = `
  position: fixed; top: 12px; left: 16px;
  color: rgba(255,255,255,0.75); font-family: monospace; font-size: 13px;
  pointer-events: none; z-index: 20; display: none;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
`;
document.body.appendChild(presetLabel);
let labelVisible = false;

const audioInputLabel = document.createElement("div");
audioInputLabel.style.cssText = `
  position: fixed; bottom: 12px; left: 16px;
  color: rgba(255,255,255,0.55); font-family: monospace; font-size: 12px;
  pointer-events: none; z-index: 20;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
`;
document.body.appendChild(audioInputLabel);

function resize() {
  syncButterchurnCanvasSize();
  if (visualizer) {
    const q = butterchurnQualityOpts(lowRes);
    visualizer.setRendererSize(canvas.width, canvas.height, {
      pixelRatio: q.pixelRatio,
      textureRatio: q.textureRatio,
    });
  }
}
window.addEventListener("resize", resize);
resize();

// --- UI overlay ---
const overlay = document.createElement("div");
overlay.style.cssText = `
  position: fixed; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85); color: white;
  font-family: sans-serif; font-size: 18px; cursor: pointer; z-index: 10;
`;
overlay.innerHTML = `
  <div style="font-size:48px;margin-bottom:16px">🎵</div>
  <div>Click to start visualizer</div>
  <div style="font-size:13px;margin-top:8px;opacity:0.6">Microphone access required</div>
  <div style="font-size:12px;margin-top:10px;opacity:0.45;max-width:320px;text-align:center">After start, press <strong>A</strong> to switch between mic and computer audio (browser will ask to share a tab/screen — use “Share tab audio” when sharing a tab).</div>
  <div style="font-size:12px;margin-top:8px;opacity:0.4;max-width:320px;text-align:center"><strong>Y</strong> cycles intensity (mild → normal → hot): <em>stock</em> presets use audio gain; <strong>custom</strong> presets in <code>src/presets</code> use unity gain and each preset’s own <code>build(tier)</code> (see <code>custom-registry.ts</code>).</div>
  <div style="font-size:12px;margin-top:6px;opacity:0.35;max-width:320px;text-align:center"><strong>O</strong> toggles a live summary of options (top-right).</div>
`;
document.body.appendChild(overlay);

const CYCLE_INTERVAL_MS = 20_000;

async function start() {
  overlay.remove();

  const rig = await createAudioAnalyserRig({
    logPrefix: "[audio]",
    onInputKindChange: (kind, filename) => {
      audioInputLabel.textContent =
        kind === "file" && filename
          ? `Audio: ${filename} (A = mic)`
          : formatAudioInputLabel(kind, "main");
    },
  });

  syncButterchurnCanvasSize();
  const q = butterchurnQualityOpts(lowRes);

  const glOpts = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
  } as const;
  if (!canvas.getContext("webgl2", glOpts)) {
    throw new Error(
      "WebGL 2 is required. Enable GPU / hardware acceleration or try another browser.",
    );
  }

  visualizer = butterchurn.createVisualizer(rig.audioCtx, canvas, {
    width: canvas.width,
    height: canvas.height,
    pixelRatio: q.pixelRatio,
    textureRatio: q.textureRatio,
  });
  visualizer.connectAudio(rig.analyser);
  resize();

  let vizIntensity: VizIntensity = "normal";
  const allPresets: Record<string, PresetWithBase> = {
    ...butterchurnPresets.getPresets(),
    [MANDELVERSE_PACK_PRESET_KEY]: mandelversePackPreset,
  };
  for (const e of CUSTOM_PRESET_REGISTRY) {
    allPresets[e.mapKeySorted] = {} as PresetWithBase;
  }
  rebuildAllCustomSlots(allPresets, vizIntensity);
  const presetKeys = Object.keys(allPresets).sort();
  let idx = 0;
  let ghostMode = false;
  let freezeMode = false;

  function formatPresetLine(): string {
    const key = presetKeys[idx];
    let line = key.trim();
    if (getCustomPresetEntry(key)) line += ` · ${vizIntensity}`;
    return line;
  }

  function syncAnalyserGainForCurrentPreset() {
    const key = presetKeys[idx];
    const custom = getCustomPresetEntry(key);
    rig.setAnalyserInputGain(custom ? 1 : VIZ_AUDIO_GAIN[vizIntensity]);
  }

  function loadPreset(blendTime: number) {
    const key = presetKeys[idx];
    const entry = getCustomPresetEntry(key);
    if (entry) allPresets[key] = entry.build(vizIntensity);
    syncAnalyserGainForCurrentPreset();
    const preset = allPresets[key];
    const p = clonePresetGraphForButterchurn(
      applyGhostFreeze(preset, ghostMode, freezeMode),
    );
    // blendTime 0 → blendDuration 0 → blendProgress Infinity → cos(∞) is NaN in butterchurn's mixer.
    const safeBlend = blendTime <= 0 ? 1e-6 : blendTime;
    visualizer!.loadPreset(p, safeBlend);
    presetLabel.textContent = formatPresetLine();
    console.log(
      "[butterchurn] preset:",
      key,
      freezeMode ? "(freeze)" : ghostMode ? "(ghost)" : "",
    );
  }
  loadPreset(0);

  let autoCycle = false;
  setInterval(() => {
    if (!autoCycle || (mode !== "butterchurn" && !combinedMode)) return;
    idx = (idx + 1) % presetKeys.length;
    loadPreset(2.0);
  }, CYCLE_INTERVAL_MS);

  let moldInstance: ReturnType<typeof createMoldSketch> | null = null;

  function initMold() {
    moldInstance = createMoldSketch(
      moldContainer,
      () => freezeMode,
      () => rig.getLevel(),
      lowRes ? MOLD_COUNT_LOW : MOLD_COUNT_DEFAULT,
    );
  }

  type Mode = "butterchurn" | "mold";
  let mode: Mode = "butterchurn";
  let combinedMode = false;

  function updateVisibility() {
    if (combinedMode) {
      canvas.style.display = "block";
      moldContainer.style.display = "block";
      moldContainer.style.mixBlendMode = "screen";
      moldContainer.style.pointerEvents = "none";
      if (!moldInstance) initMold();
    } else {
      canvas.style.display = mode === "butterchurn" ? "block" : "none";
      moldContainer.style.display = mode === "mold" ? "block" : "none";
      moldContainer.style.mixBlendMode = "";
      moldContainer.style.pointerEvents = "";
    }
  }

  function switchMode() {
    mode = mode === "butterchurn" ? "mold" : "butterchurn";
    if (mode === "mold" && !moldInstance) initMold();
    updateVisibility();
    console.log("[mode]", mode);
  }

  const optionsHud = createOptionsSummaryHud("Movement", () => {
    const display = combinedMode
      ? "combined (viz + mold)"
      : mode === "butterchurn"
        ? "butterchurn"
        : "mold";
    const opViz = parseFloat(canvas.style.opacity || "1").toFixed(1);
    const opMold = parseFloat(moldContainer.style.opacity || "1").toFixed(1);
    const rows = buildRows([
      { label: "Display", value: display },
      {
        label: "Preset",
        value: `${formatPresetLine()} (${idx + 1}/${presetKeys.length})`,
      },
      {
        label: "Intensity (Y)",
        value: getCustomPresetEntry(presetKeys[idx])
          ? `${vizIntensity} (custom preset · unity audio gain · tier via build())`
          : `${vizIntensity} (${VIZ_AUDIO_GAIN[vizIntensity].toFixed(2)}× audio into viz)`,
      },
      {
        label: "Audio in",
        value: rig.getInputKind() === "mic" ? "microphone" : "audio file",
      },
      { label: "Ghost", value: ghostMode ? "on" : "off" },
      { label: "Freeze", value: freezeMode ? "on" : "off" },
      { label: "Low-res (Q)", value: lowRes ? "on" : "off" },
      { label: "Auto-cycle (R)", value: autoCycle ? "on" : "off" },
      { label: "Preset name (I)", value: labelVisible ? "visible" : "hidden" },
      { label: "Opacity viz / mold", value: `${opViz} / ${opMold}` },
    ]);
    const hint =
      "<div style='margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);opacity:.48;font-size:10px;line-height:1.45'>" +
      "A audio · M mode · C combined · I label · O HUD · Q quality · Y intensity · G/F ghost/freeze · R auto · N/B/click preset · [ ] . , opacity" +
      "</div>";
    return rows + hint;
  });

  window.addEventListener("keydown", (e) => {
    if (
      handleSharedMovementKeys(e, {
        toggleAudioInput: () => rig.toggleInput(),
        switchMode,
        toggleCombinedMode: () => {
          combinedMode = !combinedMode;
          updateVisibility();
          console.log("[mode] combined:", combinedMode ? "on" : "off");
        },
        toggleLabels: () => {
          labelVisible = !labelVisible;
          presetLabel.style.display = labelVisible ? "block" : "none";
        },
        butterchurnOpacityEl: canvas,
        moldOpacityEl: moldContainer,
        toggleGhost: () => {
          ghostMode = !ghostMode;
          if (ghostMode) freezeMode = false;
          if (visualizer) loadPreset(0);
          console.log("[mode] ghost:", ghostMode ? "on" : "off");
        },
        toggleFreeze: () => {
          freezeMode = !freezeMode;
          if (freezeMode) ghostMode = false;
          if (visualizer) loadPreset(0);
          console.log("[mode] freeze:", freezeMode ? "on" : "off");
        },
      })
    ) {
      return;
    }
    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      optionsHud.toggle();
      return;
    }
    if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      vizIntensity = nextVizIntensity(vizIntensity);
      rebuildAllCustomSlots(allPresets, vizIntensity);
      syncAnalyserGainForCurrentPreset();
      console.log("[butterchurn] viz intensity:", vizIntensity);
      if (visualizer && getCustomPresetEntry(presetKeys[idx])) {
        loadPreset(1.2);
      }
      return;
    }
    if ((mode !== "butterchurn" && !combinedMode) || !visualizer) return;
    if (e.key === "r") {
      autoCycle = !autoCycle;
      console.log("[butterchurn] auto-cycle:", autoCycle ? "on" : "off");
    } else if (e.key === "n") {
      idx = (idx + 1) % presetKeys.length;
      loadPreset(1.5);
    } else if (e.key === "b") {
      idx = (idx - 1 + presetKeys.length) % presetKeys.length;
      loadPreset(1.5);
    } else if (e.key === "q") {
      lowRes = !lowRes;
      resize();
      console.log("[butterchurn] low-res:", lowRes ? "on" : "off");
    }
  });

  canvas.addEventListener("click", () => {
    if (mode !== "butterchurn") return;
    idx = (idx + 1) % presetKeys.length;
    loadPreset(1.5);
  });

  function render() {
    requestAnimationFrame(render);
    if (mode !== "butterchurn" && !combinedMode) return;
    visualizer!.render();
  }
  requestAnimationFrame(render);
}

overlay.addEventListener("click", () => {
  start().catch((err) => {
    console.error("[start] error:", err);
    overlay.innerHTML = `<div style="color:red">Error: ${err.message}</div>`;
    document.body.appendChild(overlay);
  });
});
