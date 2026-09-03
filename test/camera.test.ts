import { describe, expect, it } from "vitest";
import { orbitCamera, rayDirection } from "../src/camera";
import type { Vec3 } from "../src/sdf";

const RO: Vec3 = [0, 1.15, -3.4];
const TA: Vec3 = [0, 0.02, 0];
const FOV = 1.05;

function len(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

describe("rayDirection", () => {
  it("merkez piksel tam olarak normalize(ta - ro) yönünü verir", () => {
    const res: [number, number] = [960, 540];
    const dir = rayDirection([480, 270], res, RO, TA, FOV);
    const raw: Vec3 = [TA[0] - RO[0], TA[1] - RO[1], TA[2] - RO[2]];
    const l = len(raw);
    expect(dir[0]).toBeCloseTo(raw[0] / l, 12);
    expect(dir[1]).toBeCloseTo(raw[1] / l, 12);
    expect(dir[2]).toBeCloseTo(raw[2] / l, 12);
  });

  it("her piksel için birim uzunlukta yön döndürür", () => {
    const res: [number, number] = [960, 540];
    const pixels: [number, number][] = [
      [0, 0],
      [959, 0],
      [0, 539],
      [959, 539],
      [123, 456],
    ];
    for (const px of pixels) {
      expect(len(rayDirection(px, res, RO, TA, FOV))).toBeCloseTo(1, 12);
    }
  });

  it("sol ve sağ pikseller simetriktir", () => {
    const res: [number, number] = [960, 540];
    const left = rayDirection([280, 270], res, RO, TA, FOV);
    const right = rayDirection([680, 270], res, RO, TA, FOV);
    // Kamera -z'de, right ekseni -x yönünde; sol/sağ x bileşeni ters işaretli
    expect(left[0]).toBeCloseTo(-right[0], 12);
    expect(Math.abs(left[0])).toBeGreaterThan(0.1);
    expect(left[2]).toBeCloseTo(right[2], 12);
  });

  it("dikey görüş açısı en-boy oranından bağımsızdır", () => {
    const narrow = rayDirection([480, 400], [960, 540], RO, TA, FOV);
    const wide = rayDirection([960, 400], [1920, 540], RO, TA, FOV);
    expect(narrow[0]).toBeCloseTo(wide[0], 12);
    expect(narrow[1]).toBeCloseTo(wide[1], 12);
    expect(narrow[2]).toBeCloseTo(wide[2], 12);
  });

  it("fovY büyüdükçe kenar ışını merkezden daha çok açılır", () => {
    const forward: Vec3 = [0, 0, 1];
    const dot = (d: Vec3) =>
      d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
    const tight = rayDirection(
      [480, 539],
      [960, 540],
      [0, 0, -3],
      [0, 0, 0],
      0.6,
    );
    const loose = rayDirection(
      [480, 539],
      [960, 540],
      [0, 0, -3],
      [0, 0, 0],
      1.4,
    );
    expect(dot(loose)).toBeLessThan(dot(tight));
  });
});

describe("orbitCamera", () => {
  it("yarıçapı ve yüksekliği korur", () => {
    for (const angle of [0, 0.7, -1.9, Math.PI, 5.2]) {
      const p = orbitCamera(angle, 3.4, 1.15);
      expect(Math.hypot(p[0], p[2])).toBeCloseTo(3.4, 12);
      expect(p[1]).toBeCloseTo(1.15, 12);
    }
  });

  it("yarım tur sonra karşı noktaya gider", () => {
    const a = orbitCamera(0, 2, 0.5);
    const b = orbitCamera(Math.PI, 2, 0.5);
    expect(a[0]).toBeCloseTo(-b[0], 12);
    expect(a[2]).toBeCloseTo(-b[2], 12);
  });
});
