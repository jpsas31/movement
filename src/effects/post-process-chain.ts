/**
 * PostProcessChain — ripple → spiral → heartbeat → blackhole → sea → output.
 *
 * Problem solved
 * ──────────────
 * Each separate WebGL canvas feeding the next via texImage2D(canvas) causes a
 * cross-context GPU→CPU readback (PWebGL::Msg_ReadPixels) that stalls the GPU
 * pipeline. Four separate canvases = four stalls per frame ≈ 50–80 ms wasted.
 *
 * Solution
 * ────────
 * One WebGL1 context owns two ping-pong FBOs and the output canvas at viewport
 * resolution (1×). Final pass is a simple blit — no overscan, no CSS transform.
 *
 *   butterchurn (WebGL2 ctx)
 *     ↓  texImage2D — ONE cross-context readback
 *   this context:
 *     srcTex → [ripple] → [spiral+zoom] → [heartbeat] → [blackhole] → [sea] → [output → canvas]
 */

const CHAIN_CANVAS_ID = "movement-postprocess-chain";

const HEARTBEAT_MAX   = 8;
const HEARTBEAT_SCALE = 0.13;
export const BH_MAX   = 4; // must match MAX_BH in blackhole.ts

// ─── Shared vertex shader ────────────────────────────────────────────────────
const VS = /* glsl */ `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

// ─── Ripple ──────────────────────────────────────────────────────────────────
const FS_RIPPLE = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uAges[4];
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 toPixel = uv - vec2(0.5);
    float dist = length(toPixel);

    if (dist > 0.0005) {
      vec2 dir = toPixel / dist;
      float totalAmp = 0.0;
      for (int i = 0; i < 4; i++) {
        float age = uAges[i];
        if (age < 0.0 || age > 2.0) continue;
        float ringRadius = age * 0.38;
        float ringDist   = dist - ringRadius;
        float envelope   = max(0.0, 1.0 - age * 0.5);
        float profile    = cos(ringDist * 22.0) * exp(-ringDist * ringDist * 18.0);
        totalAmp += envelope * 0.045 * profile;
      }
      uv -= dir * totalAmp;
      uv = clamp(uv, 0.0, 1.0);
    }

    gl_FragColor = texture2D(uTex, uv);
  }
`;

// ─── Spiral (twist + optional slow zoom-in) ──────────────────────────────────
// uStrength = twist amount (radians at center, falls off with exp(-dist*3))
// uZoom     = zoom factor (1.0 = none; >1.0 = zoom in via center divide)
const FS_SPIRAL = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uStrength;
  uniform float uZoom;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 center = vec2(0.5);
    vec2 offset = uv - center;
    float dist = length(offset);

    float angle = uStrength * exp(-dist * 3.0);
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 rotated = vec2(
      offset.x * cosA - offset.y * sinA,
      offset.x * sinA + offset.y * cosA
    );
    // Divide by uZoom shrinks UV around center → samples a tighter region → zoom in.
    uv = clamp(center + rotated / uZoom, 0.0, 1.0);

    gl_FragColor = texture2D(uTex, uv);
  }
`;

// ─── Heartbeat ───────────────────────────────────────────────────────────────
const FS_HEARTBEAT = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uAges[${HEARTBEAT_MAX}];
  uniform float uAmps[${HEARTBEAT_MAX}];
  varying vec2 vUv;

  void main() {
    vec2 center = vec2(0.5);
    float totalS = 0.0;

    for (int i = 0; i < ${HEARTBEAT_MAX}; i++) {
      float age = uAges[i];
      float amp = uAmps[i];
      if (age < 0.0 || age > 1.5) continue;
      float pulse = amp * exp(-age * 9.0) * (1.0 - exp(-age * 50.0));
      totalS += pulse;
    }

    // Zoom-in: divide keeps UV strictly inside [0,1] — no corner clamping.
    vec2 uv = center + (vUv - center) / (1.0 + totalS * ${HEARTBEAT_SCALE.toFixed(4)});
    gl_FragColor = texture2D(uTex, uv);
  }
`;

