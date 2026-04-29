/**
 * Generic helpers for slowing down stock butterchurn presets without rewriting
 * their equations from scratch.
 *
 * The presets ship as already-compiled JS code in `frame_eqs_str` /
 * `pixel_eqs_str` (variables namespaced as `a.zoom`, `a.time`, etc.). We
 * slow them by scaling the constant time-coefficient `K` in any
 * `Math.sin(K*a.time)` / `Math.cos(K*a.time)` / `Math.tan(K*a.time)` call.
 * Spatial trig (e.g. `Math.cos(6*a.ang)`, `Math.sin(a.x)`) is left alone.
 */

/** Multiply every `Math.sin(K*a.time)` / `Math.cos(K*a.time)` / `Math.tan(K*a.time)`
 *  time coefficient by `factor`. Bare `Math.sin(a.time)` (no K) is treated as K=1. */
export function scaleTimeCoeff(src: string, factor: number): string {
  return src
    .replace(
      /Math\.(sin|cos|tan)\(([\d.]+)\s*\*\s*a\.time\)/g,
      (_, fn, k) => `Math.${fn}(${(parseFloat(k) * factor).toFixed(4)}*a.time)`,
    )
    .replace(
      /Math\.(sin|cos|tan)\(a\.time\)/g,
      (_, fn) => `Math.${fn}(${factor.toFixed(2)}*a.time)`,
    );
}

/**
 * Replace specific exact-match coefficients (used for per-preset motion
 * coefficients like `.05*equal(...)`). Each entry is [needle, factor];
 * the matched numeric prefix is multiplied by `factor`.
 */
export function scaleNumericPrefix(
  src: string,
  prefixes: ReadonlyArray<readonly [RegExp, number]>,
): string {
  let out = src;
  for (const [re, factor] of prefixes) {
    out = out.replace(re, (m) => {
      const num = parseFloat(m);
      if (Number.isNaN(num)) return m;
      return (num * factor).toString();
    });
  }
  return out;
}
