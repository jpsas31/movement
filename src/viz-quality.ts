/** Butterchurn: texsize = width × pixelRatio × textureRatio (see library Renderer). */
export function displayPixelRatio(): number {
  return window.devicePixelRatio || 1;
}

export function butterchurnQualityOpts(lowRes: boolean): {
  pixelRatio: number;
  textureRatio: number;
} {
  if (lowRes) return { pixelRatio: 1, textureRatio: 0.5 };
  return { pixelRatio: 1, textureRatio: 1 };
}
