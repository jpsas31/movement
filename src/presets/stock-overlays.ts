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
  // Literal substring swaps applied to the comp shader (`preset.comp`).
  // Use to retint hardcoded vec3 multipliers (edge detectors, palette terms)
  // without rewriting the whole shader. Each `from` must appear exactly once.
  compReplace?: Array<{ from: string; to: string }>;
  // Literal substring swaps applied to `frame_eqs_str`. Use to floor
  // `randint(N)` calls so cold-start state can't roll a "black" mode,
  // without removing randomness across the rest of the preset's range.
  frameReplace?: Array<{ from: string; to: string }>;
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

  // Retint the WHOLE preset by remapping the comp shader's final write.
  // The preset's warp shader runs a 2-channel feedback machine: ret.r = "red"
  // intensity, ret.b = "blue" intensity, ret.g ~= 0. Swapping just the two
  // edge-tint vec3s in front of the gradient terms doesn't show up — the
  // dominant visible color comes from those R/B feedback channels, not the
  // edge highlights. Instead we replace the final write
  // `tmpvar_4.xyz = ret_1;` with a hue remap: R-channel intensity displays
  // as mint-green (0.55, 1.00, 0.78), B-channel as lilac (0.78, 0.55, 1.00).
  // G-channel keeps a neutral gray pass-through. Buffer math is unchanged
  // — only the final pixel write is recolored.
  "shifter - dark tides bdrv mix 2": {
    compReplace: [
      {
        from: "tmpvar_4.xyz = ret_1;",
        to: "tmpvar_4.xyz = max(ret_1.r, 0.0) * vec3(0.55, 1.00, 0.78) + max(ret_1.b, 0.0) * vec3(0.78, 0.55, 1.00) + max(ret_1.g, 0.0) * vec3(0.50, 0.50, 0.50);",
      },
    ],
    // Cold-start black-screen fix. shifter's only enabled visual is
    // shape[1] with `textured:1` — it samples `sampler_main` onto itself
    // (feedback loop). frame_eqs explicitly sets `a.wave_a=0`, which
    // overrides baseVals.wave_a=4.1 every frame → the waveform never
    // draws → buffer never gets seeded. Cold load = black buffer = the
    // feedback loop samples black forever. Switching to another preset
    // writes content into the shared buffer; coming back, shifter finds
    // it and ignites. To self-ignite from cold, briefly enable the wave
    // for the first few seconds, then revert to the original behavior.
    // (`a.cm = randint(3)+1` mode roll exists but q5/q6 are not read by
    //  the comp/warp/shape code — that randomness is dead code, leave
    //  it alone.)
    // `a.time` is butterchurn's global wall clock — does NOT reset per
    // preset switch, so `a.time < N` would only fire on app cold-start.
    // Use `a.iter` instead: shifter's init_eqs sets it to 0 and frame_eqs
    // grows it by `a.tic` (≈ frame delta seconds) until ~30, then resets.
    // `a.iter < 2.5` ≈ "first 2.5 seconds since this preset loaded".
    frameReplace: [
      { from: "a.wave_a=0;", to: "a.wave_a=(a.iter<2.5?0.7:0);" },
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
  if (overlay.frameReplace && overlay.frameReplace.length > 0) {
    const p = preset as PresetWithBase & { frame_eqs_str?: string };
    if (typeof p.frame_eqs_str !== "string") {
      console.warn(`[stock-overlay ${key}] frameReplace skipped — preset.frame_eqs_str not a string`);
    } else {
      let frame = p.frame_eqs_str;
      let hits = 0;
      for (const { from, to } of overlay.frameReplace) {
        if (!frame.includes(from)) {
          console.warn(`[stock-overlay ${key}] frameReplace 'from' not found: ${from}`);
          continue;
        }
        frame = frame.replace(from, to);
        hits++;
      }
      p.frame_eqs_str = frame;
      console.log(`[stock-overlay ${key}] frameReplace applied: ${hits}/${overlay.frameReplace.length}`);
    }
  }
  if (overlay.compReplace && overlay.compReplace.length > 0) {
    const p = preset as PresetWithBase & { comp?: string };
    if (typeof p.comp !== "string") {
      console.warn(`[stock-overlay ${key}] compReplace skipped — preset.comp not a string`);
    } else {
      let comp = p.comp;
      let hits = 0;
      for (const { from, to } of overlay.compReplace) {
        if (!comp.includes(from)) {
          console.warn(`[stock-overlay ${key}] compReplace 'from' not found: ${from}`);
          continue;
        }
        comp = comp.replace(from, to);
        hits++;
      }
      p.comp = comp;
      console.log(`[stock-overlay ${key}] compReplace applied: ${hits}/${overlay.compReplace.length}`);
    }
  }
}
