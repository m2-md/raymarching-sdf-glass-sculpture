import { describe, expect, it } from "vitest";
import fragmentSource from "../src/shaders/scene.frag.glsl?raw";
import vertexSource from "../src/shaders/fullscreen.vert.glsl?raw";
import { annotateSource, buildFragmentSource } from "../src/program";

const DEFINES = { maxSteps: 64, shadowSteps: 24, innerSteps: 32 };

describe("shader kaynakları", () => {
  it("her iki .glsl dosyası da #version 300 es ile başlar", () => {
    expect(fragmentSource.split("\n")[0].trim()).toBe("#version 300 es");
    expect(vertexSource.split("\n")[0].trim()).toBe("#version 300 es");
  });

  it("fragment kaynağında MAX_STEPS önceden tanımlı DEĞİLDİR", () => {
    // Çift tanım sessiz bir sürüklenme kaynağı olurdu.
    expect(fragmentSource).not.toContain("#define MAX_STEPS");
    expect(fragmentSource).not.toContain("#define SHADOW_STEPS");
    expect(fragmentSource).not.toContain("#define INNER_STEPS");
  });

  it("vertex shader'ında attribute yok, gl_VertexID var", () => {
    expect(vertexSource).toContain("gl_VertexID");
    expect(vertexSource).not.toContain(" in ");
  });
});

describe("buildFragmentSource", () => {
  it("#version satırını 1. satırda bırakır", () => {
    const out = buildFragmentSource(fragmentSource, DEFINES);
    expect(out.split("\n")[0]).toBe("#version 300 es");
  });

  it("üç define'ı tam olarak 2-4. satırlara koyar", () => {
    const lines = buildFragmentSource(fragmentSource, DEFINES).split("\n");
    expect(lines[1]).toBe("#define MAX_STEPS 64");
    expect(lines[2]).toBe("#define SHADOW_STEPS 24");
    expect(lines[3]).toBe("#define INNER_STEPS 32");
  });

  it("sayıları tamsayı olarak yazar (GLSL'de int sınırı gerekir)", () => {
    const out = buildFragmentSource(fragmentSource, {
      ...DEFINES,
      maxSteps: 128,
    });
    expect(out).toContain("#define MAX_STEPS 128");
    expect(out).not.toContain("#define MAX_STEPS 128.0");
  });

  it("orijinal kaynağın geri kalanı bozulmadan kalır", () => {
    const out = buildFragmentSource(fragmentSource, DEFINES);
    const original = fragmentSource.split("\n").slice(1);
    expect(out.split("\n").slice(4)).toEqual(original);
  });

  it("#version ilk satırda değilse hata fırlatır", () => {
    const bad = `precision highp float;\n#version 300 es\n`;
    expect(() => buildFragmentSource(bad, DEFINES)).toThrow(
      /#version 300 es kaynağın ilk satırı olmalı/,
    );
    expect(() => buildFragmentSource("\n#version 300 es", DEFINES)).toThrow();
  });
});

describe("annotateSource", () => {
  it("satır numaralarını 1'den başlatır ve sağa yaslar", () => {
    const out = annotateSource("a\nb\nc").split("\n");
    expect(out[0]).toBe("   1| a");
    expect(out[1]).toBe("   2| b");
    expect(out[2]).toBe("   3| c");
  });

  it("satır sayısını değiştirmez", () => {
    const lines = fragmentSource.split("\n").length;
    expect(annotateSource(fragmentSource).split("\n").length).toBe(lines);
  });
});
