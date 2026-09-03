export type Vec3 = readonly [number, number, number];

export function length3(p: Vec3): number {
  return Math.hypot(p[0], p[1], p[2]);
}

export function sdSphere(p: Vec3, r: number): number {
  return length3(p) - r;
}

export function sdBox(p: Vec3, b: Vec3): number {
  const qx = Math.abs(p[0]) - b[0];
  const qy = Math.abs(p[1]) - b[1];
  const qz = Math.abs(p[2]) - b[2];
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

export function sdTorus(p: Vec3, major: number, minor: number): number {
  const q = Math.hypot(p[0], p[2]) - major;
  return Math.hypot(q, p[1]) - minor;
}

export function opUnion(a: number, b: number): number {
  return Math.min(a, b);
}

export function opSubtract(a: number, b: number): number {
  return Math.max(-a, b);
}

export function opIntersect(a: number, b: number): number {
  return Math.max(a, b);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** GLSL tarafındaki `smin` ile birebir aynı formül (scene.frag.glsl). */
export const SMIN_K_MIN = 1e-4;

export function smin(a: number, b: number, k: number): number {
  const kk = Math.max(k, SMIN_K_MIN);
  const h = clamp(0.5 + (0.5 * (b - a)) / kk, 0, 1);
  return mix(b, a, h) - kk * h * (1 - h);
}
