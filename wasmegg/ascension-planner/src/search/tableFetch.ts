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
          throw new Error(`the instant answer could not be loaded (${res.ok ? 404 : res.status})`);
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

/**
 * A worker's error message (it crosses as text) that means the file itself could not be had: missing, a web
 * page in its place, cut short, from another version, stalled, or no connection. Not a TE outside the file (InstantRoute's `below`).
 */
export function tableLoadFailed(message: string): boolean {
  return /404|not a precomputed table|incomplete|precomputed table version|instant answer could not be loaded|download stalled|failed to fetch|networkerror|load failed/i.test(
    message
  );
}

const isGzip = (b: ArrayBuffer) => b.byteLength > 2 && new Uint8Array(b)[0] === 0x1f && new Uint8Array(b)[1] === 0x8b;

export async function fetchTable(
  url: string,
  deps: FetchDeps = defaults(),
  stallMs = TABLE_STALL_MS
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
    return readTable(await fetchBytes(url, deps, stallMs));
  }
}
