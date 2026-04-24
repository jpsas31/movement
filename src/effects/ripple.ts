/**
 * Ripple effect state management.
 *
 * Tracks wall-clock trigger timestamps. PostProcessChain reads the current ages
 * each frame and applies per-pixel UV displacement via WebGL shader.
 */

const RIPPLE_DURATION_MS = 2000;
const MAX_RIPPLES = 4;

export type RippleState = {
  ripples: number[];
  /** Reused each frame to hand shader-uniform ages back to PostProcessChain
   *  without allocating. Length = MAX_RIPPLES; inactive slots = -1. */
  agesScratch: Float32Array;
};

export function createRippleState(): RippleState {
  return {
    ripples: [],
    agesScratch: new Float32Array(MAX_RIPPLES),
  };
}

/** Record a new ripple at current wall-clock time. */
export function triggerRipple(state: RippleState): void {
  state.ripples.push(Date.now());
  if (state.ripples.length > MAX_RIPPLES) state.ripples.shift();
}

/** Remove fully-decayed ripples. Call once per frame. In-place so no per-frame
 *  allocation when nothing expired. */
export function cleanExpiredRipples(state: RippleState): void {
  const now = Date.now();
  const src = state.ripples;
  let w = 0;
  for (let r = 0; r < src.length; r++) {
    if (now - src[r] < RIPPLE_DURATION_MS) {
      if (w !== r) src[w] = src[r];
      w++;
    }
  }
  if (w !== src.length) src.length = w;
}

/** Fill the scratch buffer with current ages (seconds) and return it.
 *  Always length MAX_RIPPLES; inactive slots = -1. */
export function getRippleAges(state: RippleState): Float32Array {
  const now = Date.now();
  const out = state.agesScratch;
  const n = Math.min(state.ripples.length, MAX_RIPPLES);
  for (let i = 0; i < n; i++) out[i] = (now - state.ripples[i]) / 1000;
  for (let i = n; i < MAX_RIPPLES; i++) out[i] = -1;
  return out;
}
