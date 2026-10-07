/**
 * Fetching a player's tables in the background while they are elsewhere on the site (the user,
 * 7 Oct), so the instant answer is ready when they open Fastest route or By a date. Only the files
 * that player will use, in the order the panel needs them, one at a time and at low priority, gzipped:
 * the browser's HTTP cache keeps them, and the route workers' own fetch then revalidates (a 304)
 * instead of downloading again (search/tableFetch.ts). Never on a phone, a small machine, a saved-data
 * connection or a 2G one; never an error: a file that fails is simply fetched when the panel opens.
 */
import { isSmallDevice } from './device';
import { isMaxed, pickBracket, type Gear, type TableEntry } from './tableBracket';

/** The files to fetch for a player, in order: their own table if the site has one; else the table of
 *  their gear and the maxed one; else the maxed one and then the nearest tables above and below. */
export function prefetchPlan(o: {
  entries: TableEntry[];
  /** The player's own table's file name (tableGear.ts `tableName`), and their gear's (`gearTableName`). */
  own: string | null;
  gear: string | null;
  /** Their earnings bonus and delivery k, for the nearest tables; null when unknown. */
  player: Gear | null;
  te: number;
}): string[] {
  const usable = o.entries.filter(e => e.from <= o.te);
  const has = (f: string | null) => !!f && usable.some(e => e.file === f);
  if (has(o.own)) return [o.own!];
  if (has(o.gear)) return [o.gear!, 'table.bin'];
  const out = ['table.bin'];
  if (o.player && !isMaxed(o.player)) {
    const { above, below } = pickBracket(usable, o.player);
    for (const e of [above, below]) if (e && !out.includes(e.file)) out.push(e.file);
  }
  return out;
}

type Nav = Partial<Navigator> & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** Whether this device and connection should fetch ahead at all. */
export function prefetchAllowed(nav: Nav = globalThis.navigator ?? {}): boolean {
  const c = nav.connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return false;
  return !isSmallDevice(nav);
}

/**
 * Each file's .gz, one after another, at low priority into the HTTP cache; the bytes are read and
 * dropped (the workers read them from the cache). Failures are ignored.
 */
export async function prefetchFiles(
  base: string,
  files: string[],
  fetchFn: (url: string, init: RequestInit & { priority?: string }) => Promise<Response> = (u, i) => fetch(u, i)
): Promise<string[]> {
  const fetched: string[] = [];
  for (const f of files) {
    try {
      const res = await fetchFn(`${base}${f}.gz`, { priority: 'low' });
      if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) continue;
      const reader = res.body?.getReader();
      if (reader) while (!(await reader.read()).done);
      fetched.push(f);
    } catch {
      // The panel fetches it when it opens.
    }
  }
  return fetched;
}
