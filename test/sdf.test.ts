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
  it("dışarıda pozitif, yüzeyde sıfır, içeride negatif", () => {
    expect(sdSphere([0, 0, 3], 1)).toBeCloseTo(2, 12);
    expect(sdSphere([1, 0, 0], 1)).toBeCloseTo(0, 12);
    expect(sdSphere([0, 0.4, 0], 1)).toBeCloseTo(-0.6, 12);
  });

  it("köşegen yönde Öklid mesafesini verir", () => {
    expect(sdSphere([3, 4, 0], 2)).toBeCloseTo(3, 12);
  });
});

describe("sdBox", () => {
  it("yüzeyde sıfır, içeride negatif, köşe dışında Öklid mesafesi", () => {
    const b: Vec3 = [1, 1, 1];
    expect(sdBox([1, 0, 0], b)).toBeCloseTo(0, 12);
    expect(sdBox([0, 0, 0], b)).toBeCloseTo(-1, 12);
    expect(sdBox([2, 2, 2], b)).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("tek eksende taşan nokta için sadece o eksen sayılır", () => {
    expect(sdBox([2.5, 0.2, -0.9], [1, 1, 1])).toBeCloseTo(1.5, 12);
  });
});

describe("sdTorus", () => {
  it("halka merkezinde major - minor kadar uzaktadır", () => {
    // major=0.8, minor=0.15 -> merkezde en yakın yüzey 0.8-0.15 = 0.65
    expect(sdTorus([0, 0, 0], 0.8, 0.15)).toBeCloseTo(0.65, 12);
  });

  it("halka çekirdeği üzerinde tam -minor, dış kenarında sıfır", () => {
    expect(sdTorus([0.8, 0, 0], 0.8, 0.15)).toBeCloseTo(-0.15, 12);
    expect(sdTorus([0.95, 0, 0], 0.8, 0.15)).toBeCloseTo(0, 12);
  });
});

describe("opSubtract", () => {
  it("a'yı b'den oyar: a'nın içi b'nin dışına döner", () => {
    // b: yarıçap 1 küre, a: yarıçap 0.5 küre. Merkez a'nın içindedir.
    const carve = (p: Vec3) => opSubtract(sdSphere(p, 0.5), sdSphere(p, 1));
    expect(carve([0, 0, 0])).toBeGreaterThan(0); // oyulan boşluk = dışarısı
    expect(carve([0.75, 0, 0])).toBeLessThan(0); // et kalınlığının ortası
    expect(carve([0, 0, 2])).toBeGreaterThan(0); // kürenin tamamen dışı
  });
});

describe("smin", () => {
  it("fark k'dan büyükse düz min'e döner", () => {
    expect(smin(0.2, 1.9, 0.5)).toBeCloseTo(0.2, 6);
    expect(smin(1.9, 0.2, 0.5)).toBeCloseTo(0.2, 6);
  });

  it("iki mesafe eşitken tam k/4 kadar aşağı çeker", () => {
    expect(smin(1, 1, 0.4)).toBeCloseTo(1 - 0.1, 6);
  });

  it("her zaman min'den küçük ya da eşittir (alan alt sınırdır)", () => {
    for (const [a, b] of [
      [0.3, 0.31],
      [0.9, 0.4],
      [-0.2, 0.05],
      [2, 2.4],
    ]) {
      expect(smin(a, b, 0.5)).toBeLessThanOrEqual(Math.min(a, b) + 1e-9);
    }
  });

  it("simetriktir", () => {
    expect(smin(0.4, 0.55, 0.3)).toBeCloseTo(smin(0.55, 0.4, 0.3), 12);
  });

  it("k=0 güvenlidir: NaN/Infinity yok, sonuç min'e yapışır", () => {
    const v = smin(0.3, 0.9, 0);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(0.3, 6);
    expect(Number.isFinite(smin(0.5, 0.5, 0))).toBe(true);
  });
});
