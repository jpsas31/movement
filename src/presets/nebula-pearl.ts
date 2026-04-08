// nebula-pearl (v12 — parameterized aggression)
//
// Visual: a pulsing circular shape surrounded by flowing nebula distortion trails.
// Audio energy (bass/treb/mid) drives the pulse amplitude; the shape expands and
// contracts in sync with transients. Two compiled shaders handle the trail effect:
// warp creates directional flow distortion; comp tints the output with slowly-drifting
// RGB registers (q10–q12) for organic color evolution.
//
// Lineage: Magellan's Nebula warp + Mother-of-Pearl comp + custom shape/frame equations.
// Intensity (Y): all motion and color responsiveness scales per-tier via TIERS.

import type { PresetWithBase } from "../preset-variants";
import {
  nextVizIntensity,
  type VizIntensity,
  VIZ_INTENSITY_ORDER,
} from "../viz-intensity";

export type NebulaAggression = VizIntensity;
export const NEBULA_AGGRESSION_ORDER = VIZ_INTENSITY_ORDER;
export const nextNebulaAggression = nextVizIntensity;

/** Key in main.ts preset map (leading spaces keep it near top when sorted). */
export const NEBULA_PEARL_PRESET_KEY_SORTED = "  nebula-pearl";

/** Key in debug / butterchurn-presets-style maps. */
export const NEBULA_PEARL_PRESET_KEY = "nebula-pearl";

export function isNebulaPearlPresetKey(mapKey: string): boolean {
  return mapKey.trim() === NEBULA_PEARL_PRESET_KEY;
}

type Tier = {
  /** Multiplier on the bass power expression — higher = more reactive to audio hits. */
  q1Scale: number;
  /** Exponent in the audio power curve — higher = more dramatic spikes on loud transients. */
  powExp: number;
  /** Decay weight for q15 smoother — higher = slower, more sustained energy. */
  q15A: number;
  /** Fresh-value weight for q15 smoother — higher = snappier immediate response. */
  q15B: number;
  /** Motion vector amplitude scale — higher = faster warp trail movement. */
  mvMul: number;
  /** Shape radial size multiplier — higher = larger pulsing circle. */
  radMul: number;
  /** Per-frame zoom delta — positive zooms in toward center each frame. */
  zoom: number;
  /** Per-frame rotation delta — scales with q1 so louder audio spins faster. */
  rot: number;
  /** Bass channel pulse depth on the wave overlay (red). */
  waveR: number;
  /** Bass channel pulse depth on the wave overlay (blue). */
  waveB: number;
  /** Mid channel pulse depth on the wave overlay (green). */
  waveG: number;
  /** Waveform oscillation smoothing (0–1) — higher = smoother wave display. */
  waveSmooth: number;
  /** Decay weight for color registers q10/q11/q12 — higher = slower color shift. */
  qColA: number;
  /** Fresh-value weight for color registers — higher = faster color response. */
  qColB: number;
};

const TIERS: Record<VizIntensity, Tier> = {
  mild: {
    q1Scale: 0.00017,
    powExp: 4,
    q15A: 0.88,
    q15B: 0.12,
    mvMul: 0.7,
    radMul: 0.62,
    zoom: 0.0055,
    rot: 0.01,
    waveR: 0.18,
    waveB: 0.18,
    waveG: 0.32,
    waveSmooth: 0.96,
    qColA: 0.84,
    qColB: 0.16,
  },
  normal: {
    q1Scale: 0.00028,
    powExp: 5,
    q15A: 0.81,
    q15B: 0.19,
    mvMul: 0.88,
    radMul: 0.82,
    zoom: 0.0084,
    rot: 0.016,
    waveR: 0.26,
    waveB: 0.26,
    waveG: 0.42,
    waveSmooth: 0.93,
    qColA: 0.78,
    qColB: 0.22,
  },
  hot: {
    q1Scale: 0.00042,
    powExp: 6,
    q15A: 0.72,
    q15B: 0.28,
    mvMul: 1.0,
    radMul: 0.96,
    zoom: 0.012,
    rot: 0.024,
    waveR: 0.35,
    waveB: 0.35,
    waveG: 0.5,
    waveSmooth: 0.87,
    qColA: 0.72,
    qColB: 0.28,
  },
};

