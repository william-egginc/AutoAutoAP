/**
 * How long a run spent computing, in words. A run records its wall-clock minutes and how many
 * workers it ran on (`run` on a submission); worker-time is the two multiplied, which is what
 * "how much computing went into this" means when runs used different machines.
 */

/** `45 s`, `12 min`, `3 h 5 min`, `2 d 4 h`. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) {
    const m = Math.round(minutes - h * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const rh = h - d * 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

/** `3 min on 7 workers`, with the worker-time when there is more than one worker. */
export function describeCompute(minutes: number, workers: number | null | undefined): string {
  const w = workers && workers > 0 ? workers : 1;
  const base = `${formatMinutes(minutes)} on ${w} worker${w === 1 ? '' : 's'}`;
  return w > 1 ? `${base} (${formatMinutes(minutes * w)} of worker time)` : base;
}
