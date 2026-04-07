/**
 * Global visual “intensity” (Y): scales audio into the analyser for every preset.
 * nebula-pearl additionally maps the same tier to its own equation set.
 */
export type VizIntensity = "mild" | "normal" | "hot";

export const VIZ_INTENSITY_ORDER: VizIntensity[] = [
  "mild",
  "normal",
  "hot",
];

export function nextVizIntensity(current: VizIntensity): VizIntensity {
  const i = VIZ_INTENSITY_ORDER.indexOf(current);
  return VIZ_INTENSITY_ORDER[(i + 1) % VIZ_INTENSITY_ORDER.length];
}

/** Gain applied before the shared AnalyserNode (Butterchurn + mold level meter). */
export const VIZ_AUDIO_GAIN: Record<VizIntensity, number> = {
  mild: 0.62,
  normal: 1,
  hot: 1.58,
};
