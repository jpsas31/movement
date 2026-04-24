export type PresetWithBase = { baseVals: Record<string, number>; [key: string]: unknown };

export { clonePresetData as clonePresetGraphForButterchurn } from "./presets/utils";