// Warp shader (compiled from Magellan's Nebula source):
// Samples blur buffers in two perpendicular directions to build a gradient field,
// then displaces UV coordinates along that field — creates the flowing nebula trails.
const WARP =
  " shader_body { \n  vec2 my_uv_1;\n  vec3 ret_2;\n  vec3 tmpvar_3;\n  tmpvar_3 = ((640.0 * texsize.z) * ((2.0 * \n    ((texture (sampler_blur2, (uv + vec2(0.01, 0.0))).xyz * scale2) + bias2)\n  ) - (2.0 * \n    ((texture (sampler_blur2, (uv - vec2(0.01, 0.0))).xyz * scale2) + bias2)\n  )));\n  vec3 tmpvar_4;\n  tmpvar_4 = ((512.0 * texsize.w) * ((2.0 * \n    ((texture (sampler_blur2, (uv + vec2(0.0, 0.01))).xyz * scale2) + bias2)\n  ) - (2.0 * \n    ((texture (sampler_blur2, (uv - vec2(0.0, 0.01))).xyz * scale2) + bias2)\n  )));\n  vec2 tmpvar_5;\n  tmpvar_5.x = tmpvar_3.y;\n  tmpvar_5.y = tmpvar_4.y;\n  vec2 tmpvar_6;\n  tmpvar_6.x = tmpvar_3.x;\n  tmpvar_6.y = tmpvar_4.x;\n  vec2 tmpvar_7;\n  tmpvar_7.x = tmpvar_4.y;\n  tmpvar_7.y = -(tmpvar_3.y);\n  vec2 tmpvar_8;\n  tmpvar_8 = (uv - ((\n    ((tmpvar_5 * 0.3) + (tmpvar_6 * 0.1))\n   + \n    (tmpvar_7 * 0.01)\n  ) * 0.01));\n  ret_2.x = texture (sampler_fw_main, (tmpvar_8 - floor(tmpvar_8))).x;\n  ret_2.x = (ret_2.x + ((\n    (2.0 * ret_2.x)\n   - \n    (2.0 * ((texture (sampler_blur1, tmpvar_8).xyz * scale1) + bias1).x)\n  ) * 0.25));\n  vec2 tmpvar_9;\n  tmpvar_9.x = tmpvar_3.y;\n  tmpvar_9.y = tmpvar_4.y;\n  vec2 tmpvar_10;\n  tmpvar_10.x = tmpvar_4.x;\n  tmpvar_10.y = -(tmpvar_3.y);\n  my_uv_1 = ((uv - (tmpvar_9 * 0.01)) + (tmpvar_10 * 0.001));\n  ret_2.y = texture (sampler_fw_main, (my_uv_1 - floor(my_uv_1))).y;\n  ret_2.y = (ret_2.y + ((\n    ((2.0 * ret_2.y) - (2.0 * ((texture (sampler_blur3, my_uv_1).xyz * scale3) + bias3).y))\n   * 0.025) + 0.01));\n  vec4 tmpvar_11;\n  tmpvar_11.w = 1.0;\n  tmpvar_11.xyz = ret_2;\n  ret = tmpvar_11.xyz;\n }";

