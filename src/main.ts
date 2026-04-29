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
  toggleSpiralZoom,
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
import { PostProcessChain } from "./effects/post-process-chain";
import {
  createNostalgiaState,
  isNostalgiaIdle,
  toggleNostalgia,
  updateNostalgia,
} from "./effects/nostalgia";
import {
  createBlackholeState,
  toggleBlackholes,
  updateBlackholes,
  getBlackholeUniforms,
  triggerMissing,
  toggleSharing,
  hasScriptedSharing,
  triggerConnect,
  triggerBrush,
} from "./effects/blackhole";
import {
  createSeaState,
  isSeaIdle,
  toggleSea,
  updateSea,
} from "./effects/sea";
import {
  createFelicidadState,
  isFelicidadIdle,
  toggleFelicidad,
  updateFelicidad,
} from "./effects/felicidad";
import {
  CUSTOM_PRESET_REGISTRY,
  getCustomPresetEntry,
  rebuildAllCustomSlots,
} from "./presets/custom-registry";
import { applyStockOverlay } from "./presets/stock-overlays";
import {
  MANDELVERSE_PACK_PRESET_KEY,
  mandelversePackPreset,
} from "./presets/mandelverse-pack-preset";
import {
  GUNTHRY_PINE_TREES_PRESET_KEY,
  gunthryPineTreesPreset,
} from "./presets/gunthry-pine-trees";
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
// ripple → spiral → heartbeat → blackhole → sea → output, all in one context.
// Eliminates 3 of 4 cross-context GPU readbacks for ~75% less pipeline stall.
const postProcessChain = new PostProcessChain();

