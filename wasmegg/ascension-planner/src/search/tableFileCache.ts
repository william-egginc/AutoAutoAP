/**
 * THE TABLE FILES A ROUTE WORKER HAS READ (review 15 Nov 2026 P6): a few parsed files by their URL, so each URL kind
 * the worker is asked for (search/tableUrlLoad.ts: a composite, the form G, one table) reads the files it is made of
 * from here. A fresh instant answer asks for the maxed table, then a composite per gear table name, then the form G:
 * each a new URL, and each fetched and decoded the ~28 MB maxed file again (up to 9 times, 6 at once).
 *
 *   - One load per file: a load in flight is shared, so overlapping asks never fetch it twice.
 *   - SIZE 2 (`TABLE_FILE_CACHE_SIZE`): the most one URL needs is two files (a composite: a gear table and the maxed
 *     one), and the worker's current table holds those anyway. So the cache costs at most one ~28 MB file more than
 *     the old one-table worker held (Safari: each route worker's heap is shared with the chain workers'), and a
 *     third file pushes the least recently used out.
 *   - A failed load is not kept: the next ask fetches again (a missing gear name, a stall, a dropped line).
 *   - MAX AGE (`TABLE_FILE_MAX_AGE_MS`, from when the file arrived): a file is read from here for a minute, then
 *     fetched again (search/tableFetch.ts still revalidates with `no-cache`). A table deployed while the page is open
 *     is picked up on the next load after at most that minute, the same window the page reads tables.json in
 *     (InstantRoute.vue `readTablesJson`). The worker's current table (one URL) is kept for its life, as before.
 *
 * Parsed files are only read (precomputedTable.ts `readTable`'s lookup; the URL kinds wrap it and copy what they
 * change), so a file shared by two URLs gives each the cells a fresh read would: bit-identical.
 */
import type { Table } from './precomputedTable';

export const TABLE_FILE_CACHE_SIZE = 2;
export const TABLE_FILE_MAX_AGE_MS = 60_000;

interface Entry {
  table: Promise<Table>;
  /** When it arrived; null while in flight (never too old then). */
  at: number | null;
}

export class TableFileCache {
  private readonly entries = new Map<string, Entry>();
  private readonly max: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(
    private readonly load: (url: string) => Promise<Table>,
    o: { size?: number; maxAgeMs?: number; now?: () => number } = {}
  ) {
    this.max = o.size ?? TABLE_FILE_CACHE_SIZE;
    this.maxAgeMs = o.maxAgeMs ?? TABLE_FILE_MAX_AGE_MS;
    this.now = o.now ?? (() => Date.now());
  }

  get size(): number {
    return this.entries.size;
  }

  /** The file at `url`, parsed: from here when it is, else loaded (and kept once it arrives). */
  get(url: string): Promise<Table> {
    const hit = this.entries.get(url);
    this.entries.delete(url);
    if (hit && (hit.at === null || this.now() - hit.at < this.maxAgeMs)) {
      // The most recently used goes last.
      this.entries.set(url, hit);
      return hit.table;
    }
    const entry: Entry = { table: this.load(url), at: null };
    this.entries.set(url, entry);
    entry.table.then(
      () => (entry.at = this.now()),
      () => {
        if (this.entries.get(url) === entry) this.entries.delete(url);
      }
    );
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
    return entry.table;
  }

  clear(): void {
    this.entries.clear();
  }
}
