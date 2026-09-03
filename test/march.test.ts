import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DIST, march } from "../src/march";
import { sdSphere, smin } from "../src/sdf";
import type { Vec3 } from "../src/sdf";

const unitSphere = (p: Vec3) => sdSphere(p, 1);

describe("march", () => {
  it("perpendicular ray converges in two map calls", () => {
    const res = march(unitSphere, [0, 0, -4], [0, 0, 1], { maxSteps: 64 });
    expect(res.hit).toBe(true);
    expect(res.steps).toBe(2); // advance 4-1=3, then exactly on surface
    expect(res.t).toBeCloseTo(3, 3);
  });

  it("tangent ray exhausts entire budget and does not hit", () => {
    // Ray missing sphere by 0.02 units: step is always small but never zero
    const res = march(unitSphere, [0, 1.02, -4], [0, 0, 1], { maxSteps: 24 });
    expect(res.hit).toBe(false);
    expect(res.steps).toBe(24); // ceiling
  });

  it("ray missing sphere widely exits with MAX_DIST, does not exhaust budget", () => {
    const res = march(unitSphere, [0, 6, -4], [0, 0, 1], { maxSteps: 128 });
    expect(res.hit).toBe(false);
    expect(res.t).toBeGreaterThan(DEFAULT_MAX_DIST);
    expect(res.steps).toBeLessThan(128);
  });

  it("steps always remain within 1..maxSteps range", () => {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 10; i++) {
      const dir: Vec3 = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const rd: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
      const res = march(unitSphere, [0, 0, -4], rd, { maxSteps: 40 });
      expect(res.steps).toBeGreaterThanOrEqual(1);
      expect(res.steps).toBeLessThanOrEqual(40);
    }
  });
});

const twoSpheres = (k: number) => (p: Vec3) => {
  const a = sdSphere([p[0] - 0.7, p[1], p[2]], 0.6);
  const b = sdSphere([p[0] + 0.7, p[1], p[2]], 0.6);
  return k === 0 ? Math.min(a, b) : smin(a, b, k);
};

describe("smin changes topology", () => {
  it("ray passing through hole at k=0 hits bridge at k=0.5", () => {
    const ray = { ro: [0, 0, -4] as Vec3, rd: [0, 0, 1] as Vec3 };
    const sharp = march(twoSpheres(0), ray.ro, ray.rd, { maxSteps: 128 });
    const blended = march(twoSpheres(0.5), ray.ro, ray.rd, { maxSteps: 128 });

    expect(sharp.hit).toBe(false); // 0.2 unit opening between two spheres
    expect(blended.hit).toBe(true); // blend closed that opening
    // Bridge begins before sphere center plane: 0 < t < 4
    expect(blended.t).toBeGreaterThan(3.5);
    expect(blended.t).toBeLessThan(4);
  });

  it("traverses less distance within same budget when step drops to lower bound", () => {
    // Ray missing both spheres: no hit for either k=0 or k=0.5,
    // but steps shrink as smin pulls distance down.
    const ro: Vec3 = [0, 0.95, -4];
    const rd: Vec3 = [0, 0, 1];
    const sharp = march(twoSpheres(0), ro, rd, { maxSteps: 6 });
    const blended = march(twoSpheres(0.5), ro, rd, { maxSteps: 6 });

    expect(sharp.hit).toBe(false);
    expect(blended.hit).toBe(false);
    expect(sharp.steps).toBe(6);
    expect(blended.steps).toBe(6);
    expect(blended.t).toBeLessThan(sharp.t);
  });
});
