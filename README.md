# SDF Raymarching — Glass Sculpture · 64 vs 128

Working code for the article "There Is Only One Triangle in the Scene: A Glass
Sculpture with SDF Raymarching, 64 Steps vs 128". Raw WebGL2 (GLSL ES 3.00),
TypeScript, Vite, vitest. No `three.js`, no shader library; the math on every line
is written by hand.

There is a single triangle in the scene: one generated from `gl_VertexID` that
covers the screen edge to edge. The silhouette, the double refraction inside the
glass and the soft shadow falling on the floor — all of it comes out of a single
`map()` distance function.

## What it contains

- **A single triangle, zero attributes** (`src/shaders/fullscreen.vert.glsl`) — no
  vertex buffer; the three corners are generated with a `gl_VertexID` bit trick.
  WebGL2 still demands a bound VAO, so an empty VAO is set up.
- **A single fragment shader** (`src/shaders/scene.frag.glsl`) — SDF primitives
  (`sdSphere`/`sdBox`/`sdTorus`), operators (`min`/`max`/`smin`), the march loop,
  normal from the gradient, `softShadow`, double refraction + Beer-Lambert, the heat
  map and the raw step counter.
- **Two programs from the same source** (`src/program.ts`) — `MAX_STEPS` is not a
  uniform but a `#define`; `buildFragmentSource()` injects the define block
  immediately AFTER the `#version` line (put it before and the shader will not
  compile). The 64 and 128 budgets are two separately compiled programs.
- **Reading back the step counter** (`src/probe.ts`, `src/steps.ts`) — the step count
  is written to an RGBA8 target as `float(steps)/255.0` and read back from a 256×144
  FBO with `readPixels`. Without `gl.disable(gl.DITHER)` the byte drifts.
- **A GPU clock** (`src/timer.ts`) — `EXT_disjoint_timer_query_webgl2`; a query queue,
  a `GPU_DISJOINT_EXT` check, NO `gl.finish()`. If the extension is missing, the HUD
  and the measurement output say so explicitly and fall back to the median rAF delta.
- **A pure logic layer** (`src/sdf.ts`, `src/march.ts`, `src/camera.ts`,
  `src/stats.ts`, `src/viewport.ts`) — the TypeScript mirror of the GLSL; browserless,
  tested with vitest.

## Install

```bash
npm install
```

## Test (browserless, deterministic)

```bash
npm test
```

**57 tests green** (7 files): SDF primitives + `smin` algebra (12), camera ray
generation (7), the CPU marcher and `smin` changing the topology (6), shader source
+ `#define` injection (10), viewport clamps (9), median/percentile (8), step
statistics (5). No test file references `document`, `window`,
`WebGL2RenderingContext` or `performance`.

## Type checking and build

```bash
npx tsc --noEmit   # 0 errors
npm run build      # tsc && vite build -> dist/
```

GLSL is not compiled here; only the browser can show you that the shader really
compiles.

## Demo (NOT `file://`)

```bash
npm run dev
# http://localhost:5173/
```

The defaults are sized so they will not heat up your machine: the canvas is not
fullscreen (a 960 px wide 16:9 box), the resolution scale is 0.5, the step budget is
64.

| Control                    | Values                  | Default    |
| -------------------------- | ----------------------- | ---------- |
| Blend `k`                  | 0 – 0.8                 | 0.35       |
| IOR                        | 1.0 – 2.0               | 1.45       |
| Resolution scale           | 0.35 / 0.5 / 0.75 / 1.0 | 0.5        |
| Step budget (`MAX_STEPS`)  | 64 / 128                | 64         |
| Mode                       | Shaded / Heatmap        | Shaded     |
| Refraction                 | on / off                | on         |
| Pause/Resume               | —                       | running    |

You can rotate the camera by dragging over the canvas.

What you will see:

- **Shaded mode:** a rotating glass sculpture; looking through it, the floor checkers
  are bent, there is a soft shadow on the ground, a Fresnel reflection at the edges.
- **`k` = 0:** three separate bodies (sphere, rotated box, torus) standing apart with
  sharp seams. **`k` = 0.8:** a single body cast from the same liquid.
- **Refraction off:** only reflection remains, the object turns into a mirror.
- **Heatmap:** the middle of the body is navy (2-3 steps), the edge of the silhouette
  is red (the step ceiling). Push the budget to 128 and that red band thins out and
  drops to green — meaning those same pixels now fit inside the budget.

