/**
 * Fetch the "gunthry … pine trees - adm atomising (v) the disintigrate (n).milk"
 * preset from the projectM "Cream of the Crop" repo, convert it to butterchurn
 * JSON, and write it to src/presets/json/.
 *
 *   node scripts/build-gunthry-preset.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { convertPreset } = require("milkdrop-preset-converter");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const PRESET_NAME =
  "gunthry is out back bloodying up the pine trees - adm atomising (v) the disintigrate (n)";

// Raw GitHub URL — repo path uses spaces and parens, must be URL-encoded.
const repoPath =
  "Drawing/Liquid Mirror/gunthry is out back bloodying up the pine trees - adm atomising (v) the disintigrate (n).milk";
const url =
  "https://raw.githubusercontent.com/projectM-visualizer/presets-cream-of-the-crop/master/" +
  encodeURI(repoPath);

const outDir = join(root, "src/presets/json");
const outPath = join(outDir, "gunthry-pine-trees.butterchurn.json");

const res = await fetch(url);
if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
const milkText = await res.text();
console.log(`[fetch] ${milkText.length} bytes`);

// convertPreset is async (Promise) and takes (presetText) only.
const converted = await convertPreset(milkText);
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(converted));
console.log(`[write] ${outPath} (${JSON.stringify(converted).length} bytes)`);
console.log(`[ok] keys: ${Object.keys(converted).join(", ")}`);
console.log(`[ok] preset name: ${PRESET_NAME}`);
