import { describe, expect, it } from "vitest";
import { median, percentile } from "../src/stats";

describe("median", () => {
  it("tek elemanlı dizide ortadaki sayıyı verir", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("çift elemanlı dizide ortadaki ikisinin ortalamasını verir", () => {
    expect(median([4, 1, 3, 2])).toBeCloseTo(2.5, 12);
  });

  it("aykırı tek değer medyanı sürüklemez", () => {
    expect(median([1, 1, 1, 1, 1000])).toBe(1);
  });
});

describe("percentile", () => {
  it("boş dizide NaN döner", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });

  it("p=0 minimumu, p=100 maksimumu verir", () => {
    const values = [5, 2, 9, 1];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("p'yi 0-100 aralığına kelepçeler", () => {
    expect(percentile([1, 2, 3], -20)).toBe(1);
    expect(percentile([1, 2, 3], 300)).toBe(3);
  });

  it("aradaki değerleri doğrusal interpolasyonla bulur", () => {
    // 0..100 arası 101 eleman: rank = 0.95 * 100 = 95 -> tam eleman
    const values = Array.from({ length: 101 }, (_, i) => i);
    expect(percentile(values, 95)).toBeCloseTo(95, 12);
    // 4 eleman: rank = 0.5 * 3 = 1.5 -> 20 ile 30 arasının ortası
    expect(percentile([10, 20, 30, 40], 50)).toBeCloseTo(25, 12);
    // 4 eleman, p=95: rank = 2.85 -> 30 + 0.85 * 10
    expect(percentile([10, 20, 30, 40], 95)).toBeCloseTo(38.5, 12);
  });

  it("girdi dizisini mutasyona uğratmaz", () => {
    const values = [5, 2, 9, 1];
    percentile(values, 50);
    expect(values).toEqual([5, 2, 9, 1]);
  });
});
