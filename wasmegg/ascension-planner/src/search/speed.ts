/**
 * @module speed
 * @description How long a sweep takes, from how long other sweeps actually took.
 *
 * The unit is WORKER-SECONDS PER CHAIN: wall-clock seconds x workers / chains priced. It is what a
 * machine spends on one chain per worker, so it carries over between worker counts (a 7-worker
 * desktop and a 17-worker workstation differ by the division, not by the constant), and it is what
 * every submission already records (`run.minutes`, `run.workers`, `chainsPriced`).
 *
 * IT DEPENDS ON CHAIN LENGTH, which is what the old flat estimates missed: a 2-ascension chain
 * shares nothing with its neighbours (both legs are new every time), 3-ascension sweeps share their
 * first leg across whole rows, and past that each extra leg costs more again. Measured on the
 * board's exhaustive runs, 2026-09-24:
 *
 *   ascensions   2     3     4     5     6      7      8
 *   median      9.8   6.4   12*   8.4   10.6   12.8   15.7*     (* one run)
 *
 * The fallback below is that, smoothed, for lengths with too few runs to trust a median. It errs
 * slightly high on fast machines (one player's 10-core box ran M1 at 5.2 and M2 at 4.4) and was
 * checked against real runs: an 8-core desktop's M1 came out at 7 min measured and 7 min estimated,
 * where the old flat figure said 2.
 */

/** Worker-seconds per chain by ascension count, for lengths the board has too few runs of. */
const FALLBACK: Record<number, number> = { 2: 9.5, 3: 6, 4: 8, 5: 8.5, 6: 10.5, 7: 12.5, 8: 15 };

export function fallbackWorkerSeconds(ascensions: number): number {
  const a = Math.max(2, Math.round(ascensions || 2));
  return FALLBACK[a] ?? 15 + (a - 8) * 2;
}

/** The fields of a board row this reads. */
export interface SpeedSample {
  ascensions: number;
  chainsPriced: number;
  run?: { minutes: number; workers?: number | null } | null;
  space?: unknown;
}

/** Worker-seconds per chain, one number per run that recorded its cost. */
export function workerSecondsOf(row: SpeedSample): number | null {
  if (!row.run || !(row.run.minutes > 0) || !(row.chainsPriced > 0)) return null;
  return (row.run.minutes * 60 * (row.run.workers || 1)) / row.chainsPriced;
}

/**
 * Median worker-seconds per chain per ascension count, from EXHAUSTIVE runs only (the sweeps these
 * estimates are for; a staged search prices a different mix of chains) and only where at least
 * `minRuns` runs agree to be counted.
 */
export function measuredWorkerSeconds(rows: SpeedSample[], minRuns = 2): Map<number, { seconds: number; runs: number }> {
  const by = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.space) continue;
    const w = workerSecondsOf(r);
    if (w === null) continue;
    const list = by.get(r.ascensions) ?? [];
    list.push(w);
    by.set(r.ascensions, list);
  }
  const out = new Map<number, { seconds: number; runs: number }>();
  for (const [asc, list] of by) {
    if (list.length < minRuns) continue;
    const s = [...list].sort((a, b) => a - b);
    const mid = s.length / 2;
    out.set(asc, { seconds: s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2, runs: s.length });
  }
  return out;
}

/** The board's figure for this length when it has one, the fallback otherwise. */
export function workerSecondsPerChain(ascensions: number, measured?: Map<number, { seconds: number }>): number {
  return measured?.get(ascensions)?.seconds ?? fallbackWorkerSeconds(ascensions);
}

/**
 * How much slower each worker gets as more run at once. Browser workers contend for memory more
 * than for cores, so twenty cores barely beat eight: the same 3-ascension sweep measured 4.4
 * worker-seconds per chain on 9 workers and 6.4-6.8 on 15-19. Flat to 9 workers, then 3% per extra.
 */
export function contention(workers: number): number {
  return workers <= 9 ? 1 : 1 + 0.03 * (workers - 9);
}

/** Seconds a sweep of `chains` takes on `workers` workers at `workerSeconds` per chain. */
export function sweepSeconds(chains: number, workers: number, workerSeconds: number): number {
  const w = Math.max(1, workers);
  return (chains * workerSeconds * contention(w)) / w;
}

/** A measured wall-clock rate (seconds per chain with `workers` running) as worker-seconds per
 *  chain, so it can be re-used at a different worker count. */
export function workerSecondsFromRate(secondsPerChain: number, workers: number): number {
  const w = Math.max(1, workers);
  return (secondsPerChain * w) / contention(w);
}
