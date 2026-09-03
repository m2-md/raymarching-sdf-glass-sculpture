import { describe, expect, it } from "vitest";
import {
  MAX_DPR,
  MAX_PIXELS,
  backingSize,
  fitPixelBudget,
} from "../src/viewport";

describe("backingSize", () => {
  it("clamps devicePixelRatio to 2", () => {
    // 800x450 @2x = 1.44 Mpx, below pixel budget: clamp is sole factor.
    const clamped = backingSize(800, 450, 3, 1);
    const atMax = backingSize(800, 450, MAX_DPR, 1);
    expect(clamped).toEqual(atMax);
    expect(clamped).toEqual({ width: 1600, height: 900 });
  });

  it("dpr does not drop below 1", () => {
    expect(backingSize(960, 540, 0.5, 1).width).toBe(960);
  });

  it("clamps scale between 0.25 and 1", () => {
    expect(backingSize(960, 540, 1, 0.1)).toEqual(
      backingSize(960, 540, 1, 0.25),
    );
    expect(backingSize(960, 540, 1, 2)).toEqual(backingSize(960, 540, 1, 1));
  });

  it("default 0.5 scale yields half dimensions", () => {
    expect(backingSize(960, 540, 1, 0.5)).toEqual({ width: 480, height: 270 });
  });

  it("returns at least 1x1 even for zero-sized box", () => {
    const size = backingSize(0, 0, 1, 0.5);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("never exceeds pixel budget", () => {
    const size = backingSize(3840, 2160, 3, 1);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS);
  });
});

describe("fitPixelBudget", () => {
  it("returns input unchanged when below budget", () => {
    expect(fitPixelBudget(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("scales down input exceeding budget while preserving aspect ratio", () => {
    const inputAspect = 3840 / 2160;
    const out = fitPixelBudget(3840, 2160, 1_000_000);
    expect(out.width * out.height).toBeLessThanOrEqual(1_000_000);
    expect(out.width / out.height).toBeCloseTo(inputAspect, 2);
  });

  it("never drops below 1x1 even with very small budget", () => {
    const out = fitPixelBudget(4000, 4000, 1);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});
