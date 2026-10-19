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

/** One file's bytes, or an error when the server has none (the preview server answers a missing file
 *  with the app's own page, status 200). Revalidated, not taken from cache: a table can be replaced
 *  while the site is up. */
async function fetchBytes(url: string, deps: FetchDeps): Promise<ArrayBuffer> {
  const res = await deps.fetch(url, { cache: 'no-cache' });
  if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) {
    throw new Error(`the instant answer could not be loaded (${res.ok ? 404 : res.status})`);
  }
  return res.arrayBuffer();
}

const isGzip = (b: ArrayBuffer) => b.byteLength > 2 && new Uint8Array(b)[0] === 0x1f && new Uint8Array(b)[1] === 0x8b;

export async function fetchTable(url: string, deps: FetchDeps = defaults()): Promise<Table> {
  try {
    let bytes = await fetchBytes(url + '.gz', deps);
    if (isGzip(bytes)) {
      const DS = deps.DecompressionStream;
      if (!DS) throw new Error('no DecompressionStream');
      bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DS('gzip'))).arrayBuffer();
    }
    return readTable(bytes);
  } catch {
    return readTable(await fetchBytes(url, deps));
  }
}
