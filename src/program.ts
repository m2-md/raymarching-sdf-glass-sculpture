export interface SceneDefines {
  maxSteps: number;
  shadowSteps: number;
  innerSteps: number;
}

// GLSL ES 3.00'te "#version" MUTLAKA ilk satır olmak zorundadır.
// Define bloğunu başa eklerseniz shader derlenmez; hata mesajı da
// "#version directive must occur before anything else" gibi kibar ama ketumdur.
export function buildFragmentSource(
  source: string,
  defines: SceneDefines,
): string {
  const lines = source.split("\n");
  if (!lines[0].trim().startsWith("#version")) {
    throw new Error("#version 300 es kaynağın ilk satırı olmalı");
  }
  const block = [
    `#define MAX_STEPS ${defines.maxSteps}`,
    `#define SHADOW_STEPS ${defines.shadowSteps}`,
    `#define INNER_STEPS ${defines.innerSteps}`,
  ];
  return [lines[0], ...block, ...lines.slice(1)].join("\n");
}

export function annotateSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader başarısız");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(log yok)";
    gl.deleteShader(shader);
    throw new Error(`Shader derlenmedi:\n${log}\n${annotateSource(source)}`);
  }
  return shader;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram başarısız");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "(log yok)";
    gl.deleteProgram(program);
    throw new Error(
      `Program linklenmedi:\n${log}\n${annotateSource(fragmentSource)}`,
    );
  }
  return program;
}
