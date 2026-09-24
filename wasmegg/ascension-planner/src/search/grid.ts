/**
 * @module grid
 * @description What grid an exhaustive sweep actually covers, in words a player reads.
 *
 * WHY (2026-09-24). A band like M3's `181-250:5` tries every 5th TE (181, 186, 191, ...) and never
 * 227, so its winner is the best ON THAT GRID. A player ran M3 (221 250 290 490, 667.4 d) and a plain
 * Balanced search (227 259 297 490, 666.5 d); none of 227, 259 or 297 is on the grid, and the notation
 * alone did not tell him so. Pricing every TE instead is not an option: four ascensions from TE 198 is
 * about four million chains, a month of computing.
 */

/** True when every value in every band is one TE apart: the grid already is every TE. */
export function gridIsComplete(bands: number[][] | undefined, rangeStep?: number): boolean {
  if (bands?.length) return bands.every(b => b.every((v, i) => i === 0 || v - b[i - 1] === 1));
  return rangeStep === 1;
}

/** The grid's spacing in words: `every TE`, `every 5 TE`, `every 2 to 5 TE`. */
export function gridStepLabel(bands: number[][] | undefined, rangeStep?: number): string {
  const steps = new Set<number>();
  if (bands?.length) {
    for (const b of bands) for (let i = 1; i < b.length; i++) steps.add(b[i] - b[i - 1]);
  } else if (rangeStep) {
    steps.add(rangeStep);
  }
  if (!steps.size) return 'every TE';
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  if (hi === 1) return 'every TE';
  return lo === hi ? `every ${lo} TE` : `every ${lo} to ${hi} TE`;
}
