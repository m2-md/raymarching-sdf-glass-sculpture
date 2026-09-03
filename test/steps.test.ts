import { describe, expect, it } from "vitest";
import { stepStats } from "../src/steps";

/** RGBA8 hedefe yazılmış adım sayılarından bir piksel bloğu kurar. */
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
  it("boş tamponda her şey sıfırdır", () => {
    const s = stepStats(new Uint8Array(0), 64);
    expect(s).toEqual({ samples: 0, mean: 0, max: 0, ceilingPct: 0 });
  });

  it("ortalama ve maksimumu kırmızı kanaldan sayar", () => {
    const s = stepStats(pixelsFrom([2, 4, 8, 10]), 64);
    expect(s.samples).toBe(4);
    expect(s.mean).toBeCloseTo(6, 12);
    expect(s.max).toBe(10);
    expect(s.ceilingPct).toBe(0);
  });

  it("tavan yüzdesi >= maxSteps olanları sayar (tam eşitlik dahil)", () => {
    const s = stepStats(pixelsFrom([3, 64, 65, 2]), 64);
    expect(s.ceilingPct).toBeCloseTo(50, 12);
  });

  it("yeşil/mavi/alfa kanallarındaki çöp sonucu değiştirmez", () => {
    const clean = stepStats(pixelsFrom([5, 9, 128, 1], 0), 128);
    const dirty = stepStats(pixelsFrom([5, 9, 128, 1], 255), 128);
    expect(dirty).toEqual(clean);
    expect(dirty.ceilingPct).toBeCloseTo(25, 12);
  });

  it("128 adım bayta kayıpsız sığar", () => {
    const s = stepStats(pixelsFrom([128]), 128);
    expect(s.max).toBe(128);
    expect(s.mean).toBe(128);
    expect(s.ceilingPct).toBe(100);
  });
});
