/**
 * Converts vendored Mandelverse JSON (init/frame/pixel/shape/wave *_eel) into
 * butterchurn-ready *_str fields. Run after updating the source .json from upstream.
 *
 *   npm run build:mandelverse
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  convertPresetEquations,
  convertShapeEquations,
  convertWaveEquations,
} = require("milkdrop-preset-converter");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcName = "Fumbling_Foo + En D & Martin - Mandelverse.json";
const srcPath = join(root, "src/presets/json", srcName);
const outPath = join(
  root,
  "src/presets/json",
  "Fumbling_Foo + En D & Martin - Mandelverse.butterchurn.json",
);

function stripEel(o) {
  const { init_eqs_eel, frame_eqs_eel, point_eqs_eel, pixel_eqs_eel, ...rest } =
    o;
  return rest;
}

const j = JSON.parse(readFileSync(srcPath, "utf8"));

const main = convertPresetEquations(
  j.pixel_eqs_eel,
  j.init_eqs_eel,
  j.frame_eqs_eel,
);

const shapes = j.shapes.map((s) => {
  const eq = convertShapeEquations(s.init_eqs_eel ?? "", s.frame_eqs_eel ?? "");
  return stripEel({
    ...s,
    init_eqs_str: eq.init_eqs_str,
    frame_eqs_str: eq.frame_eqs_str,
  });
});

const waves = j.waves.map((w) => {
  const eq = convertWaveEquations(
    w.init_eqs_eel ?? "",
    w.frame_eqs_eel ?? "",
    w.point_eqs_eel ?? "",
  );
  return stripEel({
    ...w,
    init_eqs_str: eq.init_eqs_str,
    frame_eqs_str: eq.frame_eqs_str,
    point_eqs_str: eq.point_eqs_str,
  });
});

const { init_eqs_eel, frame_eqs_eel, pixel_eqs_eel, ...base } = j;
const out = { ...base, ...main, shapes, waves };

if (typeof out.init_eqs_str !== "string" || out.init_eqs_str.length < 10) {
  throw new Error(
    "build-mandelverse-butterchurn: missing init_eqs_str — source file must use *_eel fields (not the butterchurn output).",
  );
}

// milkdrop-preset-converter often returns empty pixel_eqs_str even when pixel_eqs_eel
// is set. Mandelverse needs per-pixel dx/dy/rot (q11–q16) or the scene stays black.
if (!String(out.pixel_eqs_str ?? "").trim() && String(j.pixel_eqs_eel ?? "").trim()) {
  out.pixel_eqs_str =
    "a.warp=0;a.zoom=1;a.dx=-a.q12/a.q16*(1+0*Math.pow(a.x-0.5,2));a.dy=a.q13/a.q16*(1+0*Math.pow(a.y-0.5,2));a.rot=a.q11;";
}

if (!String(out.pixel_eqs_str ?? "").trim()) {
  throw new Error(
    "build-mandelverse-butterchurn: pixel_eqs_str is required for this preset.",
  );
}

// Mandelverse divides by q16 in pixel_eqs_str and GLSL comp. Ensure q16 is initialized
// to a non-zero value; the original EEL uses: q16 = 1 + rand(2);
// The converter may drop or zero this, causing black screen.
if (!/a\['q16'\]\s*=\s*(?!0\b)([1-9]|1\.[0-9]+|2\.[0-9]+)/.test(out.init_eqs_str)) {
  // Replace any q16 = 0; or inject a reasonable default if missing
  if (/a\['q16'\]\s*=\s*0/.test(out.init_eqs_str)) {
    out.init_eqs_str = out.init_eqs_str.replace(
      /a\['q16'\]\s*=\s*0;?/, // n before ;
      "a['q16'] = 1.0 + Math.random() * 2;"
    );
  } else {
    // No q16 assignment at all – append before any first use or at end
    out.init_eqs_str = out.init_eqs_str.replace(
      /(a\['q11'\]\s*=\s*0;)/,
      "$1 a['q16'] = 1.0 + Math.random() * 2;"
    );
    // If the above didn't match, just append
    if (!/a\['q16'\]/.test(out.init_eqs_str)) {
      out.init_eqs_str += " a['q16'] = 1.0 + Math.random() * 2;";
    }
  }
}

try {
  new Function("a", `${out.pixel_eqs_str} return a;`);
} catch (e) {
  throw new Error(
    `build-mandelverse-butterchurn: pixel_eqs_str does not compile: ${e.message}`,
  );
}

writeFileSync(outPath, JSON.stringify(out) + "\n", "utf8");
console.log("wrote", outPath);
