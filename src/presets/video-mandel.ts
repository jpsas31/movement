// video-mandel — Sobel edge detection on a live video frame, rendered with
// the organic-mandel cyclic palette (purple→navy→green→gold→red).
//
// How it works: VideoFrameInjector writes the current video frame into both of
// butterchurn's ping-pong feedback textures before each render() call. Because
// butterchurn swaps them at the start of render(), the video lands in
// sampler_pc_main → passes through the (empty) warp stage → arrives in
// sampler_main. The comp shader here runs a 3×3 Sobel kernel on sampler_main
// (full render resolution, proper texsize.zw pixel steps) and maps edge
// magnitude through the cyclic palette.
//
// We do NOT inject into sampler_noise_lq — that would corrupt presets like
// organic-mandel that rely on it for fractal computation.

import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";

export const VIDEO_MANDEL_PRESET_KEY = "video-mandel";
export const VIDEO_MANDEL_PRESET_KEY_SORTED = "  video-mandel";

// Palette colors — same 5-stop cycle as organic-mandel.
const PAL1 = "vec3(0.396, 0.012, 0.651)"; // purple
const PAL2 = "vec3(0.039, 0.035, 0.149)"; // dark navy
const PAL3 = "vec3(0.024, 0.451, 0.008)"; // green
const PAL4 = "vec3(0.651, 0.490, 0.012)"; // gold
const PAL5 = "vec3(0.651, 0.012, 0.012)"; // red

// Comp shader: Sobel on sampler_main (video via feedback injection) + cyclic palette.
// texsize.zw = vec2(1/width, 1/height) — exact 1-pixel steps at render resolution.
const VIDEO_MANDEL_COMP = `
 shader_body {
  // === 3×3 Sobel on video frame (arrives via ping-pong feedback → sampler_main) ===
  float px = texsize.z;
  float py = texsize.w;
  vec3 lum3 = vec3(0.299, 0.587, 0.114);

  float tl = dot(texture(sampler_main, uv + vec2(-px,  py)).xyz, lum3);
  float tm = dot(texture(sampler_main, uv + vec2( 0.0, py)).xyz, lum3);
  float tr = dot(texture(sampler_main, uv + vec2( px,  py)).xyz, lum3);
  float ml = dot(texture(sampler_main, uv + vec2(-px,  0.0)).xyz, lum3);
  float mr = dot(texture(sampler_main, uv + vec2( px,  0.0)).xyz, lum3);
  float bl = dot(texture(sampler_main, uv + vec2(-px, -py)).xyz, lum3);
  float bm = dot(texture(sampler_main, uv + vec2( 0.0,-py)).xyz, lum3);
  float br = dot(texture(sampler_main, uv + vec2( px, -py)).xyz, lum3);

  float gx = (-tl - 2.0*ml - bl) + (tr + 2.0*mr + br);
  float gy =  (tl + 2.0*tm + tr) - (bl + 2.0*bm + br);
  float edge = clamp(sqrt(gx*gx + gy*gy) * 4.0, 0.0, 1.0);

  // === Cyclic palette mapped to edge magnitude + time ===
  vec3 pal1 = ${PAL1};
  vec3 pal2 = ${PAL2};
  vec3 pal3 = ${PAL3};
  vec3 pal4 = ${PAL4};
  vec3 pal5 = ${PAL5};

  float pt = fract(time * 0.12 + edge * 0.4);
  vec3 palColor = mix(pal1, pal2, smoothstep(0.0, 0.2, pt));
  palColor = mix(palColor, pal3, smoothstep(0.2, 0.4, pt));
  palColor = mix(palColor, pal4, smoothstep(0.4, 0.6, pt));
  palColor = mix(palColor, pal5, smoothstep(0.6, 0.8, pt));
  palColor = mix(palColor, pal1, smoothstep(0.8, 1.0, pt));

  // Phase-shifted palette for edge glow highlight (same pattern, offset by 0.5)
  float pt2 = fract(pt + 0.5);
  vec3 edgePal = mix(pal1, pal2, smoothstep(0.0, 0.2, pt2));
  edgePal = mix(edgePal, pal3, smoothstep(0.2, 0.4, pt2));
  edgePal = mix(edgePal, pal4, smoothstep(0.4, 0.6, pt2));
  edgePal = mix(edgePal, pal5, smoothstep(0.6, 0.8, pt2));
  edgePal = mix(edgePal, pal1, smoothstep(0.8, 1.0, pt2));

  // === Composite ===
  float edgeMask = smoothstep(0.08, 0.55, edge);
  // Dark base, bright palette-colored edges
  vec3 edgeColor = mix(pal2 * 0.05, edgePal * 2.5, edgeMask);

  ret = clamp(edgeColor, 0.0, 1.0);
 }
`;

export function createVideoMandel(_tier: VizIntensity): PresetWithBase {
  return {
    version: 2,
    baseVals: {
      rating: 5,
      // Low decay: previous frame fades fast so edges stay crisp and video-driven.
      decay: 0.55,
      warp: 0,
      zoom: 1.0,
      wave_a: 0,
      ob_size: 0,
      ib_size: 0,
      mv_a: 0,
    },
    init_eqs_str: "",
    frame_eqs_str: "",
    pixel_eqs_str: "",
    warp: "",
    comp: VIDEO_MANDEL_COMP,
    shapes: [
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    ],
    waves: [
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
      { baseVals: { enabled: 0 }, init_eqs_str: "", frame_eqs_str: "" },
    ],
  };
}
