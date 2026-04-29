/**
 * Black hole effect — N-body gravitational simulation with UV lensing.
 *
 * Mass sign controls BOTH physics and visual lensing:
 *   +1 (attracting)  — holes pull UV inward, dark event horizon, orange accretion ring
 *   -1 (repelling)   — holes push UV outward, bright blue-white core
 *
 * Physics rule:  F ∝ m_i × m_j
 *   Same sign   → positive force → holes attract each other (orbital dynamics)
 *   Opposite    → negative force → holes repel each other (bouncing chaos)
 *
 * Default spawn: one attracting + one repelling → they fly apart, bounce off
 * walls, and create alternating suck/push visual patches.
 */

export const MAX_BH = 4; // must match BH_MAX in post-process-chain.ts

const G          = 0.10;   // gravitational constant (screen-UV²/s²)
const DAMPING    = 0.990;  // per-frame velocity damping
const BOUNCE     = 0.38;   // speed factor after wall collision
const SPEED_MAX  = 0.55;   // max speed (UV units / s)
const MARGIN     = 0.07;   // wall buffer (UV units)
const OMEGA      = (2 * Math.PI) / 14; // mass oscillation: 14-second period
const COLLISION  = 0.09;   // UV distance — closer than this → instant repulsion

export type BlackHole = {
  x: number;    // [0, 1] UV position
  y: number;
  vx: number;   // velocity (UV / s)
  vy: number;
  mass: number; // live value; oscillates continuously via sine
  phase: number;// oscillation phase offset (radians), unique per hole
  // ── Scripted mode ──────────────────────────────────────────────────────────
  // When set, this hole bypasses sine-mass oscillation and N-body physics.
  // Mass/position are driven by the scripted* callbacks as pure functions of
  // local elapsed time. Used by derived effects (missing, sharing) that reuse
  // the blackhole shader but need deterministic choreography.
  scripted?: "missing" | "sharing" | "connect" | "brush" | "fadeout";
  scriptedElapsed?: number;
  scriptedLifetime?: number;                     // seconds; undefined = persistent
  scriptedMass?: (t: number) => number;
  /** Writes x / y into the hole in place (no per-frame tuple allocation). */
  scriptedPos?:  (t: number, h: BlackHole) => void;
};

export type BlackHoleState = {
  holes: BlackHole[];
  active: boolean;
  lastFrameMs: number;
  elapsed: number;  // total time active (seconds) — drives mass oscillation
  /** Scratch buffers reused each frame as shader uniforms — avoids a per-frame
   *  Array allocation in the render loop. Length = MAX_BH*2 / MAX_BH. */
  positionsScratch: Float32Array;
  massesScratch: Float32Array;
  /** Reused result wrapper so getBlackholeUniforms() doesn't allocate per call. */
  _result: { positions: Float32Array; masses: Float32Array };
};

export function createBlackholeState(): BlackHoleState {
  const positionsScratch = new Float32Array(MAX_BH * 2);
  const massesScratch = new Float32Array(MAX_BH);
  return {
    holes: [],
    active: false,
    lastFrameMs: Date.now(),
    elapsed: 0,
    positionsScratch,
    massesScratch,
    _result: { positions: positionsScratch, masses: massesScratch },
  };
}

const BLACKHOLE_FADEOUT_LIFETIME = 1.5;  // seconds — non-scripted holes ease out on toggle off
const BLACKHOLE_FADEOUT_DECAY    = 1.5;  // mass decay coefficient — m(t) = m0 * e^(-DECAY*t)

/** Toggle on (spawn default pair) / off (fade out non-scripted holes over
 *  ~1.5 s instead of cutting them instantly). On toggle off, each non-scripted
 *  hole is converted into a scripted "fadeout" with frozen position and a mass
 *  that decays exponentially before being spliced. Scripted effects
 *  (missing/sharing/connect/brush) live independently and aren't affected. */
export function toggleBlackholes(state: BlackHoleState): void {
  state.active = !state.active;
  if (state.active) {
    const scripted = state.holes.filter((h) => h.scripted);
    state.holes = [...scripted, ...defaultPair()];
  } else {
    // Convert each non-scripted hole into a frozen-position fadeout.
    const fadeMass = (m0: number) =>
      (t: number): number => m0 * Math.exp(-BLACKHOLE_FADEOUT_DECAY * t);
    state.holes = state.holes.map((h) => {
      if (h.scripted) return h;
      const frozenX = h.x;
      const frozenY = h.y;
      return {
        ...h,
        vx: 0, vy: 0,
        scripted: "fadeout",
        scriptedElapsed: 0,
        scriptedLifetime: BLACKHOLE_FADEOUT_LIFETIME,
        scriptedMass: fadeMass(h.mass),
        scriptedPos: (_t, hh) => { hh.x = frozenX; hh.y = frozenY; },
      };
    });
  }
  state.lastFrameMs = Date.now();
  state.elapsed = 0;
}

