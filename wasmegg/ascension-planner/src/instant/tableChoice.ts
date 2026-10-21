/**
 * Which table answers a save (ported from the AutoAutoAP fork's InstantRoute.vue, exact matches only):
 *  (a) the player's own account table, `acct-<tableName(id)>.bin`, when its gear stamp is the save's
 *      (gearChanges empty, the stamp worked out at the table's own research);
 *  (b) else a gear table built on exactly the save's gear, `gear-<gearTableNameV3>.bin`, the stamp
 *      worked out at the maxed table's waiting research (its k3), and checked again at the gear
 *      table's own research once found;
 *  (c) else a delivery table (deliveryTables.ts) whose delivery set is the save's picked one (worked
 *      out at the maxed table's k3 research, as the stamp's), read with Joo's earnings shift
 *      (earningsShift.ts, precomputedTable.ts `shiftedTable`): Δ from that table's cteBonus; its cells
 *      scaled to the save's delivery rate by the card (deliveryScale.ts at that table's own k3), as the
 *      save's stones may be below the table's T4. Listed in
 *      the storage's index.json, so a save with no such table asks for nothing more;
 *  (d) else, when the save's picked delivery set is the maxed table's own (its 4th any 3-slot T4L) and
 *      only the earnings set is below it, the maxed table read with the earnings shift ('maxed-shift');
 *  (e) else the maxed table, `table.bin`, as before.
 * A table from another simulator (simVersion.ts tableSimMismatch) is refused like a missing one and
 * the next is tried. Each new table covers only part of the TE range: the worker joins it to the
 * maxed table per leg (precomputedTable.ts `compositeTable`); a shifted one has rows only from
 * `from + Δ` up (`shiftedFrom`), and the maxed table, unshifted and scaled, answers below that.
 *
 * Pure: the headers come from `deps.header` (instantClient.ts `probeHeader`), which resolves null for
 * a file that is not there; the stamp from `deps.stampAt`. No player id is passed in, only the
 * account table's hashed name.
 */
import type { EquippedArtifact } from '@/lib/artifacts/types';
import { shiftedFrom, type TableHeader } from './precomputedTable';
import { tableSimMismatch } from './simVersion';
import { gearChanges, gearTableNameV3, type TableGear } from './tableGear';
import { earningsShift } from './earningsShift';
import {
  deliveryEntry,
  deliveryKey,
  deliveryTableName,
  deliveryWords,
  stonesBelowT4,
  tableDeliveryIds,
  type IndexEntry,
} from './deliveryTables';

export type TableKind = 'account' | 'gear' | 'delivery' | 'maxed-shift' | 'maxed';

export interface TableChoice {
  /** The table that answers (the maxed table's url for 'maxed'). */
  url: string;
  /** Its header (null only when the maxed table is missing). */
  header: TableHeader | null;
  /** The maxed table's header: its cells answer outside the chosen table's range, scaled to the
   *  save's delivery rate (null: missing; then nothing is chosen, as there is no instant answer). */
  maxed: TableHeader | null;
  kind: TableKind;
  /** The player's own table was there but built on other gear: what changed (kind 'maxed' only). */
  changed?: string[];
  /** 'delivery' and 'maxed-shift': the Clothed TE the save's earnings set is below the table's (Δ,
   *  earningsShift.ts), the table read that many TE lower; and the delivery set as keyed. */
  shift?: number;
  delivery?: string[];
  /** 'delivery' and 'maxed-shift': the save's delivery set has a stone below T4 (deliveryTables.ts
   *  `stonesBelowT4`); the tables assume T4 in every slot. */
  stonesBelowT4?: boolean;
}

export interface ChoiceDeps {
  /** A table's header, or null when it is missing or unreadable. Must not throw for a missing file. */
  header: (url: string) => Promise<TableHeader | null>;
  /** The save's gear stamp with its delivery set picked at `research`, or null without a save. */
  stampAt: (research: Record<string, number>) => TableGear | null;
  /** The save's picked delivery set at `research` (tableGear.ts deliverySetAt), or null. */
  deliveryAt?: (research: Record<string, number>) => EquippedArtifact[] | null;
  /** The save's earnings set's Clothed TE (earningsShift.ts earningsCTE), or null without a save. */
  earningsCTE?: () => number | null;
  /** The storage's index.json (deliveryTables.ts tableIndex), or null when it is not there. */
  index?: () => Promise<IndexEntry[] | null>;
}

