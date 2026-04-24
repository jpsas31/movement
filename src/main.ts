import butterchurn from "butterchurn";
import { VideoFrameInjector } from "./video-frame-injector";
import butterchurnPresets from "butterchurn-presets";
import { createAudioAnalyserRig, formatAudioInputLabel } from "./audio-input";
import { handleSharedMovementKeys } from "./movement-keys";
import { buildRows, createOptionsSummaryHud } from "./options-summary-hud";
import { createSidePanel, type ToggleItem } from "./side-panel";
import {
  clonePresetGraphForButterchurn,
  type PresetWithBase,
} from "./preset-variants";
import {
  cleanExpiredRipples,
  createRippleState,
  getRippleAges,
  triggerRipple,
} from "./effects/ripple";
import {
  createSpiralState,
  isSpiralIdle,
  toggleSpiral,
  updateSpiral,
} from "./effects/spiral";
import {
  cleanExpiredBeats,
  createHeartbeatState,
  getHeartbeatBeats,
  HEARTBEAT_INTERVAL_MS,
  triggerHeartbeat,
  triggerLoveBurst,
} from "./effects/heartbeat";
import {
  createRotationState,
  isRotationIdle,
  toggleNostalgia,
  toggleRotation,
  updateRotation,
} from "./effects/rotation";
import { PostProcessChain } from "./effects/post-process-chain";
import {
  createBlackholeState,
  toggleBlackholes,
  updateBlackholes,
  getBlackholeUniforms,
  triggerMissing,
  toggleSharing,
  hasScriptedSharing,
  triggerConnect,
} from "./effects/blackhole";
import {
  createSeaState,
  toggleSea,
  updateSea,
  isSeaIdle,
} from "./effects/sea";
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

// --- Butterchurn canvas (hidden render target, z-index:0 behind display canvas) ---
document.getElementById(BUTTERCHURN_CANVAS_ID)?.remove();
const canvas = document.createElement("canvas");
canvas.id = BUTTERCHURN_CANVAS_ID;
// Hidden behind displayCanvas; kept in DOM so WebGL context stays active.
canvas.style.cssText =
  "position:fixed; inset:0; width:100vw; height:100vh; display:block; z-index:0; visibility:hidden;";
document.body.appendChild(canvas);

let visualizer: ReturnType<typeof butterchurn.createVisualizer> | null = null;

