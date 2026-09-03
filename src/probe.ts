export interface StepProbe {
  readonly width: number;
  readonly height: number;
  bind(): void;
  read(): Uint8Array;
  dispose(): void;
}

export const PROBE_WIDTH = 256;
export const PROBE_HEIGHT = 144;

export function createStepProbe(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): StepProbe {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const pixels = new Uint8Array(width * height * 4);

  return {
    width,
    height,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
    },
    read() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return pixels;
    },
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}