export interface ChoiceInput {
  /** Where the tables are (`…/precompute/`). */
  base: string;
  /** The maxed table's file name. */
  maxed: string;
  /** The account table's file name (tableGear.ts tableName), or null without a player id. */
  accountName: string | null;
}

/** A header usable as an answer: there, from this page's simulator, stamped with its gear. */
function usable(h: TableHeader | null): h is TableHeader & { gear: TableGear } {
  return !!h && !tableSimMismatch(h) && !!h.gear;
}

export async function chooseTable(input: ChoiceInput, deps: ChoiceDeps): Promise<TableChoice> {
  const maxedUrl = input.base + input.maxed;
  const header = async (url: string) => {
    try {
      return await deps.header(url);
    } catch {
      return null;
    }
  };
  const maxed = await header(maxedUrl);
  const asMaxed = (changed?: string[]): TableChoice => ({
    url: maxedUrl,
    header: maxed,
    maxed,
    kind: 'maxed',
    ...(changed?.length ? { changed } : {}),
  });
  if (!maxed) return asMaxed();
  let changed: string[] | undefined;
  if (input.accountName) {
    const url = input.base + input.accountName;
    const h = await header(url);
    if (usable(h)) {
      const mine = deps.stampAt(h.gear.research);
      const changes = mine ? gearChanges(h.gear, mine) : [];
      if (mine && !changes.length) return { url, header: h, maxed, kind: 'account' };
      changed = changes;
    }
  }
  const research = maxed.k3?.research;
  const stamp = research ? deps.stampAt(research) : null;
  if (stamp) {
    const url = input.base + (await gearTableNameV3(stamp));
    const h = await header(url);
    if (usable(h)) {
      // The name matched; the stamp in the file is checked too (at its own research).
      const mine = deps.stampAt(h.gear.research);
      if (mine && !gearChanges(h.gear, mine).length) return { url, header: h, maxed, kind: 'gear' };
    }
  }
  const mineSet = research && deps.deliveryAt ? deps.deliveryAt(research) : null;
  const mineIds = tableDeliveryIds(mineSet);
  const weak = stonesBelowT4(mineSet);
  const cte = mineIds && deps.earningsCTE ? deps.earningsCTE() : null;
  if (mineIds && cte !== null) {
    const key = deliveryKey(mineIds);
    let index: IndexEntry[] | null = null;
    try {
      index = deps.index ? await deps.index() : null;
    } catch {
      index = null;
    }
    const entry = deliveryEntry(index, key);
    // An entry the index already says is another simulator's is not fetched (a few MB for nothing).
    if (entry && !tableSimMismatch({ simVersion: entry.simVersion })) {
      const url = input.base + deliveryTableName(key);
      const h = await header(url);
      const keyed = h && (h.deliveryKey ?? (h.delivery ? deliveryKey(h.delivery) : null));
      if (h && !tableSimMismatch(h) && keyed === key) {
        const shift = earningsShift(cte, h);
        if (shiftedFrom(h, shift) <= h.to) return { url, header: h, maxed, kind: 'delivery', shift, delivery: mineIds, stonesBelowT4: weak };
      }
    }
    // The maxed table's own delivery set (its 4th a puzzle cube: any 3-slot T4L holds the same stones),
    // only the earnings below it: the maxed table read with the shift.
    const maxedIds = tableDeliveryIds(maxed.k3?.delivery);
    if (maxedIds && deliveryKey(maxedIds) === key) {
      const shift = earningsShift(cte, maxed);
      if (shift > 0 && shiftedFrom(maxed, shift) <= maxed.to)
        return {
          url: maxedUrl,
          header: maxed,
          maxed,
          kind: 'maxed-shift',
          shift,
          delivery: mineIds,
          stonesBelowT4: weak,
        };
    }
  }
  return asMaxed(changed);
}