### Heat guardrails

`devicePixelRatio` is clamped to 2 (`src/viewport.ts`), the resolution scale is in
the user's hands, and the total backbuffer is capped at 1.8 Mpx. When the tab goes to
the background the loop stops on its own; the `Pause` button really cancels
`requestAnimationFrame` (not throttling it — stopping it).

## Deterministic measurement mode

```
http://localhost:5173/?measure=1
```

In this mode the demo stops being interactive: the backbuffer locks to 960×540,
`uTime = 3.0` is fixed (every run draws the same pose), the camera/`k`/IOR are
constant. For each configuration 60 warmup frames are thrown away, then 240 frames
are measured. When it finishes, **a single line** lands in the console:

```
MEASURE {"gpu":"…","timerExt":true,"width":960,"height":540,…}
```

The run list:

| Run  | maxSteps | refract | k    | Measured                            |
| ---- | -------- | ------- | ---- | ----------------------------------- |
| A    | 64       | on      | 0.35 | GPU ms median/p95, frame ms median  |
| B    | 128      | on      | 0.35 | GPU ms median/p95, frame ms median  |
| C    | 64       | off     | 0.35 | GPU ms median                       |
| D    | 64       | on      | 0.35 | mean/max steps, ceiling % (probe)   |
| E    | 128      | on      | 0.35 | mean/max steps, ceiling % (probe)   |
| F    | 128      | on      | 0    | mean steps                          |
| G    | 128      | on      | 0.35 | mean steps                          |

The output schema:

```json
{
  "gpu": "<UNMASKED_RENDERER_WEBGL or 'unknown'>",
  "timerExt": true,
  "width": 960,
  "height": 540,
  "frames": 240,
  "warmup": 60,
  "probe": { "width": 256, "height": 144 },
  "k": 0.35,
  "ior": 1.45,
  "steps64": { "gpuMsMedian": 0, "gpuMsP95": 0, "wallMsMedian": 0 },
  "steps128": { "gpuMsMedian": 0, "gpuMsP95": 0, "wallMsMedian": 0 },
  "noRefract64": { "gpuMsMedian": 0, "wallMsMedian": 0 },
  "ratio128over64": 0,
  "ratioSource": "gpu",
  "stepStats": {
    "budget64": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128_k0": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128_k035": { "mean": 0, "max": 0, "ceilingPct": 0 }
  }
}
```

When the measurement is done the HUD shows the same values; the bottom line says
which clock was used (`GPU query` / `rAF delta`).

**If `timerExt: false` comes back**, every `gpuMs*` field stays `0` — nothing is
invented. In their place `wallMsMedian` (the median rAF delta) is read,
`ratio128over64` is computed from it, and `ratioSource: "wall"` says so explicitly.
The HUD also changes the column name to "frame ms". Getting a number's name wrong is
worse than not measuring it.

Careful: in a loop locked to vsync, `wallMsMedian` is the frame _period_ (~16.7 ms at
60 Hz), not the frame _cost_. That is what you are measuring in a browser without a
GPU timer.

The numbers are machine-specific. The table in the article is one machine's story;
yours will give a different number and that is the one worth reading.

## File layout

```
index.html                     960 px / 16:9 stage + HUD + controls
src/
  main.ts                      bootstrap, loop, Pause/Resume, ?measure=1 branch
  renderer.ts                  WebGL2 setup, two programs, probe, draw
  program.ts                   #define injection, compile/link + log with line numbers
  measure.ts                   deterministic run list, MEASURE {json}
  hud.ts                       readout split into MEASUREMENT / STRUCTURAL
  timer.ts                     EXT_disjoint_timer_query_webgl2 wrapper
  probe.ts                     256x144 RGBA8 FBO + readPixels
  steps.ts                     step statistics (mean / max / ceiling %)
  stats.ts                     median + percentile
  viewport.ts                  dpr clamp, scale, pixel budget
  sdf.ts                       TypeScript mirror of the GLSL SDFs
  march.ts                     CPU raymarcher (map as a parameter)
  camera.ts                    ray generation + orbit camera
  modes.ts                     MODE_SHADED / MODE_HEAT / MODE_STEPS_RAW
  shaders/
    fullscreen.vert.glsl       a single triangle from gl_VertexID
    scene.frag.glsl            the whole scene
test/                          7 files, 57 tests (browserless)
```

## License

MIT — see `LICENSE`.
