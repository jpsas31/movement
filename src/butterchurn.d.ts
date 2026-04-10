declare module 'butterchurn' {
  interface VisualizerOptions {
    width: number;
    height: number;
    pixelRatio?: number;
    textureRatio?: number;
  }

  /** @internal — not part of the public API; may change across butterchurn versions. */
  interface VisualizerRenderer {
    gl: WebGL2RenderingContext;
    noise: {
      noiseTexLQ: WebGLTexture;
    };
    /**
     * Current render target. butterchurn swaps prevTexture↔targetTexture at the
     * START of render(), so injecting into targetTexture BEFORE render() means it
     * will be read as sampler_pc_main (the "prev" input) during that render call.
     */
    targetTexture: WebGLTexture;
    prevTexture: WebGLTexture;
  }

  interface Visualizer {
    connectAudio(analyserNode: AnalyserNode): void;
    loadPreset(preset: object, blendTime: number): void;
    setRendererSize(
      width: number,
      height: number,
      opts?: { pixelRatio?: number; textureRatio?: number }
    ): void;
    render(): void;
    /** @internal */
    renderer: VisualizerRenderer;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: VisualizerOptions
    ): Visualizer;
  };

  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const butterchurnPresets: {
    getPresets(): Record<string, { baseVals: Record<string, number> }>;
  };
  export default butterchurnPresets;
}
