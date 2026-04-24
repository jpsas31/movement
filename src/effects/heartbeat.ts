/**
 * Heartbeat effect state — fires periodic lub-dub pulse pairs.
 *
 * Each "beat" is a {t0, amplitude} record. Two beats per heartbeat cycle:
 * the "lub" (full amplitude) and the "dub" 150 ms later (65% amplitude).
 * State is consumed by getHeartbeatBeats() → passed as shader uniforms.
 */

const BEAT_DURATION_MS = 1100;  // ms until a beat fully decays (cleanup threshold)
const DUB_DELAY_MS = 150;       // ms between lub and dub
const DUB_AMP = 0.65;           // dub is weaker than lub
const MAX_BEATS = 8;            // max concurrent beats (4 heartbeats × 2)

/** Wall-clock BPM interval in ms (~70 BPM). */
export const HEARTBEAT_INTERVAL_MS = 860;

export type Beat = { t0: number; amplitude: number };
export type HeartbeatState = {
  beats: Beat[];
  /** Scratch buffers reused each frame to hand shader uniforms back to
   *  PostProcessChain without allocating. Length = MAX_BEATS. */
  agesScratch: Float32Array;
  ampsScratch: Float32Array;
};

export function createHeartbeatState(): HeartbeatState {
  return {
    beats: [],
    agesScratch: new Float32Array(MAX_BEATS),
    ampsScratch: new Float32Array(MAX_BEATS),
  };
}

/** Fire one lub-dub pair. The dub is pushed immediately; its t0 is in the future. */
export function triggerHeartbeat(state: HeartbeatState): void {
  const now = Date.now();
  state.beats.push({ t0: now, amplitude: 1.0 });
  state.beats.push({ t0: now + DUB_DELAY_MS, amplitude: DUB_AMP });
  // Evict oldest if over cap
  if (state.beats.length > MAX_BEATS) {
    state.beats.splice(0, state.beats.length - MAX_BEATS);
  }
}

/** Te amo — single strong zoom burst (no dub). Amplitude ~3.5 = zoom factor ~1.4 for ~1s. */
export function triggerLoveBurst(state: HeartbeatState): void {
  state.beats.push({ t0: Date.now(), amplitude: 3.5 });
  if (state.beats.length > MAX_BEATS) {
    state.beats.splice(0, state.beats.length - MAX_BEATS);
  }
}

/** Remove fully-decayed beats. Call once per frame. In-place so no per-frame
 *  allocation when nothing expired. */
export function cleanExpiredBeats(state: HeartbeatState): void {
  const now = Date.now();
  const src = state.beats;
  let w = 0;
  for (let r = 0; r < src.length; r++) {
    if (now - src[r].t0 < BEAT_DURATION_MS) {
      if (w !== r) src[w] = src[r];
      w++;
    }
  }
  if (w !== src.length) src.length = w;
}

/** Fill scratch buffers with current ages/amps and return them.
 *  Always length MAX_BEATS; inactive slots = age -1, amp 0. */
export function getHeartbeatBeats(state: HeartbeatState): {
  ages: Float32Array;
  amps: Float32Array;
} {
  const now = Date.now();
  const ages = state.agesScratch;
  const amps = state.ampsScratch;
  const n = Math.min(state.beats.length, MAX_BEATS);
  for (let i = 0; i < n; i++) {
    const b = state.beats[i];
    ages[i] = (now - b.t0) / 1000;
    amps[i] = b.amplitude;
  }
  for (let i = n; i < MAX_BEATS; i++) {
    ages[i] = -1;
    amps[i] = 0;
  }
  return { ages, amps };
}
