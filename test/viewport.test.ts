import { describe, expect, it } from "vitest";
import {
  MAX_DPR,
  MAX_PIXELS,
  backingSize,
  fitPixelBudget,
} from "../src/viewport";

describe("backingSize", () => {
  it("devicePixelRatio'yu 2'ye kelepçeler", () => {
    // 800x450 @2x = 1.44 Mpx, piksel bütçesinin altında: kelepçe tek etken.
    const clamped = backingSize(800, 450, 3, 1);
    const atMax = backingSize(800, 450, MAX_DPR, 1);
    expect(clamped).toEqual(atMax);
    expect(clamped).toEqual({ width: 1600, height: 900 });
  });

  it("dpr 1'in altına inmez", () => {
    expect(backingSize(960, 540, 0.5, 1).width).toBe(960);
  });

  it("ölçeği 0.25 ile 1 arasına kelepçeler", () => {
    expect(backingSize(960, 540, 1, 0.1)).toEqual(
      backingSize(960, 540, 1, 0.25),
    );
    expect(backingSize(960, 540, 1, 2)).toEqual(backingSize(960, 540, 1, 1));
  });

  it("varsayılan 0.5 ölçek yarı boyut verir", () => {
    expect(backingSize(960, 540, 1, 0.5)).toEqual({ width: 480, height: 270 });
  });

  it("sıfır boyutlu kutuda bile en az 1×1 döner", () => {
    const size = backingSize(0, 0, 1, 0.5);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("piksel bütçesini asla aşmaz", () => {
    const size = backingSize(3840, 2160, 3, 1);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS);
  });
});

describe("fitPixelBudget", () => {
  it("bütçenin altındaki girdiyi aynen döndürür", () => {
    expect(fitPixelBudget(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("bütçeyi aşan girdiyi en-boy oranını koruyarak küçültür", () => {
    const inputAspect = 3840 / 2160;
    const out = fitPixelBudget(3840, 2160, 1_000_000);
    expect(out.width * out.height).toBeLessThanOrEqual(1_000_000);
    expect(out.width / out.height).toBeCloseTo(inputAspect, 2);
  });

  it("çok küçük bütçede bile 1×1'in altına inmez", () => {
    const out = fitPixelBudget(4000, 4000, 1);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});
