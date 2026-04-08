/**
 * Butterchurn `loadPreset` mutates nested `shapes` / `waves` arrays in place (adds
 * compiled `Function`s). JSON imports and `getPresets()` entries are shared references,
 * so they degrade after the first load. JSON round-trip drops functions and restores
 * string-only preset data safely.
 */
export function clonePresetData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}
