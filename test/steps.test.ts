import { describe, expect, it } from "vitest";
import { stepStats } from "../src/steps";

/** Constructs a pixel block from step counts written to RGBA8 target. */
function pixelsFrom(steps: number[], junk = 0): Uint8Array {
  const out = new Uint8Array(steps.length * 4);
  steps.forEach((value, i) => {
    out[i * 4] = value;
    out[i * 4 + 1] = junk;
    out[i * 4 + 2] = junk;
    out[i * 4 + 3] = junk;
  });
  return out;
}

describe("stepStats", () => {
  it("everything is zero in empty buffer", () => {
    const s = stepStats(new Uint8Array(0), 64);
    expect(s).toEqual({ samples: 0, mean: 0, max: 0, ceilingPct: 0 });
  });

  it("counts mean and maximum from red channel", () => {
    const s = stepStats(pixelsFrom([2, 4, 8, 10]), 64);
    expect(s.samples).toBe(4);
    expect(s.mean).toBeCloseTo(6, 12);
    expect(s.max).toBe(10);
    expect(s.ceilingPct).toBe(0);
  });

  it("counts pixels >= maxSteps toward ceiling percentage (including exact equality)", () => {
    const s = stepStats(pixelsFrom([3, 64, 65, 2]), 64);
    expect(s.ceilingPct).toBeCloseTo(50, 12);
  });

  it("garbage in green/blue/alpha channels does not change result", () => {
    const clean = stepStats(pixelsFrom([5, 9, 128, 1], 0), 128);
    const dirty = stepStats(pixelsFrom([5, 9, 128, 1], 255), 128);
    expect(dirty).toEqual(clean);
    expect(dirty.ceilingPct).toBeCloseTo(25, 12);
  });

  it("128 steps fits into byte losslessly", () => {
    const s = stepStats(pixelsFrom([128]), 128);
    expect(s.max).toBe(128);
    expect(s.mean).toBe(128);
    expect(s.ceilingPct).toBe(100);
  });
});
