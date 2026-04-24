/**
 * Rotation effect state — continuously spins the entire canvas around its center.
 *
 * When active, angle accumulates at WIND_RATE rad/s.
 * When deactivated, angle unwinds back to 0 at UNWIND_RATE rad/s.
 * At angle = 0 and inactive → idle (pass-through in post-process).
 */

const WIND_RATE = 0.35;   // rad/s (~1 full rotation per ~18 s)
const UNWIND_RATE = 1.5;  // rad/s — fast enough to feel snappy after normalize

// Nostalgia — pendulum sway. Angle = AMP * sin(ω * elapsed). Overrides wind/unwind
// when active; elapsed is relative to the toggle-on instant so motion starts at 0.
const NOSTALGIA_AMP_RAD = 0.22;                 // ~12.6° peak sway each side
const NOSTALGIA_PERIOD_S = 7.0;                 // one full left-right-left cycle
const NOSTALGIA_OMEGA = (2 * Math.PI) / NOSTALGIA_PERIOD_S;

export type RotationState = {
  angle: number;
  active: boolean;
  lastFrameMs: number;
  nostalgia: boolean;
  nostalgiaElapsed: number;
};

export function createRotationState(): RotationState {
  return { angle: 0, active: false, lastFrameMs: Date.now(), nostalgia: false, nostalgiaElapsed: 0 };
}

export function toggleRotation(state: RotationState): void {
  // Spin and pendulum are mutually exclusive — both mutate angle.
  if (state.nostalgia) state.nostalgia = false;
  state.active = !state.active;
  state.lastFrameMs = Date.now();
  if (!state.active) {
    // Normalize to (−π, π]. Visually seamless (cos/sin period = 2π) but caps
    // unwind distance at π rad so it never spins more than half a turn backward.
    const mod = ((state.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    state.angle = mod > Math.PI ? mod - 2 * Math.PI : mod;
  }
}

/** Nostalgia — pendulum mode toggle. Cancels regular spin if on. */
export function toggleNostalgia(state: RotationState): void {
  if (state.active) state.active = false;
  state.nostalgia = !state.nostalgia;
  state.nostalgiaElapsed = 0;
  state.lastFrameMs = Date.now();
}

/** Advance angle by dt, return current angle in radians. */
export function updateRotation(state: RotationState): number {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.1);
  state.lastFrameMs = now;

  if (state.nostalgia) {
    state.nostalgiaElapsed += dt;
    state.angle = NOSTALGIA_AMP_RAD * Math.sin(NOSTALGIA_OMEGA * state.nostalgiaElapsed);
    return state.angle;
  }

  if (state.active) {
    state.angle += WIND_RATE * dt;
    // Keep within [0, 2π) to avoid float drift over long sessions.
    if (state.angle >= 2 * Math.PI) state.angle -= 2 * Math.PI;
  } else if (state.angle !== 0) {
    const step = UNWIND_RATE * dt;
    if (Math.abs(state.angle) <= step) {
      // Step would overshoot zero — snap instead of oscillating.
      state.angle = 0;
    } else {
      state.angle -= Math.sign(state.angle) * step;
    }
  }

  return state.angle;
}

export function isRotationIdle(state: RotationState): boolean {
  return !state.active && !state.nostalgia && state.angle === 0;
}
