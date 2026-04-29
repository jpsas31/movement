export type AudioInputKind = "mic" | "file";

function isUserDismissedError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return e.name === "NotAllowedError" || e.name === "AbortError";
}

function showBriefMessage(text: string, durationMs = 3000): void {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.75)",
    color: "white",
    padding: "10px 24px",
    borderRadius: "6px",
    fontSize: "14px",
    zIndex: "999999",
    pointerEvents: "none",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 350);
  }, durationMs);
}

function pickAudioFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,video/*";
    input.addEventListener("cancel", () => reject(new DOMException("Cancelled", "AbortError")));
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new DOMException("No file selected", "AbortError"));
    };
    input.click();
  });
}

export function formatAudioInputLabel(kind: AudioInputKind, variant: "main" | "compact"): string {
  if (variant === "compact") {
    return kind === "mic" ? "Audio: mic (A = file)" : "Audio: file (A = mic)";
  }
  return kind === "mic" ? "Audio: microphone (A = file)" : "Audio: file (A = mic)";
}

export type AudioAnalyserRig = {
  audioCtx: AudioContext;
  analyser: AnalyserNode;
  getLevel: () => number;
  toggleInput: () => Promise<void>;
  getInputKind: () => AudioInputKind;
  setAnalyserInputGain: (linear: number) => void;
  isVoiceEnabled: () => boolean;
  setVoiceEnabled: (on: boolean) => void;
};

export async function createAudioAnalyserRig(options?: {
  logPrefix?: string;
  onInputKindChange?: (kind: AudioInputKind, filename?: string) => void;
  onTrigger?: (trigger: string) => void;
}): Promise<AudioAnalyserRig> {
  const logPrefix = options?.logPrefix ?? "[audio]";
  // Two AudioContexts:
  //   audioCtx (default rate, usually 48 kHz) drives butterchurn's analyser and
  //     speaker playback. Default rate keeps full freq range (Nyquist 24 kHz)
  //     for visual reactivity.
  //   wsCtx (16 kHz, mic-only) feeds the WS audio worklet. Pinned so the worklet
  //     can ship int16 chunks without an in-worklet downsample step.
  const audioCtx = new AudioContext();
  const wsCtx = new AudioContext({ sampleRate: 16000 });
  console.log(logPrefix, "AudioContext rates: viz=", audioCtx.sampleRate, "ws=", wsCtx.sampleRate);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  const inputGain = audioCtx.createGain();
  inputGain.gain.value = 1;
  inputGain.connect(analyser);

  let inputKind: AudioInputKind = "mic";
  let currentSource: AudioNode;
  let currentCleanup: () => void;
  let currentWsAudioWorklet: AudioWorkletNode | null = null;
  let wsMicSource: MediaStreamAudioSourceNode | null = null;
  let wsMicConnected = false;
  let ws: WebSocket | null = null;
  let destinationConnected = false;
  let voiceEnabled = false;

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  currentSource = audioCtx.createMediaStreamSource(micStream);
  currentSource.connect(inputGain);
  currentCleanup = () => micStream.getTracks().forEach((t) => t.stop());
  void audioCtx.resume();
  void wsCtx.resume();

  await wsCtx.audioWorklet.addModule(new URL("audio-processor.ts", import.meta.url));
  currentWsAudioWorklet = new AudioWorkletNode(wsCtx, "ws-audio-processor");
  // Mic feed for the WS path lives on wsCtx so its sample rate is exactly
  // 16 kHz. We connect/disconnect from the worklet on voice toggle to keep
  // the audio thread idle when the user has voice off.
  wsMicSource = wsCtx.createMediaStreamSource(micStream);
  const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);
  // ~256 KB ≈ 4 s of int16 16 kHz audio queued in the WS send buffer; past
  // this we drop new chunks. Prevents an unbounded outbound queue when the
  // page is backgrounded or the network briefly stalls.
  const WS_BACKPRESSURE_BYTES = 256_000;
  let droppedChunks = 0;
  currentWsAudioWorklet.port.onmessage = (event) => {
    if (!voiceEnabled || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > WS_BACKPRESSURE_BYTES) {
      droppedChunks++;
      if (droppedChunks % 50 === 1) {
        console.warn(logPrefix, "ws backpressure: dropped", droppedChunks, "audio chunks (buffered=", ws.bufferedAmount, ")");
      }
      return;
    }
    ws.send(event.data);
  };
  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      console.warn(logPrefix, "non-text ws frame ignored");
      return;
    }
    if (!voiceEnabled) return;
    try {
      const msg = JSON.parse(event.data);
      if (msg && typeof msg.trigger === "string") {
        options?.onTrigger?.(msg.trigger);
      }
    } catch (err) {
      console.warn(logPrefix, "bad ws message:", event.data, err);
    }
  });

  const levelData = new Uint8Array(analyser.frequencyBinCount);
  function getLevel(): number {
    analyser.getByteFrequencyData(levelData);
    let sum = 0;
    for (let i = 0; i < levelData.length; i++) sum += levelData[i];
    return sum / levelData.length / 255;
  }

  options?.onInputKindChange?.(inputKind);

  async function toggleInput(): Promise<void> {
    const next: AudioInputKind = inputKind === "mic" ? "file" : "mic";
    console.log(logPrefix, "toggleInput; switching to:", next);

    try {
      let newSource: AudioNode;
      let newCleanup: () => void;
      let filename: string | undefined;

      if (next === "mic") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        newSource = audioCtx.createMediaStreamSource(stream);
        newCleanup = () => stream.getTracks().forEach((t) => t.stop());
        // Rebuild the wsCtx mic source on top of the same stream so the WS
        // worklet keeps producing 16 kHz chunks after a file -> mic switch.
        if (wsMicSource) {
          try { wsMicSource.disconnect(); } catch { /* not connected */ }
        }
        wsMicSource = wsCtx.createMediaStreamSource(stream);
        if (voiceEnabled && currentWsAudioWorklet) {
          wsMicSource.connect(currentWsAudioWorklet);
          wsMicConnected = true;
        } else {
          wsMicConnected = false;
        }
        // Stop routing file audio to speakers
        if (destinationConnected) {
          inputGain.disconnect(audioCtx.destination);
          destinationConnected = false;
        }
      } else {
        const file = await pickAudioFile();
        filename = file.name;
        const url = URL.createObjectURL(file);
        try {
          const audioEl = new Audio(url);
          audioEl.loop = true;
          await audioEl.play();
          newSource = audioCtx.createMediaElementSource(audioEl);
          newCleanup = () => {
            audioEl.pause();
            URL.revokeObjectURL(url);
          };
        } catch (err) {
          URL.revokeObjectURL(url);
          throw err;
        }
        // File mode: detach the WS mic feed — file audio isn't sent to the
        // recognizer (and we don't have a separate file source on wsCtx).
        if (wsMicConnected && wsMicSource && currentWsAudioWorklet) {
          try { wsMicSource.disconnect(currentWsAudioWorklet); } catch { /* idempotent */ }
          wsMicConnected = false;
        }
        // Route file audio to speakers so the user can hear it
        if (!destinationConnected) {
          inputGain.connect(audioCtx.destination);
          destinationConnected = true;
        }
      }

      newSource.connect(inputGain);
      currentSource.disconnect();
      currentCleanup();
      currentSource = newSource;
      currentCleanup = newCleanup;
      inputKind = next;
      await audioCtx.resume();
      options?.onInputKindChange?.(inputKind, filename);
      console.log(logPrefix, "input:", inputKind, filename ?? "");
    } catch (err) {
      console.error(logPrefix, "switch failed:", err);
      if (!isUserDismissedError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        showBriefMessage(msg, 5000);
      }
    }
  }

  return {
    audioCtx,
    analyser,
    getLevel,
    toggleInput,
    getInputKind: () => inputKind,
    setAnalyserInputGain: (linear: number) => {
      inputGain.gain.value = linear;
    },
    isVoiceEnabled: () => voiceEnabled,
    setVoiceEnabled: (on: boolean) => {
      voiceEnabled = on;
      // Connect/disconnect the wsCtx mic source from the worklet so the audio
      // thread is idle when voice is off — no chunk processing, no port.postMessage.
      if (wsMicSource && currentWsAudioWorklet) {
        if (on && !wsMicConnected && inputKind === "mic") {
          wsMicSource.connect(currentWsAudioWorklet);
          wsMicConnected = true;
        } else if (!on && wsMicConnected) {
          try { wsMicSource.disconnect(currentWsAudioWorklet); } catch { /* idempotent */ }
          wsMicConnected = false;
        }
      }
      console.log(logPrefix, "voice mode:", on ? "on" : "off", "wsMicConnected=", wsMicConnected);
    },
  };
}
