**Navigation:** [README](README.md) | [Contributing](CONTRIBUTING.md) | [Code of Conduct](CODE_OF_CONDUCT.md)

---

# MilkDrop / Butterchurn Preset Authoring Guide

## Preset Structure

A preset is either a `.milk` INI-like text file (for MilkDrop) or a JSON/TS object (for butterchurn). Both share the same logical sections:

```
baseVals        — global numeric parameters
init_eqs_str    — runs once on load
frame_eqs_str   — runs every frame
pixel_eqs_str   — runs per mesh vertex
warp            — GLSL fragment shader (distortion pass)
comp            — GLSL fragment shader (final composite pass)
waves[]         — up to 4 waveform objects
shapes[]        — up to 4 shape objects
```

Butterchurn JSON skeleton:

```json
{
  "version": 2,
  "baseVals": { "decay": 0.98, "zoom": 1.01 },
  "init_eqs_str": "",
  "frame_eqs_str": "a.q1=a.bass; a.q2=a.mid; a.q3=a.treb;",
  "pixel_eqs_str": "",
  "warp": "",
  "comp": "",
  "waves": [
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "", "point_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "", "point_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "", "point_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "", "point_eqs_str": "" }
  ],
  "shapes": [
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "" },
    { "baseVals": { "enabled": 0 }, "init_eqs_str": "", "frame_eqs_str": "" }
  ]
}
```

> **Rules:** `waves` and `shapes` must always have exactly 4 entries. Leave `warp`/`comp` as `""` for default behavior.

---

## Custom presets in this repository (Movement)

Local presets live under `src/presets/` and are registered in **`src/presets/custom-registry.ts`**. Each exports a **`build(tier: VizIntensity)`** function (`mild` | `normal` | `hot`). **Stock** presets from `butterchurn-presets` scale audio with a shared analyser gain when you press **Y**; **custom** presets keep unity gain and encode intensity only inside their own `build()` math (see `src/viz-intensity.ts` and `src/main.ts`).

**Add a new custom preset**

1. Implement `createMyPreset(tier)` returning a full preset object (`version: 2`, `baseVals`, `warp`, `comp`, equations, four waves, four shapes).
2. Export a canonical id (e.g. `export const MY_PRESET_KEY = "my-preset"`) and a **sort key** with a leading space if you want it grouped near the top of the alphabetically sorted list: `export const MY_PRESET_KEY_SORTED = "  my-preset"`.
3. Append `{ canonicalId: MY_PRESET_KEY, build: createMyPreset }` to **`CUSTOM_PRESET_REGISTRY`**.
4. In **`src/main.ts`**, assign `presets[MY_PRESET_KEY_SORTED] = {} as object` before `rebuildAllCustomSlots` (same pattern as `nebula-pearl`).

**Shipped custom presets**

| File                            | Map key (trimmed)          | Visual description                                                                                       |
| ------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `nebula-pearl.ts`               | `nebula-pearl`             | Pulsing circle with Magellan warp trails; RGB color bloom via `q10`–`q12`                                |
| `royal-star-forge.ts`           | `royal-star-forge`         | Mandelverse fractal tunnel + Royal wave display; tint injected into comp via `q9`/`q17`/`q29`            |
| `royal-mashup-mandel.ts`        | `royal-mashup-mandel`      | Same as star-forge but no shapes, brighter (clamp 2.0), black floor lifted at 0.03                       |
| `royal-mashup-mandel-bright.ts` | `royal-mashup-mandel-bright` | Even brighter variant: clamp 2.5, floor 0.06, initial registers at 0.9                                 |
| `organic-mandel.ts`             | `organic-mandel`           | Autonomous 3D Mandelbox fly-through with cyclic palette comp (no audio intensity scaling yet)            |
| `lines.ts`                      | `lines`                    | Four drifting sine-wave lines, each driven by bass / mid / treble / bass_att                             |

---

## Writing readable custom presets

### File header

Start every preset file with a comment block that covers:

1. **Visual description** — what does it look like and feel like?
2. **Lineage** — which stock presets or sources did the warp/comp come from?
3. **Intensity note** — how does the `tier` parameter change the behavior?

```ts
// my-preset — brief visual description.
//
// Visual: what the viewer sees and how audio affects it.
//
// Lineage: where warp/comp/init/frame came from.
// Intensity (Y): what changes between mild / normal / hot.
```

### Tier type JSDoc

Document each field in your `Tier` type so future editors know the visual effect without running the preset:

```ts
type Tier = {
  /** Multiplier on the bass power expression — higher = more reactive to audio hits. */
  q1Scale: number;
  /** Decay weight for color registers — higher = slower color shift. */
  qColA: number;
  // ...
};
```

### Equation section constants

Split `frame_eqs_str` (and similar equation strings) into named section constants joined at build time. Group lines by what they *do*, not by what variable they touch:

```ts
// Audio reactivity: bass/treb/mid → q1 (main energy register); q15 smooths it.
const AUDIO_REACTIVITY_EQS = [
  `a.q1=${q1s}*pow(1+1.02*a.bass+...,${pe});`,
  `a.q15=${q15a}*a.q15+${q15b}*a.q1;a.q1=a.q15;`,
].join("");

// Motion: motion vector magnitude and position driven by q1.
const MOTION_EQS = [
  `a.mv_a=a.q1*${mv};`,
  "a.mv_x+=Math.sin(a.time);",
  // ...
].join("");

// Color oscillators: slow-drifting RGB channels feed the comp tint registers.
const COLOR_OSCILLATOR_EQS = [
  "a.wr=.5+.42*(.6*Math.sin(1.1*a.time)+.4*Math.sin(.8*a.time));",
  // ...
].join("");

const frame_eqs_str = AUDIO_REACTIVITY_EQS + MOTION_EQS + COLOR_OSCILLATOR_EQS;
```

Common section names used in this repo:

| Constant name          | What it covers                                              |
| ---------------------- | ----------------------------------------------------------- |
| `AUDIO_REACTIVITY_EQS` | Deriving the main energy register(s) from bass/mid/treb     |
| `MOTION_EQS`           | Motion vector magnitude, position, direction                |
| `VOLUME_EQS`           | RMS-based wave overlay color pulses                         |
| `COLOR_OSCILLATOR_EQS` | Slow-drifting RGB oscillators feeding comp tint registers   |

### Warp / comp shader annotations

Warp and comp shaders are compiled GLSL — the source is not readable. Add a one-liner above each describing what it does visually:

```ts
// Warp shader (compiled from Magellan’s Nebula source):
// Samples blur buffers to build a gradient field and displaces UV along it —
// creates flowing nebula distortion trails.
const WARP = "...compiled GLSL...";

// Comp shader (compiled from Mother-of-Pearl source):
// Reads edge structure, applies inverse-square tinting, multiplies by
// color registers q10/q11/q12 for the audio-reactive color bloom.
const COMP = "...compiled GLSL...";
```

---

## How a frame is rendered (MilkDrop 2 / Butterchurn)

