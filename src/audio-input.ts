/**
 * Mic vs "computer" audio: browsers expose tab/screen audio via getDisplayMedia
 * (Chrome: pick a tab and enable "Share tab audio"; macOS screen share often has no system audio).
 */
export type AudioInputKind = "mic" | "system";

function isUserDismissedError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return e.name === "NotAllowedError" || e.name === "AbortError";
}

/**
 * Capture display/tab audio via a single getDisplayMedia call.
 * Must be called directly from a user gesture handler — do not await anything before this.
 * (Browsers expire the user activation token after the first async boundary.)
 */
export async function acquireSystemAudioStream(): Promise<MediaStream> {
  // Single call: video:true gives widest browser support and preserves the user gesture.
  // Do NOT add a preceding getDisplayMedia attempt — sequential calls lose the gesture token.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (e) {
    if (isUserDismissedError(e)) throw e;
    throw new Error(
      e instanceof Error ? e.message : "getDisplayMedia is not supported or failed.",
    );
  }

  if (stream.getAudioTracks().length > 0) return stream;

  stream.getTracks().forEach((t) => t.stop());
  throw new Error(
    "No audio captured. Enable audio sharing: for a tab pick \"Share tab audio\"; for entire screen (Windows) pick \"Share system audio\".",
  );
}

export async function acquireAudioStream(kind: AudioInputKind): Promise<MediaStream> {
  if (kind === "mic") {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
  return acquireSystemAudioStream();
}

export function formatAudioInputLabel(
  kind: AudioInputKind,
  variant: "main" | "compact",
): string {
  if (variant === "compact") {
    return kind === "mic"
      ? "Audio: mic (A = computer)"
      : "Audio: computer (A = mic)";
  }
  return kind === "mic"
    ? "Audio: microphone (A = computer)"
    : "Audio: computer share (A = mic)";
}

export type AudioAnalyserRig = {
  audioCtx: AudioContext;
  analyser: AnalyserNode;
  getLevel: () => number;
  toggleInput: () => Promise<void>;
  getInputKind: () => AudioInputKind;
  /** Linear gain before the analyser (Butterchurn + level meter). Use 1 for "unity". */
  setAnalyserInputGain: (linear: number) => void;
};

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

export async function createAudioAnalyserRig(options?: {
  logPrefix?: string;
  onInputKindChange?: (kind: AudioInputKind) => void;
}): Promise<AudioAnalyserRig> {
  const logPrefix = options?.logPrefix ?? "[audio]";
  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  const inputGain = audioCtx.createGain();
  inputGain.gain.value = 1;
  inputGain.connect(analyser);

  let inputKind: AudioInputKind = "mic";
  let mediaStream = await acquireAudioStream("mic");
  let streamSource = audioCtx.createMediaStreamSource(mediaStream);
  streamSource.connect(inputGain);
  void audioCtx.resume();

  const levelData = new Uint8Array(analyser.frequencyBinCount);
  function getLevel(): number {
    analyser.getByteFrequencyData(levelData);
    let sum = 0;
    for (let i = 0; i < levelData.length; i++) sum += levelData[i];
    return sum / levelData.length / 255;
  }

  options?.onInputKindChange?.(inputKind);

  async function toggleInput(): Promise<void> {
    console.log(logPrefix, "toggleInput called; current inputKind:", inputKind);
    const next: AudioInputKind = inputKind === "mic" ? "system" : "mic";

    if (next === "system") {
      const doc = document as any;
      const isFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.webkitCurrentFullScreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement ||
        doc.webkitIsFullScreen ||
        doc.mozFullScreen
      );
      if (isFullscreen) {
        console.warn(logPrefix, "cannot switch to system audio while in fullscreen; exit fullscreen first (Esc / F11)");
        showBriefMessage("Exit fullscreen first (Esc or F11), then press A for system audio");
        return;
      }
    }

    await doSwitch(next);

    async function doSwitch(kind: AudioInputKind): Promise<void> {
      try {
        const newStream = await acquireAudioStream(kind);
        for (const t of newStream.getAudioTracks()) t.enabled = true;

        const newSource = audioCtx.createMediaStreamSource(newStream);
        newSource.connect(inputGain);
        streamSource.disconnect();
        mediaStream.getTracks().forEach((t) => t.stop());
        streamSource = newSource;
        mediaStream = newStream;
        inputKind = kind;
        await audioCtx.resume();
        options?.onInputKindChange?.(inputKind);
        console.log(logPrefix, "input:", inputKind);
      } catch (err) {
        console.error(logPrefix, "switch failed:", err);
        if (!isUserDismissedError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          showBriefMessage(msg, 5000);
        }
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
  };
}
