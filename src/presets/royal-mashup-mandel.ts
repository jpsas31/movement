import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";
import mandelverseJson from "./json/Fumbling_Foo + En D & Martin - Mandelverse.butterchurn.json";
import royalJson from "butterchurn-presets/presets/converted/$$$ Royal - Mashup (220).json";
import { clonePresetData } from "./utils";

// royal-mashup-mandel — Mandelverse motion + Royal Mashup (220) colors, no shapes.
//
// Visual: same fractal tunnel as royal-star-forge but with shapes disabled and a
// brighter comp tint (clamp 2.0 vs 1.22, higher initial q registers). Results in
// more saturated colors and less black in the output.
//
// Differences from royal-star-forge:
//  - All shapes disabled (no thick border overlay).
//  - black floor lift (max 0.03) before tinting to reduce dark areas.
//  - Higher tint clamp (2.0) and stronger initial color registers (q=0.85).
//  - Stronger audio-reactive color boost (tier amplitudes increased).
//
// Lineage: Mandelverse warp/comp/frame + Royal Mashup (220) waves + custom frame equations.
// Intensity (Y): wave color pulse depth and color register smoothing scale via TIERS.

export const ROYAL_MASHUP_MANDEL_PRESET_KEY_SORTED = "  royal-mashup-mandel";
export const ROYAL_MASHUP_MANDEL_PRESET_KEY = "royal-mashup-mandel";

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

/**
 * Shared factory for royal-mashup variants. The three params that differ between
 * royal-mashup-mandel and royal-mashup-mandel-bright are passed explicitly.
 */
export function buildRoyalMashupBase(
  aggression: VizIntensity,
  blackFloor: number,
  tintClamp: number,
  initQ: number,
  presetName: string,
): PresetWithBase {
  const p = clonePresetData(mandelverseJson) as unknown as PresetShape;
  const royal = clonePresetData(royalJson) as unknown as PresetShape;
  const t = TIERS[aggression];

  Object.assign(p.baseVals, ROYAL_COLOR_BASE_OVERLAY);

  p.waves[0] = clonePresetData(royal.waves[0]);
  p.waves[1] = clonePresetData(royal.waves[1]);
  p.waves[2] = clonePresetData(royal.waves[2]);

  for (const s of p.shapes) {
    s.baseVals = { ...s.baseVals, enabled: 0 };
  }

  if (!p.comp.includes(MANDELVERSE_COMP_RET_ANCHOR)) {
    throw new Error(`${presetName}: Mandelverse comp no longer matches expected injection point`);
  }
  p.comp = p.comp.replace(
    MANDELVERSE_COMP_RET_ANCHOR,
    [
      `  tmpvar_32.xyz = max(tmpvar_32.xyz, vec3(${blackFloor}));`,
      `  vec3 royTint = min(vec3(${tintClamp}), (vec3(q9, q17, q29) * vec3(1.11, 1.08, 1.14)) + vec3(0.04, 0.05, 0.055));`,
      "  ret = (tmpvar_32.xyz * royTint);",
      " }",
    ].join("\n"),
  );

  const wr = t.waveR.toFixed(2);
  const wb = t.waveB.toFixed(2);
  const wg = t.waveG.toFixed(2);
  const qca = t.qColA.toFixed(2);
  const qcb = t.qColB.toFixed(2);

  const VOLUME_EQS = [
    "a.vol=.25*(a.bass+a.mid+a.treb);a.vol*=a.vol;",
    `a.wave_r+=${wr}*Math.sin(42*a.vol);`,
    `a.wave_b+=${wb}*Math.sin(17*a.vol);`,
    `a.wave_g+=${wg}*Math.sin(30*a.vol);`,
  ].join("");

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
  p.init_eqs_str += `;a.q9=${initQ};a.q17=${initQ};a.q29=${initQ};a.wr=0.5;a.wb=0.5;a.wg=0.5;`;

  return { ...p, version: 2 };
}

export function createRoyalMashupMandel(aggression: VizIntensity): PresetWithBase {
  return buildRoyalMashupBase(aggression, 0.03, 2.0, 0.85, ROYAL_MASHUP_MANDEL_PRESET_KEY);
}
