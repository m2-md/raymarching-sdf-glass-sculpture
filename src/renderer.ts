import vertexSource from "./shaders/fullscreen.vert.glsl?raw";
import fragmentSource from "./shaders/scene.frag.glsl?raw";

import { orbitCamera } from "./camera";
import { MODE_SHADED, MODE_STEPS_RAW } from "./modes";
import { buildFragmentSource, linkProgram } from "./program";
import { PROBE_HEIGHT, PROBE_WIDTH, createStepProbe } from "./probe";
import type { StepProbe } from "./probe";
import { stepStats } from "./steps";
import type { StepStats } from "./steps";
import { GpuTimer } from "./timer";
import { backingSize } from "./viewport";

export type StepBudget = 64 | 128;

export interface RendererStats {
  fps: number;
  frameMs: number;
  gpuMs: number | null;
  width: number;
  height: number;
  maxSteps: StepBudget;
  meanSteps: number;
  ceilingPct: number;
}

export interface Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly timer: GpuTimer;
  resize(): void;
  render(timeSeconds: number): void;
  drawOnce(timed: boolean): Promise<void>;
  useStepBudget(n: StepBudget): void;
  setMode(mode: number): void;
  setK(k: number): void;
  setIOR(ior: number): void;
  setRefract(on: boolean): void;
  setTime(t: number): void;
  setScale(scale: number): void;
  setFixedSize(w: number, h: number): void;
  setOrbit(azimuth: number, height: number): void;
  sampleStepStats(): StepStats;
  stats(): RendererStats;
  dispose(): void;
}

export const SHADOW_STEPS = 24;
export const INNER_STEPS = 32;

export const DEFAULT_K = 0.35;
export const DEFAULT_IOR = 1.45;
export const DEFAULT_SCALE = 0.5;
export const CAM_RADIUS = 3.4;
export const CAM_AZIMUTH = -Math.PI * 0.5;
export const CAM_HEIGHT = 1.15;
export const CAM_TARGET: readonly [number, number, number] = [0, 0.02, 0];

interface ProgramBundle {
  program: WebGLProgram;
  maxSteps: StepBudget;
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uCamPos: WebGLUniformLocation | null;
  uCamTarget: WebGLUniformLocation | null;
  uK: WebGLUniformLocation | null;
  uIOR: WebGLUniformLocation | null;
  uMode: WebGLUniformLocation | null;
  uRefract: WebGLUniformLocation | null;
}

