import { describe, it, expect } from "vitest";
import {
  applyGhostFreeze,
  clonePresetGraphForButterchurn,
  type PresetWithBase,
} from "../src/preset-variants";

function makePreset(overrides: Partial<Record<string, number>> = {}): PresetWithBase {
  return {
    baseVals: {
      decay: 0.98,
      warp: 0.5,
      zoom: 1.05,
      rot: 0.02,
      dx: 0.01,
      dy: -0.01,
      ...overrides,
    },
  };
}

describe("applyGhostFreeze — freezeMode=true", () => {
  it("sets decay to 1.0", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.decay).toBe(1.0);
  });

  it("zeroes warp", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.warp).toBe(0);
  });

  it("zeroes rot", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.rot).toBe(0);
  });

  it("zeroes dx", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.dx).toBe(0);
  });

  it("zeroes dy", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.dy).toBe(0);
  });

  it("sets zoom to 1.0", () => {
    const result = applyGhostFreeze(makePreset(), false, true);
    expect(result.baseVals.zoom).toBe(1.0);
  });

  it("does not mutate the original preset", () => {
    const original = makePreset();
    applyGhostFreeze(original, false, true);
    expect(original.baseVals.decay).toBe(0.98);
    expect(original.baseVals.warp).toBe(0.5);
  });

  it("preserves other fields not listed in freeze", () => {
    const original = makePreset({ someOtherField: 42 });
    const result = applyGhostFreeze(original, false, true);
    expect(result.baseVals.someOtherField).toBe(42);
  });
});

describe("applyGhostFreeze — freezeMode=false, ghostMode=false", () => {
  it("returns the original preset reference unchanged", () => {
    const original = makePreset();
    const result = applyGhostFreeze(original, false, false);
    expect(result).toBe(original);
  });

  it("does not modify any baseVals fields", () => {
    const original = makePreset();
    const result = applyGhostFreeze(original, false, false);
    expect(result.baseVals.decay).toBe(0.98);
    expect(result.baseVals.warp).toBe(0.5);
    expect(result.baseVals.zoom).toBe(1.05);
    expect(result.baseVals.rot).toBe(0.02);
  });
});

describe("applyGhostFreeze — ghostMode=true, freezeMode=false", () => {
  it("sets decay to 1.0 only", () => {
    const result = applyGhostFreeze(makePreset(), true, false);
    expect(result.baseVals.decay).toBe(1.0);
  });

  it("leaves warp unchanged", () => {
    const result = applyGhostFreeze(makePreset(), true, false);
    expect(result.baseVals.warp).toBe(0.5);
  });

  it("leaves zoom unchanged", () => {
    const result = applyGhostFreeze(makePreset(), true, false);
    expect(result.baseVals.zoom).toBe(1.05);
  });

  it("does not mutate the original preset", () => {
    const original = makePreset();
    applyGhostFreeze(original, true, false);
    expect(original.baseVals.decay).toBe(0.98);
  });
});

describe("applyGhostFreeze — freezeMode takes precedence over ghostMode", () => {
  it("when both true, applies freeze (not ghost-only) behaviour", () => {
    const result = applyGhostFreeze(makePreset(), true, true);
    expect(result.baseVals.warp).toBe(0);
    expect(result.baseVals.zoom).toBe(1.0);
    expect(result.baseVals.rot).toBe(0);
  });
});

describe("clonePresetGraphForButterchurn", () => {
  it("returns a new object (not the same reference)", () => {
    const preset = makePreset();
    const clone = clonePresetGraphForButterchurn(preset);
    expect(clone).not.toBe(preset);
    expect(clone.baseVals).not.toBe(preset.baseVals);
  });

  it("clone has equal values", () => {
    const preset = makePreset();
    const clone = clonePresetGraphForButterchurn(preset);
    expect(clone.baseVals.decay).toBe(preset.baseVals.decay);
    expect(clone.baseVals.warp).toBe(preset.baseVals.warp);
  });

  it("mutating the clone does not affect the original", () => {
    const preset = makePreset();
    const clone = clonePresetGraphForButterchurn(preset);
    clone.baseVals.decay = 0.1;
    expect(preset.baseVals.decay).toBe(0.98);
  });
});
