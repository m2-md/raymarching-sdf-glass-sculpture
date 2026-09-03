import type { MeasureReport } from "./measure";
import type { RendererStats } from "./renderer";

export interface Hud {
  update(stats: RendererStats): void;
  setConfig(k: number, ior: number): void;
  setTimerSource(source: "gpu" | "raf"): void;
  setNote(text: string): void;
  showMeasureReport(report: MeasureReport): void;
}

/** ÖLÇÜM: her karede donanımdan/saatten okunan değerler. */
const MEASURED = [
  ["fps", "FPS"],
  ["frame", "kare ms"],
  ["gpu", "GPU ms"],
  ["mean", "ort. adım/piksel"],
  ["ceiling", "tavana dayanan %"],
] as const;

/** YAPISAL: kullanıcının seçtiği, ölçülmeyen ayarlar. */
const STRUCTURAL = [
  ["size", "arka tampon"],
  ["budget", "adım bütçesi"],
  ["k", "karışım k"],
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

  const measured = group("Ölçüm", "ÖLÇÜM");
  for (const [key, label] of MEASURED) cells.set(key, row(measured, label));

  const structural = group("Yapılandırma", "YAPISAL");
  for (const [key, label] of STRUCTURAL) cells.set(key, row(structural, label));

  const note = document.createElement("div");
  note.className = "hud-note";
  note.textContent = "GPU saati: yokluyor…";

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
          ? "GPU saati: EXT_disjoint_timer_query_webgl2"
          : "GPU saati: uzantı yok → rAF delta medyanı";
    },
    setNote(text) {
      note.textContent = text;
    },
    showMeasureReport(report) {
      const unit = report.timerExt ? "GPU ms" : "kare ms";
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
      note.textContent = `ÖLÇÜM bitti · ${report.gpu} · ${report.frames} kare · 128/64 = ${report.ratio128over64.toFixed(3)}× · ${report.timerExt ? "GPU sorgusu" : "rAF deltası"}`;
    },
  };
}
