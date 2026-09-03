export interface StepStats {
  samples: number;
  mean: number;
  max: number;
  ceilingPct: number; // percentage of pixels reaching step ceiling
}

export function stepStats(pixels: Uint8Array, maxSteps: number): StepStats {
  const samples = Math.floor(pixels.length / 4);
  if (samples === 0) return { samples: 0, mean: 0, max: 0, ceilingPct: 0 };

  let sum = 0;
  let max = 0;
  let ceiling = 0;

  for (let i = 0; i < samples; i++) {
    const steps = pixels[i * 4]; // red channel
    sum += steps;
    if (steps > max) max = steps;
    if (steps >= maxSteps) ceiling++;
  }

  return {
    samples,
    mean: sum / samples,
    max,
    ceilingPct: (ceiling / samples) * 100,
  };
}
