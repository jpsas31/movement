import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";
import mandelverseJson from "./json/Fumbling_Foo + En D & Martin - Mandelverse.butterchurn.json";
import royalJson from "butterchurn-presets/presets/converted/$$$ Royal - Mashup (220).json";
import { clonePresetData } from "./utils";

// royal-mashup-mandel-bright — royal-mashup-mandel with even less black.
//
// Visual: same as royal-mashup-mandel but pushed further toward maximum brightness.
// Dark areas are lifted more aggressively before tinting, resulting in almost no
// black pixels — the fractal structure appears as saturated color gradients.
//
// Changes from royal-mashup-mandel:
//  - Higher black floor (0.06 instead of 0.03) in the comp injection.
//  - Higher tint clamp (2.5 instead of 2.0).
//  - Brighter initial color registers (q=0.9 instead of 0.85).
//
// Lineage: Mandelverse warp/comp/frame + Royal Mashup (220) waves + custom frame equations.
// Intensity (Y): wave color pulse depth and color register smoothing scale via TIERS.

export const ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY_SORTED = "  royal-mashup-mandel-bright";
export const ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY = "royal-mashup-mandel-bright";

export function isRoyalMashupMandelBrightPresetKey(mapKey: string): boolean {
  return mapKey.trim() === ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY;
}

type WaveSlot = {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  point_eqs_str?: string;
};

type PresetShape = {
  baseVals: Record<string, number>;
  shapes: { baseVals: Record<string, number> }[];
  waves: WaveSlot[];
  init_eqs_str: string;
  frame_eqs_str: string;
  pixel_eqs_str: string;
  warp: string;
  comp: string;
};

/** Mandelverse comp ends with this; we multiply ret by a brighter tint. */
const MANDELVERSE_COMP_RET_ANCHOR = "ret = tmpvar_32.xyz;\n }";

/** Royal 220 base values (colors, wave params, etc.). */
const ROYAL_COLOR_BASE_OVERLAY: Record<string, number> = {
  gammaadj: 1.07,
  brighten: 1,
  darken: 1,
  additivewave: 1,
  modwavealphabyvolume: 1,
  wave_brighten: 0,
  wrap: 0,
  modwavealphastart: 0.71,
  modwavealphaend: 1.3,
  wave_scale: 1.286,
  wave_smoothing: 0.63,
  wave_r: 0.65,
  wave_g: 0.65,
  wave_b: 0.65,
  ob_r: 0.01,
  wave_a: 4.1,
};

type Tier = {
  /** Bass channel pulse depth on the wave overlay (red). */
  waveR: number;
  /** Bass channel pulse depth on the wave overlay (blue). */
  waveB: number;
  /** Mid channel pulse depth on the wave overlay (green). */
  waveG: number;
  /** Decay weight for color registers q9/q17/q29 — higher = slower color shift. */
  qColA: number;
  /** Fresh-value weight for color registers — higher = faster color response. */
  qColB: number;
};

const TIERS: Record<VizIntensity, Tier> = {
  mild: {
    waveR: 0.22,
    waveB: 0.22,
    waveG: 0.38,
    qColA: 0.92,
    qColB: 0.08,
  },
  normal: {
    waveR: 0.33,
    waveB: 0.33,
    waveG: 0.55,
    qColA: 0.88,
    qColB: 0.12,
  },
  hot: {
    waveR: 0.45,
    waveB: 0.45,
    waveG: 0.70,
    qColA: 0.84,
    qColB: 0.16,
  },
};

export function createRoyalMashupMandelBright(aggression: VizIntensity): PresetWithBase {
  const p = clonePresetData(mandelverseJson) as unknown as PresetShape;
  const royal = clonePresetData(royalJson) as unknown as PresetShape;
  const t = TIERS[aggression];

  // Apply Royal's color/brightness base values.
  Object.assign(p.baseVals, ROYAL_COLOR_BASE_OVERLAY);

  // Copy Royal's waveform displays (waves 0–2).
  p.waves[0] = clonePresetData(royal.waves[0]);
  p.waves[1] = clonePresetData(royal.waves[1]);
  p.waves[2] = clonePresetData(royal.waves[2]);

  // Disable all shapes to remove any border/overlay shapes.
  for (const s of p.shapes) {
    s.baseVals = { ...s.baseVals, enabled: 0 };
  }

  // Inject brighter tint + higher black floor.
  if (!p.comp.includes(MANDELVERSE_COMP_RET_ANCHOR)) {
    throw new Error(
      "royal-mashup-mandel-bright: Mandelverse comp no longer matches expected injection point",
    );
  }
  p.comp = p.comp.replace(
    MANDELVERSE_COMP_RET_ANCHOR,
    [
      "  // Even less black: lift dark areas before tinting",
      "  tmpvar_32.xyz = max(tmpvar_32.xyz, vec3(0.06));",
      "  vec3 royTint = min(vec3(2.5), (vec3(q9, q17, q29) * vec3(1.11, 1.08, 1.14)) + vec3(0.04, 0.05, 0.055));",
      "  ret = (tmpvar_32.xyz * royTint);",
      " }",
    ].join("\n"),
  );

  const wr = t.waveR.toFixed(2);
  const wb = t.waveB.toFixed(2);
  const wg = t.waveG.toFixed(2);
  const qca = t.qColA.toFixed(2);
  const qcb = t.qColB.toFixed(2);

  // Volume: combined RMS drives wave overlay color pulses on transients.
  const VOLUME_EQS = [
    "a.vol=.25*(a.bass+a.mid+a.treb);a.vol*=a.vol;",
    `a.wave_r+=${wr}*Math.sin(42*a.vol);`,
    `a.wave_b+=${wb}*Math.sin(17*a.vol);`,
    `a.wave_g+=${wg}*Math.sin(30*a.vol);`,
  ].join("");

  // Color oscillators: slow-drifting RGB channels (wr/wb/wg) feed q9/q17/q29,
  // which the injected comp tint uses to drive the audio-reactive color bloom.
  // Clamp is 1.5 for brighter sustained output.
  const COLOR_OSCILLATOR_EQS = [
    "a.wr=.5+.42*(.6*Math.sin(1.1*a.time)+.4*Math.sin(.8*a.time));",
    "a.wb=.5+.42*(.6*Math.sin(1.6*a.time)+.4*Math.sin(.5*a.time));",
    "a.wg=.5+.42*(.6*Math.sin(1.34*a.time)+.4*Math.sin(.4*a.time));",
    `a.q9=${qca}*a.q9+${qcb}*a.wr;`,
    `a.q17=${qca}*a.q17+${qcb}*a.wb;`,
    `a.q29=${qca}*a.q29+${qcb}*a.wg;`,
    "a.q9=Math.min(1.5,a.q9*1.12+0.05);",
    "a.q17=Math.min(1.5,a.q17*1.12+0.05);",
    "a.q29=Math.min(1.5,a.q29*1.12+0.05);",
  ].join("");

  p.frame_eqs_str += VOLUME_EQS + COLOR_OSCILLATOR_EQS;

  // Init: higher starting color registers.
  p.init_eqs_str += ";a.q9=0.9;a.q17=0.9;a.q29=0.9;a.wr=0.5;a.wb=0.5;a.wg=0.5;";

  return { ...p, version: 2 };
}

// Default export uses 'normal' tier.
export default createRoyalMashupMandelBright("normal");
