/**
 * Which table answers a save (ported from the AutoAutoAP fork's InstantRoute.vue, exact matches only):
 *  (a) the player's own account table, `acct-<tableName(id)>.bin`, when its gear stamp is the save's
 *      (gearChanges empty, the stamp worked out at the table's own research);
 *  (b) else a gear table built on exactly the save's gear, `gear-<gearTableNameV3>.bin`, the stamp
 *      worked out at the maxed table's waiting research (its k3), and checked again at the gear
 *      table's own research once found;
 *  (c) else the maxed table, `table.bin`, as before.
 * A table from another simulator (simVersion.ts tableSimMismatch) is refused like a missing one and
 * the next is tried. Each new table covers only part of the TE range: the worker joins it to the
 * maxed table per leg (precomputedTable.ts `compositeTable`).
 *
 * Pure: the headers come from `deps.header` (instantClient.ts `probeHeader`), which resolves null for
 * a file that is not there; the stamp from `deps.stampAt`. No player id is passed in, only the
 * account table's hashed name.
 */
import type { TableHeader } from './precomputedTable';
import { tableSimMismatch } from './simVersion';
import { gearChanges, gearTableNameV3, type TableGear } from './tableGear';

export type TableKind = 'account' | 'gear' | 'maxed';

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
}

export interface ChoiceDeps {
  /** A table's header, or null when it is missing or unreadable. Must not throw for a missing file. */
  header: (url: string) => Promise<TableHeader | null>;
  /** The save's gear stamp with its delivery set picked at `research`, or null without a save. */
  stampAt: (research: Record<string, number>) => TableGear | null;
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

/** The line for a run starting at `startTE`: as `choiceLine`, but when the start is below the chosen
 *  account or gear table's range, the first ascension is on the maxed table and later ones on it. */
export function tableLineFor(choice: Pick<TableChoice, 'kind' | 'header' | 'changed'>, startTE: number): string {
  const by = answeredBy(choice, startTE);
  const h = choice.header;
  if (by === 'maxed' && choice.kind !== 'maxed' && h && Math.floor(startTE) < h.from) {
    return `Maxed gear for TE below ${h.from}, then ${choiceLine(choice.kind).replace(/^B/, 'b')}`;
  }
  return choiceLine(by, choice.changed);
}

/** The table a run's first ascension starts on: the chosen one when the start TE is in its range,
 *  else the maxed table. */
export function answeredBy(choice: Pick<TableChoice, 'kind' | 'header'>, startTE: number): TableKind {
  const h = choice.header;
  if (choice.kind === 'maxed' || !h) return 'maxed';
  const te = Math.floor(startTE);
  return te >= h.from && te <= h.to ? choice.kind : 'maxed';
}
