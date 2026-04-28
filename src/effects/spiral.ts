/**
 * Spiral distortion state — continuously growing rotation that tapers off
 * radially from center (inner pixels rotate most), plus an optional slow
 * zoom-in compound mode.
 *
 * Two independent winds:
 *   - active     → strength ramps to SPIRAL_MAX_STRENGTH (rotation only)
 *   - zoomActive → zoom ramps to ZOOM_MAX (zoom-in)
 *
 * `toggleSpiral`     flips active only — pure twist.
 * `toggleSpiralZoom` flips both at once — compound spiral + slow zoom.
 *
 * Call `updateSpiral` once per frame; returns { strength, zoom } for the shader.
 */

/** Max rotation at center in radians (~2.5 full turns). */
export const SPIRAL_MAX_STRENGTH = Math.PI * 2.5;

/** Radians per second wind-up speed. */
const WIND_RATE = 0.9;

/** Radians per second unwind speed (faster snap-back). */
const UNWIND_RATE = 1.8;

/** Slow zoom-in: target zoom factor and ramp rates. zoom=1 → none; zoom>1 → in. */
export const ZOOM_MAX = 1.8;
const ZOOM_WIND_RATE   = 0.05; // per second — intentionally slow
const ZOOM_UNWIND_RATE = 0.30; // faster snap-back

export type SpiralState = {
  strength:    number;
  active:      boolean;
  zoom:        number;
  zoomActive:  boolean;
  lastFrameMs: number;
};

export type SpiralOutput = { strength: number; zoom: number };

export function createSpiralState(): SpiralState {
  return { strength: 0, active: false, zoom: 1, zoomActive: false, lastFrameMs: Date.now() };
}

/** Pure twist toggle. Does not affect zoom. */
export function toggleSpiral(state: SpiralState): void {
  state.active = !state.active;
  state.lastFrameMs = Date.now();
}

/** Compound: spiral twist + slow zoom-in together. Either both on or both off. */
export function toggleSpiralZoom(state: SpiralState): void {
  const both = state.active && state.zoomActive;
  state.active     = !both;
  state.zoomActive = !both;
  state.lastFrameMs = Date.now();
}

/** Advance twist and zoom by dt. */
export function updateSpiral(state: SpiralState): SpiralOutput {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.05);
  state.lastFrameMs = now;

  state.strength = state.active
    ? Math.min(SPIRAL_MAX_STRENGTH, state.strength + WIND_RATE * dt)
    : Math.max(0, state.strength - UNWIND_RATE * dt);

  state.zoom = state.zoomActive
    ? Math.min(ZOOM_MAX, state.zoom + ZOOM_WIND_RATE * dt)
    : Math.max(1, state.zoom - ZOOM_UNWIND_RATE * dt);

  return { strength: state.strength, zoom: state.zoom };
}

/** True when both twist and zoom are fully unwound. */
export function isSpiralIdle(state: SpiralState): boolean {
  return !state.active && !state.zoomActive && state.strength === 0 && state.zoom === 1;
}