// Comp shader (compiled from Mother-of-Pearl source):
// Reads edge structure via blur-buffer gradients, applies inverse-square distance
// falloff and structural tinting, then multiplies by color registers q10/q11/q12
// for the audio-reactive RGB color bloom.
const COMP =
  "vec2 xlat_mutablefactorA;\n shader_body { \n  vec2 uv_1;\n  vec2 dz_2;\n  vec3 dy_3;\n  vec3 dx_4;\n  vec2 d_5;\n  vec3 ret_6;\n  xlat_mutablefactorA = (uv - vec2(0.5, 0.5));\n  vec2 tmpvar_7;\n  tmpvar_7.x = -((xlat_mutablefactorA.y * -1024.0));\n  tmpvar_7.y = (xlat_mutablefactorA.x * -1024.0);\n  vec2 tmpvar_8;\n  tmpvar_8.x = tmpvar_7.x;\n  tmpvar_8.y = -(tmpvar_7.y);\n  uv_1 = (vec2(-100.0, 100.0) * (tmpvar_8 / (\n    (tmpvar_7.x * tmpvar_7.x)\n   + \n    (tmpvar_7.y * tmpvar_7.y)\n  )).yx);\n  uv_1 = (0.5 + ((\n    (1.0 - abs(((\n      fract((mix ((0.5 + \n        (((0.5 + (\n          (uv - 0.5)\n         * vec2(1.1, 0.81))) - 0.5) * 2.0)\n      ), (uv_1 + 0.5), vec2(0.5, 0.5)) * 0.5))\n     * 2.0) - 1.0)))\n   - 0.5) * 0.98));\n  vec2 tmpvar_9;\n  vec2 tmpvar_10;\n  tmpvar_10 = (vec2(1.0, 0.0) * texsize.zw);\n  tmpvar_9.x = (texture (sampler_main, (uv_1 + tmpvar_10)).xyz - texture (sampler_main, (uv_1 - tmpvar_10)).xyz).y;\n  vec2 tmpvar_11;\n  tmpvar_11 = (vec2(0.0, 1.0) * texsize.zw);\n  tmpvar_9.y = (texture (sampler_main, (uv_1 + tmpvar_11)).xyz - texture (sampler_main, (uv_1 - tmpvar_11)).xyz).y;\n  d_5 = (texsize.zw * 2.0);\n  dx_4 = (((2.0 * \n    ((texture (sampler_blur1, (uv_1 + (vec2(1.0, 0.0) * d_5))).xyz * scale1) + bias1)\n  ) - (2.0 * \n    ((texture (sampler_blur1, (uv_1 - (vec2(1.0, 0.0) * d_5))).xyz * scale1) + bias1)\n  )) * 0.5);\n  dy_3 = (((2.0 * \n    ((texture (sampler_blur1, (uv_1 + (vec2(0.0, 1.0) * d_5))).xyz * scale1) + bias1)\n  ) - (2.0 * \n    ((texture (sampler_blur1, (uv_1 - (vec2(0.0, 1.0) * d_5))).xyz * scale1) + bias1)\n  )) * 0.5);\n  vec2 tmpvar_12;\n  tmpvar_12.x = dx_4.y;\n  tmpvar_12.y = dy_3.y;\n  dz_2 = ((tmpvar_9 * 3.0) + tmpvar_12);\n  vec3 pTint;\n  vec3 pAlt;\n  pTint = min (vec3(1.22), ((vec3(q10, q11, q12) * vec3(1.16, 1.2, 1.14)) + vec3(0.06, 0.055, 0.065)));\n  pAlt = min (vec3(1.2), ((vec3(q12, q11, q10) * vec3(1.14, 1.16, 1.18)) + vec3(0.052, 0.06, 0.048)));\n  ret_6 = ((0.88 * vec3((\n    pow ((sqrt(dot (dz_2, dz_2)) * 0.78), 0.72)\n   + \n    (((texture (sampler_blur2, uv_1).xyz * scale2) + bias2).y * 0.38)\n  ) - 0.055)) * pTint);\n  vec2 tmpvar_13;\n  tmpvar_13.x = dx_4.x;\n  tmpvar_13.y = dy_3.x;\n  vec3 tmpvar_14;\n  vec3 hiW;\n  hiW = clamp(vec3((texture (sampler_main, \n    (uv_1 + ((tmpvar_13 * texsize.zw) * 18.0))\n  ).x * 2.65)), 0.0, 0.45);\n  tmpvar_14 = mix (ret_6, pAlt, hiW);\n  ret_6 = tmpvar_14;\n  vec4 tmpvar_15;\n  tmpvar_15.w = 1.0;\n  tmpvar_15.xyz = tmpvar_14;\n  ret = tmpvar_15.xyz;\n }";

