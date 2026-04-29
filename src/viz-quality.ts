/** Butterchurn: texsize = width × pixelRatio × textureRatio (see library Renderer).
 *
 *  Capped at 1.0 — a 2× DPR retina display quadruples post-process fill rate
 *  for negligible visual gain on motion-heavy generative visuals. Halving the
 *  ratio recovers ~30% frame budget on Apple Silicon iGPUs in practice.
 */
export function displayPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 1.0);
}

export function butterchurnQualityOpts(lowRes: boolean): {
  pixelRatio: number;
  textureRatio: number;
} {
  if (lowRes) return { pixelRatio: 1, textureRatio: 0.5 };
  return { pixelRatio: 1, textureRatio: 1 };
}