// --- Post-process chain (single WebGL context, FBOs, z-index:4) ---
// ripple → spiral → heartbeat → rotation, all in one context.
// Eliminates 3 of 4 cross-context GPU readbacks for ~75% less pipeline stall.
const postProcessChain = new PostProcessChain();

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
  // In lowRes mode, scale the post-process FBOs to match the butterchurn source
  // (50% viewport). Keeps the whole pipeline at a single resolution — no pointless
  // upsample in the chain when the source is already lower-res, and fill/readback
  // cost shrinks ×0.25. The final rotation canvas is CSS-sized to √2×viewport
  // regardless, so the browser bilinear-upscales on composite.
  const scale = lowRes ? 0.5 : 1;
  const chainW = Math.max(1, Math.floor(window.innerWidth * scale));
  const chainH = Math.max(1, Math.floor(window.innerHeight * scale));
  postProcessChain.resize(chainW, chainH);
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
  <div style="font-size:12px;margin-top:10px;opacity:0.45;max-width:320px;text-align:center">After start, press <strong>A</strong> to switch between mic and computer audio (browser will ask to share a tab/screen — use "Share tab audio" when sharing a tab).</div>
  <div style="font-size:12px;margin-top:8px;opacity:0.4;max-width:320px;text-align:center"><strong>Y</strong> cycles intensity (mild → normal → hot): <em>stock</em> presets use audio gain; <strong>custom</strong> presets in <code>src/presets</code> use unity gain and each preset's own <code>build(tier)</code> (see <code>custom-registry.ts</code>).</div>
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
    onTrigger: (trigger) => handleSpeechTrigger(trigger),
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

  const rippleState = createRippleState();
  let rippleIntervalId: ReturnType<typeof setInterval> | null = null;
  const RIPPLE_INTERVAL_MS = 1500;

  const spiralState = createSpiralState();

  const heartbeatState = createHeartbeatState();
  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

  const rotationState = createRotationState();
  const blackholeState = createBlackholeState();
  const seaState = createSeaState();

  let vizIntensity: VizIntensity = "normal";
  const allPresets: Record<string, PresetWithBase> = {
    // ...butterchurnPresets.getPresets(),
    [MANDELVERSE_PACK_PRESET_KEY]: mandelversePackPreset,
  };
  for (const e of CUSTOM_PRESET_REGISTRY) {
    allPresets[e.mapKeySorted] = {} as PresetWithBase;
  }
  rebuildAllCustomSlots(allPresets, vizIntensity);
  const presetKeys = Object.keys(allPresets).sort();
  let idx = 0;

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
    const p = clonePresetGraphForButterchurn(preset);
    // blendTime 0 → blendDuration 0 → blendProgress Infinity → cos(∞) is NaN in butterchurn's mixer.
    const safeBlend = blendTime <= 0 ? 1e-6 : blendTime;
    visualizer!.loadPreset(p, safeBlend);
    presetLabel.textContent = formatPresetLine();
    console.log("[butterchurn] preset:", key);
  }
  loadPreset(0);

  let autoCycle = false;
  const _cycleInterval = setInterval(() => {
    if (!autoCycle) return;
    idx = (idx + 1) % presetKeys.length;
    loadPreset(2.0);
  }, CYCLE_INTERVAL_MS);

  const videoInjector = new VideoFrameInjector();

  // displayCanvas is the topmost visible output (PostProcessChain canvas).
  const displayCanvas = postProcessChain.canvas;

  const optionsHud = createOptionsSummaryHud("Movement", () => {
    const opViz = parseFloat(displayCanvas.style.opacity || "1").toFixed(1);
    const rows = buildRows([
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
      { label: "Low-res (Q)", value: lowRes ? "on" : "off" },
      { label: "Auto-cycle (R)", value: autoCycle ? "on" : "off" },
      { label: "Video (V) / Camera (K)", value: videoInjector.getSource() },
      { label: "Spiral (W)", value: spiralState.active ? "winding" : isSpiralIdle(spiralState) ? "off" : "unwinding" },
      { label: "Ripple (E)", value: rippleIntervalId !== null ? "on" : "off" },
      { label: "Heartbeat (H)", value: heartbeatIntervalId !== null ? "on" : "off" },
      { label: "Rotation (T)", value: rotationState.active ? "spinning" : isRotationIdle(rotationState) ? "off" : "unwinding" },
      { label: "Black holes (X)", value: blackholeState.active ? `on (${blackholeState.holes.length})` : "off" },
      { label: "Extraño (Z)", value: "burst" },
      { label: "Compartimos (S)", value: hasScriptedSharing(blackholeState) ? "on" : "off" },
      { label: "Te amo (D)", value: "burst" },
      { label: "Conectar (J)", value: "burst" },
      { label: "Nostalgia (U)", value: rotationState.nostalgia ? "on" : "off" },
      { label: "Amor (2)", value: seaState.active ? "on" : isSeaIdle(seaState) ? "off" : "fading" },
      { label: "Voice (L)", value: rig.isVoiceEnabled() ? "listening" : "off" },
      { label: "Preset name (I)", value: labelVisible ? "visible" : "hidden" },
      { label: "Opacity (viz)", value: opViz },
    ]);
    const hint =
      "<div style='margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);opacity:.48;font-size:10px;line-height:1.45'>" +
      "A audio · I label · O HUD · Q quality · Y intensity · R auto · N/B/click preset · V video file · K camera · W spiral · E ripple · H heartbeat · T rotation · X black holes · Z extraño · S compartimos · D te amo · J conectar · U nostalgia · 2 amor · L voice · . , opacity" +
      "</div>";
    return rows + hint;
  });

  const sidePanel = createSidePanel({
    getPresetKeys: () => presetKeys,
    getCurrentIndex: () => idx,
    onPresetSelect: (i: number) => {
      idx = i;
      loadPreset(1.5);
    },
    formatPresetName: (key: string) => key.trim(),
    getToggles: (): ToggleItem[] => [
      {
        label: "Auto-cycle",
        shortcut: "R",
        getValue: () => (autoCycle ? "on" : "off"),
        onToggle: () => { autoCycle = !autoCycle; },
      },
      {
        label: "Spiral",
        shortcut: "W",
        getValue: () => (spiralState.active ? "on" : isSpiralIdle(spiralState) ? "off" : "fading"),
        onToggle: () => toggleSpiral(spiralState),
      },
      {
        label: "Ripple",
        shortcut: "E",
        getValue: () => (rippleIntervalId !== null ? "on" : "off"),
        onToggle: () => {
          if (rippleIntervalId !== null) {
            clearInterval(rippleIntervalId);
            rippleIntervalId = null;
          } else {
            triggerRipple(rippleState);
            rippleIntervalId = setInterval(() => triggerRipple(rippleState), RIPPLE_INTERVAL_MS);
          }
        },
      },
      {
        label: "Heartbeat",
        shortcut: "H",
        getValue: () => (heartbeatIntervalId !== null ? "on" : "off"),
        onToggle: () => {
          if (heartbeatIntervalId !== null) {
            clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = null;
          } else {
            triggerHeartbeat(heartbeatState);
            heartbeatIntervalId = setInterval(() => triggerHeartbeat(heartbeatState), HEARTBEAT_INTERVAL_MS);
          }
        },
      },
      {
        label: "Rotation",
        shortcut: "T",
        getValue: () => (rotationState.active ? "on" : isRotationIdle(rotationState) ? "off" : "fading"),
        onToggle: () => toggleRotation(rotationState),
      },
      {
        label: "Black holes",
        shortcut: "X",
        getValue: () => (blackholeState.active ? `on (${blackholeState.holes.length})` : "off"),
        onToggle: () => toggleBlackholes(blackholeState),
      },
      {
        label: "Extraño",
        shortcut: "Z",
        getValue: () => "burst",
        onToggle: () => triggerMissing(blackholeState),
      },
      {
        label: "Compartimos",
        shortcut: "S",
        getValue: () => (hasScriptedSharing(blackholeState) ? "on" : "off"),
        onToggle: () => toggleSharing(blackholeState),
      },
      {
        label: "Te amo",
        shortcut: "D",
        getValue: () => "burst",
        onToggle: () => triggerLoveBurst(heartbeatState),
      },
      {
        label: "Conectar",
        shortcut: "J",
        getValue: () => "burst",
        onToggle: () => triggerConnect(blackholeState),
      },
      {
        label: "Nostalgia",
        shortcut: "U",
        getValue: () => (rotationState.nostalgia ? "on" : "off"),
        onToggle: () => toggleNostalgia(rotationState),
      },
      {
        label: "Amor",
        shortcut: "2",
        getValue: () => (seaState.active ? "on" : isSeaIdle(seaState) ? "off" : "fading"),
        onToggle: () => toggleSea(seaState),
      },
      {
        label: "Voice",
        shortcut: "L",
        getValue: () => (rig.isVoiceEnabled() ? "on" : "off"),
        onToggle: () => rig.setVoiceEnabled(!rig.isVoiceEnabled()),
      },
      {
        label: "Low-res",
        shortcut: "Q",
        getValue: () => (lowRes ? "on" : "off"),
        onToggle: () => {
          lowRes = !lowRes;
          resize();
        },
      },
      {
        label: "Preset label",
        shortcut: "I",
        getValue: () => (labelVisible ? "on" : "off"),
        onToggle: () => {
          labelVisible = !labelVisible;
          presetLabel.style.display = labelVisible ? "block" : "none";
        },
      },
    ],
  });

  const heartbeatOnce = () => triggerHeartbeat(heartbeatState);
  const heartbeatLoopOn = () => {
    if (heartbeatIntervalId !== null) return;
    triggerHeartbeat(heartbeatState);
    heartbeatIntervalId = setInterval(heartbeatOnce, HEARTBEAT_INTERVAL_MS);
  };
  const heartbeatLoopOff = () => {
    if (heartbeatIntervalId === null) return;
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  };
  const rippleLoopOn = () => {
    if (rippleIntervalId !== null) return;
    triggerRipple(rippleState);
    rippleIntervalId = setInterval(() => triggerRipple(rippleState), RIPPLE_INTERVAL_MS);
  };
  const rippleLoopOff = () => {
    if (rippleIntervalId === null) return;
    clearInterval(rippleIntervalId);
    rippleIntervalId = null;
  };
  const nextPreset = () => {
    idx = (idx + 1) % presetKeys.length;
    loadPreset(1.5);
  };

  const compartimosOff = () => {
    if (hasScriptedSharing(blackholeState)) toggleSharing(blackholeState);
  };
  const ensenasteOff = () => {
    if (blackholeState.active) toggleBlackholes(blackholeState);
  };
  const futuroOff = () => {
    if (spiralState.active) toggleSpiral(spiralState);
  };
  const conectarOff = () => {
    if (rotationState.active) toggleRotation(rotationState);
  };
  const amorOff = () => {
    if (seaState.active) toggleSea(seaState);
  };

  // A trigger is either:
  // - one-shot: fire once, effect self-expires (heart pulse, ripple pulse, preset change)
  // - timed: turn an effect on, auto-off after durationMs
  // Triggers that share the same `off` handler share a channel — re-speaking any of
  // them extends the same timer instead of racing, so saying "amor" during "te amo"
  // doesn't cut the beats short.
  type TriggerSpec =
    | { kind: "once"; fire: () => void }
    | { kind: "timed"; on: () => void; off: () => void; durationMs: number };

  const TRIGGERS: Record<string, TriggerSpec> = {
    extrano:      { kind: "once",  fire: () => triggerMissing(blackholeState) },
    dejar_ir:     { kind: "once",  fire: () => triggerRipple(rippleState) },
    felicidad:    { kind: "once",  fire: nextPreset },

    te_amo:       { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 12_000 },
    amor:         { kind: "timed", on: () => { if (!seaState.active) toggleSea(seaState); }, off: amorOff, durationMs: 10_000 },
    enamorada:    { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 8_000 },
    pensar_en_ti: { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 8_000 },
    abrazo:       { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 5_000 },

    tristeza:     { kind: "timed", on: rippleLoopOn,    off: rippleLoopOff,    durationMs: 8_000 },

    compartimos:  { kind: "timed", on: () => { if (!hasScriptedSharing(blackholeState)) toggleSharing(blackholeState); }, off: compartimosOff, durationMs: 15_000 },
    ensenaste:    { kind: "timed", on: () => { if (!blackholeState.active) toggleBlackholes(blackholeState); }, off: ensenasteOff, durationMs: 12_000 },
    futuro:       { kind: "timed", on: () => { if (!spiralState.active) toggleSpiral(spiralState); },           off: futuroOff,    durationMs: 12_000 },
    conectar:     { kind: "timed", on: () => { if (!rotationState.active) toggleRotation(rotationState); },     off: conectarOff,  durationMs: 10_000 },
  };

  const channelTimers = new Map<() => void, ReturnType<typeof setTimeout>>();

  function handleSpeechTrigger(trigger: string) {
    const spec = TRIGGERS[trigger];
    if (!spec) return;
    console.log("[trigger]", trigger);
    if (spec.kind === "once") {
      spec.fire();
      return;
    }
    spec.on();
    const prev = channelTimers.get(spec.off);
    if (prev !== undefined) clearTimeout(prev);
    const t = setTimeout(() => {
      channelTimers.delete(spec.off);
      spec.off();
    }, spec.durationMs);
    channelTimers.set(spec.off, t);
  }

  window.addEventListener("keydown", (e) => {
    if (
      handleSharedMovementKeys(e, {
        toggleAudioInput: () => rig.toggleInput(),
        toggleLabels: () => {
          labelVisible = !labelVisible;
          presetLabel.style.display = labelVisible ? "block" : "none";
        },
        butterchurnOpacityEl: displayCanvas,
      })
    ) {
      return;
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      sidePanel.toggle();
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
    if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      toggleSpiral(spiralState);
      console.log("[spiral]", spiralState.active ? "winding up" : "unwinding");
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      toggleRotation(rotationState);
      console.log("[rotation]", rotationState.active ? "spinning" : "unwinding");
      return;
    }
    if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      if (heartbeatIntervalId !== null) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
        console.log("[heartbeat] off");
      } else {
        triggerHeartbeat(heartbeatState);
        heartbeatIntervalId = setInterval(() => triggerHeartbeat(heartbeatState), HEARTBEAT_INTERVAL_MS);
        console.log("[heartbeat] on");
      }
      return;
    }
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      if (rippleIntervalId !== null) {
        clearInterval(rippleIntervalId);
        rippleIntervalId = null;
        console.log("[ripple] off");
      } else {
        triggerRipple(rippleState);
        rippleIntervalId = setInterval(() => triggerRipple(rippleState), RIPPLE_INTERVAL_MS);
        console.log("[ripple] on");
      }
      return;
    }
    if (e.key === "x" || e.key === "X") {
      e.preventDefault();
      toggleBlackholes(blackholeState);
      console.log("[blackhole]", blackholeState.active ? "on" : "off");
      return;
    }
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      triggerMissing(blackholeState);
      console.log("[extraño] burst");
      return;
    }
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      const on = toggleSharing(blackholeState);
      console.log("[compartimos]", on ? "on" : "off");
      return;
    }
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      triggerLoveBurst(heartbeatState);
      console.log("[te amo] burst");
      return;
    }
    if (e.key === "j" || e.key === "J") {
      e.preventDefault();
      triggerConnect(blackholeState);
      console.log("[conectar] burst");
      return;
    }
    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      toggleNostalgia(rotationState);
      console.log("[nostalgia]", rotationState.nostalgia ? "on" : "off");
      return;
    }
    if (e.key === "2") {
      e.preventDefault();
      toggleSea(seaState);
      console.log("[amor]", seaState.active ? "on" : "off");
      return;
    }
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      rig.setVoiceEnabled(!rig.isVoiceEnabled());
      return;
    }
    if (!visualizer) return;
    if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      videoInjector.toggleFile();
      return;
    }
    if (e.key === "k" || e.key === "K") {
      e.preventDefault();
      videoInjector.toggleCamera();
      return;
    }
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

  displayCanvas.addEventListener("click", () => {
    idx = (idx + 1) % presetKeys.length;
    loadPreset(1.5);
  });

  function render() {
    requestAnimationFrame(render);
    if (videoInjector.isActive()) {
      // Inject only into targetTexture. butterchurn swaps prevTexture↔targetTexture
      // at the START of its render(), so what we write here becomes sampler_pc_main
      // on this same frame — one upload per frame instead of two. We do NOT inject
      // into noiseTexLQ — presets like organic-mandel use it for fractal computation;
      // corrupting it causes persistent visual breakage.
      const { gl, targetTexture } = visualizer!.renderer;
      videoInjector.injectToFeedback(gl, targetTexture);
    }
    visualizer!.render();
    // Post-process chain: butterchurn → ripple → spiral → heartbeat → blackhole → sea → rotation.
    cleanExpiredRipples(rippleState);
    cleanExpiredBeats(heartbeatState);
    const { ages, amps } = getHeartbeatBeats(heartbeatState);
    updateBlackholes(blackholeState);
    const { positions: bhPositions, masses: bhMasses } = getBlackholeUniforms(blackholeState);
    const { time: seaTime, amp: seaAmp } = updateSea(seaState);
    postProcessChain.render(
      canvas,
      getRippleAges(rippleState),
      updateSpiral(spiralState),
      ages,
      amps,
      bhPositions,
      bhMasses,
      seaTime,
      seaAmp,
      updateRotation(rotationState),
    );
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