/** Add one more hole (up to MAX_BH). Random phase so it desynchronises from existing holes. */
export function addBlackhole(state: BlackHoleState): void {
  if (!state.active || state.holes.length >= MAX_BH) return;
  state.holes.push({
    x:     MARGIN + Math.random() * (1 - MARGIN * 2),
    y:     MARGIN + Math.random() * (1 - MARGIN * 2),
    vx:    (Math.random() - 0.5) * 0.18,
    vy:    (Math.random() - 0.5) * 0.18,
    mass:  1,
    phase: Math.random() * 2 * Math.PI,
  });
}

/** Advance physics by one frame. Safe to call when inactive (no-op). */
export function updateBlackholes(state: BlackHoleState): void {
  const holes = state.holes;
  if (holes.length === 0) return;

  const now = Date.now();
  const dt  = Math.min((now - state.lastFrameMs) / 1000, 0.05);
  state.lastFrameMs = now;
  state.elapsed    += dt;

  // mass = sin(…) — used only for the visual halo (fades smoothly through zero-crossings).
  // Physics uses sign(m_i)*sign(m_j) so force is always full magnitude; only direction
  // flips at the sign boundary. Avoids the problem where product of two sines stays near
  // zero for long stretches and attraction appears to do nothing.
  for (const h of holes) {
    if (h.scripted) {
      h.scriptedElapsed = (h.scriptedElapsed ?? 0) + dt;
      const t = h.scriptedElapsed;
      if (h.scriptedMass) h.mass = h.scriptedMass(t);
      if (h.scriptedPos) h.scriptedPos(t, h);
      continue;
    }
    h.mass = Math.sin(OMEGA * state.elapsed + h.phase);
  }

  // ── N-body forces ──────────────────────────────────────────────────────────
  // Scripted holes are immovable choreography — they neither feel nor exert forces.
  for (let i = 0; i < holes.length; i++) {
    if (holes[i].scripted) continue;
    for (let j = i + 1; j < holes.length; j++) {
      if (holes[j].scripted) continue;
      const dx = holes[j].x - holes[i].x;
      const dy = holes[j].y - holes[i].y;
      const r2 = dx * dx + dy * dy;
      const r  = Math.sqrt(r2) + 1e-5;

      // Within COLLISION distance → override to repel immediately, no jitter.
      // Beyond that → normal sign-based attract/repel from phase oscillation.
      const signProd = r < COLLISION ? -1 : Math.sign(holes[i].mass) * Math.sign(holes[j].mass);
      const f   = G * signProd / (r2 + 0.003);
      const ax  = f * (dx / r) * dt;
      const ay  = f * (dy / r) * dt;

      holes[i].vx += ax;   holes[i].vy += ay;
      holes[j].vx -= ax;   holes[j].vy -= ay;
    }
  }

  // ── Integrate + constrain ──────────────────────────────────────────────────
  for (const h of holes) {
    if (h.scripted) continue;
    const spd = Math.hypot(h.vx, h.vy);
    if (spd > SPEED_MAX) { h.vx = h.vx / spd * SPEED_MAX; h.vy = h.vy / spd * SPEED_MAX; }

    h.vx *= DAMPING;  h.vy *= DAMPING;
    h.x  += h.vx * dt;
    h.y  += h.vy * dt;

    if (h.x < MARGIN)     { h.x = MARGIN;     h.vx =  Math.abs(h.vx) * BOUNCE; }
    if (h.x > 1 - MARGIN) { h.x = 1 - MARGIN; h.vx = -Math.abs(h.vx) * BOUNCE; }
    if (h.y < MARGIN)     { h.y = MARGIN;      h.vy =  Math.abs(h.vy) * BOUNCE; }
    if (h.y > 1 - MARGIN) { h.y = 1 - MARGIN; h.vy = -Math.abs(h.vy) * BOUNCE; }
  }

  // ── Expire scripted holes past their lifetime ──────────────────────────────
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    if (h.scripted && h.scriptedLifetime !== undefined &&
        (h.scriptedElapsed ?? 0) >= h.scriptedLifetime) {
      holes.splice(i, 1);
    }
  }
}

