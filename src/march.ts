import type { Vec3 } from "./sdf";

export interface MarchResult {
  /** Distance where raymarch ended. */
  t: number;
  /** Number of `map` invocations consumed (matches GLSL `marchScene` semantics). */
  steps: number;
  hit: boolean;
}

export interface MarchOptions {
  maxSteps: number;
  minDist?: number;
  maxDist?: number;
  epsilon?: number;
}

/** Exact defaults matching shader constants. */
export const DEFAULT_MIN_DIST = 0.02;
export const DEFAULT_MAX_DIST = 24;
export const DEFAULT_EPSILON = 0.0012;

/**
 * Mirror of GLSL `marchScene()`. Since `map` is parameterized, scene
 * is not duplicated into TypeScript: tested against analytically verifiable fields.
 */
export function march(
  map: (p: Vec3) => number,
  ro: Vec3,
  rd: Vec3,
  opts: MarchOptions,
): MarchResult {
  const minDist = opts.minDist ?? DEFAULT_MIN_DIST;
  const maxDist = opts.maxDist ?? DEFAULT_MAX_DIST;
  const eps = opts.epsilon ?? DEFAULT_EPSILON;

  let t = minDist;
  let steps = 0;
  let hit = false;

  for (let i = 0; i < opts.maxSteps; i++) {
    const d = map([ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t]);
    steps = i + 1;
    if (d < eps * t) {
      hit = true;
      break;
    }
    t += d;
    if (t > maxDist) break;
  }

  return { t, steps, hit };
}
