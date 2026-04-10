import butterchurn from "butterchurn";
import butterchurnPresets from "butterchurn-presets";
import { createAudioAnalyserRig, formatAudioInputLabel } from "./audio-input";
import { createMoldSketch } from "./mold-sketch";
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

let vizIntensity: VizIntensity = "normal";
const allPresets: Record<string, PresetWithBase> = {
  ...butterchurnPresets.getPresets(),
  [MANDELVERSE_PACK_PRESET_KEY]: mandelversePackPreset,
};
for (const e of CUSTOM_PRESET_REGISTRY) {
  allPresets[e.mapKeySorted] = {} as PresetWithBase;
}
rebuildAllCustomSlots(allPresets, vizIntensity);

(window as unknown as { presets: string[] }).presets =
  Object.keys(allPresets).sort();

/** One row per custom preset: optional stock bases + custom `mapKeySorted` (see `CUSTOM_PRESET_REGISTRY`). */
function buildDebugPresetScenes(presets: Record<string, PresetWithBase>): string[][] {
  return CUSTOM_PRESET_REGISTRY.map((e) => {
    const bases = (e.debugBasePresetKeys ?? []).filter((k) => {
      if (k in presets) return true;
      console.warn(`[debug] base preset not in pack (skipped): "${k}"`);
      return false;
    });
    return [...bases, e.mapKeySorted];
  });
}

type PanelHandle = {
  canvas: HTMLCanvasElement;
  visualizer: ReturnType<typeof butterchurn.createVisualizer>;
  label: HTMLElement;
  currentKey: string;
  load: (key: string, blendTime?: number) => void;
};

const panels: PanelHandle[] = [];
(
  window as unknown as {
    setPanel: (idx: number, key: string, blendTime?: number) => void;
  }
).setPanel = (idx: number, key: string, blendTime = 0) => {
  const p = panels[idx];
  if (!p) {
    console.error(`No panel at index ${idx}`);
    return;
  }
  if (!(key in allPresets)) {
    console.error(`Unknown preset: "${key}"`);
    return;
  }
  p.load(key, blendTime);
};

const overlay = document.getElementById("overlay")!;
const gridEl = document.getElementById("grid")!;

let lowRes = false;

function panelCanvasSize(nPanels: number): { w: number; h: number } {
  const dpr = displayPixelRatio();
  const nw = window.innerWidth / nPanels;
  if (lowRes) {
    return {
      w: Math.max(1, Math.floor(nw * 0.5)),
      h: Math.max(1, Math.floor(window.innerHeight * 0.5)),
    };
  }
  return {
    w: Math.max(1, Math.floor(nw * dpr)),
    h: Math.max(1, Math.floor(window.innerHeight * dpr)),
  };
}

overlay.addEventListener("click", () => {
  start().catch((err) => {
    overlay.innerHTML = `<div style="color:red">Error: ${err.message}</div>`;
  });
});

