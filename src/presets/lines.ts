// Custom preset: drifting horizontal lines, thickness and position driven by audio.
// Butterchurn equations use JavaScript syntax with an "a." namespace prefix.
//
// Intensity (Y): adjust `createLinesPreset` / LINES_TIER_* to taste; register in custom-registry.ts.

import type { VizIntensity } from "../viz-intensity";

export const LINES_PRESET_CANONICAL_ID = "lines";

/** Key in main / debug preset map (leading spaces keep it near top when sorted). */
export const LINES_PRESET_KEY_SORTED = "  lines";

const linesPreset = {
  version: 2,
  baseVals: {
    decay: 0.4,
    gammaadj: 2.0,
    zoom: 1.0,
    rot: 0,
    warp: 0,
    dx: 0,
    dy: 0,
    wave_a: 0,
  },
  init_eqs_str: "",
  frame_eqs_str: "",
  pixel_eqs_str: "",
  warp: "",
  comp: "",
  waves: [
    {
      baseVals: {
        enabled: 1,
        additive: 1,
        usedots: 0,
        thick: 1,
        samples: 512,
        smoothing: 0.3,
      },
      init_eqs_str: "a.t1=0.2; a.t2=0.003;",
      frame_eqs_str:
        "a.t1=0.15+Math.sin(a.time*0.13)*0.1; a.t2=0.003+a.bass*0.025; a.r=1.0; a.g=0.1+a.bass*0.4; a.b=0.1; a.a=0.4+a.bass*1.2;",
      point_eqs_str:
        "a.x=a.sample; a.y=a.t1+Math.sin(a.sample*18.8496)*a.t2;",
    },
    {
      baseVals: {
        enabled: 1,
        additive: 1,
        usedots: 0,
        thick: 1,
        samples: 512,
        smoothing: 0.3,
      },
      init_eqs_str: "a.t1=0.45; a.t2=0.003;",
      frame_eqs_str:
        "a.t1=0.45+Math.sin(a.time*0.17+1.57)*0.15; a.t2=0.003+a.mid*0.025; a.r=0.1; a.g=0.3+a.mid*0.5; a.b=1.0; a.a=0.4+a.mid*1.2;",
      point_eqs_str:
        "a.x=a.sample; a.y=a.t1+Math.sin(a.sample*31.4159)*a.t2;",
    },
    {
      baseVals: {
        enabled: 1,
        additive: 1,
        usedots: 0,
        thick: 1,
        samples: 512,
        smoothing: 0.3,
      },
      init_eqs_str: "a.t1=0.7; a.t2=0.002;",
      frame_eqs_str:
        "a.t1=0.7+Math.sin(a.time*0.11+3.14)*0.12; a.t2=0.002+a.treb*0.02; a.r=0.1+a.treb*0.4; a.g=1.0; a.b=0.2; a.a=0.3+a.treb*1.5;",
      point_eqs_str:
        "a.x=a.sample; a.y=a.t1+Math.sin(a.sample*43.9823)*a.t2;",
    },
    {
      baseVals: {
        enabled: 1,
        additive: 1,
        usedots: 0,
        thick: 1,
        samples: 512,
        smoothing: 0.5,
      },
      init_eqs_str: "a.t1=0.5; a.t2=0.002;",
      frame_eqs_str:
        "a.t1=0.5+Math.sin(a.time*0.07+0.8)*0.3; a.t2=0.002+a.bass_att*0.03; a.r=0.6+a.bass*0.3; a.g=0.1; a.b=0.8+a.treb*0.2; a.a=0.2+a.bass_att*1.0;",
      point_eqs_str:
        "a.x=a.sample; a.y=a.t1+Math.sin(a.sample*12.5664)*a.t2;",
    },
  ],
  shapes: [
    { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
  ],
};

/** Per-tier audio coupling for waves (tweak for this preset only). */
const LINES_AUDIO_COUPLE: Record<VizIntensity, number> = {
  mild: 0.72,
  normal: 1,
  hot: 1.38,
};

export function createLinesPreset(tier: VizIntensity): object {
  const m = LINES_AUDIO_COUPLE[tier];
  if (m === 1) return { ...linesPreset, waves: [...linesPreset.waves] };

  const scaleBass = (s: string) =>
    s
      .replace(/a\.bass\*([\d.]+)/g, (_, n) => `a.bass*${(Number(n) * m).toFixed(4)}`)
      .replace(/a\.bass_att\*([\d.]+)/g, (_, n) =>
        `a.bass_att*${(Number(n) * m).toFixed(4)}`,
      )
      .replace(/a\.mid\*([\d.]+)/g, (_, n) => `a.mid*${(Number(n) * m).toFixed(4)}`)
      .replace(/a\.treb\*([\d.]+)/g, (_, n) => `a.treb*${(Number(n) * m).toFixed(4)}`);

  return {
    ...linesPreset,
    waves: linesPreset.waves.map((w) => ({
      ...w,
      frame_eqs_str: scaleBass(w.frame_eqs_str),
    })),
  };
}

export default linesPreset;