// ─── Black hole ──────────────────────────────────────────────────────────────
// Pure gravitational lensing — no color overlay.
// mass > 0 → UV pulled toward hole; mass < 0 → UV pushed away.
// mass oscillates via sine in JS, so each hole continuously cycles attract↔repel.
// mass ≈ 0 at transition: active=step(0.0001,|mass|) fades lensing smoothly to zero.
const FS_BLACKHOLE = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec2  uBHPos[${BH_MAX}];
  uniform float uBHMass[${BH_MAX}];
  varying vec2 vUv;

  const float LENS = 0.006;

  void main() {
    vec2  uv       = vUv;
    float darkness = 0.0;
    float rimLight = 0.0;

    for (int i = 0; i < ${BH_MAX}; i++) {
      float mass   = uBHMass[i];
      float active = step(0.0001, abs(mass));
      vec2  d = uv - uBHPos[i];
      float r = length(d) + 1e-5;
      uv -= (d / r) * (mass * LENS / (r * r + 0.001)) * active;

      // Dark disc + thin bright rim to make the edge visible.
      float ro    = length(vUv - uBHPos[i]) + 1e-5;
      float halo  = smoothstep(0.020, 0.008, ro) * active;
      float rdiff = ro - 0.020;
      float rim   = exp(-(rdiff * rdiff) / 0.000009) * active;
      darkness    = max(darkness, halo);
      rimLight    = max(rimLight,  rim);
    }

    vec4 base = texture2D(uTex, clamp(uv, 0.0, 1.0));
    vec3 col  = base.rgb * (1.0 - darkness * 0.90);
    col = mix(col, vec3(0.85), rimLight * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Sea (Amor) ──────────────────────────────────────────────────────────────
// Realistic ocean: 4 Gerstner waves (trochoidal — sharp crests, flat troughs) +
// dual-octave FBM foam scrolling in opposite directions + non-linear time warp
// so waves surge forward and pause (va y viene). Butterchurn content acts as a
// submerged bed tinted by a deep→shallow gradient.
//
// References (researched):
//   • Gerstner waves (Jay Nakum, Catlike Coding, 80.lv) — trochoidal parametric
//     waves, steepness Q ∈ [0.15, 0.30] gives ocean-like crest sharpness.
//   • FBM (Book of Shaders) — 4 octaves of value noise, gain 0.5 per octave.
//   • Dual-direction octaves kill the sine-grid uniformity: one octave drifts
//     NE, one drifts SW, at different speeds.
const FS_SEA = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;

  float hash12(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p  = p * 2.03 + vec2(17.3, -11.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Non-linear time — surge then pause, shore rhythm.
    float t     = uTime;
    float tSurge = t + 0.55 * sin(t * 0.22);

    // Perspective: 1 at shore (bottom), 0 at horizon (top).
    float near = pow(1.0 - vUv.y, 1.6);

    // Horizontal offset curves crest lines — kills straight-band symmetry.
    float curve  = sin(vUv.x * 2.3 + t * 0.30) * 0.50
                 + sin(vUv.x * 5.1 - t * 0.45) * 0.18
                 + sin(vUv.x * 11.0 + t * 0.70) * 0.06;

    // Dominant wave phase: 5 big waves stacked vertically, travelling toward shore.
    float phase1 = vUv.y * 5.0  - tSurge * 0.90 + curve;
    // Secondary chop — different freq + direction + speed.
    float phase2 = vUv.y * 11.0 + vUv.x * 1.8 - t * 1.40 + curve * 0.4;

    float h1 = sin(phase1);   // [-1, 1]
    float h2 = sin(phase2);

    // ── Bands ────────────────────────────────────────────────────────────────
    // Asymmetric peak: power > 1 narrows the crest → sharp top, flat trough.
    float peak1 = pow(h1 * 0.5 + 0.5, 2.2);
    float peak2 = pow(h2 * 0.5 + 0.5, 4.0);
    float crestBand  = smoothstep(0.55, 0.95, peak1);           // broad bright ridge
    float foamBand   = smoothstep(0.80, 1.00, peak1) * near;    // narrow near-crest band (white foam)
    float troughBand = smoothstep(0.0,  -0.70, h1);              // dark trough shadow

    // ── UV refraction (Gerstner-ish horizontal push along crest direction) ──
    float dispY = h1 * 0.022 + h2 * 0.006;
    float dispX = sin(vUv.x * 5.0 + t * 0.6) * 0.010 + h2 * 0.003;
    vec2 uv = vUv + vec2(dispX, dispY) * uAmp * (0.30 + 0.70 * near);

    // ── Foam: FBM, dual opposite drift, gated to foamBand + high noise ──────
    vec2 fuvA = vec2(vUv.x * 6.0 + t * 0.18, vUv.y * 14.0 - t * 0.80);
    vec2 fuvB = vec2(vUv.x * 9.0 - t * 0.24, vUv.y * 18.0 - t * 1.10);
    float foamN = (fbm(fuvA) + fbm(fuvB)) * 0.5;
    float foam  = smoothstep(0.50, 0.90, foamN) * foamBand;
    // Secondary chop foam — sparser, faster, covers mid-screen
    float chopFoam = smoothstep(0.70, 0.95, peak2)
                   * smoothstep(0.55, 0.85, foamN) * near * 0.5;

    // ── Water colour gradient, deep→shallow ─────────────────────────────────
    vec3 deep    = vec3(0.03, 0.14, 0.28);
    vec3 mid     = vec3(0.08, 0.34, 0.48);
    vec3 shallow = vec3(0.22, 0.58, 0.70);
    vec3 water   = mix(mid, shallow, near);
    water        = mix(deep, water, smoothstep(0.0, 0.6, near));

    // ── Composite ───────────────────────────────────────────────────────────
    vec4 base = texture2D(uTex, clamp(uv, 0.0, 1.0));
    // Luminance of the underlying fractal used as sun glint intensity.
    float lum = dot(base.rgb, vec3(0.299, 0.587, 0.114));

    // Heavy water overlay at full amp: 80 % water colour + 20 % modulated luminance
    // → content reads as light through water, not the original fractal.
    vec3 underWater = water + vec3(lum * 0.45) * (0.5 + 0.5 * near);

    // Crest brightening + trough darkening.
    underWater += vec3(0.18, 0.28, 0.32) * crestBand * uAmp;
    underWater *= (1.0 - troughBand * 0.55 * uAmp);

    // Foam white + chop sparkles.
    underWater += vec3(0.95, 0.97, 1.00) * foam     * uAmp;
    underWater += vec3(0.90, 0.95, 1.00) * chopFoam * uAmp;

    // Envelope: at uAmp=0 we return base unchanged.
    vec3 col = mix(base.rgb, underWater, uAmp);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Felicidad (color + brightness wave) ────────────────────────────────────
// Hue rotation of base colours combined with a traveling brightness band.
// Both modulated by envelope amp ∈ [0,1]; amp=0 → pure passthrough.
// Hue rotation uses standard Rodrigues rotation around (1,1,1)/√3.
const FS_FELICIDAD = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;

  vec3 hueShift(vec3 c, float a) {
    const vec3 k = vec3(0.57735);  // 1 / sqrt(3)
    float ca = cos(a);
    float sa = sin(a);
    return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
  }

  void main() {
    vec3 base = texture2D(uTex, vUv).rgb;

    // Hue cycles slowly with a gentle wobble.
    float hueAngle = uTime * 0.45 + sin(uTime * 0.2) * 0.6;
    vec3 hued = hueShift(base, hueAngle * uAmp);

    // Brightness band travels top → bottom (vUv.y=0 bottom, 1 top).
    float wave = sin(vUv.y * 5.0 - uTime * 1.2);
    float bright = 1.0 + 0.45 * wave * uAmp;

    vec3 col = hued * bright;
    gl_FragColor = vec4(mix(base, col, uAmp), 1.0);
  }
`;

// ─── Output blit ─────────────────────────────────────────────────────────────
// Final pass — copies the latest result to the canvas. Always runs.
const FS_OUTPUT = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(uTex, vUv); }
`;

// ─── Types ───────────────────────────────────────────────────────────────────
interface FboBundle {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

// ─── Class ───────────────────────────────────────────────────────────────────
export class PostProcessChain {
  /** Output canvas — √2× screen, CSS-positioned and rotated. z-index:4. */
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;

  private sw = 0;
  private sh = 0;

  private readonly progRipple:     WebGLProgram;
  private readonly progSpiral:     WebGLProgram;
  private readonly progHeartbeat:  WebGLProgram;
  private readonly progBlackhole:  WebGLProgram;
  private readonly progSea:        WebGLProgram;
  private readonly progFelicidad:  WebGLProgram;
  private readonly progOutput:     WebGLProgram;

  /** Butterchurn canvas upload target — sole cross-context readback per frame. */
  private readonly srcTex: WebGLTexture;

  private fboA: FboBundle | null = null; // ping
  private fboB: FboBundle | null = null; // pong

  private readonly uRippleAges:      WebGLUniformLocation;
  private readonly uSpiralStrength:  WebGLUniformLocation;
  private readonly uSpiralZoom:      WebGLUniformLocation;
  private readonly uHeartbeatAges:   WebGLUniformLocation;
  private readonly uHeartbeatAmps:   WebGLUniformLocation;
  private readonly uBHPositions:     WebGLUniformLocation;
  private readonly uBHMasses:        WebGLUniformLocation;
  private readonly uSeaTime:         WebGLUniformLocation;
  private readonly uSeaAmp:          WebGLUniformLocation;
  private readonly uFelTime:         WebGLUniformLocation;
  private readonly uFelAmp:          WebGLUniformLocation;

  constructor() {
    document.getElementById(CHAIN_CANVAS_ID)?.remove();
    const c = document.createElement("canvas");
    c.id = CHAIN_CANVAS_ID;
    c.style.cssText =
      "position:fixed; inset:0;" +
      "width:100vw; height:100vh;" +
      "display:block; z-index:4; pointer-events:none;";
    document.body.appendChild(c);
    this.canvas = c;

    const gl = c.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    }) as WebGLRenderingContext;
    if (!gl) throw new Error("WebGL1 unavailable for PostProcessChain");
    this.gl = gl;

    // Full-screen quad — shared by all passes (aPos forced to index 0 via bindAttribLocation).
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Build programs (bindAttribLocation guarantees aPos = 0 in all programs).
    this.progRipple    = this.buildProgram(VS, FS_RIPPLE);
    this.progSpiral    = this.buildProgram(VS, FS_SPIRAL);
    this.progHeartbeat = this.buildProgram(VS, FS_HEARTBEAT);
    this.progBlackhole = this.buildProgram(VS, FS_BLACKHOLE);
    this.progSea       = this.buildProgram(VS, FS_SEA);
    this.progFelicidad = this.buildProgram(VS, FS_FELICIDAD);
    this.progOutput    = this.buildProgram(VS, FS_OUTPUT);

    // Wire texture unit 0 in each program.
    for (const prog of [this.progRipple, this.progSpiral, this.progHeartbeat, this.progBlackhole, this.progSea, this.progFelicidad, this.progOutput]) {
      gl.useProgram(prog);
      const loc = gl.getUniformLocation(prog, "uTex");
      if (loc !== null) gl.uniform1i(loc, 0);
    }

    // Source texture (butterchurn) — 1×1 transparent init avoids sampling an empty texture
    // on the first frame before the first texImage2D call.
    gl.activeTexture(gl.TEXTURE0);
    this.srcTex = this.makeTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]));

    // Uniform locations.
    gl.useProgram(this.progRipple);
    this.uRippleAges = gl.getUniformLocation(this.progRipple, "uAges")!;

    gl.useProgram(this.progSpiral);
    this.uSpiralStrength = gl.getUniformLocation(this.progSpiral, "uStrength")!;
    this.uSpiralZoom     = gl.getUniformLocation(this.progSpiral, "uZoom")!;

    gl.useProgram(this.progHeartbeat);
    this.uHeartbeatAges = gl.getUniformLocation(this.progHeartbeat, "uAges")!;
    this.uHeartbeatAmps = gl.getUniformLocation(this.progHeartbeat, "uAmps")!;

    gl.useProgram(this.progBlackhole);
    this.uBHPositions = gl.getUniformLocation(this.progBlackhole, "uBHPos[0]")!;
    this.uBHMasses    = gl.getUniformLocation(this.progBlackhole, "uBHMass[0]")!;

    gl.useProgram(this.progSea);
    this.uSeaTime = gl.getUniformLocation(this.progSea, "uTime")!;
    this.uSeaAmp  = gl.getUniformLocation(this.progSea, "uAmp")!;

    gl.useProgram(this.progFelicidad);
    this.uFelTime = gl.getUniformLocation(this.progFelicidad, "uTime")!;
    this.uFelAmp  = gl.getUniformLocation(this.progFelicidad, "uAmp")!;
  }

  /** sw/sh = viewport pixel dimensions. FBOs and canvas all match. */
  resize(sw: number, sh: number): void {
    if (sw === this.sw && sh === this.sh) return;
    this.sw = sw;
    this.sh = sh;

    this.canvas.width  = sw;
    this.canvas.height = sh;

    const gl = this.gl;
    if (this.fboA) { gl.deleteFramebuffer(this.fboA.fbo); gl.deleteTexture(this.fboA.tex); }
    if (this.fboB) { gl.deleteFramebuffer(this.fboB.fbo); gl.deleteTexture(this.fboB.tex); }
    this.fboA = this.makeFbo(sw, sh);
    this.fboB = this.makeFbo(sw, sh);
  }

  /**
   * Execute the full post-process chain for one frame.
   *
   * @param source        — butterchurn's hidden canvas (cross-context readback here only)
   * @param rippleAges    — ripple effect age array (seconds, -1 = inactive slot)
   * @param spiralStrength — spiral twist amount (radians at centre)
   * @param heartbeatAges — heartbeat beat age array (seconds, -1 = inactive)
   * @param heartbeatAmps — heartbeat beat amplitude array
   * @param bhPositions   — flat [x0,y0,x1,y1,…] length = BH_MAX×2 (from getBlackholeUniforms)
   * @param bhMasses      — [m0,m1,…] length = BH_MAX; 0 = inactive slot
   * @param seaTime       — elapsed seconds driving sea wave phase
   * @param seaAmp        — sea effect amplitude (0 = skip pass)
   * @param felTime       — elapsed seconds driving felicidad hue+brightness wave
   * @param felAmp        — felicidad envelope (0 = skip pass)
   * @param spiralZoom    — spiral zoom factor (1 = none; >1 = zoom in)
   */
  /** Returns true if the chain ran any pass + drew to the display canvas;
   *  false if no pass is active and the chain was bypassed entirely. The caller
   *  uses the return value to decide whether to show the chain's output canvas
   *  or fall back to displaying the butterchurn source canvas directly. */
  render(
    source: HTMLCanvasElement,
    rippleAges: Float32Array,
    spiralStrength: number,
    spiralZoom: number,
    heartbeatAges: Float32Array,
    heartbeatAmps: Float32Array,
    bhPositions: Float32Array,
    bhMasses: Float32Array,
    seaTime: number,
    seaAmp: number,
    felTime: number,
    felAmp: number,
  ): boolean {
    if (!this.fboA || !this.fboB) return false;

    // ── Pre-compute which passes are active and how many ──────────────────────
    // Done up front so the bypass shortcut is correct (was buggy — spiralZoom
    // defaults to 1, so `spiralZoom > 0` made the chain never bypass) and so
    // the LAST active pass can write straight to the canvas, eliminating the
    // separate output blit pass that used to always run.
    let rippleActive = false;
    for (let i = 0; i < rippleAges.length; i++) {
      if (rippleAges[i] >= 0) { rippleActive = true; break; }
    }
    const spiralActive =
      Math.abs(spiralStrength) > 0.0001 || Math.abs(spiralZoom - 1) > 0.0001;
    let heartbeatActive = false;
    for (let i = 0; i < heartbeatAmps.length; i++) {
      if (heartbeatAmps[i] > 0.0001) { heartbeatActive = true; break; }
    }
    let blackholeActive = false;
    for (let i = 0; i < bhMasses.length; i++) {
      if (Math.abs(bhMasses[i]) > 0.0001) { blackholeActive = true; break; }
    }
    const seaActive = seaAmp > 0.001;
    const felActive = felAmp > 0.001;

    const activeCount =
      (rippleActive ? 1 : 0) +
      (spiralActive ? 1 : 0) +
      (heartbeatActive ? 1 : 0) +
      (blackholeActive ? 1 : 0) +
      (seaActive ? 1 : 0) +
      (felActive ? 1 : 0);
    if (activeCount === 0) return false;

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);

    // ── Upload butterchurn (ONE cross-context readback) ───────────────────────
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // ── Conditional intermediate passes ───────────────────────────────────────
    // The last active pass binds the default framebuffer (canvas) instead of
    // an FBO so its draw IS the user-visible output — no separate blit needed.
    // FBO size equals canvas size (see resize()), so no scaling is required.
    let cur: WebGLTexture = this.srcTex;
    let nextFbo = 0;
    let passIdx = 0;
    const sw = this.sw;
    const sh = this.sh;
    const fboA = this.fboA;
    const fboB = this.fboB;
    // bindOutput sets framebuffer + viewport for the next pass; on the final
    // pass it points to the canvas. Must be called immediately before drawArrays.
    const bindOutput = (): WebGLTexture | null => {
      passIdx++;
      if (passIdx === activeCount) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, sw, sh);
        return null; // last pass — cur not needed afterwards
      }
      const target = nextFbo === 0 ? fboA : fboB;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, sw, sh);
      nextFbo ^= 1;
      return target.tex;
    };

    // ── Ripple ────────────────────────────────────────────────────────────────
    if (rippleActive) {
      const out = bindOutput();
      gl.useProgram(this.progRipple);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1fv(this.uRippleAges, rippleAges);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    // ── Spiral (twist + zoom) ─────────────────────────────────────────────────
    if (spiralActive) {
      const out = bindOutput();
      gl.useProgram(this.progSpiral);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1f(this.uSpiralStrength, spiralStrength);
      gl.uniform1f(this.uSpiralZoom,     spiralZoom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    if (heartbeatActive) {
      const out = bindOutput();
      gl.useProgram(this.progHeartbeat);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1fv(this.uHeartbeatAges, heartbeatAges);
      gl.uniform1fv(this.uHeartbeatAmps, heartbeatAmps);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    // ── Blackhole ─────────────────────────────────────────────────────────────
    if (blackholeActive) {
      const out = bindOutput();
      gl.useProgram(this.progBlackhole);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform2fv(this.uBHPositions, bhPositions);
      gl.uniform1fv(this.uBHMasses,    bhMasses);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    // ── Sea ───────────────────────────────────────────────────────────────────
    if (seaActive) {
      const out = bindOutput();
      gl.useProgram(this.progSea);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1f(this.uSeaTime, seaTime);
      gl.uniform1f(this.uSeaAmp,  seaAmp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    // ── Felicidad ─────────────────────────────────────────────────────────────
    if (felActive) {
      const out = bindOutput();
      gl.useProgram(this.progFelicidad);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1f(this.uFelTime, felTime);
      gl.uniform1f(this.uFelAmp,  felAmp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (out) cur = out;
    }

    return true;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private makeTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private makeFbo(w: number, h: number): FboBundle {
    const gl = this.gl;
    const tex = this.makeTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  private buildProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos"); // guarantee aPos = index 0 in all programs
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("PostProcessChain link error: " + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("PostProcessChain shader error: " + gl.getShaderInfoLog(s));
    }
    return s;
  }
}