async function start() {
  overlay.remove();

  const audioInputLabel = document.createElement("div");
  audioInputLabel.style.cssText = `
    position: fixed; bottom: 10px; right: 12px;
    color: rgba(255,255,255,0.5); font-size: 11px; font-family: monospace;
    pointer-events: none; z-index: 15;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9);
  `;
  document.body.appendChild(audioInputLabel);

  const rig = await createAudioAnalyserRig({
    logPrefix: "[debug][audio]",
    onInputKindChange: (kind) => {
      audioInputLabel.textContent = formatAudioInputLabel(kind, "compact");
    },
  });

  const moldContainer = document.createElement("div");
  moldContainer.style.cssText =
    "position:fixed; inset:0; display:none; z-index: 2;";
  document.body.appendChild(moldContainer);

  type Mode = "butterchurn" | "mold";
  let mode: Mode = "butterchurn";
  let combinedMode = false;
  let ghostMode = false;
  let freezeMode = false;
  let labelsVisible = true;
  let moldInstance: ReturnType<typeof createMoldSketch> | null = null;

  function initMold() {
    moldInstance = createMoldSketch(
      moldContainer,
      () => freezeMode,
      () => rig.getLevel(),
    );
  }

  function updateVisibility() {
    const moldVisible = combinedMode || mode === "mold";
    if (combinedMode) {
      gridEl.style.display = "flex";
      moldContainer.style.display = "block";
      moldContainer.style.mixBlendMode = "screen";
      moldContainer.style.pointerEvents = "none";
      if (!moldInstance) initMold();
    } else {
      gridEl.style.display = mode === "butterchurn" ? "flex" : "none";
      moldContainer.style.display = mode === "mold" ? "block" : "none";
      moldContainer.style.mixBlendMode = "";
      moldContainer.style.pointerEvents = "";
      if (mode === "mold" && !moldInstance) initMold();
    }
    if (moldInstance) moldVisible ? moldInstance.loop() : moldInstance.noLoop();
  }

  function switchMode() {
    mode = mode === "butterchurn" ? "mold" : "butterchurn";
    if (mode === "mold" && !moldInstance) initMold();
    updateVisibility();
    console.log("[debug][mode]", mode);
  }

  const debugScenes = buildDebugPresetScenes(allPresets);
  let debugSceneIdx = 0;
  const maxPanels = Math.max(1, ...debugScenes.map((s) => s.length));

  function syncDebugAnalyserGain() {
    const keys = debugScenes[debugSceneIdx]!;
    const anyCustom = keys.some((k) => getCustomPresetEntry(k));
    rig.setAnalyserInputGain(anyCustom ? 1 : VIZ_AUDIO_GAIN[vizIntensity]);
  }

  function applyDebugScene(blendTime: number) {
    const keys = debugScenes[debugSceneIdx]!;
    for (let i = 0; i < panels.length; i++) {
      const wrap = panels[i]!.canvas.parentElement as HTMLElement;
      if (i < keys.length) {
        wrap.style.display = "";
        panels[i]!.load(keys[i]!, blendTime);
      } else {
        wrap.style.display = "none";
      }
    }
    syncDebugAnalyserGain();
    const reg = CUSTOM_PRESET_REGISTRY[debugSceneIdx];
    console.log(
      `[debug] scene ${debugSceneIdx + 1}/${debugScenes.length} · custom: ${reg?.canonicalId ?? "?"}`,
    );
  }

  function nextDebugScene() {
    debugSceneIdx = (debugSceneIdx + 1) % debugScenes.length;
    resizeAllPanels();
    applyDebugScene(1.2);
  }

  function prevDebugScene() {
    debugSceneIdx =
      (debugSceneIdx - 1 + debugScenes.length) % debugScenes.length;
    resizeAllPanels();
    applyDebugScene(1.2);
  }

  function resizeAllPanels() {
    const n = Math.max(1, debugScenes[debugSceneIdx]!.length);
    const { w, h } = panelCanvasSize(n);
    const q = butterchurnQualityOpts(lowRes);
    for (const handle of panels) {
      handle.canvas.width = w;
      handle.canvas.height = h;
      handle.visualizer.setRendererSize(w, h, {
        pixelRatio: q.pixelRatio,
        textureRatio: q.textureRatio,
      });
    }
  }

  function reloadAllPanels(blendTime: number) {
    const keys = debugScenes[debugSceneIdx]!;
    for (let i = 0; i < keys.length; i++) {
      const handle = panels[i]!;
      const key = keys[i]!;
      const entry = getCustomPresetEntry(key);
      if (entry) allPresets[key] = entry.build(vizIntensity);
      const preset = allPresets[key];
      handle.visualizer.loadPreset(
        clonePresetGraphForButterchurn(
          applyGhostFreeze(preset, ghostMode, freezeMode),
        ),
        blendTime,
      );
    }
  }

  const wInit = panelCanvasSize(debugScenes[0]!.length);
  const qInit = butterchurnQualityOpts(lowRes);

  for (let pi = 0; pi < maxPanels; pi++) {
    const panel = document.createElement("div");
    panel.className = "panel";

    const canvas = document.createElement("canvas");
    canvas.width = wInit.w;
    canvas.height = wInit.h;
    panel.appendChild(canvas);

    const label = document.createElement("div");
    label.className = "panel-label";
    label.textContent = "";
    panel.appendChild(label);

    gridEl.appendChild(panel);

    const viz = butterchurn.createVisualizer(rig.audioCtx, canvas, {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: qInit.pixelRatio,
      textureRatio: qInit.textureRatio,
    });
    viz.connectAudio(rig.analyser);

    const handle: PanelHandle = {
      canvas,
      visualizer: viz,
      label,
      currentKey: "",
      load(key: string, blendTime = 0) {
        const entry = getCustomPresetEntry(key);
        if (entry) allPresets[key] = entry.build(vizIntensity);
        const preset = allPresets[key];
        if (!preset) {
          console.error(`Preset not found: ${key}`);
          return;
        }
        this.visualizer.loadPreset(
          clonePresetGraphForButterchurn(
            applyGhostFreeze(preset, ghostMode, freezeMode),
          ),
          blendTime,
        );
        this.label.textContent = entry
          ? `${key.trim()} · ${vizIntensity}`
          : key;
        this.currentKey = key;
        syncDebugAnalyserGain();
        console.log(`[debug] panel ${panels.indexOf(this)} → "${key}"`);
      },
    };

    panels.push(handle);
  }

  applyDebugScene(0);

  const winDbg = window as unknown as {
    setDebugScene: (i: number, blendTime?: number) => void;
    nextDebugScene: () => void;
    prevDebugScene: () => void;
    debugPresetScenes: () => string[][];
  };
  winDbg.setDebugScene = (i, blendTime = 1.2) => {
    if (i < 0 || i >= debugScenes.length) {
      console.error(`[debug] setDebugScene: index ${i} out of range`);
      return;
    }
    debugSceneIdx = i;
    resizeAllPanels();
    applyDebugScene(blendTime);
  };
  winDbg.nextDebugScene = nextDebugScene;
  winDbg.prevDebugScene = prevDebugScene;
  winDbg.debugPresetScenes = () => debugScenes.map((row) => [...row]);

  const optionsHud = createOptionsSummaryHud("Movement · debug", () => {
    const display = combinedMode
      ? "combined (grid + mold)"
      : mode === "butterchurn"
        ? "grid"
        : "mold";
    const opGrid = parseFloat(gridEl.style.opacity || "1").toFixed(1);
    const opMold = parseFloat(moldContainer.style.opacity || "1").toFixed(1);
    const sceneKeys = debugScenes[debugSceneIdx]!;
    const panelPairs = sceneKeys.map((k, i) => ({
      label: `Panel ${i}`,
      value: getCustomPresetEntry(k) ? `${k.trim()} · ${vizIntensity}` : k,
    }));
    const rows = buildRows([
      { label: "Display", value: display },
      {
        label: "Compare scene",
        value: `${debugSceneIdx + 1}/${debugScenes.length} · ${CUSTOM_PRESET_REGISTRY[debugSceneIdx]!.canonicalId} · N/B`,
      },
      ...panelPairs,
      {
        label: "Audio in",
        value: rig.getInputKind() === "mic" ? "microphone" : "computer capture",
      },
      { label: "Ghost", value: ghostMode ? "on" : "off" },
      { label: "Freeze", value: freezeMode ? "on" : "off" },
      { label: "Low-res (Q)", value: lowRes ? "on" : "off" },
      {
        label: "Panel labels (I)",
        value: labelsVisible ? "visible" : "hidden",
      },
      {
        label: "Intensity (Y)",
        value: sceneKeys.some((k) => getCustomPresetEntry(k))
          ? `${vizIntensity} (unity gain while scene includes a custom preset)`
          : `${vizIntensity} (${VIZ_AUDIO_GAIN[vizIntensity].toFixed(2)}× audio)`,
      },
      { label: "Opacity grid / mold", value: `${opGrid} / ${opMold}` },
    ]);
    const hint =
      "<div style='margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);opacity:.48;font-size:10px;line-height:1.45'>" +
      "A audio · M mode · C combined · I labels · O HUD · Q quality · Y intensity · G/F · [ ] . , opacity · N/B compare scene (PgUp/PgDn too) · window.setDebugScene(i) · window.setPanel(i,key)" +
      "</div>";
    return rows + hint;
  });

  window.addEventListener("resize", () => {
    resizeAllPanels();
  });

  window.addEventListener("keydown", (e) => {
    if (
      handleSharedMovementKeys(e, {
        toggleAudioInput: () => rig.toggleInput(),
        switchMode,
        toggleCombinedMode: () => {
          combinedMode = !combinedMode;
          updateVisibility();
          console.log("[debug][mode] combined:", combinedMode ? "on" : "off");
        },
        toggleLabels: () => {
          labelsVisible = !labelsVisible;
          for (const p of panels) {
            p.label.style.display = labelsVisible ? "" : "none";
          }
        },
        butterchurnOpacityEl: gridEl,
        moldOpacityEl: moldContainer,
        toggleGhost: () => {
          ghostMode = !ghostMode;
          if (ghostMode) freezeMode = false;
          reloadAllPanels(0);
          console.log("[debug][mode] ghost:", ghostMode ? "on" : "off");
        },
        toggleFreeze: () => {
          freezeMode = !freezeMode;
          if (freezeMode) ghostMode = false;
          reloadAllPanels(0);
          console.log("[debug][mode] freeze:", freezeMode ? "on" : "off");
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
      const sk = debugScenes[debugSceneIdx]!;
      for (let i = 0; i < sk.length; i++) {
        panels[i]!.load(sk[i]!, 1.2);
      }
      syncDebugAnalyserGain();
      console.log("[debug] viz intensity:", vizIntensity);
      return;
    }
    if (mode === "butterchurn" || combinedMode) {
      if (e.key === "n" || e.key === "PageDown") {
        e.preventDefault();
        nextDebugScene();
        return;
      }
      if (e.key === "b" || e.key === "PageUp") {
        e.preventDefault();
        prevDebugScene();
        return;
      }
    }
    if (e.key === "q") {
      lowRes = !lowRes;
      resizeAllPanels();
      console.log("[debug] low-res:", lowRes ? "on" : "off");
    }
  });

  updateVisibility();

  function render() {
    requestAnimationFrame(render);
    if (mode === "butterchurn" || combinedMode) {
      for (const { visualizer, canvas } of panels) {
        if ((canvas.parentElement as HTMLElement).style.display === "none") {
          continue;
        }
        visualizer.render();
      }
    }
  }
  requestAnimationFrame(render);

  console.log("%c[debug] ready", "color: #7cf");
  console.log(
    "  a / m / c / i / o / y / n b / ] [ / . , / g / f / q / PgUp PgDn  → n/b (or PgUp/PgDn) = compare scene; y = intensity; o = options",
  );
  console.log("  window.presets            → array of all preset keys");
  console.log("  window.debugPresetScenes()→ copy of [bases…, custom] rows");
  console.log("  window.setDebugScene(i)   → jump to scene i (0-based)");
  console.log("  window.nextDebugScene()   / window.prevDebugScene()");
  console.log(
    "  window.setPanel(i, key)   → override one panel in current scene",
  );
}