/** The choice kept per save (the account's hashed name and the save's time): headers are probed
 *  once per save, not once per run. */
const kept = new Map<string, Promise<TableChoice>>();

export function choiceFor(key: string, make: () => Promise<TableChoice>): Promise<TableChoice> {
  let got = kept.get(key);
  if (!got) {
    got = make();
    if (kept.size >= 4) kept.delete(kept.keys().next().value as string);
    kept.set(key, got);
    // A choice with no maxed table is asked again next time (the table may be put up later).
    void got.then(
      c => {
        if (!c.header && kept.get(key) === got) kept.delete(key);
      },
      () => kept.get(key) === got && kept.delete(key)
    );
  }
  return got;
}

/** For specs. */
export function forgetChoices(): void {
  kept.clear();
}

/** Which table answered, in one line (the answer's first ascension starts on it). */
export function choiceLine(kind: TableKind, changed?: string[]): string {
  if (kind === 'account') return 'Built for your account';
  if (kind === 'gear') return 'Built for your exact gear';
  return changed?.length ? `Maxed gear (yours differs: ${changed.join(', ')})` : 'Maxed gear';
}

/** The earnings shift in words: one decimal, at least 0.1 when there is one (any shift reads a whole
 *  row lower: the row is rounded down). */
export function shiftWords(shift: number | undefined): string {
  if (!shift || !(shift > 0)) return 'earnings match';
  return `earnings read ${Math.max(0.1, Math.round(shift * 10) / 10).toFixed(1)} TE lower`;
}

/** The line for a table read with the earnings shift ('delivery' or 'maxed-shift'). */
function shiftedLine(choice: Pick<TableChoice, 'kind' | 'shift' | 'delivery'>): string {
  if (choice.kind === 'maxed-shift') return `Maxed gear, ${shiftWords(choice.shift)} (your delivery matches)`;
  return `Built for gear like yours: delivery ${deliveryWords(choice.delivery ?? [])}, ${shiftWords(choice.shift)}`;
}

const lower = (line: string) => line.replace(/^(B|M)/, c => c.toLowerCase());

/** The line for a run starting at `startTE`: as `choiceLine`, but when the start is below the chosen
 *  table's range (for a shifted table, the TEs it has a row for), the first ascension is on the maxed
 *  table and later ones on it. */
export function tableLineFor(
  choice: Pick<TableChoice, 'kind' | 'header' | 'changed' | 'shift' | 'delivery'>,
  startTE: number
): string {
  const by = answeredBy(choice, startTE);
  const range = ownRange(choice);
  const shifted = choice.kind === 'delivery' || choice.kind === 'maxed-shift';
  const line = shifted ? shiftedLine(choice) : choiceLine(choice.kind, choice.changed);
  if (by === 'maxed' && choice.kind !== 'maxed' && range && Math.floor(startTE) < range.from)
    return `Maxed gear for TE below ${range.from}, then ${lower(line)}`;
  return by === choice.kind ? line : choiceLine('maxed', choice.changed);
}

/** The TEs the chosen table answers itself (null for the plain maxed table): its range, from the
 *  first TE it has a row for when read with the earnings shift. */
export function ownRange(choice: Pick<TableChoice, 'kind' | 'header' | 'shift'>): { from: number; to: number } | null {
  const h = choice.header;
  if (choice.kind === 'maxed' || !h) return null;
  return { from: shiftedFrom(h, choice.shift ?? 0), to: h.to };
}

/** The table a run's first ascension starts on: the chosen one when the start TE is in its range,
 *  else the maxed table. */
export function answeredBy(choice: Pick<TableChoice, 'kind' | 'header' | 'shift'>, startTE: number): TableKind {
  const r = ownRange(choice);
  if (!r) return 'maxed';
  const te = Math.floor(startTE);
  return te >= r.from && te <= r.to ? choice.kind : 'maxed';
}
