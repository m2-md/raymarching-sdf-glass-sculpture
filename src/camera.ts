import type { Vec3 } from "./sdf";

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Mirror of GLSL `rayDirection()` (src/shaders/scene.frag.glsl).
 * fragCoord is pixel center; dividing by res.y makes vertical FOV
 * independent of aspect ratio.
 */
export function rayDirection(
  fragCoord: readonly [number, number],
  res: readonly [number, number],
  ro: Vec3,
  ta: Vec3,
  fovY: number,
): Vec3 {
  const uvx = (fragCoord[0] - 0.5 * res[0]) / res[1];
  const uvy = (fragCoord[1] - 0.5 * res[1]) / res[1];

  const forward = normalize(sub(ta, ro));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  const focal = 1 / Math.tan(0.5 * fovY);
  return normalize([
    uvx * right[0] + uvy * up[0] + focal * forward[0],
    uvx * right[1] + uvy * up[1] + focal * forward[1],
    uvx * right[2] + uvy * up[2] + focal * forward[2],
  ]);
}

/** Demo camera: orbits around y axis. Pure function. */
export function orbitCamera(
  angle: number,
  radius: number,
  height: number,
): Vec3 {
  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
}