Butterchurn is a WebGL port of **MilkDrop 2**’s programmable preset model. The official mental model is documented in Ryan Geiss’s [MilkDrop preset authoring guide](http://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html) (see _pixel shaders → conceptual overview / WARP / COMPOSITE_). A more tutorial-style companion site is [milkdrop.co.uk](http://www.milkdrop.co.uk/). The implementation lives in [jberg/butterchurn](https://github.com/jberg/butterchurn).

### One frame, in order

1. **Preset equations** — `init_eqs_str` (once), then each frame: `frame_eqs_str`, per-shape / per-wave equations, and **`pixel_eqs_str` at each vertex** of an internal mesh. Those per-vertex outputs mainly drive **warp sampling**: they offset the `uv` used when the warp shader reads the previous frame.

2. **Warp shader** — Runs on every pixel of an **internal double-buffered texture**. Input is typically `sampler_main` (last frame’s image) at **warped** `uv`. Output is written back into that internal buffer. Effects here **persist**: feedback, smear, and **per-pixel color tricks applied to the feedback image** (e.g. cross products) accumulate frame-to-frame. Geiss: _“Any special effects that happen here get ‘baked’ into the image.”_

3. **Composite shader** — Runs on the **display**. It samples the **internal canvas** (usually at **undistorted** screen `uv`), applies final mapping (polar remaps, brighten, vignette, etc.), and outputs what you see. Geiss: _“Anything you do here will NOT affect the subsequent frame.”_

4. **Waves / shapes** — Drawn in the pipeline as separate layers according to `baseVals` and their equations (exact order relative to warp/comp is handled inside the engine; the important part is they are not the same code path as the warp shader).

### Why this matters for “mixing” presets

- **Motion and low-level texture** mostly come from **warp** + **decay/echo** + **pixel_eqs** (what gets fed back each frame).
- **Final silhouette tricks** (e.g. Magellan’s corona) often live in **comp**, but comp can only **reinterpret** the image the warp already built. It cannot recreate mother-of-pearl’s **warp-stage** iridescence if you keep a different warp.
- **Uniform tinting** in comp (replacing `vec3` constants with `q10,q11,q12`) changes **overall colorization** of whatever structure the warp produced; it does **not** inject the donor’s **per-pixel, view-dependent** color math from the donor’s warp.

---

## ⚠️ Butterchurn vs MilkDrop Equation Syntax

**This is the most important thing to get right when writing presets directly for butterchurn.**

MilkDrop and butterchurn use _different_ equation formats:

|                 | MilkDrop (`.milk` file)       | Butterchurn (`_str` fields)                  |
| --------------- | ----------------------------- | -------------------------------------------- |
| Field suffix    | `_eel`                        | `_str`                                       |
| Variable prefix | none — `bass`, `zoom`, `t1`   | `a.` — `a.bass`, `a.zoom`, `a.t1`            |
| Math functions  | `sin(x)`, `cos(x)`, `sqrt(x)` | `Math.sin(x)`, `Math.cos(x)`, `Math.sqrt(x)` |
| Control flow    | `if(cond, a, b)`              | `above(a,b)` still works; `if()` may not     |

Butterchurn's `_str` fields contain **pre-compiled JavaScript** with an `a.` namespace object. Every variable — audio inputs, time, state, position — lives on `a.`:

```js
// Butterchurn equation string syntax
a.t1 = 0.15 + Math.sin(a.time * 0.13) * 0.1;
a.r = 1.0;
a.g = 0.1 + a.bass * 0.4;
a.a = 0.4 + a.bass * 1.2;
```

The `above(x, y)` and `below(x, y)` helpers are still available as globals (not on `a.`):

```js
a.beat = above(a.bass, a.bass_att * 1.3) ? 1 : 0;
```

**When converting from MilkDrop EEL → butterchurn `_str`:**

1. Rename all `_eel` field keys to `_str`
2. Prefix every variable with `a.` (e.g. `bass` → `a.bass`, `t1` → `a.t1`, `q1` → `a.q1`)
3. Replace bare math functions: `sin(` → `Math.sin(`, `cos(` → `Math.cos(`, etc.

> If you author presets in MilkDrop3 and convert them with `milkdrop-preset-converter-node`, this translation is done automatically — you only need to worry about it when writing presets by hand for butterchurn.

---

## EEL Equation Language

Simple C-like scripting. All values are 64-bit floats. Statements end with `;`. No block constructs — control flow uses function calls.

### Operators

| Operator          | Description                    |
| ----------------- | ------------------------------ |
| `+ - * / %`       | Arithmetic                     |
| `^`               | Power (`x^2` = x squared)      |
| `= += -= *= /=`   | Assignment                     |
| `< > == != <= >=` | Comparison (return 1.0 or 0.0) |
| `!`               | Logical NOT                    |
| `& \|`            | Bitwise AND/OR                 |

### Math Functions

```c
sin(x)   cos(x)   tan(x)   asin(x)   acos(x)   atan(x)   atan2(y,x)
sqrt(x)  sqr(x)   pow(x,y) exp(x)    log(x)    abs(x)    sign(x)
min(a,b) max(a,b) floor(x) ceil(x)   int(x)    mod(x,y)
rand(x)  // random integer 0..x-1 (re-evaluated each frame)
```

### Control Flow

```c
if(cond, true_val, false_val)   // both branches always evaluated
equal(a, b)   // 1 if a==b else 0
above(a, b)   // 1 if a>b  else 0
below(a, b)   // 1 if a<b  else 0
band(a, b)    // boolean AND
bor(a, b)     // boolean OR
```

Example:

```c
// Clamp zoom between 0.5 and 2.0
zoom = if(above(zoom, 2.0), 2.0, if(below(zoom, 0.5), 0.5, zoom));
```

### Audio Variables (read-only)

| Variable        | Range | Description                 |
| --------------- | ----- | --------------------------- |
| `bass`          | 0..~3 | Low-frequency energy        |
| `mid`           | 0..~3 | Mid-frequency energy        |
| `treb`          | 0..~3 | High-frequency energy       |
| `bass_att`      | 0..~3 | Smoothed bass (slow attack) |
| `mid_att`       | 0..~3 | Smoothed mid                |
| `treb_att`      | 0..~3 | Smoothed treble             |
| `vol` `vol_att` | 0..~3 | Overall volume / smoothed   |

### Time Variables (read-only)

| Variable            | Description                             |
| ------------------- | --------------------------------------- |
| `time`              | Seconds since start (always increasing) |
| `frame`             | Frame count                             |
| `fps`               | Current framerate                       |
| `meshx` `meshy`     | Warp mesh dimensions                    |
| `aspectx` `aspecty` | Aspect ratio correction factors         |

### State Variables

| Variable    | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `q1`..`q32` | Bridge EEL → GLSL shaders; **persist across frames**               |
| `t1`..`t8`  | Per-wave/shape state; persist across frames within that wave/shape |

---

## Per-Frame vs Per-Vertex Equations

### `frame_eqs_str` — once per frame

Update animation state, read audio, pass values to shaders:

```js
a.q1 = a.bass;
a.q2 = a.mid;
a.q3 = a.treb;
a.phase = a.phase + 0.01 + a.mid * 0.003; // accumulates forever
a.zoom = 1.0 + a.bass * 0.025;
a.rot = a.rot + 0.003 + a.mid * 0.008;
a.decay = 0.97 + a.vol_att * 0.02;
```

### `pixel_eqs_str` — once per mesh vertex (~1700×/frame)

Controls where each vertex samples the previous frame (the warp). Writeable per-vertex:

| Variable    | Description                      |
| ----------- | -------------------------------- |
| `x` `y`     | Vertex position 0..1 (read-only) |
| `rad` `ang` | Polar coords from center         |
| `zoom`      | Per-vertex zoom                  |
| `rot`       | Per-vertex rotation              |
| `dx` `dy`   | Per-vertex translation           |
| `cx` `cy`   | Center of rotation               |
| `sx` `sy`   | Stretch                          |
| `warp`      | Per-vertex warp strength         |

```js
// Spatially varying rotation — edges spin faster
a.rot = a.rot + a.rad * 0.05;

// Swirl
a.ang = a.ang + a.rad * a.q1 * 0.3;

// Lens/bulge
a.zoom = a.zoom * (1.0 + 0.1 * (1.0 - a.rad));
```

---

## baseVals — All Parameters

### Core

| Parameter   | Range     | Description                                                           |
| ----------- | --------- | --------------------------------------------------------------------- |
| `decay`     | 0..1      | Previous frame persistence. `1.0` = infinite trails, `0.98` = typical |
| `gammaadj`  | 0.01..8   | Brightness (>1 brightens)                                             |
| `zoom`      | 0.01..100 | Zoom per frame (>1 zooms in = tunnel)                                 |
| `zoomexp`   | 0.01..10  | Radial zoom exponent                                                  |
| `rot`       | any       | Rotation per frame (radians)                                          |
| `cx` `cy`   | 0..1      | Center of rotation/zoom                                               |
| `dx` `dy`   | -1..1     | Translation per frame                                                 |
| `sx` `sy`   | 0.01..100 | Stretch                                                               |
| `warp`      | 0..100    | Built-in animated warp amplitude                                      |
| `warpscale` | 0.01..10  | Warp spatial scale                                                    |
| `warpspeed` | 0..10     | Warp animation speed                                                  |

### Blur Passes (3 available)

| Parameter   | Description                   |
| ----------- | ----------------------------- |
| `b1n` `b1x` | Blur pass 1 min/max           |
| `b2n` `b2x` | Blur pass 2 min/max           |
| `b3n` `b3x` | Blur pass 3 min/max           |
| `b1ed`      | Edge darken amount for pass 1 |

---

## Warp Shader (GLSL)

Runs **before** geometry drawing. Distorts the feedback buffer. Leave as `""` for default.

### Uniforms

```glsl
uniform float time, fps, frame;
uniform float bass, mid, treb, bass_att, mid_att, treb_att, vol;
uniform float q1, q2, /* ... */ q32;       // from frame_eqs_str (a.q1..a.q32)
uniform float zoom, rot, warp, decay, cx, cy, dx, dy, sx, sy;
uniform vec2  resolution;

uniform sampler2D sampler_main;            // previous frame
uniform sampler2D sampler_blur1;           // blur passes
uniform sampler2D sampler_blur2;
uniform sampler2D sampler_blur3;
uniform sampler2D sampler_noise_lq;        // 256x256 tiling noise
uniform sampler2D sampler_noise_hq;

varying vec2 uv;                           // 0..1 screen coords
varying vec2 uv_orig;                      // pre-warp uv
```

### Examples

```glsl
// Kaleidoscope (6-fold symmetry)
shader_body {
  vec2 p = uv - 0.5;
  float a = atan(p.y, p.x);
  float r = length(p);
  a = mod(a, 3.14159 / 6.0) * 6.0;
  p = r * vec2(cos(a), sin(a)) + 0.5;
  ret = texture2D(sampler_main, p).rgb;
}

// Noise-driven color pulse
shader_body {
  vec4 c = texture2D(sampler_main, uv);
  vec4 n = texture2D(sampler_noise_lq, uv * 2.0 + vec2(time * 0.1, 0.0));
  c.rgb += n.rgb * q1 * 0.05;
  ret = c.rgb;
}

// Mirror (left half mirrors right)
shader_body {
  vec2 p = uv;
  p.x = 0.5 - abs(p.x - 0.5);
  ret = texture2D(sampler_main, p).rgb;
}
```

---

## Comp Shader (GLSL)

Runs **last**, after all waves and shapes are drawn. Same uniforms as warp. `sampler_main` is now the fully composited frame.

```glsl
// Vignette
shader_body {
  vec4 c = texture2D(sampler_main, uv);
  float r = length(uv - 0.5) * 1.414;
  c.rgb *= 1.0 - r * r * 0.5;
  ret = c.rgb;
}

// Bloom/glow on treble
shader_body {
  vec4 sharp  = texture2D(sampler_main, uv);
  vec4 blurry = texture2D(sampler_blur1, uv);
  vec3 glow   = max(blurry.rgb - 0.3, 0.0) * 2.0;
  ret = sharp.rgb + glow * q3;
}

// Chromatic aberration driven by bass
shader_body {
  float amt = q1 * 0.005;
  float r = texture2D(sampler_main, uv + vec2(amt, 0.0)).r;
  float g = texture2D(sampler_main, uv).g;
  float b = texture2D(sampler_main, uv - vec2(amt, 0.0)).b;
  ret = vec3(r, g, b);
}
```

---

## Waves

Up to 4 waves. Each draws an audio waveform as a polyline or dot series.

### Wave baseVals

| Parameter       | Description                                 |
| --------------- | ------------------------------------------- |
| `enabled`       | 0/1                                         |
| `samples`       | 2..512 audio samples                        |
| `spectrum`      | 0 = waveform, 1 = frequency spectrum        |
| `r` `g` `b` `a` | Base color                                  |
| `smoothing`     | 0..1 smoothing along the wave               |
| `usedots`       | Draw as dots instead of lines               |
| `thick`         | Thick lines (2px)                           |
| `additive`      | Additive blending                           |
| `x` `y`         | Center position                             |
| `scaling`       | Amplitude scale (affects `value1`/`value2`) |

### Wave per-frame equations (`frame_eqs_str`)

Runs once/frame. Animate color, position, etc. `a.t1..a.t8` for per-wave persistent state:

```js
a.t1 = a.t1 + 0.02;
a.r = 0.5 + 0.5 * Math.sin(a.t1);
a.g = 0.5 + 0.5 * Math.sin(a.t1 + 2.094);
a.b = 0.5 + 0.5 * Math.sin(a.t1 + 4.189);
a.a = 0.5 + 0.3 * a.bass;
```

### Wave point equations (`point_eqs_str`)

Runs per sample. Write to `a.x`, `a.y`, `a.r`, `a.g`, `a.b`, `a.a` to position/color each point:

| Variable   | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `a.sample` | Sample index 0..1                                             |
| `a.value1` | Left channel audio at this point (-1..1, scaled by `scaling`) |
| `a.value2` | Right channel audio (-1..1)                                   |

```js
// Lissajous (L/R channels → X/Y axes)
a.x = 0.5 + a.value1 * 0.4;
a.y = 0.5 + a.value2 * 0.4;

// Circle wave
var theta = a.sample * 6.28318;
var r = 0.3 + a.value1 * 0.1 * a.bass;
a.x = 0.5 + Math.cos(theta) * r;
a.y = 0.5 + Math.sin(theta) * r;

// Spectrum bars with frequency coloring
a.x = a.sample;
a.y = 0.5 - a.value1 * 0.4;
a.r = 1.0 - a.sample;
a.g = 1.0 - Math.abs(a.sample - 0.5) * 2.0;
a.b = a.sample;

// Flat horizontal line (drifting y, thickness driven by audio)
a.x = a.sample;
a.y = a.t1 + Math.sin(a.sample * 18.85) * a.t2;
```

---

## Shapes

Up to 4 shapes. Procedurally drawn polygons/circles.

### Shape baseVals

| Parameter            | Description                      |
| -------------------- | -------------------------------- |
| `enabled`            | 0/1                              |
| `sides`              | 3..100 sides (100 ≈ circle)      |
| `x` `y`              | Center position                  |
| `rad`                | Radius                           |
| `ang`                | Rotation angle (radians)         |
| `r` `g` `b` `a`      | Outer/fill color                 |
| `r2` `g2` `b2` `a2`  | Inner color (gradient center)    |
| `border_r/g/b/a`     | Border color                     |
| `additive`           | Additive blending                |
| `textured`           | Sample previous frame as texture |
| `tex_zoom` `tex_ang` | Texture zoom/rotation            |

### Shape per-frame equations (`frame_eqs_str`)

```js
// Pulsing beat ring
a.t1 = a.t1 + 0.02;
a.rad = 0.05 + a.bass * 0.08;
a.ang = a.t1 * 2.0;
a.r = 0.5 + 0.5 * Math.sin(a.t1 * 1.3);
a.g = 0.5 + 0.5 * Math.sin(a.t1 * 0.7 + 2.0);
a.b = 0.5 + 0.5 * Math.sin(a.t1 * 1.1 + 4.0);
a.a = 0.0;
a.border_a = 0.8;
a.border_r = a.r;
a.border_g = a.g;
a.border_b = a.b;
```

---

## Audio Reactivity Patterns

### Beat Detection

```js
// frame_eqs_str — fires when bass sharply exceeds its running average
a.beat = above(a.bass, a.bass_att * 1.3) && !above(a.cooldown, 0) ? 1 : 0;
a.cooldown = Math.max(0, a.cooldown - 1) + a.beat * 20;
a.q7 = a.beat ? 1.0 : a.q7 * 0.85; // decaying trigger pulse
```

### Smooth Envelope (fast attack, slow release)

```js
a.smooth = above(a.bass, a.smooth) ? a.bass : a.smooth * 0.95;
```

### Common Recipes

```js
a.zoom = 1.0 + a.bass * 0.03; // zoom pulse on bass
a.rot = a.rot + a.mid * 0.01; // spin on mid
a.decay = 0.95 + a.vol_att * 0.04; // trail length by volume
a.phase = a.phase + 0.01; // color cycle accumulator
a.q10 = Math.sin(a.phase); // pass to GLSL for hue rotation
a.q11 = Math.sin(a.phase + 2.094);
a.q12 = Math.sin(a.phase + 4.189);
```

---

## Common Visual Techniques

| Effect                 | How                                                     |
| ---------------------- | ------------------------------------------------------- |
| **Tunnel**             | `zoom = 1.05` constant                                  |
| **Spiral tunnel**      | `zoom = 1.05` + `rot = 0.01`                            |
| **Long trails**        | `decay = 0.97..0.995`                                   |
| **Snappy / no trails** | `decay = 0.3..0.85`                                     |
| **Swirl**              | per-vertex: `ang = ang + rad * q1 * 0.3`                |
| **Kaleidoscope**       | Fold `ang` per-vertex or in warp GLSL                   |
| **Lens/bulge**         | per-vertex: `zoom = zoom * (1.0 + 0.1 * (1.0 - rad))`   |
| **Color cycle**        | Accumulate `phase`, use `sin(phase + offset)` for r/g/b |
| **Beat flash**         | Shape with `a = q7 * 0.9` (q7 = decaying beat trigger)  |
| **Glow**               | Comp shader: sample `sampler_blur1`, add to sharp       |
| **Mirror**             | Warp GLSL: `p.x = 0.5 - abs(p.x - 0.5)`                 |
| **Galaxy arms**        | per-vertex: `rot = 0.02 * rad`                          |
| **Freeze trails**      | `decay = 1.0` + `warp = 0` + `zoom = 1.0` + `rot = 0`   |

---

## Post-Process Effects (WebGL overlay)

Post-process effects distort or augment the rendered butterchurn output **after** it leaves the pipeline. They work on **all** presets, including those with custom GLSL warp shaders.

### Why preset equation injection doesn't work universally

Two traps that make `pixel_eqs_str` injection unreliable for visual effects:

1. **`a.x` / `a.y` are inputs, not outputs.** In per-vertex equations they hold the mesh vertex's position. Writing to them has no visible effect — the UV sampling is controlled by `a.zoom`, `a.rot`, `a.dx`, `a.dy`, `a.sx`, `a.sy`.

2. **Custom GLSL warp shaders bypass the mesh entirely.** When a preset has a non-empty `warp` field, that shader samples `sampler_fw_main` (raw previous frame) directly with its own UV math. Any modifications to `a.dx` / `a.dy` in `pixel_eqs_str` are overwritten and never reach the display. Most complex presets (Mandelverse family, organic-mandel, etc.) fall into this category.

### Two-canvas architecture

Movement uses a split-canvas pipeline for post-process effects:

```
butterchurn canvas          (z-index: 0, visibility:hidden)
        │  renders to hidden WebGL2 canvas
        ▼
RipplePostProcess canvas    (z-index: 1, visible display)
        │  WebGL1 shader reads butterchurn canvas as texture
        │  applies UV displacement / color effects per pixel
        ▼
  moldContainer             (z-index: 2, overlaid when active)
```

butterchurn's canvas stays in the DOM (killing it loses the WebGL context) but is invisible. `RipplePostProcess.render(sourceCanvas, params)` is called every frame after `visualizer.render()`.

### Implementing a new effect

**1. Create `src/effects/my-effect-postprocess.ts`**

Copy the `RipplePostProcess` class and replace only the fragment shader. The boilerplate (quad setup, texture upload, canvas management) stays identical:

```typescript
const FS = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  // add your uniforms here
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;

    // --- your displacement / color math here ---
    // uv is in [0,1]x[0,1], center = vec2(0.5)
    // Displace by modifying uv before sampling:
    //   uv += vec2(dx, dy);
    //   uv = clamp(uv, 0.0, 1.0);
    // Color-grade by modifying the sampled color:
    //   vec4 c = texture2D(uTex, uv);
    //   c.rgb = ... ;
    //   gl_FragColor = c;
    // -------------------------------------------

    gl_FragColor = texture2D(uTex, uv);
  }
`;
```

Key GLSL constraints (WebGL1 / GLSL ES 1.0):
- Loop bounds must be compile-time constants; use `if (i >= uCount) continue;` inside a fixed-bound loop for dynamic counts.
- No `break` in loops on some drivers; use the conditional pattern above.
- Array uniforms: `uniform float uValues[4];` indexed by loop variable is safe.

**2. Create `src/effects/my-effect.ts` (state management)**

```typescript
const DURATION_MS = 2000;
const MAX = 4;

export type MyEffectState = { triggers: number[] }; // wall-clock ms timestamps

export function createMyEffectState(): MyEffectState { return { triggers: [] }; }

export function triggerMyEffect(state: MyEffectState): void {
  state.triggers.push(Date.now());
  if (state.triggers.length > MAX) state.triggers.shift();
}

export function cleanExpired(state: MyEffectState): void {
  const now = Date.now();
  state.triggers = state.triggers.filter(t0 => now - t0 < DURATION_MS);
}

/** Return ages in seconds for shader uniforms. */
export function getAges(state: MyEffectState): number[] {
  const now = Date.now();
  return state.triggers.map(t0 => (now - t0) / 1000);
}
```

**3. Wire into `main.ts`**

```typescript
// Module level — alongside ripplePostProcess
const myPostProcess = new MyEffectPostProcess();  // creates + appends its canvas
myPostProcess.canvas.style.zIndex = "1";          // same layer as ripplePostProcess or higher

// Inside start()
const myState = createMyEffectState();
let myIntervalId: ReturnType<typeof setInterval> | null = null;

// Key handler (e.g. key "T"):
if (e.key === "t") {
  if (myIntervalId !== null) {
    clearInterval(myIntervalId);
    myIntervalId = null;
  } else {
    triggerMyEffect(myState);
    myIntervalId = setInterval(() => triggerMyEffect(myState), 1500);
  }
}

// In render():
cleanExpired(myState);
myPostProcess.render(canvas, getAges(myState));   // canvas = butterchurn render target
```

If the effect doesn't need the butterchurn frame as a texture (e.g. a pure additive canvas 2D overlay), use a regular `<canvas>` + `getContext("2d")` instead and skip the WebGL post-process entirely. Pure 2D overlays with `mix-blend-mode: screen` work well for additive glow effects that don't require pixel displacement.

### Shipped post-process effects

| Effect  | Key | Files                                         | Description                                                              |
| ------- | --- | --------------------------------------------- | ------------------------------------------------------------------------ |
| Ripple  | `E` | `effects/ripple.ts` + `ripple-postprocess.ts` | Expanding radial UV rings (raindrop). Discrete triggers at 1500 ms interval. Reads butterchurn canvas. |
| Spiral  | `W` | `effects/spiral.ts` + `spiral-postprocess.ts` | Vortex rotation that winds up from center. Continuous strength float. Reads ripple canvas (chained). |

### Effect chain

```
butterchurn canvas (hidden, WebGL2)
        ↓ texImage2D
RipplePostProcess canvas  z-index:1   ← reads butterchurn
        ↓ texImage2D
SpiralPostProcess canvas  z-index:2   ← reads ripple output
        ↓ display
```

Each new effect should read from the previous effect's canvas and output to its own. Add it as the new topmost layer (`z-index` +1), `pointer-events:none`.

### Ripple effect — implementation reference

`src/effects/ripple.ts` — state (wall-clock timestamps), `triggerRipple`, `cleanExpiredRipples`, `getRippleAges`.

`src/effects/ripple-postprocess.ts` — WebGL1 post-process. Fragment shader:
- `dist = length(uv - vec2(0.5))` — distance from center
- For each active ripple age: `ringRadius = age * 0.38`, `ringDist = dist - ringRadius`
- Displacement profile: `cos(ringDist * 22.0) * exp(-ringDist² * 18.0)` — crest at ring front, trough trailing
- `uv -= dir * amplitude` — negative sign: sampling inward = visual pixels appear pushed outward ✓
- Ages passed as `uniform float uAges[4]`; `-1.0` sentinel = inactive slot

Interval toggle pattern (key `E`): `triggerRipple` fires once immediately, then `setInterval` at 1500 ms. Toggle off clears the interval; active ripples fade to zero naturally.

### Spiral effect — implementation reference

`src/effects/spiral.ts` — continuous `strength` float (`0` → `SPIRAL_MAX_STRENGTH = 2.5π`). `updateSpiral(state)` called every frame, advances by `WIND_RATE * dt` when active, retreats by `UNWIND_RATE * dt` otherwise. Returns current strength.

`src/effects/spiral-postprocess.ts` — WebGL1 post-process. Fragment shader:
- `offset = uv - vec2(0.5)`, `dist = length(offset)`
- `angle = uStrength * exp(-dist * 3.0)` — center rotates by full strength, falls off exponentially
- Rotate `offset` by `angle` (standard 2D rotation matrix), re-add center to get displaced UV
- `uStrength = 0` → `angle = 0` → pure pass-through
- Reads from **ripple canvas** (not butterchurn), so both effects compose correctly

Toggle pattern (key `W`): `toggleSpiral` flips `state.active`. Wind-up rate 0.9 rad/s, unwind 1.8 rad/s — takes ~8 s to reach max, ~4 s to fully unwind.

---

## Converting .milk → Butterchurn JSON

Use `milkdrop-preset-converter-node`:

```bash
git clone https://github.com/jberg/milkdrop-preset-converter-node.git
cd milkdrop-preset-converter-node
yarn install && yarn build

# Convert a folder of .milk files to JSON
yarn run convert /path/to/milk-files /path/to/output
```

Then load in your app:

```ts
import myPreset from "./my-preset.json";
visualizer.loadPreset(myPreset, 0);
```

### Troubleshooting conversion issues

Some presets (e.g. Mandelverse) may exhibit a black screen if the conversion is incomplete. Two common causes:

- **Incorrect `convertPresetEquations` argument order**: The library expects `(pixel_eqs_eel, init_eqs_eel, frame_eqs_eel)`. Passing `(init_eqs_eel, frame_eqs_eel, pixel_eqs_eel)` results in an empty `pixel_eqs_str` and a truncated `frame_eqs_str`, causing loss of motion logic and eventual blackouts.

- **`q16` initialized to zero**: If `q16` becomes zero, shader divisions by `q16` produce black. The converter sometimes fails to emit the original `q16 = 1 + rand(2)` from the `.milk` file. Add a post-processing step to enforce `a['q16'] = 1.0 + Math.random() * 2;` in `init_eqs_str`.

The Mandelverse preset in this repo demonstrates the fix: `scripts/build-mandelverse-butterchurn.mjs` applies both steps and rebuilds the JSON.

### Lenient-driver shader bugs (Mac WebGL vs Windows ANGLE)

The AWS milkdropShaderConverter Lambda intermittently produces broken GLSL where every binary operation is wrapped in `bvec(...) && bvec(...)`:

```glsl
// BROKEN output that ships when the lambda has a bad day:
ret = vec3((bvec3((vec3(1.25) * vec3((bvec3(...) && bvec3(bias3))))) && bvec3(...)));
uv  = vec2((bvec2(((uv - vec2(0.5)) * vec2(1.0))) && bvec2((vec2(-1, 1) + vec2(0.5)))));
```

`&&` does not exist for `bvec*` types in GLSL ES — it's strictly a boolean-scalar operator. The output is invalid.

| Driver | Behavior |
|---|---|
| Mac WebGL (Metal backend on Safari/Chrome/Firefox/Zen) | Lenient — silently coerces or ignores → preset renders |
| Windows ANGLE (Chrome/Firefox/Opera/Edge → D3D11) | Strict — link fails, console floods with `'&&' wrong operand types — '3-component vector of bool' && '3-component vector of bool'` and `'rad' undeclared identifier` and `'clamp' no matching overload` |

**This means a preset that "works on Mac" is not validated.** Always test on Windows before shipping.

**Detection**: grep the JSON for `bvec` and `&&` in `warp` / `comp` strings — should be zero (or only inside `bvecTernary0` helper bodies, which are fine when the helpers are USED instead of inlined). A clean Lambda response uses `xll_saturate_vf2`/`xll_saturate_vf3` helpers and reads naturally.

```bash
# quick check — should print zero for both
node -e "const j=require('./src/presets/json/foo.butterchurn.json'); console.log('bvec_in_warp:', (j.warp.match(/bvec/g)||[]).length, 'bvec_in_comp:', (j.comp.match(/bvec/g)||[]).length)"
```

**Fix**: re-run the build script (`node scripts/build-<preset>-preset.mjs`). The Lambda's output varies by run — a fresh fetch usually returns the clean version.

If the regen still produces `bvec && bvec`, fall back to:
1. Drop the warp/comp shader entirely from the JSON (preset uses butterchurn's default identity warp + comp). Visual changes but preset compiles.
2. Hand-port the source `.milk`'s HLSL warp/comp to GLSL by reading the Milkdrop sources and rewriting in plain GLSL — slow but reliable.

**Prevention**: consider running each newly-built preset JSON through a headless ANGLE-backed WebGL context as part of CI to catch this before merging.

### Division by zero in custom presets

When mashing presets, watch for **q-registers used in division** (`q7`, `q16` most common). If initialized to zero, the preset renders black:

| Register | Used in                                                           | Solution                           |
| -------- | ----------------------------------------------------------------- | ---------------------------------- |
| `q7`     | Mandelverse/organic: `a['uvx']=div(a['reg26']*a['dist'],a['q7'])` | Set `a['q7']=0.25` in init         |
| `q16`    | Pixel eqs: `a.dx=-a.q12/a.q16*...`                                | Set `a['q16']=(1+rand(2))` in init |

**Correct init syntax**: Use bracket notation matching the JSON output:

```js
// Correct (matches butterchurn JSON output)
a["q7"] = 0.25;
a["q16"] = 1 + rand(2);
a["q8"] = rand(2.0) - 1.0;

// Avoid (different syntax, may not compile)
a.q7 = 0.25;
a.q16 = 1 + Math.random() * 2;
```

Also ensure buffer arrays are initialized if the preset uses them (common in Mandelverse-style fractals):

```js
for (var mdparser_idx1 = 0; mdparser_idx1 < 10000; mdparser_idx1++) {
  a["gmegabuf"][Math.floor(a["n"])] = 0;
  a["n"] = a["n"] + 1;
}
a["n"] = 0;
for (var mdparser_idx2 = 0; mdparser_idx2 < 10000; mdparser_idx2++) {
  a["megabuf"][Math.floor(a["n"])] = 0;
  a["n"] = a["n"] + 1;
}
```

### Comp shader injection patterns

When adding color from a donor preset to an existing comp, **do not replace the entire comp shader**. The comp defines the entire output pipeline — swapping it changes shape, not just color.

**Wrong approach** — replacing the whole comp:

```glsl
// Donor's comp uses different UV mapping, grayscale conversion, noise displacement
// This destroys the host's geometric structure
```

**Right approach** — apply channel permutation to the already-colored image, then mix back:

```glsl
// Keep host's existing color computation (e.g. hue_shader, gradients, etc.)
ret_1 = (((texture(sampler_main, uv).x * (1.0 - sqrt(dot(x_3, x_3))))
         * pow(hue_shader, vec3(6.0, 6.0, 6.0))) * 1.4);
// ... rest of host's comp logic ...

// Apply Mandelverse-style channel permutation to the result
vec3 mandelCol;
mandelCol.x = abs(q21) + abs(q20);
mandelCol.y = abs(q22) + abs(q21);
mandelCol.z = abs(q20) + abs(q22);
mandelCol = log(exp2((3.141593 * mandelCol) * ret_1.yzx));

// Mix with original — preserves shape, adds iridescent color cycling
ret_1 = mix(ret_1, mandelCol, 0.6 + 0.4 * q15);
```

**Why this works:**

- `log(exp2(pi * colVec * ret_1.yzx))` permutes RGB channels, creating iridescent color cycling
- `colVec` from `abs(q20-q22)` sums drives per-channel intensity (from host's frame_eqs rotation matrix)
- Mixing back preserves the host's geometric structure while layering the donor's color math
- `q15` (or any unused q-register) controls the blend amount, allowing audio-reactive color intensity

**Key lesson:** Color injection in comp works by **post-processing the final image**, not by replacing the rendering pipeline. The host's shape comes from warp + comp structure; color comes from what you do to `ret_1` before `ret = ret_1`.

### Multi-color structures via luminance-based channel permutation

To show **multiple colors simultaneously** within the same structure (not vertical bands), select the channel permutation based on **pixel luminance** instead of spatial position:

```glsl
vec3 rawCol = texture(sampler_main, uv).xyz;
float lum = dot(rawCol, vec3(0.299, 0.587, 0.114));
vec3 colVec;
colVec.x = abs(q21) + abs(q20);
colVec.y = abs(q22) + abs(q21);
colVec.z = abs(q20) + abs(q22);
vec3 c1 = log(exp2((3.141593 * colVec) * rawCol.yzx));
vec3 c2 = log(exp2((3.141593 * colVec) * rawCol.zxy));
vec3 c3 = log(exp2((3.141593 * colVec) * rawCol.xyz));
float phase = fract(lum * 3.0 + time * 0.1);
vec3 mandelCol = phase < 0.333 ? c1 : phase < 0.666 ? c2 : c3;
ret_1 = mix(ret_1, mandelCol, 0.5 + 0.5 * q15);
```

Bright areas, mid-tones, and shadows each get their own iridescent hue, with slow color drift over time.

### Applying a fixed palette with time-based cycling

To apply a specific color palette (e.g. brand colors) to a comp shader, use palette colors **directly as the output color** and drive brightness from pixel luminance. Trying to inject colors through the `log(exp2(...))` formula as multipliers is ineffective — see warning below.

```glsl
vec3 rawCol = texture(sampler_main, uv).xyz;
float lum = dot(rawCol, vec3(0.299, 0.587, 0.114));

// Define palette (hex → linear RGB, divide each channel by 255)
vec3 pal1 = vec3(0.396, 0.012, 0.651); // #6503A6 purple
vec3 pal2 = vec3(0.039, 0.035, 0.149); // #0A0926 dark navy
vec3 pal3 = vec3(0.024, 0.451, 0.008); // #067302 green
vec3 pal4 = vec3(0.651, 0.490, 0.012); // #A67D03 gold
vec3 pal5 = vec3(0.651, 0.012, 0.012); // #A60303 red

// Time-driven cycling: time is primary, lum adds spatial variation
float pt = fract(time * 0.12 + lum * 0.4);
vec3 palColor = mix(pal1, pal2, smoothstep(0.0, 0.2, pt));
palColor = mix(palColor, pal3, smoothstep(0.2, 0.4, pt));
palColor = mix(palColor, pal4, smoothstep(0.4, 0.6, pt));
palColor = mix(palColor, pal5, smoothstep(0.6, 0.8, pt));
palColor = mix(palColor, pal1, smoothstep(0.8, 1.0, pt));

// Luminance carries structure; palette drives hue
vec3 mandelCol = palColor * (lum * 2.0 + 0.2);
```

**Cycle speed:** `time * 0.12` ≈ 8-second full cycle. Increase for faster swapping, decrease for slower drift.

**Making palette colors easily configurable in TypeScript:** define them as string constants and use a template literal for the shader string:

```ts
const PAL1 = "vec3(0.396, 0.012, 0.651)"; // #6503A6 purple
const PAL2 = "vec3(0.039, 0.035, 0.149)"; // #0A0926 dark navy

const COMP = `
  ...
  vec3 pal1 = ${PAL1};
  vec3 pal2 = ${PAL2};
  ...
`;
```

To convert a hex color: divide each channel by 255. `#A67D03` → R=166/255=0.651, G=125/255=0.490, B=3/255=0.012 → `vec3(0.651, 0.490, 0.012)`.

#### ⚠️ Why `log(exp2(pi * palette * rawCol))` does NOT give you palette colors

`log(exp2(x)) = x * ln(2)` — the two operations cancel to a linear scale by 0.693. So `log(exp2(pi * palette * rawCol))` is mathematically identical to `2.177 * palette * rawCol`. With small palette values (0.0–1.0), this produces muted, barely distinguishable hues — the output color is always a dimmed version of whatever `rawCol` already was. To actually see a palette color, assign it directly.

#### ⚠️ Watch for white edges injected before your palette code runs

The Mandelverse/organic comp contains this line that adds white to structure edges:

```glsl
tmpvar_6 = mix(ret_1, vec3(1.0, 1.0, 1.0), vec3(sqrt(dot(x_5, x_5))));
ret_1 = tmpvar_6;
```

If your palette code runs **after** this line, those edges stay white regardless of what you do to `mandelCol` later (because the final `mix(ret_1, mandelCol, 0.5)` only partially overwrites them). **Fix:** move your palette variable declarations and `palColor` computation to **before** this line, then replace `vec3(1.0, 1.0, 1.0)` with `palColor * 1.5`.

#### Using a phase-offset palette color for edges

To give edges a different palette color than the fill (for contrast), compute a second palette lookup at `pt + 0.5`:

```glsl
float pt2 = fract(pt + 0.5);
vec3 edgePal = mix(pal1, pal2, smoothstep(0.0, 0.2, pt2));
edgePal = mix(edgePal, pal3, smoothstep(0.2, 0.4, pt2));
edgePal = mix(edgePal, pal4, smoothstep(0.4, 0.6, pt2));
edgePal = mix(edgePal, pal5, smoothstep(0.6, 0.8, pt2));
edgePal = mix(edgePal, pal1, smoothstep(0.8, 1.0, pt2));
mandelCol = mix(mandelCol, edgePal * 2.0, edgeMask * 0.7);
```

`pt + 0.5` gives the complementary point in the cycle — purple body → gold/red edges, green body → navy/purple edges.

---

### Edge-highlighted borders in comp

The host's comp already computes gradient vectors (`xlat_mutabledx`, `xlat_mutabledy`) for its edge detection. Reuse these to add colored borders to structures:

```glsl
// x_3 and x_5 already computed by host's comp (gradient magnitudes)
float edgeMag = sqrt(dot(x_3, x_3));
float edgeMask = smoothstep(0.05, 0.6, edgeMag);
vec3 edgeCol = log(exp2((3.141593 * colVec) * vec3(1.0, 0.0, 0.5)));
mandelCol = mix(mandelCol, edgeCol, edgeMask * (0.7 + 0.3 * q15));
```

- **Border thickness**: controlled by two independent levers:
  1. **Gradient sample distance** — `xlat_mutabled = (texsize.zw * N)` at the top of the comp. Increasing `N` widens the neighborhood used for gradient computation, making all edges thicker. `1.5` = thin, `4.0` = thick, `6.0` = very thick/glowing.
  2. **`smoothstep` lower bound** — `smoothstep(low, 0.6, edgeMag)`. Lowering `low` (e.g. `0.15` → `0.05`) makes the mask activate at weaker gradients, widening the colored fringe.
- **Border color**: use a fixed `vec3` permuted through the same channel math for consistent edge coloring, or use `palColor`/`edgePal` from a palette cycle (see above)
- **Fade control**: `smoothstep(low, high, edgeMag)` — wider range = softer transition

### Removing the outer frame border

Set `ob_size: 0` in `baseVals` to remove the thick white frame around the preset output:

```ts
baseVals: {
  ob_size: 0,  // default is often 0.05 — creates a visible border
  // ...
}
```

1. Install **MilkDrop3** (Windows, standalone — no Winamp needed)
2. Play audio, press `M` to open the preset editor
3. Edit EEL equations and GLSL shaders live
4. Press `Ctrl+Enter` to recompile and see changes immediately
5. Save as `.milk`
6. Convert to JSON with `milkdrop-preset-converter-node`
7. Drop JSON into your project

### MilkDrop2077 (preset masher)

A GUI tool for generating presets without writing code:

- Load two `.milk` presets → adjust a blend slider → mash them together
- Interpolates `baseVals`, mixes waves/shapes, picks shaders from one source
- Batch-generate hundreds of variants from a folder
- Good starting point: mash two visually interesting presets, then hand-edit the result

---

## Mixing Presets: Movement from One, Colors from Another

### ⚠️ Critical: use `getPresets()` format, not `presets/converted/` JSON

The butterchurn-presets package ships two different representations of the same presets:

| Location                                                    | Format                                                                       | Compatible with `loadPreset()`?                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/butterchurn-presets/presets/converted/*.json` | Pack’s on-disk JSON for each preset (same shaders the bundle was built from) | **Usually yes** for whole-preset objects — used by this repo in `royal-star-forge.ts` via `import … from '…/presets/converted/….json'` |
| `require('butterchurn-presets').getPresets()`               | In-memory map of those presets (keys are full titles)                        | **YES**                                                                                                                                |

Some **individual** `warp` / `comp` strings (e.g. hand-copied fragments, or exports from other tools) use declarations **outside** `shader_body {}` in a way butterchurn rejects — the canvas can go **black with no GL error**. That is the failure mode the row above is warning about, not “JSON vs JS” per se.

**When mashing presets:** prefer starting from a full object from **`getPresets()`** or from the matching **`presets/converted/*.json`** file, then `structuredClone` and edit. If you get a black screen, diff your `warp` / `comp` against `getPresets()['exact preset title']`.

**Inspect preset data via Node:**

```js
const presets = require("butterchurn-presets").getPresets();
const p = presets["cope + martin - mother-of-pearl"];
// p.warp, p.comp are the correct compiled strings
```

**Compiled format** — declarations inside the body (correct):

```glsl
 shader_body {
  vec3 noise3_1;   // ← declarations go INSIDE
  vec3 tmpvar_2;
  tmpvar_2 = texture(sampler_main, uv).xyz + ...;
  ret = tmpvar_9.xyz;
 }
```

**Raw (broken) format** — declarations outside the body (incorrect):

```glsl
vec2 xlat_mutabled;    // ← outside shader_body — butterchurn silently renders black
vec3 xlat_mutabledx;
 shader_body { ... }
```

> **Exception:** Some compiled shaders (e.g. Magellan's comp) have a single global `vec2` declaration outside `shader_body`. This is a quirk of that specific compiled output and works fine — the rule is about the general pattern of many declarations outside the body.

### ⚠️ Verify exact preset key names

Preset keys include the full author attribution and can be longer than they appear in UIs. Always check the exact key via Node before hardcoding:

```js
const presets = require("butterchurn-presets").getPresets();
Object.keys(presets).filter((k) => k.includes("Magellan"));
// → ["TonyMilkdrop - Magellan's Nebula [Flexi - you enter first + multiverse]"]
// NOT "TonyMilkdrop - Magellan's Nebula" — that key doesn't exist and loads nothing
```

---

### Anatomy of separation

| What you see                            | Where it lives                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fluid push/pull, swirl, self-similarity | `warp` GLSL shader                                                                                         |
| Nebula corona shape / radial projection | `comp` GLSL shader (e.g. Magellan's polar mapping)                                                         |
| Audio-reactive zoom/rotation burst      | `pixel_eqs_str`                                                                                            |
| Iridescent cross-product rainbow        | `warp` GLSL (when it uses `image.yzx * target.zxy - image.zxy * target.yzx`)                               |
| Color cycle via comp color injection    | `frame_eqs_str` (e.g. `q10`–`q12`, or any unused `q` slots) + replacing fixed `vec3` colors in `comp` GLSL |
| Surface shimmer, edge highlights        | `comp` GLSL shader                                                                                         |
| Trail persistence                       | `baseVals.decay`, `echo_alpha`, `echo_zoom`                                                                |

**Two ways to inject color from a donor:**

1. **Cross-product warp** (mother-of-pearl approach): use the donor's warp shader which does cross-product color math using q10/q11/q12. Gives iridescent rainbow fringes. Replaces the motion warp entirely.

2. **Comp color injection** (`nebula-pearl` approach): keep the motion preset's warp and comp intact, but replace fixed `vec3(r, g, b)` constants in **comp** with `vec3(q10, q11, q12)` fed from the donor's **frame_eqs** (e.g. mother-of-pearl's `wr/wb/wg` pattern). This **only tints** the image the motion warp already built. It does **not** copy mother-of-pearl's **warp-stage** look.

---

### Why `nebula-pearl` can match Magellan yet look nothing like mother-of-pearl

Side‑by‑side, **Magellan** + **mother-of-pearl** + **`nebula-pearl`** often show:

| Panel           | What you’re seeing                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Magellan        | High-contrast, channel-split **warp** feedback + corona **comp** + Flexi shape — “fiery web” structure is mostly **warp output** before comp tints it.                                                                                                                                                                   |
| mother-of-pearl | Soft, horizontal **silk** and **iridescent fringes** — the iconic look is largely the **warp** shader: it mixes the image with `vec3(q10,q11,q12)` and adds **cross-product** terms `(rgb × permuted rgb)` so color **depends on local image direction** (pearlescent highlights), gated by **`q3`** (volume) and noise. |
| `nebula-pearl`  | **Magellan’s warp** + **comp** with **`wr/wb/wg` low-passed into `q10`–`q12`** (`pTint` / `pAlt` in comp — scaled `vec3(q10,q11,q12)` and complementary swap, not MoP’s warp cross-product). Tier (**Y**) adjusts `q1` burst, pixel zoom/rot, wave color wobble, and tint smoothing (`qColA` / `qColB`).                 |

**Bottom line:** “Same colors as mother-of-pearl” in **frame_eqs** ≠ “same visual texture.” The pearl **texture** is mostly **shader math in `warp`**, not the slow RGB triple in `frame_eqs`.

**If you want mother-of-pearl’s actual surface:** you must use **mother-of-pearl’s `warp`** (losing Magellan’s oil/water motion), or **author a new warp** that combines ideas from both (advanced). **MilkDrop2077**-style mashing or hand-merged GLSL is the practical route.

**If you want Magellan’s structure with softer pearl:** keep comp injection but **remove** aggressive neutral `mix(...)` and litmus **multiply** (they fight both sources), **raise saturation** in the comp tint, and accept that **fringes still won’t match** MoP without warp work.

---

### Step-by-step

1. **Get both presets via `getPresets()`** — not from `presets/converted/`. Verify exact key names. Inspect `.warp` and `.comp` strings in Node.
2. **Decide your color injection strategy:**
   - If the color donor's warp does cross-product color math → use that warp, lose the motion warp's shape
   - If you want to preserve the motion preset's shape → keep its warp+comp, inject color by replacing fixed `vec3` constants in the comp with uniforms such as `vec3(q10, q11, q12)` **only on registers the motion preset’s `frame_eqs_str` does not already use** (see `royal-star-forge`: `q14`–`q16` instead of `q10`–`q12`)
3. **Add audio reactivity via `pixel_eqs_str`** from the motion donor — this is independent of the warp/comp shaders and can always be stacked.
4. **Merge `frame_eqs_str`**: motion block (q1, mv_x/y, zoom, rot) from one preset + color cycle (wr/wb/wg → q10/q11/q12) from the other. Concatenate; audit q-register collisions.
5. **Watch comp brightness calibration** — a comp with `* 12.0` multiplier is calibrated for dark images. Applied to a bright turbulent warp, it overexposes. Use the motion donor's comp if the color donor's comp blows out.
6. **Use the motion donor's `baseVals`** for structural character (echo\_\*, darken, wave_mode, decay).
7. **Set `wave_a: 0`** if `wave_mode` draws a visible waveform line you don't want.
8. **Audit q-register collisions** — list every q slot used, rename if they overlap.

---

### Worked example: `nebula-pearl` (current: v12 in repo — see file header)

**File:** `src/presets/nebula-pearl.ts`  
**Goal (achievable):** Magellan’s nebula **structure** (warp + corona comp + Flexi shape + pixel_eqs punch), with **slow global tint** driven by phase-staggered `wr/wb/wg` smoothed into `q10`–`q12`.  
**Goal (not achieved by this strategy alone):** mother-of-pearl’s **smooth iridescent surface** — that requires MoP’s **warp** (see table above).

**Strategy used:** comp color injection — `pTint` / `pAlt` in comp use scaled `vec3(q10,q11,q12)` and `vec3(q12,q11,q10)`; `frame_eqs_str` runs dual **sines** on `wr/wb/wg`, then **`a.q10 = qColA*q10 + qColB*wr`** (and same for `q11`/`q12`), plus audio wobble on `wave_r` / `wave_g` / `wave_b`. **Cannot** reproduce MoP’s **cross-product warp** fringes without swapping warp.

#### What each donor contributed

**From Magellan's Nebula — warp + comp + motion equations (structure)**

Magellan's warp uses blur2 gradient vectors to displace R, G, B channels independently — this creates the oil/water fluid motion:

```glsl
// Simplified: compute gradient from blur2, use as displacement per channel
vec2 disp = gradient * 0.01;
ret_2.x = texture(sampler_fw_main, uv - disp).x;  // R offset one way
ret_2.y = texture(sampler_fw_main, uv + disp_perp).y;  // G offset another
// B is implicit from ret_2.z
```

Magellan's comp applies a polar coordinate projection creating the dark-center nebula corona shape, then colors it with fixed constants:

```glsl
// Original: fixed blue-white and brown
ret_6 = brightness * vec3(0.3, 0.5, 0.7);           // blue-white nebula
mix(ret_6, vec3(0.2, 0.1, 0.0), inner_mask);         // brown inner region
```

The `pixel_eqs_str` adds audio-reactive zoom + rotation bursts on beats:

```js
a.zoom += 0.0125 * a.q1;
a.rot += 0.025 * Math.sin(10 * a.fps) * a.q1;
```

**From mother-of-pearl — color _idea_ (`wr` / `wb` / `wg` pattern, not a verbatim MoP preset)**

`nebula-pearl` uses the same _style_ of slow RGB phases (staggered sines on `a.wr` / `a.wb` / `a.wg`), then feeds comp uniforms through a **low-pass** (tier-tuned `qColA` / `qColB`), not a direct `q10 = wr` assignment:

```js
a.wr = 0.5 + 0.42 * (0.6 * Math.sin(1.1 * a.time) + 0.4 * Math.sin(0.8 * a.time));
a.wb = 0.5 + 0.42 * (0.6 * Math.sin(1.6 * a.time) + 0.4 * Math.sin(0.5 * a.time));
a.wg = 0.5 + 0.42 * (0.6 * Math.sin(1.34 * a.time) + 0.4 * Math.sin(0.4 * a.time));
a.q10 = qColA * a.q10 + qColB * a.wr; // + same pattern for q11, q12; then clamp boost
```

**The injection:** Magellan’s comp was rewritten to use **`pTint` / `pAlt`** — scaled, clamped `vec3(q10,q11,q12)` and `vec3(q12,q11,q10)` multiplied into the corona brightness path (see `COMP` in `nebula-pearl.ts`), instead of fixed RGB constants.

The corona **tint** cycles slowly while **motion** stays Magellan-like. **Do not expect** the middle panel of a three-way compare to match — that is **warp-level** appearance.

#### Gotchas encountered

| Problem                                     | Cause                                                                                                                                                          | Fix                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Black screen, no shader errors              | Shaders copied from `presets/converted/` JSON (wrong format)                                                                                                   | Use `getPresets()` via Node                                     |
| Panel in debug view showing nothing (black) | Preset key string was wrong — partial name that doesn't exist                                                                                                  | Verify exact key via `Object.keys(presets).filter(...)` in Node |
| White overexposure                          | Used mother-of-pearl's comp (×12 multiplier) on Magellan's bright warp output                                                                                  | Use Magellan's own comp instead; inject color there             |
| Horizontal line through middle              | `wave_mode: 6` + `wave_a > 0` draws an audio waveform bar                                                                                                      | Set `wave_a: 0`                                                 |
| v1 nebula-pearl had wrong shape             | Used mother-of-pearl's warp (smooth silk push) instead of Magellan's (gradient oil/water)                                                                      | Use Magellan's warp; inject color in comp instead               |
| Looks like B&W / thin web vs MoP            | Neutral `mix` toward gray in comp + litmus **multiply toward white** killed saturation (fixed in v4); remaining gap vs MoP is still **warp**-stage iridescence | See “Why nebula-pearl…” above                                   |

#### Q-register map

| Slot                  | Source                                   | Purpose                                              |
| --------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `q1`                  | nebula `frame_eqs` (via `q15` smoothing) | Audio energy burst → Flexi `rad`, pixel_eqs zoom/rot |
| `q15`                 | nebula `frame_eqs`                       | Low-pass of `q1` for stabler motion read             |
| `q10` / `q11` / `q12` | nebula `frame_eqs`                       | `wr` / `wb` / `wg` → comp `pTint` / `pAlt`           |

---

### Worked example: `royal-star-forge`

**File:** `src/presets/royal-star-forge.ts`  
**Donors:** `Fumbling_Foo & Flexi, Martin, Orb - Star Forge v16` (motion / beat / warp / comp shell) + `$$$ Royal - Mashup (220)` (palette: `baseVals` overlay, three spectrum waves copied into wave slots 1–3).  
**Why not `q10`–`q12` for tint?** Star Forge’s own `frame_eqs_str` already uses **`q11`–`q13`** for internal logic, so tint is applied with **`q14`–`q16`** in comp and the same `wr` / `wb` / `wg` low-pass pattern as `nebula-pearl`, appended after Star Forge’s frame equations. **Always audit q collisions** when appending `frame_eqs_str`.

---

### Worked example: `royal-pink-forge` — full palette substitution

**File:** `src/presets/royal-pink-forge.ts`  
**Donors:** same as `royal-star-forge` (Mandelverse motion + Royal Mashup waves).  
**Goal:** swap original green/blue color identity for **dark pink** (`#C71585`) and **light pink** (`#FFB6C1`), then add a deep red wash in dark zones.

This preset surfaces several **color-substitution gotchas** that don't show up when you only tweak hues. If you ever try to retheme a preset by recoloring, read this section first.

#### Gotcha 1 — multiplicative tint cannot replace a hue, only attenuate it

A common pattern is `ret = src * tint;` in comp. This works to push colors *toward* a tint, but it **cannot remove a channel that's already in `src`**. Light pink has `G = 0.71`, so `whitePixel * lightPink = (1.0, 0.71, 0.76)` — green is still 71% present. Multiplicative tinting toward a non-pure-channel color **cannot eliminate green**.

**Fix:** abandon multiplicative tinting and do **luma → palette mapping** instead. Compute source luma (`dot(src, vec3(0.299, 0.587, 0.114))`) and use it to drive a fixed palette. Output color is determined by your palette, not the source's hue.

```glsl
float lum = dot(tmpvar_32.xyz, vec3(0.299, 0.587, 0.114));
vec3 pinkMix = mix(darkPink, lightPink, mixT);   // mixT from q-register oscillator
float bright = clamp(lum * gain + 0.05, 0.0, 1.0);
float desat = pow(bright, 1.4);
vec3 lit = mix(pinkMix * bright, vec3(bright), desat);
```

Three brightness zones emerge: `lum=0` → black, `lum≈0.5` → pink, `lum=1` → white. The `pow(bright, 1.4)` exponent controls how aggressively highlights desaturate to white (lower → more white, higher → more pink).

#### Gotcha 2 — shapes draw AFTER comp, so comp tint never reaches them

Mandelverse ships **4 enabled shapes** (`p.shapes[]`) with `g: 1` and `b: 1` baseVals — these render **on top of** the comp output. No matter what you do in the comp shader, those shapes paint their original green/cyan over the top.

**Fix:** override `baseVals.r/g/b/r2/g2/b2` on every enabled shape. Note that **MilkDrop fills unset color channels with `1.0` for `r/g/b/a` and `0.0` for `r2/g2/b2`**, so set every channel explicitly:

```ts
Object.assign(p.shapes[i].baseVals, {
  r: 0.78, g: 0.08, b: 0.52,
  r2: 0.78, g2: 0.08, b2: 0.52,
});
```

Same applies to **outer border** (`ob_r/ob_g/ob_b`) — Mandelverse's defaults `ob_g=0.1, ob_b=1` paint a blue-green frame edge that comp also can't touch.

#### Gotcha 3 — wave `point_eqs_str` overrides `wave_r/g/b`

Royal Mashup wave slots set `a.r = 1 + sin(sp)` and `a.g = 1 + sin(sp)` directly inside `point_eqs_str`. The global `wave_r/g/b` baseVals you set in the overlay are **ignored** for those waves because the per-point equations write last.

**Fix:** append palette overrides to each wave's `point_eqs_str` so last-write-wins forces RGB onto the palette:

```ts
const darkPinkPaint =
  `;a.r=${DARK_PINK_R}*(1+Math.sin(a.sp));` +
  `a.g=${DARK_PINK_G}*(1+Math.sin(a.sp));` +
  `a.b=${DARK_PINK_B}*(1+Math.sin(a.sp));`;
p.waves[1].point_eqs_str = (p.waves[1].point_eqs_str ?? "") + darkPinkPaint;
```

#### Gotcha 4 — clamping `lit = min(vec3(1.0), pinkMix * mult)` kills highlights

If you cap the multiplier at 1.0 to "stay in the palette", brightest pixels max out at `pinkMix` itself (e.g. dark pink `(0.78, 0.08, 0.52)`) — you lose all white highlights. Conversely, if you let the multiplier exceed 1.0 freely, bright pixels clamp to vec3(1.0) = white and the palette disappears.

**Fix:** progressive desaturation via `mix(pinkMix * bright, vec3(bright), desat)` with `desat = pow(bright, exponent)`. Low luma → pure palette; high luma → smooth fade to white. No threshold cliffs.

#### Gotcha 5 — adding a third color (red) needs sharp falloff

To paint a third color in the *un-lit* zones (e.g. red in shadows), use a curve that collapses fast:

```glsl
float redMix = pow(1.0 - bright, 3.0) * (1.0 - desat);
lit += deepRed * redMix * (0.28 + 0.15 * q17);
```

Linear `(1 - bright)` swamps mid-tones; cubic confines red to deep darks only. The `(1 - desat)` factor ensures red also fades out as highlights desaturate to white, preventing red bleed into bright spots.

#### Color-substitution checklist

When retheming a preset, audit every render stage that produces color:

1. **Source `tmpvar_*` in comp** — replace via luma → palette mapping, not multiplicative tint.
2. **`p.baseVals.wave_r/g/b`** — set to palette base.
3. **`p.baseVals.ob_r/g/b`** — outer border.
4. **`p.baseVals.ib_r/g/b`** — inner border.
5. **`p.shapes[i].baseVals.r/g/b/r2/g2/b2`** — every enabled shape, every channel (Milkdrop fills unset with 1.0).
6. **`p.shapes[i].frame_eqs_str` / `init_eqs_str`** — grep for `a.r =`, `a.g =`, `a.b =`.
7. **`p.waves[i].point_eqs_str` / `frame_eqs_str`** — same grep, append palette override since last-write-wins.

Skip any of these and a color will leak through.

---

## Stock-Preset Overlays (Movement)

When tweaking presets that ship in the `butterchurn-presets` npm pkg, you have two paths:

1. **Light overlay** — append code to `frame_eqs_str` / `pixel_eqs_str` and string-replace literals in `comp` / `warp` GLSL. Lives in `src/presets/stock-overlays.ts`. Best for color tints, audio reactivity, motion damping that don't need the preset's full equation rewritten.
2. **JSON-backed deep variant** (gunthry-style) — snapshot the upstream preset to `src/presets/json/<name>.butterchurn.json`, import it from a TS module under `src/presets/`, deeply modify in TS at module load, and register in `main.ts` `allPresets`. Best for slow-down rewrites where you need to scale every `Math.sin(K*a.time)` coefficient or restructure equations.

### Overlay system (`stock-overlays.ts`)

```ts
type StockOverlay = {
  baseValsSet?: Partial<Record<string, number>>;
  frameAppend?: string;   // appended to frame_eqs_str (runs AFTER preset)
  pixelAppend?: string;   // appended to pixel_eqs_str (runs AFTER preset)
  compReplace?: ReadonlyArray<readonly [string, string]>;  // exact-string substitutions in comp GLSL
};
```

Applied at `loadPreset()` time after `clonePresetGraphForButterchurn` (fresh JSON clone — never mutates the cached upstream object).

### Critical gotchas

#### 1. butterchurn-presets ships **compiled JS**, not Milkdrop EEL

```js
// frame_eqs_str sample from upstream:
a.wave_r=.5+.5*Math.sin(1.6*a.time);
a.warp=2;
a.ob_r+=a.wave_b*above(Math.sin(.1*a.time),0);
```

Variables namespaced as `a.<var>`. So `frameAppend` MUST use `a.zoom`, `a.warp`, `a.bass`, `a.q1`, etc. Use JS ternaries (`cond ? x : y`) — `if(c,a,b)` is treated as JS keyword and throws `SyntaxError: expected expression, got keyword 'if'`. Symptoms when you forget: `ReferenceError: zoom is not defined` (no `a.` prefix) or syntax error on `if`.

#### 2. `*_att` auto-levels — kills sustained reactivity

`bass_att / mid_att / treb_att` are auto-leveled — they normalize toward 1.0 over ~seconds. Sustained loud audio sees them shrink back near 1, so `Math.max(0, att-1)` decays toward zero and reactivity dies after a few seconds.

For sustained reactivity (e.g. always-pumping zoom on every beat for a long song): use raw `a.bass`, `a.mid`, `a.treb`. They stay raw 0..3+ regardless of duration.

For transient-only kicks (only flash on peaks, ignore baseline): keep `Math.max(0, att - 1)`.

#### 3. `wave_r/g/b` is NOT always the visible color source

Some presets render their dominant colors via **hardcoded `vec3` literals in the comp shader**, not from `wave_r/g/b`. Setting `a.wave_r/g/b` does nothing visible.

Detect: dump `p.comp` and grep for `vec3(`. If the shader has hardcoded color vectors driving the output (`ret_1 = ret_1 + (vec3(R,G,B) * ...)`), those override `wave_r/g/b`.

Fix: use `compReplace` to swap the literals for either:
- A spatial palette `vec3(...)` from a `mix(mix(...), mix(...), uv.y)` corner blend
- A `q`-uniform reference (`vec3(q15, q16, q17)`) you populate from frame_eqs
- A computed expression like `(_palette * 4.0)` after injecting a local `vec3 _palette = …;` decl

Example (shifter — pink/lilac/mint/light-blue spatial palette):

```ts
compReplace: [
  // Inject _palette decl after the existing tmpvar setup
  [
    "tmpvar_3 = (tmpvar_2 * 2.5);",
    "tmpvar_3 = (tmpvar_2 * 2.5);\n  vec2 _t = smoothstep(vec2(0.4), vec2(0.6), uv);\n  vec3 _palette = mix(mix(vec3(1.00,0.45,0.75), vec3(0.78,0.55,1.00), _t.x), mix(vec3(0.55,1.00,0.78), vec3(0.55,0.85,1.00), _t.x), _t.y);",
  ],
  // Swap hardcoded color literals
  ["vec3(3.4, 2.38, 1.02)", "(_palette * 6.0)"],
  ["vec3(0.68, 1.7, 2.38)", "(_palette * 4.0)"],
],
```

#### 4. Spatial palette beats time-cycle palette for "all 4 colors visible"

If user wants 4 distinct colors visible **simultaneously**, don't cycle through them via `time` — they'll only see one slot at a time. Use a `uv`-driven blend instead:

```glsl
vec2 _t = smoothstep(vec2(0.4), vec2(0.6), uv);
vec3 _palette = mix(
  mix(vec3(R0,G0,B0), vec3(R1,G1,B1), _t.x),  // top edge
  mix(vec3(R2,G2,B2), vec3(R3,G3,B3), _t.x),  // bottom edge
  _t.y                                          // blend top → bottom
);
```

`smoothstep(0.4, 0.6, uv)` over plain `uv` gives sharp quadrants with thin transitions — pure colors over ~80% of each quadrant. Plain `mix(..., uv.y)` averages everything to a muddy mix.

#### 5. Comp shader edges → empty zones stay black

Many presets only paint along Sobel-edge differentials (`+= vec3(...) * (sample_a - sample_b)`). Where the preset has no edges, the pixel stays at the previous-frame feedback. If you replace the feedback with a tinted version, those zones still depend on the prior frame having color.

Fix: replace the feedback sample with `_palette * (floor + luminance * scale)`:

```ts
[
  "(texture (sampler_main, uv).xyz * 0.5)",
  "(_palette * (0.55 + dot(texture(sampler_main, uv).xyz, vec3(0.30, 0.59, 0.11)) * 2.0))",
],
```

`0.55` floor → every pixel always shows palette at 55%. `luminance * 2.0` → motion brightens it. Now empty zones still display the corner's color.

#### 6. `pixel_eqs_str` runs AFTER `frame_eqs_str`

Per-pixel runs once per mesh vertex (~1700×/frame), AFTER per-frame. So if `pixel_eqs` reassigns `a.warp = a.bass`, your `frameAppend` damping of `a.warp` is overwritten. Solution: also append to `pixel_eqs_str` with `pixelAppend`.

#### 7. Audio gate for genuine stillness at silence

Floor + slope (`0.05 + 0.6*en`) leaves residual motion at silence. To make idle FULLY still, multiply everything by a gate:

```js
var _en = (a.bass + a.mid + a.treb) * 0.5;
var _gate = Math.min(1, _en * 6.0);   // 0 below en≈0.17, 1 above
a.zoom = 1 + (a.zoom - 1)*_gate*_motion;
a.warp = a.warp*_gate*_motion;
a.warpanimspeed = 0.3*_gate;          // critical — drives the warp shader's own animation
a.wave_a = _gate * 0.18;
```

`warpanimspeed` is the easy-to-miss one — the warp shader's swirl pattern animates regardless of zoom/warp magnitudes unless this is gated.

### JSON-backed slow variants (gunthry-style)

Pattern for deeply modifying upstream presets (used for Aderrasi Potion of Spirits, Flexi mindblob, Zylot Paint Spill, Zylot True Visionary):

1. **Snapshot to JSON**: `node scripts/build-stock-preset-snapshot.mjs` (extend `PRESETS` array with `[upstreamName, outFilename]`).
2. **Import + modify in TS**: `src/presets/<name>-slow.ts` imports the JSON, deep-clones, mutates baseVals + transforms `frame_eqs_str` / `pixel_eqs_str`, exports.
3. **Register in `main.ts`**: add to `allPresets[KEY_SORTED] = preset;` and **remove the original from `SELECTED_STOCK_PRESETS`** (otherwise both load and the upstream wins by alphabetical order or last-write).

#### Time-coefficient scaling helper

`src/presets/preset-slowdown.ts` exports `scaleTimeCoeff(src, factor)` which rewrites every `Math.sin(K*a.time)` / `Math.cos(K*a.time)` / `Math.tan(K*a.time)` (and bare `Math.sin(a.time)`) to multiply `K` by `factor`. Spatial trig (`Math.cos(6*a.ang)`, `Math.sin(a.x)`) is left alone.

```ts
const TIME_FACTOR = 0.30;  // 3.3× slower
src.pixel_eqs_str = scaleTimeCoeff(src.pixel_eqs_str, TIME_FACTOR);
```

For preset-specific motion magnitudes (e.g. Aderrasi's `.05*equal(...)*Math.sin(5*a.time)` for dx_r), add per-preset string replacements:

```ts
src.pixel_eqs_str = src.pixel_eqs_str
  .replace(/a\.dx_r=\.05\*/g,    `a.dx_r=${(0.05 * MOTION_FACTOR).toFixed(4)}*`)
  .replace(/a\.zoom-=\.0825\*/g, `a.zoom-=${(0.0825 * MOTION_FACTOR).toFixed(4)}*`);