/**
 * Returns flat arrays suitable for gl.uniform2fv / gl.uniform1fv.
 * Inactive slots are padded with mass=0 (shader skips them).
 */
export function getBlackholeUniforms(state: BlackHoleState): {
  positions: Float32Array;   // [x0,y0, x1,y1, …] length = MAX_BH × 2
  masses:    Float32Array;   // [m0, m1, …]        length = MAX_BH
} {
  const positions = state.positionsScratch;
  const masses    = state.massesScratch;
  const n = Math.min(state.holes.length, MAX_BH);
  for (let i = 0; i < n; i++) {
    const h = state.holes[i];
    positions[i * 2]     = h.x;
    positions[i * 2 + 1] = h.y;
    masses[i]            = h.mass;
  }
  for (let i = n; i < MAX_BH; i++) {
    positions[i * 2]     = 0;
    positions[i * 2 + 1] = 0;
    masses[i]            = 0;
  }
  return state._result;
}

// ── Scripted effects (derived from blackhole shader) ─────────────────────────

const MISSING_LIFETIME    = 2.0;   // seconds — total hole existence (mass decays to ~0 by end)
const MISSING_MOTION_TIME = 0.7;   // holes reach end position by this time; then hold while mass fades
const MISSING_PEAK_MASS   = -2.0;  // strong repel (shader LENS × mass = UV displacement)
const MISSING_START_X     = 0.48;  // holes start near center, nearly touching
const MISSING_END_X       = 0.15;  // left hole final x (right = 1 - this)
const SHARING_APPROACH    = 3.0;  // seconds to travel from edges to center
const SHARING_APPROACH_POW = 2.2; // >1 = slow start, fast finish on approach
const SHARING_DANCE_RADIUS = 0.05; // UV radius of center orbit after meeting
const SHARING_DANCE_PERIOD = 3.0; // seconds per full orbit
const SHARING_RAMP         = 1.5; // seconds to grow dance radius from 0 → full

/** Extraño — figures separate rápido. One-shot repel pulse from a pair of scripted
 *  holes on the horizontal midline. Mass rises fast, decays over ~0.7 s, then holes
 *  auto-remove. Re-firing while active replaces the in-flight pair. */
export function triggerMissing(state: BlackHoleState): void {
  // Drop any in-flight missing holes so re-trigger restarts cleanly.
  state.holes = state.holes.filter((h) => h.scripted !== "missing");
  if (state.holes.length + 2 > MAX_BH) {
    // Make room by dropping oldest non-scripted holes.
    const overflow = state.holes.length + 2 - MAX_BH;
    let removed = 0;
    state.holes = state.holes.filter((h) => {
      if (removed < overflow && !h.scripted) { removed++; return false; }
      return true;
    });
  }
  // Mass: fast rise, gentle decay so mass ≈ 0 at splice time (no abrupt cut).
  // At t=MISSING_LIFETIME (2.0s): |mass| ≈ 2 * e^-4 ≈ 0.04.
  const massCurve = (t: number) =>
    MISSING_PEAK_MASS * (1 - Math.exp(-18 * t)) * Math.exp(-2.0 * t);
  // Position: ease-out cubic over MOTION_TIME; then clamp so holes hold at edge while mass fades.
  const eased = (t: number): number => {
    const u = Math.min(1, t / MISSING_MOTION_TIME);
    return 1 - Math.pow(1 - u, 3);
  };
  const leftX  = (t: number, h: BlackHole) => {
    h.x = MISSING_START_X + (MISSING_END_X - MISSING_START_X) * eased(t);
    h.y = 0.5;
  };
  const rightX = (t: number, h: BlackHole) => {
    h.x = (1 - MISSING_START_X) + ((1 - MISSING_END_X) - (1 - MISSING_START_X)) * eased(t);
    h.y = 0.5;
  };
  state.holes.push(
    { x: MISSING_START_X, y: 0.5, vx: 0, vy: 0, mass: 0, phase: 0,
      scripted: "missing", scriptedElapsed: 0, scriptedLifetime: MISSING_LIFETIME,
      scriptedMass: massCurve, scriptedPos: leftX },
    { x: 1 - MISSING_START_X, y: 0.5, vx: 0, vy: 0, mass: 0, phase: 0,
      scripted: "missing", scriptedElapsed: 0, scriptedLifetime: MISSING_LIFETIME,
      scriptedMass: massCurve, scriptedPos: rightX },
  );
  state.lastFrameMs = Date.now();
}

/** Compartimos — two patches approach and recede, slow at first then fast.
 *  Toggle-based: returns true when turned on, false when turned off. */
