import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";
import { buildRoyalMashupBase } from "./royal-mashup-mandel";

// royal-mashup-mandel-bright — royal-mashup-mandel with even less black.
//
// Changes from royal-mashup-mandel:
//  - Higher black floor (0.06 instead of 0.03) in the comp injection.
//  - Higher tint clamp (2.5 instead of 2.0).
//  - Brighter initial color registers (q=0.9 instead of 0.85).

export const ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY_SORTED = "  royal-mashup-mandel-bright";
export const ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY = "royal-mashup-mandel-bright";

export function createRoyalMashupMandelBright(aggression: VizIntensity): PresetWithBase {
  return buildRoyalMashupBase(aggression, 0.06, 2.5, 0.9, ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY);
}
