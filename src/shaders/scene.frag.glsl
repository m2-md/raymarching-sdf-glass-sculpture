#version 300 es
// NOTE: "#version 300 es" must be the FIRST line of this file.
// MAX_STEPS / SHADOW_STEPS / INNER_STEPS are NOT defined here;
// buildFragmentSource() in src/program.ts injects them immediately
// AFTER line 1.
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uK;
uniform float uIOR;
uniform int uMode;
uniform int uRefract;

out vec4 outColor;

const float EPS = 0.0012;
const float MIN_DIST = 0.02;
const float MAX_DIST = 24.0;
const vec3 LIGHT_DIR = vec3(0.4, 0.75, -0.5);
const float PLANE_Y = -1.15;

const int MODE_SHADED = 0;
const int MODE_HEAT = 1;
const int MODE_STEPS_RAW = 2;

struct Hit {
  float t;
  int steps;
  bool hit;
};

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b; // use symmetry: positive octant is sufficient
  // Outside: length of overflowing axes; Inside: distance to nearest surface
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, float major, float minor) {
  vec2 q = vec2(length(p.xz) - major, p.y); // first to ring, then to cross-section
  return length(q) - minor;
}

float opUnion(float a, float b) { return min(a, b); }
float opSubtract(float a, float b) { return max(-a, b); } // carve a from b
float opIntersect(float a, float b) { return max(a, b); }

// k: blend radius (world units). Reverts to plain min when k=0.
float smin(float a, float b, float k) {
  float kk = max(k, 1e-4);
  float h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

float map(vec3 p) {
  vec3 q = p;
  q.xz = rot(uTime * 0.25) * q.xz; // rotate space, not the sculpture itself

  float sphere = sdSphere(q - vec3(0.0, 0.34, 0.0), 0.62);

  vec3 bp = q - vec3(0.0, -0.36, 0.0);
  bp.xz = rot(0.6) * bp.xz;
  float box = sdBox(bp, vec3(0.46, 0.26, 0.46));

  vec3 tp = q;
  tp.yz = rot(1.15) * tp.yz;
  float torus = sdTorus(tp, 0.80, 0.15);

  float d = smin(sphere, box, uK);
  d = smin(d, torus, uK * 0.75);

  // Cavity: glass thickness emerges here, refraction will encounter this
  float cavity = sdSphere(q - vec3(0.0, 0.20, 0.0), 0.34);
  return opSubtract(cavity, d);
}

vec3 rayDirection(vec2 fragCoord, vec2 res, vec3 ro, vec3 ta, float fovY) {
  // Coordinate relative to screen center, divided by HEIGHT.
  // Dividing by res.y makes vertical FOV independent of aspect ratio.
  vec2 uv = (fragCoord - 0.5 * res) / res.y;

  vec3 forward = normalize(ta - ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  float focal = 1.0 / tan(0.5 * fovY);
  return normalize(uv.x * right + uv.y * up + focal * forward);
}

Hit marchScene(vec3 ro, vec3 rd) {
  float t = MIN_DIST;
  int steps = 0;
  bool hit = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float d = map(ro + rd * t);
    steps = i + 1;
    if (d < EPS * t) { hit = true; break; } // converged
    t += d;                                 // safe step = distance itself
    if (t > MAX_DIST) break;                // escaped
  }
  return Hit(t, steps, hit);
}

vec3 calcNormal(vec3 p) {
  vec2 h = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + h.xyy) - map(p - h.xyy),
    map(p + h.yxy) - map(p - h.yxy),
    map(p + h.yyx) - map(p - h.yyx)
  ));
}

float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0;
  float t = tmin;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    float h = map(ro + rd * t);
    res = min(res, k * h / t); // grazing pass near surface = soft penumbra
    t += clamp(h, 0.03, 0.4);
    if (res < 0.004 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 sky(vec3 rd) {
  float h = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.10, 0.12, 0.17), vec3(0.30, 0.44, 0.66), h);
  float sun = pow(max(dot(rd, normalize(LIGHT_DIR)), 0.0), 64.0);
  return col + vec3(1.0, 0.92, 0.78) * sun * 0.9;
}

vec3 background(vec3 ro, vec3 rd, bool withShadow) {
  if (rd.y < -0.0001) {
    float t = (PLANE_Y - ro.y) / rd.y; // ray-plane intersection, no loop
    if (t > 0.0 && t < MAX_DIST) {
      vec3 p = ro + rd * t;
      float c = mod(floor(p.x * 0.8) + floor(p.z * 0.8), 2.0);
      vec3 col = mix(vec3(0.16), vec3(0.26), c);
      if (withShadow) {
        col *= 0.35 + 0.65 * softShadow(p, normalize(LIGHT_DIR), 0.06, 6.0, 12.0);
      }
      return mix(col, sky(rd), 1.0 - exp(-0.035 * t));
    }
  }
  return sky(rd);
}

vec3 marchInside(vec3 p, vec3 rd, out vec3 exitNormal) {
  float t = 0.02;
  for (int i = 0; i < INNER_STEPS; i++) {
    float d = -map(p + rd * t); // inside distance is negative, invert sign
    if (d < 0.0008) break;
    t += max(d, 0.006); // prevent getting stuck on zero steps
    if (t > 6.0) break;
  }
  vec3 q = p + rd * t;
  exitNormal = -calcNormal(q); // exit normal must point inward
  return q;
}

vec3 shadeGlass(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 l = normalize(LIGHT_DIR);

  float f0 = pow((1.0 - uIOR) / (1.0 + uIOR), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);

  vec3 reflDir = reflect(rd, n);
  vec3 reflCol = background(p, reflDir, false);

  vec3 refrCol = reflCol;
  if (uRefract == 1) {
    vec3 dirIn = refract(rd, n, 1.0 / uIOR); // air -> glass
    vec3 exitN;
    vec3 exitP = marchInside(p, dirIn, exitN);

    vec3 dirOut = refract(dirIn, exitN, uIOR); // glass -> air
    if (dot(dirOut, dirOut) < 0.5) {
      dirOut = reflect(dirIn, exitN); // total internal reflection: refract returns zero
    }
    refrCol = background(exitP, dirOut, false);

    // Beer-Lambert: thicker regions absorb more light
    float thickness = distance(p, exitP);
    refrCol *= exp(-thickness * vec3(0.35, 0.18, 0.10));
  }

  vec3 col = mix(refrCol, reflCol, fresnel);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflDir, l), 0.0), 48.0) * 0.6;
  return col;
}

vec3 heat(float f) {
  f = clamp(f, 0.0, 1.0);
  vec3 cold = vec3(0.05, 0.10, 0.30);
  vec3 mid  = vec3(0.15, 0.75, 0.55);
  vec3 hot  = vec3(1.00, 0.25, 0.15);
  return f < 0.5 ? mix(cold, mid, f * 2.0) : mix(mid, hot, (f - 0.5) * 2.0);
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = rayDirection(gl_FragCoord.xy, uResolution, ro, uCamTarget, 1.05);
  Hit h = marchScene(ro, rd);

  if (uMode == MODE_STEPS_RAW) {
    // Write step count as raw byte: lossless since 128 <= 255
    outColor = vec4(float(h.steps) / 255.0, 0.0, 0.0, 1.0);
    return;
  }
  if (uMode == MODE_HEAT) {
    outColor = vec4(heat(float(h.steps) / float(MAX_STEPS)), 1.0);
    return;
  }

  vec3 col = h.hit ? shadeGlass(ro, rd, h.t) : background(ro, rd, true);
  outColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), 1.0);
}
