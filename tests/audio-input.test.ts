import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { acquireSystemAudioStream } from "../src/audio-input";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDOMException(name: string): DOMException {
  return new DOMException(name, name);
}

function makeMediaStream(audioTrackCount: number): MediaStream {
  const tracks = Array.from({ length: audioTrackCount }, () => ({ stop: vi.fn() }));
  const allTracks = [...tracks];
  return {
    getAudioTracks: () => tracks,
    getTracks: () => allTracks,
  } as unknown as MediaStream;
}

// ── isUserDismissedError (tested indirectly via acquireSystemAudioStream) ────

describe("acquireSystemAudioStream — getDisplayMedia rejection paths", () => {
  beforeEach(() => {
    // Ensure navigator.mediaDevices exists in jsdom
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rethrows NotAllowedError (user dismissed) as-is", async () => {
    const err = makeDOMException("NotAllowedError");
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue(err);

    await expect(acquireSystemAudioStream()).rejects.toBe(err);
  });

  it("rethrows AbortError (user dismissed) as-is", async () => {
    const err = makeDOMException("AbortError");
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue(err);

    await expect(acquireSystemAudioStream()).rejects.toBe(err);
  });

  it("wraps non-DOMException errors in a plain Error", async () => {
    const err = new Error("hardware failure");
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue(err);

    await expect(acquireSystemAudioStream()).rejects.toThrow("hardware failure");
    await expect(acquireSystemAudioStream()).rejects.toBeInstanceOf(Error);
    // Must NOT be the original reference (it's re-wrapped)
    await expect(acquireSystemAudioStream()).rejects.not.toBe(err);
  });

  it("wraps unknown thrown values in a fallback message", async () => {
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue("bad string");

    await expect(acquireSystemAudioStream()).rejects.toThrow(
      "getDisplayMedia is not supported or failed.",
    );
  });

  it("wraps NotFoundError (not a user-dismissed error) in a plain Error", async () => {
    const err = makeDOMException("NotFoundError");
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue(err);

    const thrown = await acquireSystemAudioStream().catch((e) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(err);
    // In jsdom DOMException does not extend Error, so falls through to the generic fallback
    expect(thrown.message).toBe("getDisplayMedia is not supported or failed.");
  });
});

describe("acquireSystemAudioStream — stream content paths", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the stream when it has audio tracks", async () => {
    const stream = makeMediaStream(1);
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockResolvedValue(
      stream as unknown as MediaStream,
    );

    const result = await acquireSystemAudioStream();
    expect(result).toBe(stream);
  });

  it("throws when stream has no audio tracks and stops all tracks", async () => {
    const stream = makeMediaStream(0);
    const stopSpy = vi.fn();
    // Override getTracks to return stoppable tracks even with 0 audio tracks
    const videoTrack = { stop: stopSpy };
    (stream as any).getTracks = () => [videoTrack];

    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockResolvedValue(
      stream as unknown as MediaStream,
    );

    await expect(acquireSystemAudioStream()).rejects.toThrow(
      "No audio captured",
    );
    expect(stopSpy).toHaveBeenCalledOnce();
  });

  it("error message for no audio tracks mentions Share tab audio", async () => {
    const stream = makeMediaStream(0);
    (stream as any).getTracks = () => [];
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockResolvedValue(
      stream as unknown as MediaStream,
    );

    const thrown = await acquireSystemAudioStream().catch((e) => e);
    expect(thrown.message).toContain("Share tab audio");
  });
});
