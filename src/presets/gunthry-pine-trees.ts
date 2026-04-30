/**
 * "gunthry is out back bloodying up the pine trees - adm atomising (v) the disintigrate (n)"
 *
 * Source: projectM-visualizer/presets-cream-of-the-crop, path
 *   Drawing/Liquid Mirror/<title>.milk
 * Converted from MilkDrop .milk → butterchurn JSON via `npm run build:gunthry`.
 * Re-run that script to refresh the JSON if upstream changes.
 *
 * Slowdown layers:
 *   1. TIME_FACTOR scales every `Math.{sin,cos,tan}(K*a['time'])` coefficient in
 *      frame_eqs / pixel_eqs (color shifts, dx_r/dy_r oscillation, rot/cx/cy drift).
 *      Spatial trig (a['rad']) and audio trig (bass_att*treb_shift) untouched.
 *   2. MOTION_FACTOR scales magnitude prefixes of cx/cy/rot/zoom-kick/dx_r/dy_r,
 *      shape ma drift gains, and baseVals echo_zoom/warp. Time-coeff scaling
 *      alone slows oscillation rate but leaves displacement amplitude unchanged;
 *      the per-frame echo_zoom=1.002 + bass-driven shape `ma` motion stays fast.
 *      MOTION_FACTOR addresses both.
 */
import type { PresetWithBase } from "../preset-variants";
import gunthryJson from "./json/gunthry-pine-trees.butterchurn.json";
import { scaleTimeCoeff } from "./preset-slowdown";

export const GUNTHRY_PINE_TREES_PRESET_KEY =
  "gunthry is out back bloodying up the pine trees - adm atomising (v) the disintigrate (n)";

const TIME_FACTOR   = 0.1;   // 10× slower temporal oscillation
const MOTION_FACTOR = 0.25;  // 4× weaker displacement / kick magnitudes
const KILL_ECHO_ZOOM = true; // pin echo_zoom to 1.0 — no per-frame zoom pulse

function scaleGunthryMotion(src: string, f: number): string {
  return src
    // frame_eqs zoom-kick magnitude (0.05 * (treb*cos*bass_shift))
    .replace(/Math\.abs\(\(0\.05\*/g, `Math.abs((${(0.05 * f).toFixed(4)}*`)
    // pixel_eqs cx / cy oscillation magnitudes
    .replace(/a\['cx'\]-\(0\.25\*/g,  `a['cx']-(${(0.25 * f).toFixed(4)}*`)
    .replace(/a\['cy'\]-\(0\.25\*/g,  `a['cy']-(${(0.25 * f).toFixed(4)}*`)
    // pixel_eqs rot kicks (-0.25, -0.5, +0.25)
    .replace(/a\['rot'\]-\(0\.25\*/g, `a['rot']-(${(0.25 * f).toFixed(4)}*`)
    .replace(/a\['rot'\]-\(0\.5\*/g,  `a['rot']-(${(0.5 * f).toFixed(4)}*`)
    .replace(/a\['rot'\]\+\(0\.25\*/g,`a['rot']+(${(0.25 * f).toFixed(4)}*`)
    // pixel_eqs dx_r / dy_r kick magnitude (within `equal(thresh,2)*0.015`)
    .replace(/equal\(a\['thresh'\], 2\)\*0\.015/g,
             `equal(a['thresh'], 2)*${(0.015 * f).toFixed(5)}`);
}

function scaleShapeFrameEqs(src: string, f: number): string {
  return src
    // Shape ma drift gains (bass/mid/treb → ma)
    .replace(/3\.1415\)\*0\.01\)\*a\['bass'\]/g, `3.1415)*${(0.01 * f).toFixed(5)})*a['bass']`)
    .replace(/3\.1415\)\*0\.01\)\*a\['treb'\]/g, `3.1415)*${(0.01 * f).toFixed(5)})*a['treb']`)
    .replace(/3\.1415\)\*0\.05\)\*a\['bass'\]/g, `3.1415)*${(0.05 * f).toFixed(5)})*a['bass']`)
    .replace(/3\.1415\)\*0\.05\)\*a\['mid'\]/g,  `3.1415)*${(0.05 * f).toFixed(5)})*a['mid']`)
    // mx / my drift step
    .replace(/0\.0002\*Math\.cos/g, `${(0.0002 * f).toFixed(6)}*Math.cos`)
    .replace(/0\.0002\*Math\.sin/g, `${(0.0002 * f).toFixed(6)}*Math.sin`)
    .replace(/0\.0001\*Math\.cos/g, `${(0.0001 * f).toFixed(6)}*Math.cos`)
    .replace(/0\.0001\*Math\.sin/g, `${(0.0001 * f).toFixed(6)}*Math.sin`);
}

type GunthryShape = { frame_eqs_str?: string };

export const gunthryPineTreesPreset: PresetWithBase = (() => {
  const src = JSON.parse(JSON.stringify(gunthryJson)) as PresetWithBase & {
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
    shapes?: GunthryShape[];
  };

  // baseVals — per-frame zoom pulse + warp anim speed.
  const bv = src.baseVals as Record<string, number>;
  if (typeof bv.echo_zoom === "number") {
    bv.echo_zoom = KILL_ECHO_ZOOM ? 1 : 1 + (bv.echo_zoom - 1) * MOTION_FACTOR;
  }
  if (typeof bv.warp === "number") bv.warp *= MOTION_FACTOR; // 0.01 → 0.0025

  // Equation strings — apply motion-magnitude scaling BEFORE time-coeff scaling
  // so motion regexes match the original prefixes (e.g. `0.25*` ahead of
  // `Math.cos(a['time'])`) before they get rewritten with new coefficients.
  if (src.frame_eqs_str) {
    src.frame_eqs_str = scaleTimeCoeff(
      scaleGunthryMotion(src.frame_eqs_str, MOTION_FACTOR),
      TIME_FACTOR,
    );
  }
  if (src.pixel_eqs_str) {
    src.pixel_eqs_str = scaleTimeCoeff(
      scaleGunthryMotion(src.pixel_eqs_str, MOTION_FACTOR),
      TIME_FACTOR,
    );
  }
  if (src.shapes) {
    for (const sh of src.shapes) {
      if (sh.frame_eqs_str) sh.frame_eqs_str = scaleShapeFrameEqs(sh.frame_eqs_str, MOTION_FACTOR);
    }
  }

  return src as PresetWithBase;
})();
