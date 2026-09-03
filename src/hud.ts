import type { MeasureReport } from "./measure";
import type { RendererStats } from "./renderer";

export interface Hud {
  update(stats: RendererStats): void;
  setConfig(k: number, ior: number): void;
  setTimerSource(source: "gpu" | "raf"): void;
  setNote(text: string): void;
  showMeasureReport(report: MeasureReport): void;
}

/** MEASUREMENT: values read from hardware/clock each frame. */
const MEASURED = [
  ["fps", "FPS"],
  ["frame", "frame ms"],
  ["gpu", "GPU ms"],
  ["mean", "avg. steps/pixel"],
  ["ceiling", "ceiling reached %"],
] as const;

/** STRUCTURAL: user-selected, unmeasured settings. */
const STRUCTURAL = [
  ["size", "backbuffer"],
  ["budget", "step budget"],
  ["k", "blend k"],
  ["ior", "IOR"],
] as const;

function group(title: string, kind: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "hud-group";
  const head = document.createElement("div");
  head.className = "hud-group-title";
  head.textContent = title;
  const tag = document.createElement("span");
  tag.className = "hud-tag";
  tag.textContent = kind;
  head.appendChild(tag);
  box.appendChild(head);
  return box;
}

function row(parent: HTMLElement, label: string): HTMLElement {
  const line = document.createElement("div");
  line.className = "hud-row";
  const name = document.createElement("span");
  name.className = "hud-label";
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "hud-value";
  value.textContent = "—";
  line.append(name, value);
  parent.appendChild(line);
  return value;
}

export function createHud(root: HTMLElement): Hud {
  root.textContent = "";
  const cells = new Map<string, HTMLElement>();

  const measured = group("Measurement", "MEASUREMENT");
  for (const [key, label] of MEASURED) cells.set(key, row(measured, label));

  const structural = group("Configuration", "STRUCTURAL");
  for (const [key, label] of STRUCTURAL) cells.set(key, row(structural, label));

  const note = document.createElement("div");
  note.className = "hud-note";
  note.textContent = "GPU timer: polling…";

  root.append(measured, structural, note);

  let timerSource: "gpu" | "raf" = "raf";

  const set = (key: string, text: string) => {
    const cell = cells.get(key);
    if (cell) cell.textContent = text;
  };

  return {
    update(stats) {
      set("fps", stats.fps.toFixed(0));
      set("frame", `${stats.frameMs.toFixed(2)} ms`);
      if (timerSource === "gpu") {
        set("gpu", stats.gpuMs === null ? "…" : `${stats.gpuMs.toFixed(3)} ms`);
      } else {
        set("gpu", `${stats.frameMs.toFixed(2)} ms (rAF)`);
      }
      set("mean", stats.meanSteps.toFixed(1));
      set("ceiling", `${stats.ceilingPct.toFixed(2)} %`);
      set("size", `${stats.width}×${stats.height}`);
      set("budget", String(stats.maxSteps));
    },
    setConfig(k, ior) {
      set("k", k.toFixed(2));
      set("ior", ior.toFixed(2));
    },
    setTimerSource(source) {
      timerSource = source;
      note.textContent =
        source === "gpu"
          ? "GPU timer: EXT_disjoint_timer_query_webgl2"
          : "GPU timer: no extension → rAF delta median";
    },
    setNote(text) {
      note.textContent = text;
    },
    showMeasureReport(report) {
      const unit = report.timerExt ? "GPU ms" : "frame ms";
      const t64 = report.timerExt
        ? report.steps64.gpuMsMedian
        : report.steps64.wallMsMedian;
      const t128 = report.timerExt
        ? report.steps128.gpuMsMedian
        : report.steps128.wallMsMedian;
      set("fps", "—");
      set("frame", `${report.steps64.wallMsMedian.toFixed(2)} ms`);
      set("gpu", `${t64.toFixed(3)} → ${t128.toFixed(3)} ${unit}`);
      set(
        "mean",
        `${report.stepStats.budget64.mean.toFixed(1)} / ${report.stepStats.budget128.mean.toFixed(1)}`,
      );
      set(
        "ceiling",
        `${report.stepStats.budget64.ceilingPct.toFixed(2)} / ${report.stepStats.budget128.ceilingPct.toFixed(2)} %`,
      );
      set("size", `${report.width}×${report.height}`);
      set("budget", "64 → 128");
      set("k", report.k.toFixed(2));
      set("ior", report.ior.toFixed(2));
      note.textContent = `BENCHMARK complete · ${report.gpu} · ${report.frames} frames · 128/64 = ${report.ratio128over64.toFixed(3)}× · ${report.timerExt ? "GPU query" : "rAF delta"}`;
    },
  };
}
