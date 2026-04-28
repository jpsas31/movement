// royal-pink-forge — royal-star-forge variant: green register → dark pink,
// blue register → light pink. Mandelverse motion + Royal Mashup (220) waves
// stay identical; only the comp-stage color tint and wave overlay color
// targeting are remapped to a pink palette.
//
// Lineage: src/presets/royal-star-forge.ts (see for full notes on Mandelverse
// + Royal Mashup donor structure and q9/q17/q29 register routing).
// Color mapping:
//   q9  → red oscillator (kept)
//   q17 → dark pink   (#C71585 ≈ vec3(0.78, 0.08, 0.52)) — replaces green
//   q29 → light pink  (#FFB6C1 ≈ vec3(1.00, 0.71, 0.76)) — replaces blue

import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";
import mandelverseJson from "./json/Fumbling_Foo + En D & Martin - Mandelverse.butterchurn.json";
import royalJson from "butterchurn-presets/presets/converted/$$$ Royal - Mashup (220).json";
import { clonePresetData } from "./utils";

export const ROYAL_PINK_FORGE_PRESET_KEY_SORTED = "  royal-pink-forge";
export const ROYAL_PINK_FORGE_PRESET_KEY = "royal-pink-forge";

type WaveSlot = {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  point_eqs_str?: string;
};

type ShapeSlot = {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
};

type PresetShape = {
  baseVals: Record<string, number>;
  shapes: ShapeSlot[];
  waves: WaveSlot[];
  init_eqs_str: string;
  frame_eqs_str: string;
  pixel_eqs_str: string;
  warp: string;
  comp: string;
};

const MANDELVERSE_COMP_RET_ANCHOR = "ret = tmpvar_32.xyz;\n }";

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
  wave_r: 0.78,
  wave_g: 0.08,
  wave_b: 0.52,
  ob_r: 0.78,
  ob_g: 0.08,
  ob_b: 0.52,
};

/**
 * Mandelverse ships 4 enabled shapes whose `g`/`b` baseVals (and Milkdrop's
 * default-to-1 fallback for unset channels) paint cyan/green/blue overlays
 * on top of the comp output — comp-stage tinting cannot touch them. Force
 * each shape's color baseVals onto the pink palette: cyan/light shapes →
 * light pink, green/dark shapes → dark pink.
 */
const SHAPE_PINK_TARGET: ReadonlyArray<{ palette: "dark" | "light" }> = [
  { palette: "light" }, // shape 0 — was textured cyan-white
  { palette: "dark" },  // shape 1 — was solid green
  { palette: "dark" },  // shape 2 — was default green
  { palette: "light" }, // shape 3 — was blue
];

type Tier = {
  /** Red-channel pulse depth on wave overlay (driven by q9). */
  waveR: number;
  /** Light-pink pulse depth on wave overlay (driven by q29). */
  waveLightPink: number;
  /** Dark-pink pulse depth on wave overlay (driven by q17). */
  waveDarkPink: number;
  /** Decay weight for color registers q9/q17/q29 — higher = slower color shift. */
  qColA: number;
  /** Fresh-value weight for color registers — higher = faster color response. */
  qColB: number;
};

const TIERS: Record<VizIntensity, Tier> = {
  mild: {
    waveR: 0.16,
    waveLightPink: 0.16,
    waveDarkPink: 0.28,
    qColA: 0.86,
    qColB: 0.14,
  },
  normal: {
    waveR: 0.24,
    waveLightPink: 0.24,
    waveDarkPink: 0.4,
    qColA: 0.8,
    qColB: 0.2,
  },
  hot: {
    waveR: 0.33,
    waveLightPink: 0.33,
    waveDarkPink: 0.52,
    qColA: 0.74,
    qColB: 0.26,
  },
};

// Pink palette (RGB 0..1).
const DARK_PINK_R = 0.78;
const DARK_PINK_G = 0.08;
const DARK_PINK_B = 0.52;
const LIGHT_PINK_R = 1.0;
const LIGHT_PINK_G = 0.71;
const LIGHT_PINK_B = 0.76;

