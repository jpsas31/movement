export type PresetWithBase = { baseVals: Record<string, number>; [key: string]: unknown };

/**
 * Butterchurn `loadPreset` mutates nested `shapes` / `waves` (adds `Function`s). Without a
 * deep clone, shared objects from `getPresets()` or JSON imports degrade across cycles.
 */
export function clonePresetGraphForButterchurn<T>(preset: T): T {
  return JSON.parse(JSON.stringify(preset)) as T;
}

export function applyGhostFreeze(
  preset: PresetWithBase,
  ghostMode: boolean,
  freezeMode: boolean,
): PresetWithBase {
  if (freezeMode) {
    return {
      ...preset,
      baseVals: {
        ...preset.baseVals,
        decay: 1.0,
        warp: 0,
        zoom: 1.0,
        rot: 0,
        dx: 0,
        dy: 0,
      },
    };
  }
  if (ghostMode) {
    return { ...preset, baseVals: { ...preset.baseVals, decay: 1.0 } };
  }
  return preset;
}
