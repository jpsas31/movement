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

  // 4-color palette cycle: pink → light-blue → lilac → mint, ~26 s full cycle.
  // Audio reactivity:
  //   - idle (silent / quiet) → motion damped (zoom + warp + warpanimspeed scaled down)
  //   - peaks above baseline → bass pumps zoom, mid pumps warp, (bass+treb)
  //     brightens wave alpha (transient-only — see cope+martin notes).
  // Note: shifter's pixel_eqs is just `a.warp = a.bass;` — that runs per-pixel
  // AFTER our frame-level warp damping, so we ALSO append a pixel-level scale
  // to keep the swirl tame regardless of bass loudness.
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
      a.q1 = a.time*0.15 - Math.floor(a.time*0.15/4)*4;
      a.wave_r = a.q1<1 ? 1.00 : (a.q1<2 ? 0.55 : (a.q1<3 ? 0.78 : 0.55));
      a.wave_g = a.q1<1 ? 0.45 : (a.q1<2 ? 0.85 : (a.q1<3 ? 0.55 : 1.00));
      a.wave_b = a.q1<1 ? 0.75 : (a.q1<2 ? 1.00 : (a.q1<3 ? 1.00 : 0.78));
      a.zoom = a.zoom + 0.025*Math.max(0, a.bass_att - 1.0);
      a.warp = a.warp + 0.25*Math.max(0, a.mid_att - 1.0);
      a.wave_a = Math.min(1, (a.wave_a !== undefined ? a.wave_a : 0.5) + 0.4*Math.max(0, (a.bass_att + a.treb_att)*0.5 - 1.0));
    `,
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
}
