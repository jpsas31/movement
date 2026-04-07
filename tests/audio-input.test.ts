import { describe, it, expect } from "vitest";
import { formatAudioInputLabel } from "../src/audio-input";

describe("formatAudioInputLabel", () => {
  it("compact mic shows file as next option", () => {
    expect(formatAudioInputLabel("mic", "compact")).toBe("Audio: mic (A = file)");
  });

  it("compact file shows mic as next option", () => {
    expect(formatAudioInputLabel("file", "compact")).toBe("Audio: file (A = mic)");
  });

  it("main mic shows file as next option", () => {
    expect(formatAudioInputLabel("mic", "main")).toBe("Audio: microphone (A = file)");
  });

  it("main file shows mic as next option", () => {
    expect(formatAudioInputLabel("file", "main")).toBe("Audio: file (A = mic)");
  });
});
