/**
 * Snapshot one or more presets from butterchurn-presets pkg into JSON files.
 * Mirrors the gunthry-pine-trees pattern: TS modules import the JSON and
 * apply per-preset modifications at module load time.
 *
 *   node scripts/build-stock-preset-snapshot.mjs
 *
 * To add a new snapshot, append `[upstream-name, out-filename]` to PRESETS.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const butterchurnPresets = require("butterchurn-presets");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "src/presets/json");

const PRESETS = [
  ["Aderrasi - Potion of Spirits",                     "aderrasi-potion.butterchurn.json"],
  ["Flexi - mindblob [shiny mix]",                     "flexi-mindblob.butterchurn.json"],
  ["Zylot - Paint Spill (Music Reactive Paint Mix)",   "zylot-paint-spill.butterchurn.json"],
  ["Zylot - True Visionary (Final Mix)",               "zylot-true-visionary.butterchurn.json"],
];

const presets = butterchurnPresets.getPresets();
mkdirSync(outDir, { recursive: true });

for (const [name, file] of PRESETS) {
  const p = presets[name];
  if (!p) {
    console.warn(`[skip] preset "${name}" not found in butterchurn-presets`);
    continue;
  }
  const path = join(outDir, file);
  writeFileSync(path, JSON.stringify(p, null, 2));
  console.log(
    `[write] ${file} (shapes:${(p.shapes ?? []).length} waves:${(p.waves ?? []).length} ` +
    `init:${(p.init_eqs_str ?? "").length}b frame:${(p.frame_eqs_str ?? "").length}b ` +
    `pixel:${(p.pixel_eqs_str ?? "").length}b)`,
  );
}
