export const MAX_DPR = 2;
export const MAX_PIXELS = 1_800_000;

export function backingSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  scale: number,
) {
  const clampedDpr = Math.min(Math.max(dpr, 1), MAX_DPR);
  const clampedScale = Math.min(Math.max(scale, 0.25), 1);
  const width = Math.max(1, Math.round(cssWidth * clampedDpr * clampedScale));
  const height = Math.max(1, Math.round(cssHeight * clampedDpr * clampedScale));
  return fitPixelBudget(width, height);
}

// Scales down total pixel count under budget while preserving aspect ratio.
export function fitPixelBudget(
  width: number,
  height: number,
  budget = MAX_PIXELS,
) {
  const total = width * height;
  if (total <= budget) return { width, height };
  const factor = Math.sqrt(budget / total);
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}