```

#### Spring-physics presets need different scaling

Flexi mindblob has zero `Math.sin(K*a.time)` calls — its motion comes from a spring rig:

```js
a.spring=18; a.dt=.0003;   // stiffness + integration timestep
a.vx2 = a.vx2*(1-a.resist*a.dt) + a.dt*(a.x1+a.x3-2*a.x2)*a.spring;
```

Slow it by scaling `dt` (sim time-step) and `spring` (stiffness):

```ts
src.frame_eqs_str = src.frame_eqs_str
  .replace(/a\.dt=\.0003/g, `a.dt=${(0.0003 * 0.7).toFixed(6)}`)
  .replace(/a\.spring=18/g, `a.spring=${(18 * 0.7).toFixed(2)}`);
```

`scaleTimeCoeff` is a no-op here.

### When overlay vs JSON-backed?

| Need | Use overlay | Use JSON-backed |
|---|---|---|
| Re-tint colors via `wave_r/g/b` | ✅ | overkill |
| Audio reactivity tweaks | ✅ | overkill |
| Replace hardcoded `vec3` in shader | ✅ via `compReplace` | also fine |
| Slow down by 0.6–1.0× | ✅ via `frameAppend` damping | ✅ |
| Slow down aggressively (0.3× or less) | ❌ damping doesn't reach pixel_eqs time coeffs | ✅ via `scaleTimeCoeff` |
| Restructure equations / change motion topology | ❌ | ✅ |
| Need preset to remain editable as JSON file | ❌ | ✅ |

---

## Quick Reference

### Butterchurn `_str` equation cheat sheet

```js
// Audio (frame_eqs_str)
a.q1 = a.bass;
a.q2 = a.mid;
a.q3 = a.treb;
a.q4 = a.bass_att;
a.q5 = a.mid_att;
a.q6 = a.treb_att;

// Beat detect
a.beat = above(a.bass, a.bass_att * 1.3) && !above(a.cd, 0) ? 1 : 0;
a.cd = Math.max(0, a.cd - 1) + a.beat * 20;
a.q7 = a.beat ? 1.0 : a.q7 * 0.85;

// Motion
a.zoom = 1.0 + a.bass * 0.02;
a.rot = a.rot + a.mid * 0.005;
a.decay = 0.97 + a.vol_att * 0.02;

// Color cycle
a.phase = a.phase + 0.01;
a.q10 = Math.sin(a.phase);
a.q11 = Math.sin(a.phase + 2.094);
a.q12 = Math.sin(a.phase + 4.189);
```

### GLSL uniform cheat sheet

```glsl
uniform float time, fps, frame;
uniform float bass, mid, treb, bass_att, mid_att, treb_att;
uniform float q1 /* .. */ q32;
uniform float zoom, rot, warp, decay;
uniform vec2  resolution;
uniform sampler2D sampler_main, sampler_blur1, sampler_blur2, sampler_blur3;
uniform sampler2D sampler_noise_lq, sampler_noise_hq;
varying vec2 uv, uv_orig;
```
