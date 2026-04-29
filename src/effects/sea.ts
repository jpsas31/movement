/**
 * Sea effect — rolling multi-sine UV warp with foam speckle.
 *
 * "Amor / olas de mar" — slow, constant waves that come and go (va y viene).
 *
 * Shader (FS_SEA in post-process-chain.ts) does:
 *   - UV displacement via sum of three sines (two vertical-rolling, one horizontal sway)
 *   - Foam: bright speckle noise where wave-crest amplitude is high
 *
 * This module only produces (time, amp) uniforms. Envelope smooths entry/exit so
 * the effect never pops. Tide breath modulates amp ±TIDE_DEPTH over TIDE_PERIOD_S
 * so the waves feel like they advance and recede.
 */

const RAMP_ON_S   = 1.0;    // envelope rises 0 → 1 over this on toggle-on
const RAMP_OFF_S  = 1.5;    // envelope falls 1 → 0 on toggle-off (gentle fade)
const TIDE_PERIOD_S = 21.0; // "va y viene" breath cycle
const TIDE_DEPTH  = 0.25;   // amp multiplier range: [1 − d, 1 + d]

export type SeaState = {
  active: boolean;
  envelope: number;         // 0..1 smoothed on/off envelope
  elapsed: number;          // seconds since state creation (drives shader phase)
  lastFrameMs: number;
  // Per-state result object reused across updateSea() calls so the render
  // loop's destructure doesn't allocate a fresh object literal every frame.
  _result: { time: number; amp: number };
};

export function createSeaState(): SeaState {
  return { active: false, envelope: 0, elapsed: 0, lastFrameMs: Date.now(), _result: { time: 0, amp: 0 } };
}

export function toggleSea(state: SeaState): void {
  state.active = !state.active;
  state.lastFrameMs = Date.now();
}

/** Advance envelope + elapsed; return uniforms for the sea shader pass.
 *  When amp < 0.001 the caller should skip the pass entirely (shader no-op). */
export function updateSea(state: SeaState): { time: number; amp: number } {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.1);
  state.lastFrameMs = now;
  state.elapsed += dt;

  const target = state.active ? 1 : 0;
  const rate = state.active ? 1 / RAMP_ON_S : 1 / RAMP_OFF_S;
  const step = rate * dt;
  if (state.envelope < target)      state.envelope = Math.min(target, state.envelope + step);
  else if (state.envelope > target) state.envelope = Math.max(target, state.envelope - step);

  // Tide ± TIDE_DEPTH — slow amplitude breath centered on 1.0 so baseline wave
  // strength is preserved and peaks/troughs feel like a tide coming and going.
  const tide = 1 + TIDE_DEPTH * Math.sin((2 * Math.PI * state.elapsed) / TIDE_PERIOD_S);
  state._result.time = state.elapsed;
  state._result.amp = state.envelope * tide;
  return state._result;
}

export function isSeaIdle(state: SeaState): boolean {
  return !state.active && state.envelope < 0.001;
}
