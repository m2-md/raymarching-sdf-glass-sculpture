import { describe, expect, it } from "vitest";
import {
  opSubtract,
  sdBox,
  sdSphere,
  sdTorus,
  smin,
  type Vec3,
} from "../src/sdf";

describe("sdSphere", () => {
  it("positive outside, zero on surface, negative inside", () => {
    expect(sdSphere([0, 0, 3], 1)).toBeCloseTo(2, 12);
    expect(sdSphere([1, 0, 0], 1)).toBeCloseTo(0, 12);
    expect(sdSphere([0, 0.4, 0], 1)).toBeCloseTo(-0.6, 12);
  });

  it("returns Euclidean distance along diagonal", () => {
    expect(sdSphere([3, 4, 0], 2)).toBeCloseTo(3, 12);
  });
});

describe("sdBox", () => {
  it("zero on surface, negative inside, Euclidean distance outside corners", () => {
    const b: Vec3 = [1, 1, 1];
    expect(sdBox([1, 0, 0], b)).toBeCloseTo(0, 12);
    expect(sdBox([0, 0, 0], b)).toBeCloseTo(-1, 12);
    expect(sdBox([2, 2, 2], b)).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("only overflowing axis counts for point overflowing along single axis", () => {
    expect(sdBox([2.5, 0.2, -0.9], [1, 1, 1])).toBeCloseTo(1.5, 12);
  });
});

describe("sdTorus", () => {
  it("at torus center distance is major - minor", () => {
    // major=0.8, minor=0.15 -> nearest surface at center is 0.8-0.15 = 0.65
    expect(sdTorus([0, 0, 0], 0.8, 0.15)).toBeCloseTo(0.65, 12);
  });

  it("exactly -minor on ring core, zero on outer edge", () => {
    expect(sdTorus([0.8, 0, 0], 0.8, 0.15)).toBeCloseTo(-0.15, 12);
    expect(sdTorus([0.95, 0, 0], 0.8, 0.15)).toBeCloseTo(0, 12);
  });
});

describe("opSubtract", () => {
  it("carves a from b: interior of a becomes exterior of b", () => {
    // b: radius 1 sphere, a: radius 0.5 sphere. Center is inside a.
    const carve = (p: Vec3) => opSubtract(sdSphere(p, 0.5), sdSphere(p, 1));
    expect(carve([0, 0, 0])).toBeGreaterThan(0); // carved cavity = outside
    expect(carve([0.75, 0, 0])).toBeLessThan(0); // middle of wall thickness
    expect(carve([0, 0, 2])).toBeGreaterThan(0); // completely outside sphere
  });
});

describe("smin", () => {
  it("reverts to plain min if difference exceeds k", () => {
    expect(smin(0.2, 1.9, 0.5)).toBeCloseTo(0.2, 6);
    expect(smin(1.9, 0.2, 0.5)).toBeCloseTo(0.2, 6);
  });

  it("pulls down by exactly k/4 when two distances are equal", () => {
    expect(smin(1, 1, 0.4)).toBeCloseTo(1 - 0.1, 6);
  });

  it("always less than or equal to min (step lower bound)", () => {
    for (const [a, b] of [
      [0.3, 0.31],
      [0.9, 0.4],
      [-0.2, 0.05],
      [2, 2.4],
    ]) {
      expect(smin(a, b, 0.5)).toBeLessThanOrEqual(Math.min(a, b) + 1e-9);
    }
  });

  it("is symmetric", () => {
    expect(smin(0.4, 0.55, 0.3)).toBeCloseTo(smin(0.55, 0.4, 0.3), 12);
  });

  it("k=0 is safe: no NaN/Infinity, result matches min", () => {
    const v = smin(0.3, 0.9, 0);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(0.3, 6);
    expect(Number.isFinite(smin(0.5, 0.5, 0))).toBe(true);
  });
});
