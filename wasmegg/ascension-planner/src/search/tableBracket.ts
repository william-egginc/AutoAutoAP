/**
 * NEAREST TABLES ABOVE AND BELOW (the user, 6 Oct). A player with no table of their own gear gets the
 * maxed table with their delivery rate; how far that is from their real date depends on how far their
 * gear is from the maxed one. So the page also prices their route on the nearest deployed table built
 * for stronger gear and the nearest for weaker gear, and says their date likely falls between.
 *
 * A table's gear is two numbers: its earnings set's Clothed TE bonus and its delivery k (its peak
 * delivery rate against the maxed table's). Both come from `precompute/tables.json` (scripts/
 * precompute.ts --manifest), which lists each deployed table by file only: an account's own table is
 * described by its gear, never by whose it is.
 */

export interface TableEntry {
  /** File name in precompute/ ('table.bin' is the maxed table). */
  file: string;
  bonus: number;
  k: number;
  /** The lowest start TE it has. */
  from: number;
  /** On the maxed table's entry only: its waiting research and delivery set (TableHeader.k3). */
  k3?: { research: Record<string, number>; delivery: unknown[] };
}

export interface Gear {
  bonus: number;
  k: number;
}

/** The maxed table's gear: the top of both scales. */
export const MAXED: Gear = { bonus: 128.71, k: 1 };
// Today's tables span 115.28-128.71 bonus and 0.709-1.0 delivery; each gap is measured in those.
const BONUS_RANGE = 13.4;
const K_RANGE = 0.29;
const EPS_BONUS = 0.01;
const EPS_K = 0.001;

/** Whether this gear is the maxed table's (nothing to bracket). */
export function isMaxed(g: Gear): boolean {
  return g.bonus >= MAXED.bonus - EPS_BONUS && g.k >= MAXED.k - EPS_K;
}

function distance(a: Gear, b: Gear): number {
  return Math.abs(a.bonus - b.bonus) / BONUS_RANGE + Math.abs(a.k - b.k) / K_RANGE;
}

/**
 * The nearest table at least as strong on both numbers (`above`; the maxed one when nothing closer
 * is), and the nearest no stronger on both (`below`; null when there is none). A table stronger on one
 * and weaker on the other is neither. A table with the player's own gear on both is above, not below.
 */
export function pickBracket(
  tables: TableEntry[],
  player: Gear
): { above: TableEntry | null; below: TableEntry | null } {
  const stronger = tables.filter(t => t.bonus >= player.bonus - EPS_BONUS && t.k >= player.k - EPS_K);
  const weaker = tables.filter(
    t => t.bonus <= player.bonus + EPS_BONUS && t.k <= player.k + EPS_K && !stronger.includes(t)
  );
  const nearest = (ts: TableEntry[]) =>
    ts.reduce<TableEntry | null>((a, t) => (!a || distance(t, player) < distance(a, player) ? t : a), null);
  return {
    above: nearest(stronger) ?? tables.find(t => t.file === 'table.bin') ?? null,
    below: nearest(weaker),
  };
}

/** "a table built for gear like 126.0 bonus / 0.94 delivery". */
export function describeGear(t: Gear): string {
  return `a table built for gear like ${t.bonus.toFixed(1)} bonus / ${t.k.toFixed(2)} delivery`;
}
