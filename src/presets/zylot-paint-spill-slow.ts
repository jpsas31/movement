/**
 * "Zylot - Paint Spill (Music Reactive Paint Mix)" — slowed variant.
 *
 * Speed perception in this preset comes from the color-cycling sin waves in
 * frame_eqs (`Math.sin(.333*a.time)` for R, `.555` for G, `.444` for B).
 * scaleTimeCoeff(0.6) makes those cycles 1.67× slower while keeping the
 * audio reactivity (bass_att / mid_att / treb_att) intact.
 */
import type { PresetWithBase } from "../preset-variants";
import zylotJson from "./json/zylot-paint-spill.butterchurn.json";
import { scaleTimeCoeff } from "./preset-slowdown";

export const ZYLOT_PAINT_SPILL_SLOW_PRESET_KEY = "Zylot - Paint Spill (slow)";
export const ZYLOT_PAINT_SPILL_SLOW_PRESET_KEY_SORTED = "  " + ZYLOT_PAINT_SPILL_SLOW_PRESET_KEY;

const TIME_FACTOR = 0.6;

export const zylotPaintSpillSlowPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(zylotJson)) as PresetWithBase & {
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
  };
  if (src.frame_eqs_str) src.frame_eqs_str = scaleTimeCoeff(src.frame_eqs_str, TIME_FACTOR);
  if (src.pixel_eqs_str) src.pixel_eqs_str = scaleTimeCoeff(src.pixel_eqs_str, TIME_FACTOR);
  return src as PresetWithBase;
})();