export function toggleSharing(state: BlackHoleState): boolean {
  const existing = state.holes.some((h) => h.scripted === "sharing");
  if (existing) {
    state.holes = state.holes.filter((h) => h.scripted !== "sharing");
    return false;
  }
  if (state.holes.length + 2 > MAX_BH) {
    const overflow = state.holes.length + 2 - MAX_BH;
    let removed = 0;
    state.holes = state.holes.filter((h) => {
      if (removed < overflow && !h.scripted) { removed++; return false; }
      return true;
    });
  }
  // Approach: ease-in curve pulls each hole from its edge to center over SHARING_APPROACH
  // seconds, then clamps at center (no cyclical reset).
  // Dance: after meeting, both holes orbit opposite points of a small circle at center.
  // A linger ramp grows the dance radius smoothly from 0 → full to avoid a discontinuity
  // at the approach→dance boundary (pos is continuous at the handoff).
  const approachProgress = (t: number): number => {
    const u = Math.min(1, t / SHARING_APPROACH);
    return Math.pow(u, SHARING_APPROACH_POW);
  };
  const lingerAmp = (t: number): number => {
    const td = Math.max(0, t - SHARING_APPROACH);
    return Math.min(1, td / SHARING_RAMP) * SHARING_DANCE_RADIUS;
  };
  const danceAngle = (t: number): number => {
    const td = Math.max(0, t - SHARING_APPROACH);
    return (2 * Math.PI * td) / SHARING_DANCE_PERIOD;
  };
  const leftPos = (t: number, h: BlackHole) => {
    const baseX = 0.20 + (0.50 - 0.20) * approachProgress(t);
    const r = lingerAmp(t);
    const a = danceAngle(t);
    h.x = baseX + r * Math.cos(a);
    h.y = 0.5 + r * Math.sin(a);
  };
  const rightPos = (t: number, h: BlackHole) => {
    const baseX = 0.80 + (0.50 - 0.80) * approachProgress(t);
    const r = lingerAmp(t);
    const a = danceAngle(t);
    h.x = baseX - r * Math.cos(a);
    h.y = 0.5 - r * Math.sin(a);
  };
  state.holes.push(
    { x: 0.20, y: 0.5, vx: 0, vy: 0, mass: 0.85, phase: 0,
      scripted: "sharing", scriptedElapsed: 0, scriptedPos: leftPos },
    { x: 0.80, y: 0.5, vx: 0, vy: 0, mass: 0.85, phase: 0,
      scripted: "sharing", scriptedElapsed: 0, scriptedPos: rightPos },
  );
  state.lastFrameMs = Date.now();
  return true;
}

export function hasScriptedMissing(state: BlackHoleState): boolean {
  return state.holes.some((h) => h.scripted === "missing");
}

export function hasScriptedSharing(state: BlackHoleState): boolean {
  return state.holes.some((h) => h.scripted === "sharing");
}

// ── Conectar — two patches converge rápidamente into one ─────────────────────

const CONNECT_LIFETIME    = 2.0;   // seconds — total existence (mass fades before splice)
const CONNECT_MOTION_TIME = 0.55;  // fast approach; holes lock at center for fade tail
const CONNECT_PEAK_MASS   = 1.8;   // strong attract
const CONNECT_START_X     = 0.15;  // far apart
const CONNECT_END_X       = 0.50;  // meet at center

/** Conectar — one-shot attract pulse. Two holes rush toward center, merge, mass fades. */
export function triggerConnect(state: BlackHoleState): void {
  state.holes = state.holes.filter((h) => h.scripted !== "connect");
  if (state.holes.length + 2 > MAX_BH) {
    const overflow = state.holes.length + 2 - MAX_BH;
    let removed = 0;
    state.holes = state.holes.filter((h) => {
      if (removed < overflow && !h.scripted) { removed++; return false; }
      return true;
    });
  }
  const massCurve = (t: number) =>
    CONNECT_PEAK_MASS * (1 - Math.exp(-14 * t)) * Math.exp(-1.4 * t);
  // ease-in-out cubic — smooth accelerate + decelerate for clean merge
  const eased = (t: number): number => {
    const u = Math.min(1, t / CONNECT_MOTION_TIME);
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  };
  const leftPos  = (t: number, h: BlackHole) => {
    h.x = CONNECT_START_X + (CONNECT_END_X - CONNECT_START_X) * eased(t);
    h.y = 0.5;
  };
  const rightPos = (t: number, h: BlackHole) => {
    h.x = (1 - CONNECT_START_X) + ((1 - CONNECT_END_X) - (1 - CONNECT_START_X)) * eased(t);
    h.y = 0.5;
  };
  state.holes.push(
    { x: CONNECT_START_X, y: 0.5, vx: 0, vy: 0, mass: 0, phase: 0,
      scripted: "connect", scriptedElapsed: 0, scriptedLifetime: CONNECT_LIFETIME,
      scriptedMass: massCurve, scriptedPos: leftPos },
    { x: 1 - CONNECT_START_X, y: 0.5, vx: 0, vy: 0, mass: 0, phase: 0,
      scripted: "connect", scriptedElapsed: 0, scriptedLifetime: CONNECT_LIFETIME,
      scriptedMass: massCurve, scriptedPos: rightPos },
  );
  state.lastFrameMs = Date.now();
}

