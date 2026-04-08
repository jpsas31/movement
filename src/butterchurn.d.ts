declare module 'butterchurn' {
  interface VisualizerOptions {
    width: number;
    height: number;
    pixelRatio?: number;
    textureRatio?: number;
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