export function createRoyalPinkForge(aggression: VizIntensity): PresetWithBase {
  const p = clonePresetData(mandelverseJson) as unknown as PresetShape;
  const royal = clonePresetData(royalJson) as unknown as PresetShape;
  const t = TIERS[aggression];

  Object.assign(p.baseVals, ROYAL_COLOR_BASE_OVERLAY);

  // Repaint Mandelverse shapes to pink palette (Milkdrop fills unset channels
  // with 1.0, so we set every channel explicitly to suppress green/blue leak).
  for (let i = 0; i < p.shapes.length && i < SHAPE_PINK_TARGET.length; i++) {
    const target = SHAPE_PINK_TARGET[i];
    const r = target.palette === "dark" ? DARK_PINK_R : LIGHT_PINK_R;
    const g = target.palette === "dark" ? DARK_PINK_G : LIGHT_PINK_G;
    const b = target.palette === "dark" ? DARK_PINK_B : LIGHT_PINK_B;
    Object.assign(p.shapes[i].baseVals, {
      r, g, b,
      r2: r, g2: g, b2: b,
    });
  }

  p.waves[0] = clonePresetData(royal.waves[0]);
  p.waves[1] = clonePresetData(royal.waves[1]);
  p.waves[2] = clonePresetData(royal.waves[2]);

  // Royal wave point_eqs hardcode `a.g = 1 + sin(...)` per slot — that is the
  // dominant green source. Append palette overrides so last-write-wins maps
  // each wave onto pink: bass/mid waves → dark pink, treb wave → light pink.
  const darkPinkPaint =
    `;a.r=${DARK_PINK_R}*(1+Math.sin(a.sp));` +
    `a.g=${DARK_PINK_G}*(1+Math.sin(a.sp));` +
    `a.b=${DARK_PINK_B}*(1+Math.sin(a.sp));`;
  const lightPinkPaint =
    `;a.r=${LIGHT_PINK_R}*(1+Math.sin(a.sp));` +
    `a.g=${LIGHT_PINK_G}*(1+Math.sin(a.sp));` +
    `a.b=${LIGHT_PINK_B}*(1+Math.sin(a.sp));`;
  p.waves[0].point_eqs_str = (p.waves[0].point_eqs_str ?? "") + darkPinkPaint;
  p.waves[1].point_eqs_str = (p.waves[1].point_eqs_str ?? "") + darkPinkPaint;
  p.waves[2].point_eqs_str = (p.waves[2].point_eqs_str ?? "") + lightPinkPaint;

  if (!p.comp.includes(MANDELVERSE_COMP_RET_ANCHOR)) {
    throw new Error(
      "royal-pink-forge: Mandelverse comp no longer matches expected injection point",
    );
  }
  // Force every comp output pixel onto the pink palette: take source luma,
  // pick a dark/light-pink mix from q9/q17/q29, multiply. This is hue-
  // replacement, not tinting — eliminates green/red feedback leaks the
  // multiplicative path could not suppress, and keeps fractal detail via luma.
  p.comp = p.comp.replace(
    MANDELVERSE_COMP_RET_ANCHOR,
    [
      "  vec3 darkPink = vec3(0.78, 0.08, 0.52);",
      "  vec3 lightPink = vec3(1.00, 0.71, 0.76);",
      "  vec3 src = tmpvar_32.xyz;",
      "  float lum = dot(src, vec3(0.299, 0.587, 0.114));",
      "  float mixT = clamp(q29 * 0.85 + (1.0 - q17) * 0.25, 0.0, 1.0);",
      "  vec3 pinkMix = mix(darkPink, lightPink, mixT);",
      "  vec3 deepRed = vec3(0.95, 0.05, 0.08);",
      "  float gain = 1.7 + 0.6 * q9;",
      "  float bright = clamp(lum * gain + 0.05, 0.0, 1.0);",
      "  float desat = pow(bright, 1.4);",
      "  vec3 lit = mix(pinkMix * bright, vec3(bright), desat);",
      "  float redMix = pow(1.0 - bright, 3.0) * (1.0 - desat);",
      "  lit += deepRed * redMix * (0.28 + 0.15 * q17);",
      "  ret = min(vec3(1.0), lit);",
      " }",
    ].join("\n"),
  );

  const wr = t.waveR.toFixed(2);
  const wlp = t.waveLightPink.toFixed(2);
  const wdp = t.waveDarkPink.toFixed(2);
  const qca = t.qColA.toFixed(2);
  const qcb = t.qColB.toFixed(2);

  // Volume: combined RMS drives wave overlay color pulses on transients.
  // Pulses are routed through the dark-pink and light-pink palettes instead
  // of raw G / B channels.
  const VOLUME_EQS = [
    "a.vol=.25*(a.bass+a.mid+a.treb);a.vol*=a.vol;",
    `a.wave_r+=${wr}*Math.sin(42*a.vol)`,
    `+${wdp}*${DARK_PINK_R}*Math.sin(30*a.vol)`,
    `+${wlp}*${LIGHT_PINK_R}*Math.sin(17*a.vol);`,
    `a.wave_g+=${wdp}*${DARK_PINK_G}*Math.sin(30*a.vol)`,
    `+${wlp}*${LIGHT_PINK_G}*Math.sin(17*a.vol);`,
    `a.wave_b+=${wdp}*${DARK_PINK_B}*Math.sin(30*a.vol)`,
    `+${wlp}*${LIGHT_PINK_B}*Math.sin(17*a.vol);`,
  ].join("");

  // Color oscillators feed q9/q17/q29; the comp-stage tint maps them onto
  // red, dark pink, light pink respectively.
  const COLOR_OSCILLATOR_EQS = [
    "a.wr=.5+.42*(.6*Math.sin(1.1*a.time)+.4*Math.sin(.8*a.time));",
    "a.wb=.5+.42*(.6*Math.sin(1.6*a.time)+.4*Math.sin(.5*a.time));",
    "a.wg=.5+.42*(.6*Math.sin(1.34*a.time)+.4*Math.sin(.4*a.time));",
    `a.q9=${qca}*a.q9+${qcb}*a.wr;`,
    `a.q17=${qca}*a.q17+${qcb}*a.wg;`,
    `a.q29=${qca}*a.q29+${qcb}*a.wb;`,
    "a.q9=Math.min(1,a.q9*1.12+0.05);",
    "a.q17=Math.min(1,a.q17*1.12+0.05);",
    "a.q29=Math.min(1,a.q29*1.12+0.05);",
  ].join("");

  p.frame_eqs_str += VOLUME_EQS + COLOR_OSCILLATOR_EQS;

  p.init_eqs_str +=
    ";a.q9=0.5;a.q17=0.5;a.q29=0.5;a.wr=0.5;a.wb=0.5;a.wg=0.5;";

  return { ...p, version: 2 };
}
