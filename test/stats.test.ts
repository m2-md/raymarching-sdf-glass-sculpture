import { describe, expect, it } from "vitest";
import { median, percentile } from "../src/stats";

describe("median", () => {
  it("returns middle element in odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns average of middle two in even-length array", () => {
    expect(median([4, 1, 3, 2])).toBeCloseTo(2.5, 12);
  });

  it("single outlier does not drag median", () => {
    expect(median([1, 1, 1, 1, 1000])).toBe(1);
  });
});

describe("percentile", () => {
  it("returns NaN for empty array", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });

  it("p=0 returns minimum, p=100 returns maximum", () => {
    const values = [5, 2, 9, 1];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("clamps p to 0-100 range", () => {
    expect(percentile([1, 2, 3], -20)).toBe(1);
    expect(percentile([1, 2, 3], 300)).toBe(3);
  });

  it("finds intermediate values via linear interpolation", () => {
    // 101 elements from 0..100: rank = 0.95 * 100 = 95 -> exact element
    const values = Array.from({ length: 101 }, (_, i) => i);
    expect(percentile(values, 95)).toBeCloseTo(95, 12);
    // 4 elements: rank = 0.5 * 3 = 1.5 -> midpoint between 20 and 30
    expect(percentile([10, 20, 30, 40], 50)).toBeCloseTo(25, 12);
    // 4 elements, p=95: rank = 2.85 -> 30 + 0.85 * 10
    expect(percentile([10, 20, 30, 40], 95)).toBeCloseTo(38.5, 12);
  });

  it("does not mutate input array", () => {
    const values = [5, 2, 9, 1];
    percentile(values, 50);
    expect(values).toEqual([5, 2, 9, 1]);
  });
});
