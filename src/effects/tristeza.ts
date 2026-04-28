/**
 * Tristeza — falling ink-drop splatter.
 *
 * Doc spec: "gotas de tinta empiezan a caer o salpicar sobre la imágen
 *            LENTO Y CONSTANTE 8 seg".
 *
 * Architecture (approach A — CPU-driven particle state):
 *   - While active, spawn a Drop every SPAWN_INTERVAL_S at a random (x,y)
 *   - Each Drop carries its own age, lifetime LIFETIME_S
 *   - Per frame, ages advance; drops past LIFETIME_S are recycled
 *   - State exposes flat Float32Arrays of positions + ages for the shader
 *
 * MAX_DROPS must match the loop bound in FS_TRISTEZA (post-process-chain.ts).
 */

export const MAX_DROPS = 16;

const LIFETIME_S       = 4.5;
const SPAWN_INTERVAL_S = 1.0;
/** Inset so drops don't clip the very edge of the frame. */
const MARGIN           = 0.05;

export type TristezaState = {
  active: boolean;
  drops: { x: number; y: number; vx: number; vy: number; age: number; seed: number }[];
  spawnAccum: number;
  elapsed: number;          // total seconds since creation, drives shader flow-warp
  lastFrameMs: number;
  /** Scratch buffers handed to the shader each frame. age = -1 → inactive slot. */
  posBuf: Float32Array;
  ageBuf: Float32Array;
  /** Per-drop random seed in [0,1); shader hashes it for size/lifetime/aspect variation. */
  seedBuf: Float32Array;
};

export function createTristezaState(): TristezaState {
  return {
    active: false,
    drops: [],
    spawnAccum: 0,
    elapsed: 0,
    lastFrameMs: Date.now(),
    posBuf:  new Float32Array(MAX_DROPS * 2),
    ageBuf:  new Float32Array(MAX_DROPS).fill(-1),
    seedBuf: new Float32Array(MAX_DROPS),
  };
}

export function toggleTristeza(state: TristezaState): void {
  state.active = !state.active;
  state.lastFrameMs = Date.now();
  if (state.active) state.spawnAccum = SPAWN_INTERVAL_S; // first drop fires immediately
}

/** Advance ages, recycle expired drops, spawn new ones, fill scratch buffers.
 *  Returns the same Float32Array refs every frame (no allocation). */
export function updateTristeza(state: TristezaState): { positions: Float32Array; ages: Float32Array; seeds: Float32Array; time: number } {
  const now = Date.now();
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.05);
  state.lastFrameMs = now;
  state.elapsed += dt;

  // Age + reap + drift. Per-drop lifeMul controls effective lifetime; vx/vy
  // make the drop slide outward from its spawn point during its lifetime.
  const next: typeof state.drops = [];
  for (const d of state.drops) {
    const a = d.age + dt;
    const lifeMul = 0.65 + 0.65 * fractMul(d.seed, 3.17);
    if (a < LIFETIME_S * lifeMul) {
      next.push({
        x:    d.x + d.vx * dt,
        y:    d.y + d.vy * dt,
        vx:   d.vx,
        vy:   d.vy,
        age:  a,
        seed: d.seed,
      });
    }
  }
  state.drops = next;

  // Spawn while active.
  if (state.active) {
    state.spawnAccum += dt;
    while (state.spawnAccum >= SPAWN_INTERVAL_S && state.drops.length < MAX_DROPS) {
      state.spawnAccum -= SPAWN_INTERVAL_S;
      // Random direction + speed → drop drifts outward from spawn point.
      // Speed range 0.020-0.045 UV/s × ~4s lifetime = 0.08-0.18 UV travel.
      const angle = Math.random() * 2 * Math.PI;
      const speed = 0.020 + Math.random() * 0.025;
      state.drops.push({
        x:    MARGIN + Math.random() * (1 - MARGIN * 2),
        y:    MARGIN + Math.random() * (1 - MARGIN * 2),
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed,
        age:  0,
        seed: Math.random(),
      });
    }
    if (state.drops.length >= MAX_DROPS) state.spawnAccum = 0;
  }

  // Fill scratch buffers.
  state.ageBuf.fill(-1);
  for (let i = 0; i < state.drops.length; i++) {
    const d = state.drops[i];
    state.posBuf[i * 2]     = d.x;
    state.posBuf[i * 2 + 1] = d.y;
    state.ageBuf[i]         = d.age;
    state.seedBuf[i]        = d.seed;
  }

  return {
    positions: state.posBuf,
    ages:      state.ageBuf,
    seeds:     state.seedBuf,
    time:      state.elapsed,
  };
}

/** Mirrors the GLSL `fract(seed * mul)` hash used by the shader so JS-side
 *  lifetime decisions match shader-side effective lifetime exactly. */
function fractMul(seed: number, mul: number): number {
  const v = seed * mul;
  return v - Math.floor(v);
}

export function isTristezaIdle(state: TristezaState): boolean {
  return !state.active && state.drops.length === 0;
}
