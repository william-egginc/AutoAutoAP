/**
 * Fetching a table file (workers/routeFinder.worker.ts), gzipped when the site has the copy.
 *
 * `NAME.bin.gz` is about a quarter of `NAME.bin` (13.4 MB -> 3.2 MB). Servers send it with
 * `Content-Encoding: gzip`, so the browser unpacks it; if the bytes still arrive packed (a server that
 * doesn't), DecompressionStream does it here. Anything wrong with the .gz (missing, a web page in its
 * place, cut short, nothing to unpack it with) falls back to the plain file. readTable checks either
 * is complete.
 */
import { readTable, type Table } from './precomputedTable';

export interface FetchDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Absent in older browsers (Safari before 16.4). */
  DecompressionStream?: typeof DecompressionStream;
}

const defaults = (): FetchDeps => ({
  fetch: (url, init) => fetch(url, init),
  DecompressionStream: typeof DecompressionStream === 'undefined' ? undefined : DecompressionStream,
});

/** How long a download may go without a byte arriving before it is given up (QA break-it #6, 22 Oct 2026: a
 *  stalled download spun "Loading the instant answer" forever). A file is 2-3 MB, so a slow phone still sees
 *  bytes every few seconds; no limit on the whole download, which a slow line may need. */
export const TABLE_STALL_MS = 30_000;
/** The stall's message: it crosses from the worker as text, and `tableLoadFailed` reads it. */
export const TABLE_STALLED = 'the instant answer download stalled (timeout)';

class Stalled extends Error {}
/** The server has no such file: a 404, or the app's own page in its place. */
class Missing extends Error {}

/** The error (here, or as text from a worker) is the stall. */
export function isTableStall(e: unknown): boolean {
  return (e instanceof Error ? e.message : String(e)).includes(TABLE_STALLED);
}

/**
 * An optional file's header (the player's own instant answer, one for their gear): null when there is none,
 * so the caller falls back to the maxed one. A stall is not "none": it is the connection, and waiting another
 * 30 s on the next file only doubled the wait before the "couldn't be loaded" card (the shots, 22 Oct 2026:
 * 60 s). So it is thrown on, and the card shows at the one 30 s limit.
 */
export async function probeHeader<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (e) {
    if (isTableStall(e)) throw e;
    return null;
  }
}

/**
 * The first of `urls` that has a header (`probeHeader` on each in turn, one after another): a player's own table
 * under its `.v2` name, then the plain one (tableGear.ts ownTableNames). The plain name is asked for only after the
 * `.v2` one misses. A file this page can't read (a newer version) is no table, as a missing one: nothing shown. Null
 * when none; a stall is thrown on, so no later name waits another 30 s.
 */
export async function probeFirst<T>(
  urls: readonly string[],
  load: (url: string) => Promise<T>
): Promise<{ url: string; header: T } | null> {
  for (const url of urls) {
    const header = await probeHeader(() => load(url));
    if (header) return { url, header };
  }
  return null;
}

/** One file's bytes, or an error when the server has none (the preview server answers a missing file
 *  with the app's own page, status 200), or when no byte arrives for `stallMs`. Revalidated, not taken
 *  from cache: a table can be replaced while the site is up. */
async function fetchBytes(url: string, deps: FetchDeps, stallMs: number): Promise<ArrayBuffer> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fail: (e: Error) => void = () => {};
  // Rejects at the stall whether or not the fetch notices the abort.
  const stalled = new Promise<never>((_, reject) => (fail = reject));
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ctrl.abort();
      fail(new Stalled(TABLE_STALLED));
    }, stallMs);
  };
  progress();
  try {
    return await Promise.race([
      (async () => {
        const res = await deps.fetch(url, { cache: 'no-cache', signal: ctrl.signal });
        progress();
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) {
          const message = `the instant answer could not be loaded (${res.ok ? 404 : res.status})`;
          throw res.ok || res.status === 404 ? new Missing(message) : new Error(message);
        }
        if (!res.body) return res.arrayBuffer();
        // Read by chunks, each one putting the stall off again.
        const reader = res.body.getReader();
        const parts: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          progress();
          parts.push(value);
          size += value.byteLength;
        }
        const out = new Uint8Array(size);
        let at = 0;
        for (const p of parts) {
          out.set(p, at);
          at += p.byteLength;
        }
        return out.buffer;
      })(),
      stalled,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** What the instant answer card says when its file could not be loaded (QA break-it #5, 22 Oct 2026): a missing
 *  file used to read "No instant answer for your TE yet", the words for a TE the instant answer doesn't cover. No "table": players never read that word. */
export const TABLE_LOAD_FAILED = 'The instant answer couldn’t be loaded.';

/** What the card says when the file is a newer version than this page reads (`tableNewerThanPage`): the site was
 *  updated while the tab was open (Jordan's By a date on egg-beta, 23 Oct 2026). With a Reload button. */
export const TABLE_OLDER_PAGE = 'An older version of this page is open: reload it to get the instant answer.';

/** The error (as text from a worker) is the loader refusing the file's version (precomputedTable.ts readTable):
 *  this page is older than the file. A load failure too (`tableLoadFailed`), said as an older page. */
export function tableNewerThanPage(message: string): boolean {
  return /precomputed table version \d+ is not supported/i.test(message);
}

/**
 * A worker's error message (it crosses as text) that means the file itself could not be had: missing, a web
 * page in its place, cut short, from another version, stalled, or no connection; or the route worker reading it never
 * started, stopped or sent a reply the page couldn't read (search/routePool.ts), which a Retry may get past. Not a TE
 * outside the file (InstantRoute's `below`).
 */
export function tableLoadFailed(message: string): boolean {
  return /404|not a precomputed table|incomplete|precomputed table version|instant answer could not be loaded|download stalled|failed to fetch|networkerror|load failed|route worker/i.test(
    message
  );
}

const isGzip = (b: ArrayBuffer) => b.byteLength > 2 && new Uint8Array(b)[0] === 0x1f && new Uint8Array(b)[1] === 0x8b;

/**
 * An own or gear table (`acct-…`, `gear-…`, either name: tableGear.ts ownTableNames, gearTableFiles): looked up by
 * name, and most players have none, so a miss must be one request per name. The deploy ships every one as `NAME.gz`
 * beside `NAME`, so a missing `.gz` is no table under that name: the plain file is not asked for. A `.gz` that is
 * there but broken still falls back to it. The maxed table keeps the full `.gz`-then-plain fallback.
 */
export function gzOnlyWhenMissing(url: string): boolean {
  return /(^|\/)(acct|gear)-[^/]*\.bin$/.test(url);
}

export async function fetchTable(
  url: string,
  deps: FetchDeps = defaults(),
  stallMs = TABLE_STALL_MS,
  gzOnly = gzOnlyWhenMissing(url)
): Promise<Table> {
  try {
    let bytes = await fetchBytes(url + '.gz', deps, stallMs);
    if (isGzip(bytes)) {
      const DS = deps.DecompressionStream;
      if (!DS) throw new Error('no DecompressionStream');
      bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DS('gzip'))).arrayBuffer();
    }
    return readTable(bytes);
  } catch (e) {
    // A stall is the connection, not the .gz: the plain file (four times the size) would only stall too.
    if (e instanceof Stalled) throw e;
    // An own or gear table with no .gz: none under this name (`gzOnlyWhenMissing`).
    if (gzOnly && e instanceof Missing) throw e;
    return readTable(await fetchBytes(url, deps, stallMs));
  }
}
