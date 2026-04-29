/**
 * "Flexi - mindblob [shiny mix]" — slowed variant.
 *
 * Source: butterchurn-presets pkg, snapshotted via
 *   `node scripts/build-stock-preset-snapshot.mjs`
 *
 * Speed in mindblob comes from a spring-physics rig (the bouncy blob), NOT
 * time-driven trig. The dominant knobs are `a.dt=.0003` (sim time-step) and
 * `a.spring=18` (spring stiffness). Cutting both by 0.7 slows the blob's
 * motion + bounce frequency by ~30% without changing its character.
 *
 * Also reduces the bass/treb input gains driving xx1/xx2/yy1 so audio kicks
 * are more subtle.
 */
import type { PresetWithBase } from "../preset-variants";
import flexiJson from "./json/flexi-mindblob.butterchurn.json";

export const FLEXI_MINDBLOB_SLOW_PRESET_KEY = "Flexi - mindblob [shiny mix] (slow)";
export const FLEXI_MINDBLOB_SLOW_PRESET_KEY_SORTED = "  " + FLEXI_MINDBLOB_SLOW_PRESET_KEY;

const SPEED_FACTOR = 0.7;

export const flexiMindblobSlowPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(flexiJson)) as PresetWithBase & {
    frame_eqs_str?: string;
  };

  if (src.frame_eqs_str) {
    src.frame_eqs_str = src.frame_eqs_str
      // Spring physics — slow the integration step + soften stiffness.
      .replace(/a\.dt=\.0003/g, `a.dt=${(0.0003 * SPEED_FACTOR).toFixed(6)}`)
      .replace(/a\.spring=18/g, `a.spring=${(18 * SPEED_FACTOR).toFixed(2)}`)
      // Audio drives — gentler kick into xx1/xx2/yy1.
      .replace(/\.01\*a\.bass\b/g,  `${(0.01 * SPEED_FACTOR).toFixed(5)}*a.bass`)
      .replace(/\.01\*a\.treb\b/g,  `${(0.01 * SPEED_FACTOR).toFixed(5)}*a.treb`)
      .replace(/\.0075\*\(a\.treb\+a\.bass\)/g,
               `${(0.0075 * SPEED_FACTOR).toFixed(5)}*(a.treb+a.bass)`);
  }

  return src as PresetWithBase;
})();
