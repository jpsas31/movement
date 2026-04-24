/**
 * Spiral distortion state — a continuously growing rotation that tapers off
 * radially from center (inner pixels rotate most).
 *
 * Unlike ripple (discrete triggers), spiral uses a single float `strength`
 * that winds up while active and unwinds when toggled off.
 *
 * Call `updateSpiral` once per frame; it returns the current strength to pass
 * to the shader as `uStrength`.
 */

/** Max rotation at center in radians (~2.5 full turns). */
export const SPIRAL_MAX_STRENGTH = Math.PI * 2.5;

/** Radians per second wind-up speed. */
const WIND_RATE = 0.9;

/** Radians per second unwind speed (faster snap-back). */
const UNWIND_RATE = 1.8;

export type SpiralState = {
  strength: number;    // current rotation at center (radians, 0 → SPIRAL_MAX_STRENGTH)
  active: boolean;     // true = winding up, false = unwinding
  lastFrameMs: number;
};

export function createSpiralState(): SpiralState {
  return { strength: 0, active: false, lastFrameMs: Date.now() };
}

export function toggleSpiral(state: SpiralState): void {
  state.active = !state.active;
  state.lastFrameMs = Date.now(); // reset to avoid dt spike on first update
}

/**
 * Advance the spiral animation by one frame.
 * Returns the current strength (pass to shader as `uStrength`).
 */
export function updateSpiral(state: SpiralState): number {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.05); // cap at 50 ms
  state.lastFrameMs = now;

  if (state.active) {
    state.strength = Math.min(SPIRAL_MAX_STRENGTH, state.strength + WIND_RATE * dt);
  } else {
    state.strength = Math.max(0, state.strength - UNWIND_RATE * dt);
  }

  return state.strength;
}

/** True when fully unwound and no rendering needed. */
export function isSpiralIdle(state: SpiralState): boolean {
  return !state.active && state.strength === 0;
}
