/**
 * THE NEAREST TABLE (R10, Jordan 25 Nov 2026: "score each table's gear and the player's, answer from the closest one
 * that covers their TE"). With no own table and no board gear table exactly like theirs, the instant answer reads the
 * listed delivery-set table the form G moves least for this player, |ln geo| with geo its sqrt(lambda sigma) as shipped
 * (search/instantGear.ts), among the tables covering their TE; past that table's last TE, the nearest covering the next
 * TE, and so on until the maxed table (a candidate too, scored the same way) is the nearest or the only one left.
 *
 * Measured (aaap-tools/notes/nearest-table-formg-2026-11-25.md, 8 saves, 43 save x TE rows, 3 passes on sample cells):
 * the table this picks was the one nearest exact or within about a point of it. Weak delivery gear (the T3 metronome
 * sets) went from +10 to +16% on the maxed table to +1.6 to +8%; T4 sets with no table of their own stay within about
 * 1.3 points of the maxed one. Scoring by k (the old single scale) instead took a delivery table built with a compass
 * the player's set leaves off (+9 to +15%): sqrt(lambda sigma) counts that shipping, so |ln geo| passes it over.
 * Earnings (g) are not in the score: the delivery tables share the earnings artifacts (their stones differ: Clothed-TE
 * bonus 122.5 to 128.7), and the measured picks held without it; the form G moves each table's rows by its own g.
 *
 * The scores come from tables.json alone (`TableEntry.formGHeader`, the header fields the form G reads), so choosing
 * downloads nothing; only the chosen tables are, as one delivery url (precomputedTable.ts `deliveryUrl` with more).
 */
import type { TableHeader } from './precomputedTable';
import type { GearShift } from './instantGear';
import type { TableEntry } from './tableBracket';

/** Two scores this close are a tie (|ln geo|: about half a percent of delivery). */
export const NEAREST_TIE = 0.005;

/** A table the answer could read, with the form G's move from it for this player. */
export interface NearestTable {
  file: string;
  from: number;
  to: number;
  /** The form G's numbers from this table for the player; null when it can't be read (the table read as it is). */
  shift: (Pick<GearShift, 'geo'> & Partial<GearShift>) | null;
  /** Their own delivery set's table (its file or an alias is their delivery key's name: tableGear.ts
   *  `deliveryTableFile`). */
  exact: boolean;
  /** The maxed table: the last a chain reads. */
  maxed?: boolean;
}

/** How far the form G moves the table for this player: |ln geo|, 0 when it doesn't move it. */
export function nearestScore(t: Pick<NearestTable, 'shift'>): number {
  const geo = t.shift?.geo;
  return geo && geo > 0 ? Math.abs(Math.log(geo)) : 0;
}

/** The nearest table covering `te`; ties (within NEAREST_TIE of the lowest) go to their own set's table, then the one
 *  reaching higher (fewer joins), then the file name. Null when none covers it. */
export function pickNearest(tables: readonly NearestTable[], te: number): NearestTable | null {
  const covering = tables.filter(t => t.from <= te && te <= t.to);
  if (!covering.length) return null;
  const best = Math.min(...covering.map(nearestScore));
  const tied = covering.filter(t => nearestScore(t) <= best + NEAREST_TIE);
  return [...tied].sort((a, b) => Number(b.exact) - Number(a.exact) || b.to - a.to || (a.file < b.file ? -1 : 1))[0];
}

/** What the answer reads from `te` up: the nearest at `te`, then the nearest covering the TE past its last, until the
 *  maxed one (nothing after it). Just the maxed one when it is the nearest at `te`. */
export function nearestChain(tables: readonly NearestTable[], maxed: NearestTable, te: number): NearestTable[] {
  const all = [...tables, maxed];
  const chain: NearestTable[] = [];
  for (let at = te; at <= maxed.to; ) {
    const t = pickNearest(all, at);
    if (!t) break;
    chain.push(t);
    if (t.maxed) break;
    at = t.to + 1;
  }
  return chain;
}

/** The header fields the form G reads (search/instantGear.ts `instantGearShift`), from a tables.json entry. */
export function formGHeaderOf(e: Partial<TableEntry> & Pick<TableEntry, 'formGHeader'>): TableHeader {
  return { ...e.formGHeader, from: e.from, to: e.to, simVersion: e.simVersion } as unknown as TableHeader;
}

/** The tables.json entries the answer can score: with the form G's header fields and a last TE, by this simulator,
 *  not the maxed table, and with a form G move for this player (`shiftOf`). */
export function nearestCandidates(
  entries: readonly Partial<TableEntry>[],
  o: {
    maxedFile: string;
    /** Their delivery key's table name (tableGear.ts `deliveryTableFile`), when they have a key. */
    playerFiles: ReadonlySet<string>;
    simOk: (e: Partial<TableEntry>) => boolean;
    shiftOf: (header: TableHeader) => GearShift | null;
  }
): NearestTable[] {
  const out: NearestTable[] = [];
  for (const e of entries) {
    if (!e.file || e.file === o.maxedFile || !e.formGHeader || e.from === undefined || e.to === undefined) continue;
    if (!o.simOk(e)) continue;
    const shift = o.shiftOf(formGHeaderOf(e as Partial<TableEntry> & Pick<TableEntry, 'formGHeader'>));
    if (!shift) continue;
    const exact = [e.file, ...(e.aliases ?? [])].some(n => o.playerFiles.has(n));
    out.push({ file: e.file, from: e.from, to: e.to, shift, exact });
  }
  return out;
}
