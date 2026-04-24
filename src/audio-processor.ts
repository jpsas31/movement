const DOWNSAMPLE_RATIO = 3; // 48 kHz → 16 kHz
const CHUNK_SAMPLES = 1600; // ~100 ms at 16 kHz

class WsAudioProcessor extends AudioWorkletProcessor {
  private buffer = new Int16Array(CHUNK_SAMPLES);
  private bufferIndex = 0;

  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += DOWNSAMPLE_RATIO) {
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