function buildBundle(
  gl: WebGL2RenderingContext,
  maxSteps: StepBudget,
): ProgramBundle {
  const frag = buildFragmentSource(fragmentSource, {
    maxSteps,
    shadowSteps: SHADOW_STEPS,
    innerSteps: INNER_STEPS,
  });
  const program = linkProgram(gl, vertexSource, frag);
  const loc = (name: string) => gl.getUniformLocation(program, name);
  return {
    program,
    maxSteps,
    uResolution: loc("uResolution"),
    uTime: loc("uTime"),
    uCamPos: loc("uCamPos"),
    uCamTarget: loc("uCamTarget"),
    uK: loc("uK"),
    uIOR: loc("uIOR"),
    uMode: loc("uMode"),
    uRefract: loc("uRefract"),
  };
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  if (!context) throw new Error("WebGL2 not available");
  const gl: WebGL2RenderingContext = context;

  const bundles: Record<StepBudget, ProgramBundle> = {
    64: buildBundle(gl, 64),
    128: buildBundle(gl, 128),
  };

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao); // no attributes, just to have a bound VAO

  gl.disable(gl.DEPTH_TEST); // no depth, single triangle
  gl.disable(gl.DITHER); // step count will be read back as bytes, dithering would corrupt it
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  const timer = new GpuTimer(gl);
  const probe: StepProbe = createStepProbe(gl, PROBE_WIDTH, PROBE_HEIGHT);

  let budget: StepBudget = 64;
  let mode = MODE_SHADED;
  let k = DEFAULT_K;
  let ior = DEFAULT_IOR;
  let refract = true;
  let time = 0;
  let scale = DEFAULT_SCALE;
  let azimuth = CAM_AZIMUTH;
  let height = CAM_HEIGHT;
  let fixedSize: { width: number; height: number } | null = null;

  let lastStats: StepStats = {
    samples: 0,
    mean: 0,
    max: 0,
    ceilingPct: 0,
  };
  let fps = 0;
  let frameMs = 0;
  let lastFrameStamp = 0;
  let lastProbeStamp = 0;

  function camPos(): readonly [number, number, number] {
    return orbitCamera(azimuth, CAM_RADIUS, height);
  }

  function applyUniforms(
    bundle: ProgramBundle,
    width: number,
    heightPx: number,
    modeOverride: number,
  ): void {
    const ro = camPos();
    gl.useProgram(bundle.program);
    gl.uniform2f(bundle.uResolution, width, heightPx);
    gl.uniform1f(bundle.uTime, time);
    gl.uniform3f(bundle.uCamPos, ro[0], ro[1], ro[2]);
    gl.uniform3f(
      bundle.uCamTarget,
      CAM_TARGET[0],
      CAM_TARGET[1],
      CAM_TARGET[2],
    );
    gl.uniform1f(bundle.uK, k);
    gl.uniform1f(bundle.uIOR, ior);
    gl.uniform1i(bundle.uMode, modeOverride);
    gl.uniform1i(bundle.uRefract, refract ? 1 : 0);
  }

  function drawMain(): void {
    const bundle = bundles[budget];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    applyUniforms(bundle, canvas.width, canvas.height, mode);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize(): void {
    let width: number;
    let heightPx: number;
    if (fixedSize) {
      width = fixedSize.width;
      heightPx = fixedSize.height;
    } else {
      const cssW = canvas.clientWidth || 960;
      const cssH = canvas.clientHeight || 540;
      const size = backingSize(cssW, cssH, window.devicePixelRatio || 1, scale);
      width = size.width;
      heightPx = size.height;
    }
    if (canvas.width !== width || canvas.height !== heightPx) {
      canvas.width = width;
      canvas.height = heightPx;
    }
  }

  function sampleStepStats(): StepStats {
    const bundle = bundles[budget];
    probe.bind();
    applyUniforms(bundle, probe.width, probe.height, MODE_STEPS_RAW);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = probe.read();
    lastStats = stepStats(pixels, budget);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    return lastStats;
  }

  function render(timeSeconds: number): void {
    time = timeSeconds;
    resize();

    const now = performance.now();
    if (lastFrameStamp > 0) {
      const dt = now - lastFrameStamp;
      frameMs = frameMs === 0 ? dt : frameMs * 0.9 + dt * 0.1;
      fps = frameMs > 0 ? 1000 / frameMs : 0;
    }
    lastFrameStamp = now;

    timer.poll();
    timer.begin();
    drawMain();
    timer.end();

    if (now - lastProbeStamp > 500) {
      lastProbeStamp = now;
      sampleStepStats();
    }
    if (timer.samplesMs.length > 240) {
      timer.samplesMs.splice(0, timer.samplesMs.length - 240);
    }
  }

  async function drawOnce(timed: boolean): Promise<void> {
    timer.poll();
    if (timed) timer.begin();
    drawMain();
    if (timed) timer.end();
    await nextFrame();
    timer.poll();
  }

  function stats(): RendererStats {
    const recent = timer.samplesMs.slice(-30);
    const gpuMs =
      recent.length > 0
        ? recent.reduce((a, b) => a + b, 0) / recent.length
        : null;
    return {
      fps,
      frameMs,
      gpuMs,
      width: canvas.width,
      height: canvas.height,
      maxSteps: budget,
      meanSteps: lastStats.mean,
      ceilingPct: lastStats.ceilingPct,
    };
  }

  return {
    gl,
    timer,
    resize,
    render,
    drawOnce,
    useStepBudget(n) {
      budget = n;
    },
    setMode(next) {
      mode = next;
    },
    setK(next) {
      k = next;
    },
    setIOR(next) {
      ior = next;
    },
    setRefract(on) {
      refract = on;
    },
    setTime(t) {
      time = t;
    },
    setScale(next) {
      scale = next;
    },
    setFixedSize(w, h) {
      fixedSize = { width: w, height: h };
      resize();
    },
    setOrbit(nextAzimuth, nextHeight) {
      azimuth = nextAzimuth;
      height = nextHeight;
    },
    sampleStepStats,
    stats,
    dispose() {
      timer.dispose();
      probe.dispose();
      gl.deleteProgram(bundles[64].program);
      gl.deleteProgram(bundles[128].program);
      gl.deleteVertexArray(vao);
    },
  };
}
