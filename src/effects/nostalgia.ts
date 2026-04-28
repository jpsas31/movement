/**
 * Nostalgia — pendulum sway of the display canvas.
 *
 * Doc spec: "movimiento de oleaje constante, o como péndulo. LENTO Y CONSTANTE."
 * Implementation: angle = AMP * sin(ω * elapsed), applied via CSS transform on
 * the post-process display canvas. No shader pass — compositor-thread cost only.
 *
 * Standalone (no longer coupled to a rotation effect). Toggle on → starts swaying;
 * toggle off → angle eases back to 0 over UNWIND_RATE.
 */

const NOSTALGIA_AMP_RAD  = 0.22;               // ~12.6° peak sway each side
const NOSTALGIA_PERIOD_S = 7.0;                 // one full left-right-left cycle
const NOSTALGIA_OMEGA    = (2 * Math.PI) / NOSTALGIA_PERIOD_S;
const UNWIND_RATE        = 1.5;                 // rad/s when toggling off — snappy

export type NostalgiaState = {
  angle: number;
  active: boolean;
  elapsed: number;
  lastFrameMs: number;
};

export function createNostalgiaState(): NostalgiaState {
  return { angle: 0, active: false, elapsed: 0, lastFrameMs: Date.now() };
}

export function toggleNostalgia(state: NostalgiaState): void {
  state.active = !state.active;
  state.elapsed = 0;
  state.lastFrameMs = Date.now();
}

/** Advance one frame; returns current angle in radians. */
export function updateNostalgia(state: NostalgiaState): number {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.1);
  state.lastFrameMs = now;

  if (state.active) {
    state.elapsed += dt;
    state.angle = NOSTALGIA_AMP_RAD * Math.sin(NOSTALGIA_OMEGA * state.elapsed);
    return state.angle;
  }

  // Decay toward 0 when turned off.
  if (state.angle !== 0) {
    const step = UNWIND_RATE * dt;
    state.angle = Math.abs(state.angle) <= step
      ? 0
      : state.angle - Math.sign(state.angle) * step;
  }
  return state.angle;
}

export function isNostalgiaIdle(state: NostalgiaState): boolean {
  return !state.active && state.angle === 0;
}
