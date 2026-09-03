import { createHud } from "./hud";
import { runMeasurement } from "./measure";
import { MODE_HEAT, MODE_SHADED } from "./modes";
import type { Renderer, StepBudget } from "./renderer";
import {
  CAM_AZIMUTH,
  CAM_HEIGHT,
  DEFAULT_IOR,
  DEFAULT_K,
  DEFAULT_SCALE,
  createRenderer,
} from "./renderer";

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`DOM düğümü yok: ${selector}`);
  return el;
}

const canvas = need<HTMLCanvasElement>("#stage");
const hudRoot = need<HTMLElement>("#hud");
const banner = need<HTMLElement>("#banner");
const toggleButton = need<HTMLButtonElement>("#toggle");
const kInput = need<HTMLInputElement>("#k");
const iorInput = need<HTMLInputElement>("#ior");
const scaleSelect = need<HTMLSelectElement>("#scale");
const budgetSelect = need<HTMLSelectElement>("#budget");
const modeSelect = need<HTMLSelectElement>("#mode");
const refractInput = need<HTMLInputElement>("#refract");
const kOut = need<HTMLElement>("#k-out");
const iorOut = need<HTMLElement>("#ior-out");

let renderer: Renderer;
try {
  renderer = createRenderer(canvas);
} catch (error) {
  canvas.remove();
  banner.hidden = false;
  banner.textContent = `Bu tarayıcıda WebGL2 yok, demo çalışamaz. (${String(error)})`;
  throw error;
}

const hud = createHud(hudRoot);
hud.setTimerSource(renderer.timer.available ? "gpu" : "raf");
hud.setConfig(DEFAULT_K, DEFAULT_IOR);

canvas.addEventListener(
  "webglcontextlost",
  (event) => {
    event.preventDefault();
    setRunning(false);
    banner.hidden = false;
    banner.textContent = "WebGL bağlamı kayboldu. Sayfayı yenileyin.";
    console.warn("webglcontextlost");
  },
  false,
);

let running = true;
let frameId = 0;

function loop(now: number) {
  frameId = requestAnimationFrame(loop);
  renderer.render(now * 0.001);
  hud.update(renderer.stats());
}

function setRunning(next: boolean): void {
  if (next === running) return;
  running = next;
  toggleButton.textContent = running ? "Dur" : "Devam";
  if (running) {
    hud.setTimerSource(renderer.timer.available ? "gpu" : "raf");
    frameId = requestAnimationFrame(loop);
  } else {
    hud.setNote("Döngü duraklatıldı — sayaçlar donduruldu.");
    cancelAnimationFrame(frameId);
  }
}

toggleButton.addEventListener("click", () => setRunning(!running));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setRunning(false);
});

function wireControls(): void {
  kInput.value = String(DEFAULT_K);
  iorInput.value = String(DEFAULT_IOR);
  scaleSelect.value = String(DEFAULT_SCALE);
  budgetSelect.value = "64";
  modeSelect.value = String(MODE_SHADED);
  refractInput.checked = true;
  kOut.textContent = DEFAULT_K.toFixed(2);
  iorOut.textContent = DEFAULT_IOR.toFixed(2);

  const syncConfig = () => {
    hud.setConfig(Number(kInput.value), Number(iorInput.value));
    kOut.textContent = Number(kInput.value).toFixed(2);
    iorOut.textContent = Number(iorInput.value).toFixed(2);
  };

  kInput.addEventListener("input", () => {
    renderer.setK(Number(kInput.value));
    syncConfig();
  });
  iorInput.addEventListener("input", () => {
    renderer.setIOR(Number(iorInput.value));
    syncConfig();
  });
  scaleSelect.addEventListener("change", () => {
    renderer.setScale(Number(scaleSelect.value));
    renderer.resize();
  });
  budgetSelect.addEventListener("change", () => {
    renderer.useStepBudget(Number(budgetSelect.value) as StepBudget);
  });
  modeSelect.addEventListener("change", () => {
    renderer.setMode(
      Number(modeSelect.value) === MODE_HEAT ? MODE_HEAT : MODE_SHADED,
    );
  });
  refractInput.addEventListener("change", () => {
    renderer.setRefract(refractInput.checked);
  });
}

function wireCamera(): void {
  let azimuth = CAM_AZIMUTH;
  let height = CAM_HEIGHT;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    azimuth += (event.clientX - lastX) * 0.006;
    height = Math.min(
      Math.max(height - (event.clientY - lastY) * 0.008, -0.6),
      2.6,
    );
    lastX = event.clientX;
    lastY = event.clientY;
    renderer.setOrbit(azimuth, height);
  });
  const stop = (event: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

const measureMode = new URLSearchParams(location.search).get("measure") === "1";

if (measureMode) {
  document.body.classList.add("measuring");
  toggleButton.disabled = true;
  hud.setNote("Deterministik ölçüm koşuyor… (sekmeyi ön planda tutun)");
  running = false;
  runMeasurement(renderer).then((report) => {
    console.log(`MEASURE ${JSON.stringify(report)}`);
    hud.showMeasureReport(report);
  });
} else {
  wireControls();
  wireCamera();
  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  frameId = requestAnimationFrame(loop);
}
