/**
 * What shifts cost in soul eggs (Jordan, 15 Oct 2026, from the community; it reproduces a Discord shift-cost
 * report: 66 shifts used, the next 100 cost 72.68% of the soul eggs, starting near 26 quintillion at shift 67).
 * For shift number N (1-based: the first shift ever is N = 1):
 *
 *   basis = SE x (0.02 x ((N - 1) / 120)^3 + 0.0001)
 *   cost  = 10^11 + 0.6 x basis + (0.4 x basis)^0.9
 *
 * The next shift is N = shifts done + 1, and at that N this is the companion's `nextShiftCost(backup)`
 * (lib/earning_bonus.ts `shiftCost(SE, shiftCount)`): shiftCost.spec.ts holds them equal.
 *
 * `plannedShiftsCost` adds up a plan's shifts from TODAY's soul eggs, earning none on the way and paying each
 * shift out of what is left, as the report does ("SE after 166 shifts = SE now minus the sum of the costs";
 * that is what reproduces its 72.68%). An estimate: the later shifts happen with more soul eggs and cost more.
 * My runs says "at today's soul eggs".
 */

/** Shift number `n` (1-based) at `soulEggs`. */
export function shiftCostAt(soulEggs: number, n: number): number {
  const basis = soulEggs * (0.02 * Math.pow((n - 1) / 120, 3) + 0.0001);
  return 1e11 + 0.6 * basis + Math.pow(0.4 * basis, 0.9);
}

/** The next shift's cost, with `done` shifts already made. */
export function nextShiftCostAt(soulEggs: number, done: number): number {
  return shiftCostAt(soulEggs, done + 1);
}

/** The `count` shifts after `done` (N = done + 1 .. done + count), from `soulEggs` with each paid out of what is
 *  left and none earned. 0 for none. */
export function plannedShiftsCost(soulEggs: number, done: number, count: number): number {
  let sum = 0;
  let se = soulEggs;
  for (let k = 1; k <= Math.max(0, Math.floor(count)); k++) {
    const cost = shiftCostAt(Math.max(0, se), done + k);
    sum += cost;
    se -= cost;
  }
  return sum;
}
