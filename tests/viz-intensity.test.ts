import { describe, it, expect } from "vitest";
import {
  nextVizIntensity,
  VIZ_AUDIO_GAIN,
  VIZ_INTENSITY_ORDER,
  type VizIntensity,
} from "../src/viz-intensity";

describe("VIZ_INTENSITY_ORDER", () => {
  it("contains exactly mild, normal, hot", () => {
    expect(VIZ_INTENSITY_ORDER).toEqual(["mild", "normal", "hot"]);
  });
});

describe("VIZ_AUDIO_GAIN", () => {
  it("has a numeric gain for each intensity", () => {
    for (const level of VIZ_INTENSITY_ORDER) {
      expect(typeof VIZ_AUDIO_GAIN[level]).toBe("number");
    }
  });

  it("has the correct specific gain values", () => {
    expect(VIZ_AUDIO_GAIN.mild).toBe(0.62);
    expect(VIZ_AUDIO_GAIN.normal).toBe(1);
    expect(VIZ_AUDIO_GAIN.hot).toBe(1.58);
  });

  it("hot gain > normal gain > mild gain", () => {
    expect(VIZ_AUDIO_GAIN.hot).toBeGreaterThan(VIZ_AUDIO_GAIN.normal);
    expect(VIZ_AUDIO_GAIN.normal).toBeGreaterThan(VIZ_AUDIO_GAIN.mild);
  });
});

describe("nextVizIntensity", () => {
  it("cycles mild → normal", () => {
    expect(nextVizIntensity("mild")).toBe("normal");
  });

  it("cycles normal → hot", () => {
    expect(nextVizIntensity("normal")).toBe("hot");
  });

  it("cycles hot → mild (wraps around)", () => {
    expect(nextVizIntensity("hot")).toBe("mild");
  });

  it("full cycle returns to original after 3 steps", () => {
    let current: VizIntensity = "mild";
    current = nextVizIntensity(current);
    current = nextVizIntensity(current);
    current = nextVizIntensity(current);
    expect(current).toBe("mild");
  });

  it("returns a valid VizIntensity for each valid input", () => {
    for (const level of VIZ_INTENSITY_ORDER) {
      const next = nextVizIntensity(level);
      expect(VIZ_INTENSITY_ORDER).toContain(next);
    }
  });
});
