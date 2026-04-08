/**
 * Custom presets under src/presets: intensity (Y) is applied only via each preset’s
 * `build(tier)` — the shared analyser GainNode stays at unity (1×) while they run.
 * Stock butterchurn-presets use `VIZ_AUDIO_GAIN[tier]` on the GainNode instead.
 */
import type { PresetWithBase } from "../preset-variants";
import type { VizIntensity } from "../viz-intensity";
import { createLinesPreset, LINES_PRESET_CANONICAL_ID, LINES_PRESET_KEY_SORTED } from "./lines";
import {
  createNebulaPearl,
  NEBULA_PEARL_PRESET_KEY,
  NEBULA_PEARL_PRESET_KEY_SORTED,
} from "./nebula-pearl";
import {
  createOrganicMandel,
  ORGANIC_MANDEL_PRESET_KEY,
  ORGANIC_MANDEL_PRESET_KEY_SORTED,
} from "./organic-mandel";
import { MANDELVERSE_PACK_PRESET_KEY } from "./mandelverse-pack-preset";
import {
  createRoyalStarForge,
  ROYAL_STAR_FORGE_PRESET_KEY,
  ROYAL_STAR_FORGE_PRESET_KEY_SORTED,
} from "./royal-star-forge";
import {
  createRoyalMashupMandel,
  ROYAL_MASHUP_MANDEL_PRESET_KEY,
  ROYAL_MASHUP_MANDEL_PRESET_KEY_SORTED,
} from "./royal-mashup-mandel";
import {
  createRoyalMashupMandelBright,
  ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY,
  ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY_SORTED,
} from "./royal-mashup-mandel-bright";

export type CustomPresetDefinition = {
  /** Must match `presetMapKey.trim()` (e.g. "nebula-pearl", "lines"). */
  canonicalId: string;
  /** Key in `presets` / `main.ts` (usually leading spaces for sort order). */
  mapKeySorted: string;
  build: (tier: VizIntensity) => PresetWithBase;
  /**
   * Stock `getPresets()` keys shown left → right before the custom preset in
   * `debug.html`. Missing keys (e.g. motion donor not shipped in minimal pack) are skipped with a console warning.
   */
  debugBasePresetKeys?: readonly string[];
};

/** Register new local presets here with their own `build` implementation. */
export const CUSTOM_PRESET_REGISTRY: CustomPresetDefinition[] = [
  {
    canonicalId: NEBULA_PEARL_PRESET_KEY,
    mapKeySorted: NEBULA_PEARL_PRESET_KEY_SORTED,
    build: createNebulaPearl,
    debugBasePresetKeys: [
      "TonyMilkdrop - Magellan's Nebula [Flexi - you enter first + multiverse]",
      "cope + martin - mother-of-pearl",
    ],
  },
  {
    canonicalId: ORGANIC_MANDEL_PRESET_KEY,
    mapKeySorted: ORGANIC_MANDEL_PRESET_KEY_SORTED,
    build: createOrganicMandel,
    debugBasePresetKeys: [
      "flexi + amandio c - organic12-3d-2.milk",
      "Fumbling_Foo + En D & Martin - Mandelverse",
    ],
  },
  {
    canonicalId: ROYAL_STAR_FORGE_PRESET_KEY,
    mapKeySorted: ROYAL_STAR_FORGE_PRESET_KEY_SORTED,
    build: createRoyalStarForge,
    debugBasePresetKeys: [MANDELVERSE_PACK_PRESET_KEY, "$$$ Royal - Mashup (220)"],
  },
  {
    canonicalId: ROYAL_MASHUP_MANDEL_PRESET_KEY,
    mapKeySorted: ROYAL_MASHUP_MANDEL_PRESET_KEY_SORTED,
    build: createRoyalMashupMandel,
    debugBasePresetKeys: [MANDELVERSE_PACK_PRESET_KEY, "$$$ Royal - Mashup (220)"],
  },
  {
    canonicalId: ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY,
    mapKeySorted: ROYAL_MASHUP_MANDEL_BRIGHT_PRESET_KEY_SORTED,
    build: createRoyalMashupMandelBright,
    debugBasePresetKeys: [MANDELVERSE_PACK_PRESET_KEY, "$$$ Royal - Mashup (220)"],
  },
  {
    canonicalId: LINES_PRESET_CANONICAL_ID,
    mapKeySorted: LINES_PRESET_KEY_SORTED,
    build: createLinesPreset,
  },
];

export function canonicalPresetId(mapKey: string): string {
  return mapKey.trim();
}

export function getCustomPresetEntry(mapKey: string): CustomPresetDefinition | null {
  const id = canonicalPresetId(mapKey);
  return CUSTOM_PRESET_REGISTRY.find((e) => e.canonicalId === id) ?? null;
}

export function rebuildAllCustomSlots(presets: Record<string, PresetWithBase>, tier: VizIntensity): void {
  for (const k of Object.keys(presets)) {
    const e = getCustomPresetEntry(k);
    if (e) presets[k] = e.build(tier);
  }
}