// Black body background so fade-to-black effects (e.g. "dejar ir") show black,
// not the browser default white, when display canvas opacity drops to 0.
document.body.style.background = "black";

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
// scheduleResize coalesces multiple resize triggers (window drag, toggle Q,
// preset load) into one rAF tick so FBO destroy/recreate isn't repeated mid-frame.
let _resizePending = false;
function scheduleResize() {
  if (_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(() => {
    _resizePending = false;
    resize();
  });
}
window.addEventListener("resize", scheduleResize);
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

  const blackholeState = createBlackholeState();
  const seaState = createSeaState();
  const nostalgiaState = createNostalgiaState();
  const felicidadState = createFelicidadState();

  let vizIntensity: VizIntensity = "normal";
  const allPresets: Record<string, PresetWithBase> = {
    [MANDELVERSE_PACK_PRESET_KEY]: mandelversePackPreset,
    [GUNTHRY_PINE_TREES_PRESET_KEY]: gunthryPineTreesPreset,
  };

  // Hand-picked stock butterchurn presets (curated subset of butterchurn-presets pkg).
  const SELECTED_STOCK_PRESETS = [
    "Aderrasi + Geiss - Airhandler (Kali Mix) - Canvas Mix",
    "Aderrasi - Potion of Spirits",
    "cope + martin - mother-of-pearl",
    "Flexi - mindblob [shiny mix]",
    "shifter - dark tides bdrv mix 2",
    "Zylot - Paint Spill (Music Reactive Paint Mix)",
    "Zylot - True Visionary (Final Mix)",
  ] as const;
  const stockPresets = butterchurnPresets.getPresets() as Record<string, PresetWithBase>;
  for (const k of SELECTED_STOCK_PRESETS) {
    const p = stockPresets[k];
    if (p) allPresets[k] = p;
    else console.warn("[preset] stock pack missing key:", k);
  }

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
    // Stock-preset overlays — apply only when the preset has no custom builder
    // (custom presets bake their own variants in `build(tier)`).
    if (!entry) applyStockOverlay(key, p);
    // blendTime 0 → blendDuration 0 → blendProgress Infinity → cos(∞) is NaN in butterchurn's mixer.
    const safeBlend = blendTime <= 0 ? 1e-6 : blendTime;
    visualizer!.loadPreset(p, safeBlend);
    presetLabel.textContent = formatPresetLine();
    console.log("[butterchurn] preset:", key);
  }
  loadPreset(0);

  let autoCycle = false;
  let cycleInterval: ReturnType<typeof setInterval> | null = null;
  function setAutoCycle(on: boolean) {
    autoCycle = on;
    if (on && cycleInterval === null) {
      cycleInterval = setInterval(() => {
        idx = (idx + 1) % presetKeys.length;
        loadPreset(2.0);
      }, CYCLE_INTERVAL_MS);
    } else if (!on && cycleInterval !== null) {
      clearInterval(cycleInterval);
      cycleInterval = null;
    }
  }

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
      { label: "Spiral+zoom (M)", value: spiralState.zoomActive ? "winding" : spiralState.zoom > 1 ? "unwinding" : "off" },
      { label: "Ripple (E)", value: rippleIntervalId !== null ? "on" : "off" },
      { label: "Heartbeat (H)", value: heartbeatIntervalId !== null ? "on" : "off" },
      { label: "Black holes (X)", value: blackholeState.active ? `on (${blackholeState.holes.length})` : "off" },
      { label: "Blackhole burst (J)", value: "tap" },
      { label: "Blackhole merge (C)", value: "tap" },
      { label: "Blackhole orbit (S)", value: hasScriptedSharing(blackholeState) ? "on" : "off" },
      { label: "Brushstroke (4)", value: "tap" },
      { label: "Big pulse (D)", value: "tap" },
      { label: "Fade to black (Z)", value: "tap" },
      { label: "Pendulum sway (U)", value: nostalgiaState.active ? "swaying" : isNostalgiaIdle(nostalgiaState) ? "off" : "settling" },
      { label: "Sea (F)", value: seaState.active ? "on" : isSeaIdle(seaState) ? "off" : "fading" },
      { label: "Color wave (T)", value: felicidadState.active ? "on" : isFelicidadIdle(felicidadState) ? "off" : "fading" },
      { label: "Voice (L)", value: rig.isVoiceEnabled() ? "listening" : "off" },
      { label: "Preset name (I)", value: labelVisible ? "visible" : "hidden" },
      { label: "Opacity (viz)", value: opViz },
    ]);
    const hint =
      "<div style='margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);opacity:.48;font-size:10px;line-height:1.45'>" +
      "A audio · I label · O HUD · G voice-map · Q quality · Y intensity · R auto · N/B/click preset · V video file · K camera · W spiral · M spiral+zoom · E ripple · H heartbeat · X black holes · J bh-burst · C bh-merge · S bh-orbit · 4 brushstroke · D big-pulse · Z fade-black · U pendulum · F sea · T color-wave · L voice · . , opacity" +
      "</div>";
    return rows + hint;
  });

  // Effect ↔ voice map overlay. Shown with G.
  // One row per effect. Voice column lists trigger words (with duration if timed),
  // or "—" when the effect has no voice association (key-only).
  type EffectBinding = { effect: string; key: string | null; voice: string };
  const EFFECT_BINDINGS: EffectBinding[] = [
    { effect: "Spiral",              key: "W",  voice: "futuro (12s)" },
    { effect: "Spiral + zoom",       key: "M",  voice: "pensar en ti (8s)" },
    { effect: "Ripple",              key: "E",  voice: "abrazo (loop 8s)" },
    { effect: "Fade to black",       key: "Z",  voice: "dejar ir" },
    { effect: "Heartbeat",           key: "H",  voice: "enamorada (8s)" },
    { effect: "Big pulse",           key: "D",  voice: "te amo" },
    { effect: "Black holes",         key: "X",  voice: "—" },
    { effect: "Blackhole burst",     key: "J",  voice: "extraño" },
    { effect: "Blackhole merge",     key: "C",  voice: "conectar" },
    { effect: "Blackhole orbit",     key: "S",  voice: "compartimos (8s)" },
    { effect: "Brushstroke",         key: "4",  voice: "ensenaste (5s)" },
    { effect: "Pendulum sway",       key: "U",  voice: "nostalgia (5s)" },
    { effect: "Sea",                 key: "F",  voice: "amor (10s)" },
    { effect: "Color wave",          key: "T",  voice: "felicidad (5s)" },
  ];
  const voiceMapHud = createOptionsSummaryHud("Effects ↔ voice (G)", () =>
    buildRows(
      EFFECT_BINDINGS.map((b) => ({
        label: b.key ? `${b.effect} (${b.key})` : b.effect,
        value: b.voice,
      })),
    ),
  );

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
        onToggle: () => setAutoCycle(!autoCycle),
      },
      {
        label: "Spiral",
        shortcut: "W",
        getValue: () => (spiralState.active ? "on" : isSpiralIdle(spiralState) ? "off" : "fading"),
        onToggle: () => toggleSpiral(spiralState),
      },
      {
        label: "Spiral + zoom",
        shortcut: "M",
        getValue: () => (spiralState.zoomActive ? "on" : spiralState.zoom > 1 ? "fading" : "off"),
        onToggle: () => toggleSpiralZoom(spiralState),
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
        label: "Black holes",
        shortcut: "X",
        getValue: () => (blackholeState.active ? `on (${blackholeState.holes.length})` : "off"),
        onToggle: () => toggleBlackholes(blackholeState),
      },
      {
        label: "Blackhole burst",
        shortcut: "J",
        getValue: () => "tap",
        onToggle: () => triggerMissing(blackholeState),
      },
      {
        label: "Blackhole merge",
        shortcut: "C",
        getValue: () => "tap",
        onToggle: () => triggerConnect(blackholeState),
      },
      {
        label: "Blackhole orbit",
        shortcut: "S",
        getValue: () => (hasScriptedSharing(blackholeState) ? "on" : "off"),
        onToggle: () => toggleSharing(blackholeState),
      },
      {
        label: "Brushstroke",
        shortcut: "4",
        getValue: () => "tap",
        onToggle: () => triggerBrush(blackholeState),
      },
      {
        label: "Big pulse",
        shortcut: "D",
        getValue: () => "tap",
        onToggle: () => triggerLoveBurst(heartbeatState),
      },
      {
        label: "Fade to black",
        shortcut: "Z",
        getValue: () => "tap",
        onToggle: () => triggerDejarIr(),
      },
      {
        label: "Pendulum sway",
        shortcut: "U",
        getValue: () => (nostalgiaState.active ? "on" : isNostalgiaIdle(nostalgiaState) ? "off" : "fading"),
        onToggle: () => toggleNostalgia(nostalgiaState),
      },
      {
        label: "Sea",
        shortcut: "F",
        getValue: () => (seaState.active ? "on" : isSeaIdle(seaState) ? "off" : "fading"),
        onToggle: () => toggleSea(seaState),
      },
      {
        label: "Color wave",
        shortcut: "T",
        getValue: () => (felicidadState.active ? "on" : isFelicidadIdle(felicidadState) ? "off" : "fading"),
        onToggle: () => toggleFelicidad(felicidadState),
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
          scheduleResize();
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
  // "dejar ir" — fade display canvas to black, hold ~1.4s, fade back in.
  // Total visual duration ≈ 2s (matches doc spec). Restores prior opacity so
  // user-set "." / "," opacity tweaks survive the trigger.
  let dejarIrPending = false;
  const triggerDejarIr = () => {
    if (dejarIrPending) return;
    dejarIrPending = true;
    const c = displayCanvas;
    const origOpacity = c.style.opacity || "1";
    const origTransition = c.style.transition;
    c.style.transition = "opacity 0.25s ease-out";
    c.style.opacity = "0";
    setTimeout(() => {
      c.style.opacity = origOpacity;
      setTimeout(() => {
        c.style.transition = origTransition;
        dejarIrPending = false;
      }, 350);
    }, 1700);
  };

  const compartimosOff = () => {
    if (hasScriptedSharing(blackholeState)) toggleSharing(blackholeState);
  };
  const futuroOff = () => {
    if (spiralState.active) toggleSpiral(spiralState);
  };
  const pensarEnTiOff = () => {
    if (spiralState.zoomActive) toggleSpiralZoom(spiralState);
  };
  const amorOff = () => {
    if (seaState.active) toggleSea(seaState);
  };
  const nostalgiaOff = () => {
    if (nostalgiaState.active) toggleNostalgia(nostalgiaState);
  };
  const felicidadOff = () => {
    if (felicidadState.active) toggleFelicidad(felicidadState);
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
    // ── Once: scripted bursts that self-expire ────────────────────────────────
    extrano:      { kind: "once",  fire: () => triggerMissing(blackholeState) },
    dejar_ir:     { kind: "once",  fire: triggerDejarIr },
    te_amo:       { kind: "once",  fire: () => triggerLoveBurst(heartbeatState) },
    conectar:     { kind: "once",  fire: () => triggerConnect(blackholeState) },

    // ── Timed: turn an effect on for N seconds, then auto-off ─────────────────
    amor:         { kind: "timed", on: () => { if (!seaState.active) toggleSea(seaState); }, off: amorOff, durationMs: 10_000 },
    enamorada:    { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 8_000 },
    siento:       { kind: "timed", on: heartbeatLoopOn, off: heartbeatLoopOff, durationMs: 8_000 },
    pensar_en_ti: { kind: "timed", on: () => { if (!spiralState.zoomActive) toggleSpiralZoom(spiralState); }, off: pensarEnTiOff, durationMs: 8_000 },

    // abrazo = drop falling, repeated, slow constant 8s → ripple loop, NOT heartbeat.
    abrazo:       { kind: "timed", on: rippleLoopOn,    off: rippleLoopOff,    durationMs: 8_000 },

    // compartimos doc = 8s (not 15).
    compartimos:  { kind: "timed", on: () => { if (!hasScriptedSharing(blackholeState)) toggleSharing(blackholeState); }, off: compartimosOff, durationMs: 8_000 },
    ensenaste:    { kind: "once",  fire: () => triggerBrush(blackholeState) },
    futuro:       { kind: "timed", on: () => { if (!spiralState.active) toggleSpiral(spiralState); },           off: futuroOff,    durationMs: 12_000 },
    nostalgia:    { kind: "timed", on: () => { if (!nostalgiaState.active) toggleNostalgia(nostalgiaState); },  off: nostalgiaOff, durationMs: 5_000 },
    recuerdo:     { kind: "timed", on: () => { if (!nostalgiaState.active) toggleNostalgia(nostalgiaState); },  off: nostalgiaOff, durationMs: 5_000 },
    felicidad:    { kind: "timed", on: () => { if (!felicidadState.active) toggleFelicidad(felicidadState); },  off: felicidadOff, durationMs: 5_000 },
  };

  const channelTimers = new Map<() => void, ReturnType<typeof setTimeout>>();

  // Trigger queue: backend can burst multiple triggers in tight succession
  // (long utterance, rapid repeats). Firing all on the same frame stacks GPU
  // work and looks like chaos. FIFO with hard cap (drop oldest on overflow);
  // drain at ~60 ms spacing so each effect's first frame lands before the next.
  const TRIGGER_QUEUE_MAX = 16;
  const TRIGGER_DRAIN_MS = 60;
  const triggerQueue: string[] = [];
  let triggerDraining = false;

  function handleSpeechTrigger(trigger: string) {
    if (!TRIGGERS[trigger]) {
      console.warn("[trigger] unknown:", trigger);
      return;
    }
    if (triggerQueue.length >= TRIGGER_QUEUE_MAX) {
      const dropped = triggerQueue.shift();
      console.warn("[trigger] queue full, dropped oldest:", dropped);
    }
    triggerQueue.push(trigger);
    if (!triggerDraining) drainTriggerQueue();
  }

  function drainTriggerQueue() {
    const next = triggerQueue.shift();
    if (next === undefined) {
      triggerDraining = false;
      return;
    }
    triggerDraining = true;
    fireTrigger(next);
    setTimeout(drainTriggerQueue, TRIGGER_DRAIN_MS);
  }

  function fireTrigger(trigger: string) {
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
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleSpiralZoom(spiralState);
      console.log("[spiral+zoom]", spiralState.zoomActive ? "on" : "off");
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
    if (e.key === "j" || e.key === "J") {
      e.preventDefault();
      triggerMissing(blackholeState);
      console.log("[blackhole-burst] tap");
      return;
    }
    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      triggerConnect(blackholeState);
      console.log("[blackhole-connect] tap");
      return;
    }
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      const on = toggleSharing(blackholeState);
      console.log("[blackhole-sharing]", on ? "on" : "off");
      return;
    }
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      triggerLoveBurst(heartbeatState);
      console.log("[love-burst] tap");
      return;
    }
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      triggerDejarIr();
      console.log("[fade-black] tap");
      return;
    }
    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      toggleNostalgia(nostalgiaState);
      console.log("[nostalgia]", nostalgiaState.active ? "swaying" : "settling");
      return;
    }
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleSea(seaState);
      console.log("[sea]", seaState.active ? "on" : "off");
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      toggleFelicidad(felicidadState);
      console.log("[felicidad]", felicidadState.active ? "on" : "off");
      return;
    }
    if (e.key === "4") {
      e.preventDefault();
      triggerBrush(blackholeState);
      console.log("[brushstroke] tap");
      return;
    }
    if (e.key === "g" || e.key === "G") {
      e.preventDefault();
      voiceMapHud.toggle();
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
      setAutoCycle(!autoCycle);
      console.log("[butterchurn] auto-cycle:", autoCycle ? "on" : "off");
    } else if (e.key === "n") {
      idx = (idx + 1) % presetKeys.length;
      loadPreset(1.5);
    } else if (e.key === "b") {
      idx = (idx - 1 + presetKeys.length) % presetKeys.length;
      loadPreset(1.5);
    } else if (e.key === "q") {
      lowRes = !lowRes;
      scheduleResize();
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
    // Post-process chain: butterchurn → ripple → spiral(+zoom) → heartbeat → blackhole → sea → output.
    cleanExpiredRipples(rippleState);
    cleanExpiredBeats(heartbeatState);
    const { ages, amps } = getHeartbeatBeats(heartbeatState);
    updateBlackholes(blackholeState);
    const { positions: bhPositions, masses: bhMasses } = getBlackholeUniforms(blackholeState);
    const { time: seaTime, amp: seaAmp } = updateSea(seaState);
    const { time: felTime, amp: felAmp } = updateFelicidad(felicidadState);
    const spiral = updateSpiral(spiralState);
    postProcessChain.render(
      canvas,
      getRippleAges(rippleState),
      spiral.strength,
      spiral.zoom,
      ages,
      amps,
      bhPositions,
      bhMasses,
      seaTime,
      seaAmp,
      felTime,
      felAmp,
    );
    // Nostalgia pendulum — CSS transform on display canvas, compositor only.
    const nostAngle = updateNostalgia(nostalgiaState);
    displayCanvas.style.transform = nostAngle === 0 ? "" : `rotate(${nostAngle}rad)`;
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
