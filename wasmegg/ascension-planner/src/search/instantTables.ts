/**
 * WHICH TABLES A SAVED INSTANT ANSWER WAS MADE FROM (Jordan's Safari, 24 Oct 2026: main's own version 2 table had
 * been on egg-beta for hours, PC Chrome read it ("your gear", 313), Safari still showed the answer saved from before
 * it existed: "Saved from …: same save, setup and filters, so nothing was worked out again", 314 on the form G).
 *
 * The saved answer's key (instantSnapshot.ts `instantKey`, shared with My runs) is the save, the setup and the
 * filters: not the tables. So a table deployed, rebuilt or restamped after an answer was saved never reached it. Now
 * every saved answer carries the identity of the tables the page could read for that player when it was worked out
 * (`tablesIdentity`: from tables.json, each candidate file's name, simulator, build time and gear numbers) and is
 * put back only while that identity still holds (`savedAnswerFits`). The key itself is unchanged, so My runs finds
 * every answer as before.
 *
 * No Vue, no fetch: InstantRoute.vue reads tables.json and the player's file names.
 */
import { snapshotUsable } from './instantSnapshot';
import type { TableEntry } from './tableBracket';

/** One file as tables.json lists it: what changes when the file is rebuilt, restamped or replaced. */
export function entryIdentity(e: TableEntry): string {
  return [e.file, e.simVersion ?? '', e.builtAt ?? '', e.from, e.bonus, e.k].join(',');
}

/**
 * The tables the instant answer could read for this player, as they stand: for each name it tries (their own
 * table's, their gear's, the maxed one), the listed file under that name or alias, or "-" for none. Another
 * player's file coming or going changes nothing. Null when tables.json couldn't be read.
 */
export function tablesIdentity(entries: readonly TableEntry[] | null, names: readonly string[]): string | null {
  if (!entries) return null;
  return [...new Set(names)]
    .map(n => {
      const e = entries.find(x => x.file === n || x.aliases?.includes(n));
      return `${n}=${e ? entryIdentity(e) : '-'}`;
    })
    .join('|');
}

/** A saved answer, as far as this check reads it. */
export interface SavedTables {
  ownChanged?: string;
  gearRule?: number;
  tableUrl?: string;
  /** `tablesIdentity` when it was worked out; absent on one saved before 24 Oct 2026. */
  tables?: string | null;
}

/**
 * Whether a saved answer may be shown again instead of working it out: usable as before (instantSnapshot.ts
 * `snapshotUsable`) and made from the tables there are now. One saved before its tables were kept, or with
 * tables.json unreadable then, is worked out again once. With tables.json unreadable now (offline, say), the saved
 * answer stands: nothing could be checked, and it is better than none.
 */
export function savedAnswerFits(s: SavedTables | null | undefined, gearRule: number, now: string | null): boolean {
  if (!s || !snapshotUsable(s, gearRule)) return false;
  if (now === null) return true;
  return typeof s.tables === 'string' && s.tables === now;
}
