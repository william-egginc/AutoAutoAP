/**
 * The file names tables.json lists (scripts/precompute.ts --manifest; tableBracket.ts `manifestFiles`): every entry's
 * file and its aliases. The instant answer asks only for an own or gear name in it (search/instantCompute.ts
 * `chooseInstantTable` `listed`, review 15 Nov 2026 P6): most players have neither, and each name not there was a
 * request, one after another, before the answer could start.
 */
import type { TableEntry } from './tableBracket';

/** Every name `entries` lists, or null when tables.json could not be read (then every name is asked for). */
export function listedTableNames(
  entries: readonly Pick<TableEntry, 'file' | 'aliases'>[] | null | undefined
): Set<string> | null {
  if (!Array.isArray(entries)) return null;
  return new Set(entries.flatMap(e => [e.file, ...(e.aliases ?? [])]));
}

/** tables.json under `base` (revalidated: a few KB), as `listedTableNames`; null when it can't be read in 5 s. */
export async function fetchListedTableNames(
  base: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)
): Promise<Set<string> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetchFn(`${base}tables.json`, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return null;
    return listedTableNames((await res.json()) as TableEntry[]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
