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

/** A file the server does not have (a 404, or the preview server's app page in its place). */
export class MissingTable extends Error {
  constructor() {
    super('the instant answer could not be loaded (404)');
  }
}

/** One file's bytes, or an error when the server has none (the preview server answers a missing file
 *  with the app's own page, status 200). Revalidated, not taken from cache: a table can be replaced
 *  while the site is up. */
async function fetchBytes(url: string, deps: FetchDeps): Promise<ArrayBuffer> {
  const res = await deps.fetch(url, { cache: 'no-cache' });
  if (res.status === 404 || (res.ok && /text\/html/.test(res.headers.get('content-type') ?? '')))
    throw new MissingTable();
  if (!res.ok) throw new Error(`the instant answer could not be loaded (${res.status})`);
  return res.arrayBuffer();
}

const isGzip = (b: ArrayBuffer) => b.byteLength > 2 && new Uint8Array(b)[0] === 0x1f && new Uint8Array(b)[1] === 0x8b;

/**
 * The table at `url`. `probe` (an account or gear table that is usually not there, tableChoice.ts):
 * a missing .gz is taken as no table at all, without asking for the plain file too, so a miss costs
 * one request. Those tables are put up with their .gz, as the maxed one is; a .gz that is there but
 * broken still falls back to the plain file.
 */
export async function fetchTable(url: string, deps: FetchDeps = defaults(), probe = false): Promise<Table> {
  try {
    let bytes = await fetchBytes(url + '.gz', deps);
    if (isGzip(bytes)) {
      const DS = deps.DecompressionStream;
      if (!DS) throw new Error('no DecompressionStream');
      bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DS('gzip'))).arrayBuffer();
    }
    return readTable(bytes);
  } catch (err) {
    if (probe && err instanceof MissingTable) throw err;
    return readTable(await fetchBytes(url, deps));
  }
}
