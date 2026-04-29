/**
 * "Aderrasi - Potion of Spirits" — slowed-down warm-palette variant.
 *
 * Source: butterchurn-presets pkg, snapshotted to JSON via
 *   `node scripts/build-stock-preset-snapshot.mjs`
 *
 * Modifications vs upstream:
 *   1. Slow temporal oscillation — TIME_FACTOR=0.12 multiplies every
 *      Math.sin(K*a.time) / Math.cos(K*a.time) in pixel_eqs (~8× slower).
 *      The reaction-to-bass threshold keeps its original cadence so beats
 *      still trigger on time.
 *   2. Split motion factors:
 *        BEAT_MOTION_FACTOR=0.30 — strength of dx_r/dy_r kicks on bass beat.
 *        IDLE_FIELD_FACTOR=0.0   — kill stock always-on zoom/rot field. At
 *                                  silence, no pixel motion. Beats still
 *                                  fire via held dx_r/dy_r values.
 *   3. Warm 3-color palette (red / orange / yellow) cycling on a 35-second
 *      sin wave, replacing the original cyan/magenta/yellow rainbow.
 *   4. Audio drive uses RAW bass+mid+treb (not _att) — _att auto-levels
 *      to ~1.0 at silence, raw goes to 0. Single envelope `audioRaw` (0..1)
 *      gates everything:
 *        - wave_r/g/b color brightness (0.55..1.0)
 *        - warp / warpanimspeed / warpscale — silence freezes warp shader
 *        - wave_a (0.45..1.0), ob_a (0.20..0.90)
 *        - decay 0.97 (idle, faster fade) → 0.998 (loud, persist)
 *      Stock pixel_eqs bass-thresh reactivity preserved.
 *   5. baseVals: wave_brighten 0→1 (wave additively lights buffer).
 *      warpanimspeed/warpscale/decay set per-frame from audio, baseVals
 *      values are seed only.
 */
import type { PresetWithBase } from "../preset-variants";
import potionJson from "./json/aderrasi-potion.butterchurn.json";
import { scaleTimeCoeff } from "./preset-slowdown";

export const ADERRASI_POTION_SLOW_PRESET_KEY = "Aderrasi - Potion of Spirits (slow warm)";
/** Leading spaces sort it next to other custom presets at the top of the list. */
export const ADERRASI_POTION_SLOW_PRESET_KEY_SORTED = "  " + ADERRASI_POTION_SLOW_PRESET_KEY;

const TIME_FACTOR        = 0.12;   // ~8× slower temporal oscillation
const BEAT_MOTION_FACTOR = 0.60;   // dx_r/dy_r kick strength (gated by audioRaw at runtime)
const IDLE_FIELD_FACTOR  = 0.0;    // kill always-on zoom/rot field — silence = static

/** Aderrasi-specific motion coefficients in pixel_eqs (verified by manual inspection). */
function scaleAderrasiMotion(src: string, beat: number, idle: number): string {
  const replacements: Array<[RegExp, string]> = [
    [/a\.dx_r=\.05\*/g,        `a.dx_r=${(0.05 * beat).toFixed(4)}*`],
    [/a\.dy_r=\.056\*/g,       `a.dy_r=${(0.056 * beat).toFixed(4)}*`],
    [/a\.zoom-=\.0825\*/g,     `a.zoom-=${(0.0825 * idle).toFixed(4)}*`],
    [/a\.rot-=\.039375\*/g,    `a.rot-=${(0.039375 * idle).toFixed(5)}*`],
  ];
  let out = src;
  for (const [re, repl] of replacements) out = out.replace(re, repl);
  return out;
}

/**
 * Gate dx/dy accumulation by audioRaw so idle = no UV motion. The stock
 * pixel_eqs sets dx_r/dy_r on bass_att-based thresh which fires even at
 * silence (bass_att auto-levels to ~1.0). Without this gate, dx/dy keep
 * accumulating during silence, producing visible drift.
 */
function gateDxDyByAudio(src: string): string {
  return src
    .replace(/a\.dx\+=([^;]+);/g, "a.dx+=($1)*a.audioRaw;")
    .replace(/a\.dy\+=([^;]+);/g, "a.dy+=($1)*a.audioRaw;");
}

// Warm palette: red ↔ orange ↔ yellow, ~35 s full cycle, plus audio envelope.
// Runs AFTER stock frame_eqs so palette wins.
const FRAME_EQS_OVERRIDE = `
a.q1 = Math.sin(a.time*0.18);
a.audioSum = a.bass + a.mid + a.treb;
a.audioLin = Math.min(1, Math.max(0, (a.audioSum - 1.0)) * 0.7);
a.audioRaw = a.audioLin * a.audioLin;
a.q2 = 0.55 + 0.45*a.audioRaw;
a.wave_r = (a.q1>0.33 ? 1.00 : (a.q1>-0.33 ? 0.95 : 0.55)) * a.q2;
a.wave_g = (a.q1>0.33 ? 0.20 : (a.q1>-0.33 ? 0.40 : 0.85)) * a.q2;
a.wave_b = 0.05 * a.q2;
a.warp = 0.80*a.audioRaw;
a.warpanimspeed = 0.50*a.audioRaw;
a.warpscale = 1.60*a.audioRaw;
a.wave_a = Math.min(1, 0.10 + 0.90*a.audioRaw);
a.ob_a = Math.min(1, 0.05 + 0.85*a.audioRaw);
a.decay = 0.92 + 0.078*a.audioRaw*a.audioRaw*a.audioRaw;
a.zoom = 1;
`;

export const aderrasiPotionSlowPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(potionJson)) as PresetWithBase & {
    init_eqs_str?: string;
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
  };

  const bv = src.baseVals as Record<string, number>;
  bv.warpanimspeed  = 0.08;
  bv.warpscale      = 0.6;
  bv.decay          = 0.985;
  bv.wave_brighten  = 1;

  if (src.pixel_eqs_str) {
    src.pixel_eqs_str = gateDxDyByAudio(
      scaleAderrasiMotion(
        scaleTimeCoeff(src.pixel_eqs_str, TIME_FACTOR),
        BEAT_MOTION_FACTOR,
        IDLE_FIELD_FACTOR,
      ),
    );
  }

  src.frame_eqs_str = (src.frame_eqs_str ?? "") + "\n" + FRAME_EQS_OVERRIDE.trim() + "\n";

  return src as PresetWithBase;
})();
