/**
 * "Zylot - True Visionary (Final Mix)" — slowed variant.
 *
 * Original pixel_eqs:
 *   a.zoom += .03 * a.bass_att*a.bass_att * a.rad;
 *   a.rot  += a.rad * bitand(-2.5, 5*Math.cos(a.time)) * .01;
 *
 * Slowdowns applied:
 *   1. Time-driver `Math.cos(a.time)` → `Math.cos(0.25*a.time)` (4× slower
 *      rotation cycle).
 *   2. Rotation magnitude `.01` → `.004` (×0.4) — less rot per frame.
 *   3. Bass-zoom magnitude `.03` → `.012` (×0.4) — gentler audio kick.
 */
import type { PresetWithBase } from "../preset-variants";
import zylotJson from "./json/zylot-true-visionary.butterchurn.json";
import { scaleTimeCoeff } from "./preset-slowdown";

export const ZYLOT_TRUE_VISIONARY_SLOW_PRESET_KEY = "Zylot - True Visionary (slow)";
export const ZYLOT_TRUE_VISIONARY_SLOW_PRESET_KEY_SORTED = "  " + ZYLOT_TRUE_VISIONARY_SLOW_PRESET_KEY;

const TIME_FACTOR     = 0.25;
const ROT_FACTOR      = 0.4;
const BASS_ZOOM_FACTOR = 0.4;

export const zylotTrueVisionarySlowPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(zylotJson)) as PresetWithBase & {
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
  };
  if (src.frame_eqs_str) src.frame_eqs_str = scaleTimeCoeff(src.frame_eqs_str, TIME_FACTOR);
  if (src.pixel_eqs_str) {
    let p = scaleTimeCoeff(src.pixel_eqs_str, TIME_FACTOR);
    // Magnitude knobs — reduce per-frame rotation and bass-zoom kicks.
    p = p
      .replace(/\)\*\.01;/g,                       `)*${(0.01 * ROT_FACTOR).toFixed(4)};`)
      .replace(/a\.zoom\+=\.03\*/g,                `a.zoom+=${(0.03 * BASS_ZOOM_FACTOR).toFixed(4)}*`);
    src.pixel_eqs_str = p;
  }
  return src as PresetWithBase;
})();