// ── Brush — single hole traces a wavy path with varying speed (enseñaste) ────

const BRUSH_LIFETIME    = 5.0;   // seconds — total stroke duration
const BRUSH_PEAK_MASS   = 1.5;   // attracting → dark lensed mark drags across
const BRUSH_X_START     = 0.10;
const BRUSH_X_END       = 0.90;
const BRUSH_Y_AMP       = 0.28;  // vertical wave amplitude
const BRUSH_WAVES       = 3;     // number of full sine waves across path
const BRUSH_SPEED_FREQ  = 1.2;   // Hz — speed variation rate
const BRUSH_SPEED_DEPTH = 0.45;  // < 1 keeps dwarp/dt > 0 (no backtrack)
const BRUSH_FADE_TAIL   = 0.8;   // seconds at end where mass fades to zero

function smoothstep01(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Enseñaste — a brushstroke. One scripted hole drags across the canvas along
 *  a sine-weave path with continuously varying speed (rápido y lento todo el
 *  tiempo). Mass rises fast, holds, fades in the last ~0.8 s before splice. */
export function triggerBrush(state: BlackHoleState): void {
  state.holes = state.holes.filter((h) => h.scripted !== "brush");
  if (state.holes.length + 1 > MAX_BH) {
    const overflow = state.holes.length + 1 - MAX_BH;
    let removed = 0;
    state.holes = state.holes.filter((h) => {
      if (removed < overflow && !h.scripted) { removed++; return false; }
      return true;
    });
  }

  const massCurve = (t: number): number => {
    const rise = 1 - Math.exp(-9 * t);
    const fade = 1 - smoothstep01(BRUSH_LIFETIME - BRUSH_FADE_TAIL, BRUSH_LIFETIME, t);
    return BRUSH_PEAK_MASS * rise * fade;
  };

  // warpedT(t) = t + (DEPTH / (2π·f)) sin(2π·f·t)
  // dwarp/dt = 1 + DEPTH · cos(...) ∈ [1−DEPTH, 1+DEPTH] — always positive.
  const warpedTime = (t: number) =>
    t + (BRUSH_SPEED_DEPTH / (2 * Math.PI * BRUSH_SPEED_FREQ))
        * Math.sin(2 * Math.PI * BRUSH_SPEED_FREQ * t);

  const pos = (t: number, h: BlackHole) => {
    const s = Math.min(1, Math.max(0, warpedTime(t) / BRUSH_LIFETIME));
    h.x = BRUSH_X_START + (BRUSH_X_END - BRUSH_X_START) * s;
    h.y = 0.5 + BRUSH_Y_AMP * Math.sin(s * BRUSH_WAVES * 2 * Math.PI);
  };

  state.holes.push({
    x: BRUSH_X_START, y: 0.5, vx: 0, vy: 0, mass: 0, phase: 0,
    scripted: "brush", scriptedElapsed: 0, scriptedLifetime: BRUSH_LIFETIME,
    scriptedMass: massCurve, scriptedPos: pos,
  });
  state.lastFrameMs = Date.now();
}

export function hasScriptedBrush(state: BlackHoleState): boolean {
  return state.holes.some((h) => h.scripted === "brush");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Default pair — perpendicular initial velocities create orbital motion when attracting.
 *  Phases [0, 0.3π]: both start with same sign (attracting) and spend ~70% of the
 *  14-second cycle attracting, with two short repulsion bursts per cycle. */
function defaultPair(): BlackHole[] {
  return [
    { x: 0.30, y: 0.48, vx:  0.02, vy: -0.10, mass:  1, phase: 0 },
    { x: 0.70, y: 0.52, vx: -0.02, vy:  0.10, mass:  1, phase: Math.PI * 0.3 },
  ];
}
