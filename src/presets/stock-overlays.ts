/**
 * Stock-preset overlays — small declarative tweaks applied on top of the
 * butterchurn-presets pkg presets at load time. Custom presets in
 * `src/presets/*` build their own data from scratch and don't need this.
 *
 * The overlay is applied AFTER `clonePresetGraphForButterchurn` (so we mutate
 * a fresh JSON copy, never the shared cached preset).
 *
 * IMPORTANT: butterchurn-presets ships preset code as already-compiled JS
 * (variables namespaced as `a.zoom`, `a.warp`, `a.wave_r`, `a.bass_att`,
 *  `a.q1`, `a.time`, …). Our `frameAppend` is concatenated into the same
 * Function body, so it MUST be JS — use `a.` prefix and JS ternaries
 * (`cond ? x : y`), not Milkdrop's `if(c,a,b)`.
 *
 * Two knobs:
 *   - baseValsSet : direct overrides on top-level `baseVals`
 *   - frameAppend : JS code appended to `frame_eqs_str`. Runs AFTER the
 *                   preset's own per-frame code, so reassignments here
 *                   dampen / re-tint motion already computed by the preset.
 *                   Use to scale `a.zoom`, `a.warp`, swap palette colors,
 *                   or modulate by `a.bass_att` / `a.mid_att` / `a.treb_att`.
 */
import type { PresetWithBase } from "../preset-variants";

export type StockOverlay = {
  baseValsSet?: Partial<Record<string, number>>;
  frameAppend?: string;
  pixelAppend?: string;
  /** Exact-string replacements applied to `comp` (final composite GLSL). Used to
   *  swap hardcoded color vectors for q-driven palette uniforms. */
  compReplace?: ReadonlyArray<readonly [string, string]>;
};

export const STOCK_OVERLAYS: Record<string, StockOverlay> = {
  // Boost audio reactivity — only on TRANSIENTS above baseline. butterchurn's
  // *_att variables idle near 1.0; previous overlay added a constant 0.4 every
  // frame, which clamped wave_r/g/b to white and washed out the preset's
  // native pearl-iridescence palette. Now `Math.max(0, att-1)` adds zero at
  // idle (preserving original colors) and only kicks in when audio actually
  // peaks above its rolling average.
  "cope + martin - mother-of-pearl": {
    frameAppend: `
      a.zoom = a.zoom + 0.05*Math.max(0, a.bass_att - 1.0);
      a.warp = a.warp + 0.6*Math.max(0, a.mid_att - 1.0);
      a.wave_r = a.wave_r + 0.30*Math.max(0, a.treb_att - 1.0);
      a.wave_g = a.wave_g + 0.30*Math.max(0, a.bass_att - 1.0);
      a.wave_b = a.wave_b + 0.30*Math.max(0, a.mid_att - 1.0);
      a.wave_a = Math.min(1, a.wave_a + 0.35*Math.max(0, (a.bass_att + a.treb_att)*0.5 - 1.0));
    `,
  },

  // Static 4-color spatial palette: pink (top-left), lilac (top-right),
  // mint (bottom-left), light-blue (bottom-right). All 4 colors visible
  // simultaneously, smooth bilinear blend between them. NO time cycle.
  //
  // The original blue tones lived in TWO places:
  //   1. `texture(sampler_main, uv) * 0.5` — previous-frame feedback that
  //      preserved any prior blue accumulation. We multiply this sample by
  //      the spatial palette so feedback decays toward the requested colors.
  //   2. Two hardcoded `vec3(...)` tint multipliers on Sobel edges. Both
  //      replaced with the spatial palette × scale.
  //
  // Audio reactivity (idle damped, peaks pump zoom/warp/wave_a — see
  // cope+martin notes for the transient-only pattern).
  "shifter - dark tides bdrv mix 2": {
    baseValsSet: {
      warpanimspeed: 0.3,  // upstream default ~1.0 drives swirl-pattern animation rate
    },
    pixelAppend: `
      a.warp = a.warp*0.30;
    `,
    frameAppend: `
      var _en = Math.max(a.bass_att, a.mid_att, a.treb_att);
      var _motion = Math.min(1, 0.10 + 0.30*Math.max(0, _en - 1.0));
      a.zoom = 1 + (a.zoom - 1)*_motion;
      a.warp = a.warp*_motion;
      a.zoom = a.zoom + 0.025*Math.max(0, a.bass_att - 1.0);
      a.warp = a.warp + 0.25*Math.max(0, a.mid_att - 1.0);
      a.wave_a = Math.min(1, (a.wave_a !== undefined ? a.wave_a : 0.5) + 0.4*Math.max(0, (a.bass_att + a.treb_att)*0.5 - 1.0));
    `,
    compReplace: [
      // Inject _palette decl right after the existing tmpvar_3 setup. Bilinear
      // blend across uv: corners are pink (TL) / lilac (TR) / mint (BL) / light-blue (BR).
      [
        "tmpvar_3 = (tmpvar_2 * 2.5);",
        "tmpvar_3 = (tmpvar_2 * 2.5);\n  vec3 _palette = mix(mix(vec3(1.00,0.45,0.75), vec3(0.78,0.55,1.00), uv.x), mix(vec3(0.55,1.00,0.78), vec3(0.55,0.85,1.00), uv.x), uv.y);",
      ],
      // Multiply previous-frame feedback by the palette so the dark-blue clear
      // colour decays out instead of accumulating.
      [
        "(texture (sampler_main, uv).xyz * 0.5)",
        "(texture (sampler_main, uv).xyz * _palette * 1.2)",
      ],
      // Replace the two hardcoded Sobel tint vectors with the spatial palette.
      ["vec3(3.4, 2.38, 1.02)", "(_palette * 4.0)"],
      ["vec3(0.68, 1.7, 2.38)", "(_palette * 2.5)"],
    ],
  },
};

export function applyStockOverlay(key: string, preset: PresetWithBase): void {
  const overlay = STOCK_OVERLAYS[key];
  if (!overlay) return;

  if (overlay.baseValsSet) {
    Object.assign(preset.baseVals, overlay.baseValsSet);
  }
  if (overlay.frameAppend) {
    const p = preset as PresetWithBase & { frame_eqs_str?: string };
    const prev = typeof p.frame_eqs_str === "string" ? p.frame_eqs_str : "";
    p.frame_eqs_str = prev + "\n" + overlay.frameAppend.trim() + "\n";
  }
  if (overlay.pixelAppend) {
    const p = preset as PresetWithBase & { pixel_eqs_str?: string };
    const prev = typeof p.pixel_eqs_str === "string" ? p.pixel_eqs_str : "";
    p.pixel_eqs_str = prev + "\n" + overlay.pixelAppend.trim() + "\n";
  }
  if (overlay.compReplace) {
    const p = preset as PresetWithBase & { comp?: string };
    if (typeof p.comp === "string") {
      let comp = p.comp;
      for (const [from, to] of overlay.compReplace) {
        if (!comp.includes(from)) {
          console.warn(`[stock-overlays] compReplace miss for "${key}": ${from}`);
          continue;
        }
        comp = comp.split(from).join(to);
      }
      p.comp = comp;
    }
  }
}