export function createNebulaPearl(aggression: VizIntensity): PresetWithBase {
  const t = TIERS[aggression];
  const q1s = t.q1Scale.toFixed(5);
  const pe = String(t.powExp);
  const q15a = t.q15A.toFixed(2);
  const q15b = t.q15B.toFixed(2);
  const mv = t.mvMul.toFixed(2);
  const rad = t.radMul.toFixed(2);
  const zm = t.zoom.toFixed(4);
  const rt = t.rot.toFixed(4);
  const wr = t.waveR.toFixed(2);
  const wb = t.waveB.toFixed(2);
  const wg = t.waveG.toFixed(2);
  const qca = t.qColA.toFixed(2);
  const qcb = t.qColB.toFixed(2);

  // Audio reactivity: bass/treb/mid combined into q1 (main energy register);
  // q15 exponentially smooths q1 frame-to-frame to avoid flicker.
  const AUDIO_REACTIVITY_EQS = [
    `a.q1=${q1s}*pow(1+1.02*a.bass+0.36*a.bass_att+.09*a.treb+.09*a.treb_att+.1*a.mid+.1*a.mid_att,${pe});`,
    `a.q15=${q15a}*a.q15+${q15b}*a.q1;a.q1=a.q15;`,
  ].join("");

  // Motion: motion vector magnitude and oscillating XY position driven by q1;
  // RGB motion vector channels oscillate independently for organic movement.
  const MOTION_EQS = [
    `a.mv_a=a.q1*${mv};`,
    "a.mv_x+=Math.sin(a.time);",
    "a.mv_y+=Math.cos(a.time);",
    "a.mv_dx+=1.25*Math.sin(8*a.fps);",
    "a.mv_dy+=1.35*Math.sin(8*a.fps);",
    "a.mv_r+=Math.sin(.565*a.time);",
    "a.mv_g+=Math.sin(.615*a.time);",
    "a.mv_b+=Math.sin(.665*a.time);",
  ].join("");

  // Volume: combined RMS drives wave overlay color pulses on transients.
  const VOLUME_EQS = [
    "a.vol=.25*(a.bass+a.mid+a.treb);a.vol*=a.vol;",
    `a.wave_r+=${wr}*Math.sin(42*a.vol);`,
    `a.wave_b+=${wb}*Math.sin(17*a.vol);`,
    `a.wave_g+=${wg}*Math.sin(30*a.vol);`,
  ].join("");

  // Color oscillators: slow-drifting independent RGB channels (wr/wb/wg) feed
  // q10/q11/q12, which the comp shader uses for the audio-reactive color bloom.
  const COLOR_OSCILLATOR_EQS = [
    "a.wr=.5+.42*(.6*Math.sin(1.1*a.time)+.4*Math.sin(.8*a.time));",
    "a.wb=.5+.42*(.6*Math.sin(1.6*a.time)+.4*Math.sin(.5*a.time));",
    "a.wg=.5+.42*(.6*Math.sin(1.34*a.time)+.4*Math.sin(.4*a.time));",
    `a.q10=${qca}*a.q10+${qcb}*a.wr;`,
    `a.q11=${qca}*a.q11+${qcb}*a.wb;`,
    `a.q12=${qca}*a.q12+${qcb}*a.wg;`,
    "a.q10=Math.min(1,a.q10*1.12+0.05);",
    "a.q11=Math.min(1,a.q11*1.12+0.05);",
    "a.q12=Math.min(1,a.q12*1.12+0.05);",
    "a.warp=0;",
  ].join("");

  const frame_eqs_str = AUDIO_REACTIVITY_EQS + MOTION_EQS + VOLUME_EQS + COLOR_OSCILLATOR_EQS;

  const shape0_frame =
    "a.r+=Math.sin(.339*a.time);a.g+=Math.sin(.369*a.time);a.b+=Math.sin(.399*a.time);" +
    "a.r2+=Math.sin(.113*a.time);a.g2+=Math.sin(.123*a.time);a.b2+=Math.sin(.133*a.time);" +
    `a.rad=div(a.q1*${rad},3);`;

  const pixel_eqs_str = `a.zoom+=${zm}*a.q1;a.rot+=${rt}*Math.sin(10*a.fps)*a.q1;a.warp=0;`;

  return {
    version: 2,
    baseVals: {
      gammaadj: 1.14,
      decay: 1,
      echo_zoom: 1.75,
      echo_alpha: 0.15,
      echo_orient: 3,
      wave_mode: 1,
      wave_dots: 1,
      darken: 1,
      wave_scale: 0.5,
      wave_smoothing: t.waveSmooth,
      warp: 0.008,
      mv_l: 5,
    },
    shapes: [
      {
        baseVals: { enabled: 1, sides: 100, border_a: 0 },
        init_eqs_str: "a.q1=0;",
        frame_eqs_str: shape0_frame,
      },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    ],
    waves: [
      { baseVals: { enabled: 0 } },
      { baseVals: { enabled: 0 } },
      { baseVals: { enabled: 0 } },
      { baseVals: { enabled: 0 } },
    ],
    init_eqs_str:
      "a.q1=0;a.q15=0;a.q10=0.5;a.q11=0.5;a.q12=0.5;a.wr=0.5;a.wb=0.5;a.wg=0.5;a.vol=0;",
    frame_eqs_str,
    pixel_eqs_str,
    warp: WARP,
    comp: COMP,
  };
}

export default createNebulaPearl("normal");
