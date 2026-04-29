/**
 * Felicidad — rolling hue rotation + traveling brightness wave.
 *
 * Doc spec: "oleaje de brillo y color LENTO Y CONSTANTE 5 seg".
 *
 * Visual: a slow hue cycle drifts the colour palette around the wheel; a sine
 * brightness band sweeps top→bottom over the frame. Both are gated by an
 * `envelope` that smoothly fades the effect in/out so toggling never pops.
 *
 * State only produces { time, amp } uniforms — same shape as `sea`. The shader
 * pass (FS_FELICIDAD in post-process-chain) is skipped entirely when amp < 0.001.
 */

const RAMP_ON_S  = 0.6; // envelope rise time on toggle-on
const RAMP_OFF_S = 1.2; // envelope fall time on toggle-off

export type FelicidadState = {
  active: boolean;
  envelope: number;     // 0..1 smoothed on/off envelope
  elapsed: number;      // seconds since creation, drives wave phase
  lastFrameMs: number;
  _result: { time: number; amp: number };
};

export function createFelicidadState(): FelicidadState {
  return { active: false, envelope: 0, elapsed: 0, lastFrameMs: Date.now(), _result: { time: 0, amp: 0 } };
}

export function toggleFelicidad(state: FelicidadState): void {
  state.active = !state.active;
  state.lastFrameMs = Date.now();
}

/** Advance envelope + elapsed; return uniforms for the shader pass. */
export function updateFelicidad(state: FelicidadState): { time: number; amp: number } {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.1);
  state.lastFrameMs = now;
  state.elapsed += dt;

  const target = state.active ? 1 : 0;
  const rate = state.active ? 1 / RAMP_ON_S : 1 / RAMP_OFF_S;
  const step = rate * dt;
  if (state.envelope < target)      state.envelope = Math.min(target, state.envelope + step);
  else if (state.envelope > target) state.envelope = Math.max(target, state.envelope - step);

  state._result.time = state.elapsed;
  state._result.amp = state.envelope;
  return state._result;
}

export function isFelicidadIdle(state: FelicidadState): boolean {
  return !state.active && state.envelope < 0.001;
}
