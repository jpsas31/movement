// AudioContext is pinned to 16 kHz in audio-input.ts. No downsampling here.
// CHUNK_SAMPLES = 1600 -> ~100 ms per WS frame, multiple of silero's 512-sample step.
const CHUNK_SAMPLES = 1600;

class WsAudioProcessor extends AudioWorkletProcessor {
  private buffer = new Int16Array(CHUNK_SAMPLES);
  private bufferIndex = 0;

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.bufferIndex++] = sample * 32767;

      if (this.bufferIndex >= CHUNK_SAMPLES) {
        this.port.postMessage(this.buffer.slice());
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("ws-audio-processor", WsAudioProcessor);