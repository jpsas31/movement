/**
 * "Aderrasi - Potion of Spirits" — slowed-down warm-palette variant.
 *
 * Source: butterchurn-presets pkg, snapshotted to JSON via
 *   `node scripts/build-stock-preset-snapshot.mjs`
 *
 * Modifications vs upstream:
 *   1. Slow ~3.3× — every Math.sin(K*a.time) / Math.cos(K*a.time) in pixel_eqs
 *      has its time coefficient multiplied by 0.30. The reaction-to-bass
 *      threshold (`thresh`) keeps its original cadence so the visual still
 *      pumps with audio, just more languidly.
 *   2. Smaller per-beat motion — dx_r / dy_r / zoom kick coefficients cut to
 *      ~30%, so each beat displaces UV less.
 *   3. Warm 3-color palette (red / orange / yellow) cycling on a 35-second
 *      sin wave, replacing the original cyan/magenta/yellow rainbow.
 *   4. Audio drive — bass_att gently pumps zoom, treb_att brightens the
 *      wave alpha. Stock preset's audio reactivity flowed through pixel_eqs;
 *      we keep that AND add an extra envelope to make beats more visible.
 *   5. baseVals: warpanimspeed cut from 2.63 to 0.6, warpscale 3.21 to 1.4.
 */
import type { PresetWithBase } from "../preset-variants";
import potionJson from "./json/aderrasi-potion.butterchurn.json";
import { scaleTimeCoeff } from "./preset-slowdown";

export const ADERRASI_POTION_SLOW_PRESET_KEY = "Aderrasi - Potion of Spirits (slow warm)";
/** Leading spaces sort it next to other custom presets at the top of the list. */
export const ADERRASI_POTION_SLOW_PRESET_KEY_SORTED = "  " + ADERRASI_POTION_SLOW_PRESET_KEY;

const TIME_FACTOR   = 0.30;   // 3.3× slower temporal oscillation
const MOTION_FACTOR = 0.30;   // smaller per-beat displacement

/** Aderrasi-specific motion coefficients in pixel_eqs (verified by manual inspection). */
function scaleAderrasiMotion(src: string, factor: number): string {
  const replacements: Array<[RegExp, string]> = [
    [/a\.dx_r=\.05\*/g,        `a.dx_r=${(0.05 * factor).toFixed(4)}*`],
    [/a\.dy_r=\.056\*/g,       `a.dy_r=${(0.056 * factor).toFixed(4)}*`],
    [/a\.zoom-=\.0825\*/g,     `a.zoom-=${(0.0825 * factor).toFixed(4)}*`],
    [/a\.rot-=\.039375\*/g,    `a.rot-=${(0.039375 * factor).toFixed(5)}*`],
  ];
  let out = src;
  for (const [re, repl] of replacements) out = out.replace(re, repl);
  return out;
}

// Warm palette: red ↔ orange ↔ yellow, ~35 s full cycle, plus audio envelope.
// Runs AFTER stock frame_eqs so palette wins.
const FRAME_EQS_OVERRIDE = `
a.q1 = Math.sin(a.time*0.18);
a.wave_r = a.q1>0.33 ? 1.00 : (a.q1>-0.33 ? 0.95 : 0.55);
a.wave_g = a.q1>0.33 ? 0.20 : (a.q1>-0.33 ? 0.40 : 0.85);
a.wave_b = 0.05;
a.warp = 0.5;
a.wave_a = Math.min(1, 0.4 + 0.6*a.treb_att);
a.zoom = (a.zoom !== undefined ? a.zoom : 1) + 0.02*a.bass_att;
`;

export const aderrasiPotionSlowPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(potionJson)) as PresetWithBase & {
    init_eqs_str?: string;
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
  };

  const bv = src.baseVals as Record<string, number>;
  bv.warpanimspeed = 0.6;
  bv.warpscale     = 1.4;
  bv.decay         = 0.97;

  if (src.pixel_eqs_str) {
    src.pixel_eqs_str = scaleAderrasiMotion(
      scaleTimeCoeff(src.pixel_eqs_str, TIME_FACTOR),
      MOTION_FACTOR,
    );
  }

  src.frame_eqs_str = (src.frame_eqs_str ?? "") + "\n" + FRAME_EQS_OVERRIDE.trim() + "\n";

  return src as PresetWithBase;
})();
