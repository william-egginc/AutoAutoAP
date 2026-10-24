/**
 * THE FORM G's DELIVERY CORRECTION (search/instantGear.ts, precomputedTable.ts gearShiftTable), fitted
 * on fresh cells of the simulator the maxed table was built with (aaap-tools/notes/table-augment-2026-10-24.md).
 *
 * Below full research, sqrt(lambda sigma) moves a build's peak delivery rate too little when the player
 * is short on DELIVERY EPIC RESEARCH or colleggtibles (Epic Comfy Nests, Transportation Lobbyists, the
 * laying, shipping and hab-capacity eggs): G was optimistic, -1 to -4% per leg below TE 300. A gear
 * shortfall (weaker artifacts) is not: on main's own table G is already right to slightly pessimistic
 * there. So the extra scale is on the research and colleggtible part of the delivery scale only:
 *
 *   peak x geo x geoEr^a(TE), for a start TE below belowTe (a from erExponent's points)
 *
 * where geoEr is sqrt(lambda sigma) of the table's own delivery set at the player's epic research and
 * colleggtibles over at the table's (1 for a player with every delivery epic research and colleggtible
 * maxed, as 107 of the board's 108 accounts are). From belowTe a build reaches full research and its
 * peak is the cap, which already counts the research.
 *
 * A table header's `formG` (a later table built with its own fit) takes the place of these numbers.
 *
 * THE CAP (instantGear.ts): with `fullResearchCap` the peak's ceiling is the player's own full-research peak
 * (the ratio at every common research's top level, = buildPeak / k3.peak), which puts G's legs from TE 300
 * at a median error of 0 (they were ~1.2% pessimistic with the ratio at the table's K3 research). On a whole
 * route that pessimism was offsetting the optimiser's choice of route: on main the told finish moves from
 * within about a day of the route's real time to 4.7-6.4 days sooner (the route itself is the same). False
 * keeps the K3 ratio.
 */
export const FORM_G_DELIVERY: FormGDelivery = {
  erExponent: [[0, 0.139]],
  belowTe: 300,
  fullResearchCap: true,
};

export interface FormGDelivery {
  /** [start TE, exponent] points, straight lines between them and flat beyond the ends. */
  erExponent: readonly (readonly [number, number])[];
  /** From this start TE no extra scale (a build there reaches full research; the cap has it). */
  belowTe: number;
  fullResearchCap: boolean;
}

/** The exponent on geoEr for a start TE. */
export function erExponentAt(fit: Pick<FormGDelivery, 'erExponent' | 'belowTe'>, te: number): number {
  if (te >= fit.belowTe) return 0;
  const p = fit.erExponent;
  if (!p.length) return 0;
  if (te <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (te <= p[i][0]) {
      const [t0, a0] = p[i - 1];
      const [t1, a1] = p[i];
      return a0 + ((a1 - a0) * (te - t0)) / (t1 - t0);
    }
  }
  return p[p.length - 1][1];
}
