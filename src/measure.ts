import { MODE_SHADED } from "./modes";
import { PROBE_HEIGHT, PROBE_WIDTH } from "./probe";
import type { Renderer } from "./renderer";
import { CAM_AZIMUTH, CAM_HEIGHT, DEFAULT_IOR, DEFAULT_K } from "./renderer";
import { median, percentile } from "./stats";

export const MEASURE_TIME = 3.0;
export const MEASURE_WIDTH = 960;
export const MEASURE_HEIGHT = 540;
export const MEASURE_FRAMES = 240;
export const MEASURE_WARMUP = 60;

export interface RunResult {
  gpuMsMedian: number;
  gpuMsP95: number;
  wallMsMedian: number;
}

export async function runConfig(
  renderer: Renderer,
  config: { maxSteps: 64 | 128; refract: boolean },
  frames: number,
  warmup: number,
): Promise<RunResult> {
  renderer.useStepBudget(config.maxSteps);
  renderer.setRefract(config.refract);
  renderer.setTime(MEASURE_TIME); // sabit poz: her koşu aynı kareyi çiziyor

  for (let i = 0; i < warmup; i++) await renderer.drawOnce(false);

  const wall: number[] = [];
  renderer.timer.samplesMs.length = 0;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    await renderer.drawOnce(true); // timer.begin() -> draw -> timer.end() -> poll()
    wall.push(performance.now() - t0);
  }

  return {
    gpuMsMedian: median(renderer.timer.samplesMs),
    gpuMsP95: percentile(renderer.timer.samplesMs, 95),
    wallMsMedian: median(wall),
  };
}

export interface StepSummary {
  mean: number;
  max: number;
  ceilingPct: number;
}

export interface MeasureReport {
  gpu: string;
  timerExt: boolean;
  width: number;
  height: number;
  frames: number;
  warmup: number;
  probe: { width: number; height: number };
  k: number;
  ior: number;
  steps64: RunResult;
  steps128: RunResult;
  noRefract64: { gpuMsMedian: number; wallMsMedian: number };
  ratio128over64: number;
  /** Oranın hangi saatten çıktığı. Uzantı yoksa "wall" (rAF deltası). */
  ratioSource: "gpu" | "wall";
  stepStats: {
    budget64: StepSummary;
    budget128: StepSummary;
    budget128_k0: StepSummary;
    budget128_k035: StepSummary;
  };
}

function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function rendererName(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) return "bilinmiyor";
  const name = gl.getParameter(
    (ext as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL,
  );
  return typeof name === "string" && name.length > 0 ? name : "bilinmiyor";
}

/** Adım istatistiği koşusu: birkaç kare çiz, sonuncusunu oku. */
async function runStepStats(
  renderer: Renderer,
  config: { maxSteps: 64 | 128; k: number },
): Promise<StepSummary> {
  renderer.useStepBudget(config.maxSteps);
  renderer.setK(config.k);
  renderer.setRefract(true);
  renderer.setTime(MEASURE_TIME);
  for (let i = 0; i < 3; i++) await renderer.drawOnce(false);
  const s = renderer.sampleStepStats();
  return {
    mean: round(s.mean, 3),
    max: s.max,
    ceilingPct: round(s.ceilingPct, 3),
  };
}

function roundRun(r: RunResult): RunResult {
  return {
    gpuMsMedian: round(r.gpuMsMedian, 4),
    gpuMsP95: round(r.gpuMsP95, 4),
    wallMsMedian: round(r.wallMsMedian, 4),
  };
}

/**
 * Deterministik ölçüm modu (`?measure=1`).
 * Sabit arka tampon, sabit zaman, sabit kamera; sonunda konsola TEK satır.
 */
export async function runMeasurement(
  renderer: Renderer,
): Promise<MeasureReport> {
  renderer.setFixedSize(MEASURE_WIDTH, MEASURE_HEIGHT);
  renderer.setOrbit(CAM_AZIMUTH, CAM_HEIGHT);
  renderer.setMode(MODE_SHADED);
  renderer.setK(DEFAULT_K);
  renderer.setIOR(DEFAULT_IOR);
  renderer.setTime(MEASURE_TIME);

  const a = await runConfig(
    renderer,
    { maxSteps: 64, refract: true },
    MEASURE_FRAMES,
    MEASURE_WARMUP,
  );
  const b = await runConfig(
    renderer,
    { maxSteps: 128, refract: true },
    MEASURE_FRAMES,
    MEASURE_WARMUP,
  );
  const c = await runConfig(
    renderer,
    { maxSteps: 64, refract: false },
    MEASURE_FRAMES,
    MEASURE_WARMUP,
  );

  const timerExt = renderer.timer.available;
  const base = timerExt ? a.gpuMsMedian : a.wallMsMedian;
  const doubled = timerExt ? b.gpuMsMedian : b.wallMsMedian;

  const budget64 = await runStepStats(renderer, { maxSteps: 64, k: DEFAULT_K });
  const budget128 = await runStepStats(renderer, {
    maxSteps: 128,
    k: DEFAULT_K,
  });
  const budget128k0 = await runStepStats(renderer, { maxSteps: 128, k: 0 });
  const budget128k035 = await runStepStats(renderer, {
    maxSteps: 128,
    k: 0.35,
  });

  return {
    gpu: rendererName(renderer.gl),
    timerExt,
    width: MEASURE_WIDTH,
    height: MEASURE_HEIGHT,
    frames: MEASURE_FRAMES,
    warmup: MEASURE_WARMUP,
    probe: { width: PROBE_WIDTH, height: PROBE_HEIGHT },
    k: DEFAULT_K,
    ior: DEFAULT_IOR,
    steps64: roundRun(a),
    steps128: roundRun(b),
    noRefract64: {
      gpuMsMedian: round(c.gpuMsMedian, 4),
      wallMsMedian: round(c.wallMsMedian, 4),
    },
    ratio128over64: round(base > 0 ? doubled / base : 0, 4),
    ratioSource: timerExt ? "gpu" : "wall",
    stepStats: {
      budget64,
      budget128,
      budget128_k0: budget128k0,
      budget128_k035: budget128k035,
    },
  };
}
