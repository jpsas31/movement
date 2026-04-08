/**
 * Vendored from upstream [butterchurn-presets](https://github.com/jberg/butterchurn-presets)
 * (`presets/converted/…Mandelverse.json`). The npm `butterchurn-presets@2.4.7` **minimal** bundle
 * predates this preset; npm stable has not been republished since 2018.
 */
/** EEL source: `Fumbling_Foo + En D & Martin - Mandelverse.json` — run `npm run build:mandelverse`. */
import type { PresetWithBase } from "../preset-variants";
import mandelversePackJson from "./json/Fumbling_Foo + En D & Martin - Mandelverse.butterchurn.json";

export const MANDELVERSE_PACK_PRESET_KEY =
  "Fumbling_Foo + En D & Martin - Mandelverse";

export const mandelversePackPreset = mandelversePackJson as unknown as PresetWithBase;
