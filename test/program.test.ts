import { describe, expect, it } from "vitest";
import fragmentSource from "../src/shaders/scene.frag.glsl?raw";
import vertexSource from "../src/shaders/fullscreen.vert.glsl?raw";
import { annotateSource, buildFragmentSource } from "../src/program";

const DEFINES = { maxSteps: 64, shadowSteps: 24, innerSteps: 32 };

describe("shader sources", () => {
  it("both .glsl files start with #version 300 es", () => {
    expect(fragmentSource.split("\n")[0].trim()).toBe("#version 300 es");
    expect(vertexSource.split("\n")[0].trim()).toBe("#version 300 es");
  });

  it("MAX_STEPS is NOT predefined in fragment source", () => {
    // duplicate definition would cause silent drift.
    expect(fragmentSource).not.toContain("#define MAX_STEPS");
    expect(fragmentSource).not.toContain("#define SHADOW_STEPS");
    expect(fragmentSource).not.toContain("#define INNER_STEPS");
  });

  it("vertex shader has no attributes, gl_VertexID is present", () => {
    expect(vertexSource).toContain("gl_VertexID");
    expect(vertexSource).not.toContain(" in ");
  });
});

describe("buildFragmentSource", () => {
  it("preserves #version on line 1", () => {
    const out = buildFragmentSource(fragmentSource, DEFINES);
    expect(out.split("\n")[0]).toBe("#version 300 es");
  });

  it("places three defines exactly on lines 2-4", () => {
    const lines = buildFragmentSource(fragmentSource, DEFINES).split("\n");
    expect(lines[1]).toBe("#define MAX_STEPS 64");
    expect(lines[2]).toBe("#define SHADOW_STEPS 24");
    expect(lines[3]).toBe("#define INNER_STEPS 32");
  });

  it("writes numbers as integers (GLSL requires int limits)", () => {
    const out = buildFragmentSource(fragmentSource, {
      ...DEFINES,
      maxSteps: 128,
    });
    expect(out).toContain("#define MAX_STEPS 128");
    expect(out).not.toContain("#define MAX_STEPS 128.0");
  });

  it("leaves the rest of original source intact", () => {
    const out = buildFragmentSource(fragmentSource, DEFINES);
    const original = fragmentSource.split("\n").slice(1);
    expect(out.split("\n").slice(4)).toEqual(original);
  });

  it("throws error if #version is not on first line", () => {
    const bad = `precision highp float;\n#version 300 es\n`;
    expect(() => buildFragmentSource(bad, DEFINES)).toThrow(
      /#version 300 es must be the first line of the source/,
    );
    expect(() => buildFragmentSource("\n#version 300 es", DEFINES)).toThrow();
  });
});

describe("annotateSource", () => {
  it("starts line numbers at 1 and right-aligns them", () => {
    const out = annotateSource("a\nb\nc").split("\n");
    expect(out[0]).toBe("   1| a");
    expect(out[1]).toBe("   2| b");
    expect(out[2]).toBe("   3| c");
  });

  it("does not change line count", () => {
    const lines = fragmentSource.split("\n").length;
    expect(annotateSource(fragmentSource).split("\n").length).toBe(lines);
  });
});
