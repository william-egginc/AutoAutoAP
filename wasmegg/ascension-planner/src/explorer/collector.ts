/**
 * @module explorer/collector
 * @description Reading the collector Worker from a page that is not the planner.
 *
 * The planner WRITES to the collector (`POST /submit`, `POST /csv`); this only ever reads, and
 * reads the two endpoints that were put there for exactly this: `GET /all` for every submitted
 * run, and `GET /csv?id=` for one run's full priced-chain table. Both answer with
 * `access-control-allow-origin: *`, which is what lets this page be hosted anywhere at all --
 * GitHub Pages, a file server, a Netlify site that is not the planner's.
 *
 * WHERE THE BASE URL COMES FROM, in order:
 *
 *   1. `?collector=https://…` on the page's own URL. A static copy of this page can be pointed at
 *      a different collector without rebuilding it, which is the difference between "hostable" and
 *      "hostable by the person who ran the build".
 *   2. `VITE_SUBMIT_URL` minus its `/submit`, so a build already configured to submit is already
 *      configured to read.
 *   3. Nothing, and the page says so and offers a box. A fork with no collector is a normal state,
 *      not an error -- the planner hides its own Submit button in the same situation.
 *
 * THE CSV ARRIVES AS A GZIP FILE, NOT AS A GZIP-ENCODED CSV. The Worker is deliberate about this
 * (see its `GET /csv` comment: Cloudflare's edge double-compresses anything it thinks is text), so
 * `fetch` hands back gzip bytes with no `content-encoding` for the browser to undo. Inflating is
 * this module's job, via `DecompressionStream`, and the magic-number check means a collector that
 * ever starts sending plain text still works.
 */
import type { Submission } from '@/search/submission';
import type { PricedChain } from '@/search/types';

/** A row from `GET /all`: a stored submission, plus the two fields the Worker derives per request. */
export interface CollectorRow extends Submission {
  /** Last segment of the KV key. Also the id `GET /csv?id=` wants. */
  id: string;
  /** Whether this run's full chain table was uploaded alongside the summary. */
  hasCsv?: boolean;
}

/** `https://…/submit` -> `https://…`. Tolerates a base that was already given without the path. */
function stripSubmit(url: string): string {
  return url.replace(/\/submit\/?$/, '').replace(/\/$/, '');
}

/**
 * A collector base this page is willing to fetch from, or null.
 *
 * Shared by the query parameter and the typed box so the two cannot drift: both trim, both drop a
 * trailing `/submit`, and both refuse anything that is not http(s). That last one is the point --
 * a `javascript:` or `data:` URL that gets fetched and rendered is the shape of every "look at this
 * link" attack, and this page is meant to be linked around.
 */
export function normaliseCollectorBase(raw: string): string | null {
  const trimmed = stripSubmit(raw.trim());
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * The collector this page should read, or null when nothing has pointed it at one.
 *
 * `search` is injectable so this is testable without a browser location.
 */
export function resolveCollectorBase(search = typeof location === 'undefined' ? '' : location.search): string | null {
  const fromQuery = new URLSearchParams(search).get('collector');
  // A query parameter that is present but unusable returns null rather than falling through to the
  // build-time default: someone who put `?collector=` on the URL asked for that collector, and
  // quietly showing them a different one's data would be worse than showing them nothing.
  if (fromQuery) return normaliseCollectorBase(fromQuery);
  const configured = import.meta.env.VITE_SUBMIT_URL as string | undefined;
  return configured ? stripSubmit(configured) : null;
}

export interface AllResponse {
  count: number;
  rows: CollectorRow[];
}

/** Every submission the collector holds, newest KV page first. Throws with a readable message. */
export async function fetchAll(base: string, signal?: AbortSignal): Promise<CollectorRow[]> {
  const res = await fetch(`${base}/all`, { signal });
  if (!res.ok) throw new Error(`The collector answered ${res.status} for /all.`);
  const body = (await res.json()) as AllResponse;
  if (!body || !Array.isArray(body.rows)) throw new Error('The collector answered something that is not a run list.');
  // A row without a chain cannot be placed on any chart here, and one bad record should not empty
  // the page. Same posture the Worker takes when a stored value will not parse.
  return body.rows.filter(r => Array.isArray(r.chain) && r.chain.length >= 2 && Number.isFinite(r.durationDays));
}

/**
 * One run's full chain table, inflated to text.
 *
 * These are the big objects on this page -- a few hundred KB compressed, up to 15 MB of text -- so
 * nothing calls this except an explicit click.
 */
export async function fetchRunCsv(base: string, id: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${base}/csv?id=${encodeURIComponent(id)}`, { signal });
  if (res.status === 404) throw new Error('That run has no chain table stored.');
  if (!res.ok) throw new Error(`The collector answered ${res.status} for that run's table.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return inflateIfGzip(bytes);
}

/** Text out of bytes that may or may not be gzip. Exported for the tests and for dropped files. */
export async function inflateIfGzip(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot inflate gzip (no DecompressionStream). Chrome, Edge, Firefox 113+ or Safari 16.4+ can.'
    );
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export interface ParsedRunCsv {
  currentTE: number;
  finalTE: number;
  /** One entry per distinct chain, in the file's own rank order (fastest first). */
  chains: PricedChain[];
  /** Chains dropped because `limit` was reached, so the page can say the table is partial. */
  truncated: number;
}

/**
 * How many chains a parse keeps.
 *
 * The scatter renders 25,000 points comfortably and hundreds of thousands not at all, and the
 * file's own rank order means the first N are the fastest N -- so a cap loses the slow tail, which
 * is the half nobody is looking at. Stated in the UI rather than applied silently.
 */
export const MAX_PARSED_CHAINS = 60_000;

/**
 * A chain-search CSV export, parsed back into priced chains.
 *
 * WRITTEN AGAINST `search/csv.ts`, not against a sample file: header comments start with `#`, then
 * one `rank,chain,…` header line, then ONE ROW PER LEG, so a six-ascension chain appears six times
 * and only the first row of each is worth reading. Only the first four columns are touched
 * (`rank`, `chain`, `prestiges`, `total_days`), which is also why a naive comma split is safe here
 * -- the columns that can contain a semicolon-separated list are all to the right of them.
 *
 * Scans by index rather than `split('\n')`: these files reach 15 MB, and materialising a
 * quarter-million substrings to throw away five of every six is the kind of thing that kills a tab
 * on a phone.
 */
export function parseRunCsv(text: string, limit = MAX_PARSED_CHAINS): ParsedRunCsv {
  let currentTE = 0;
  let finalTE = 0;
  const chains: PricedChain[] = [];
  const seen = new Set<string>();
  let truncated = 0;

  let i = 0;
  const n = text.length;
  while (i < n) {
    let end = text.indexOf('\n', i);
    if (end === -1) end = n;
    const line = text[end - 1] === '\r' ? text.slice(i, end - 1) : text.slice(i, end);
    i = end + 1;
    if (!line) continue;

    if (line.charCodeAt(0) === 35 /* # */) {
      const header = /current TE (\d+)\s*->\s*final target (\d+)/.exec(line);
      if (header) {
        currentTE = Number(header[1]);
        finalTE = Number(header[2]);
      }
      continue;
    }
    // The column header, and anything else that does not start a data row.
    const code = line.charCodeAt(0);
    if (code < 48 || code > 57) continue;

    const c1 = line.indexOf(',');
    const c2 = line.indexOf(',', c1 + 1);
    const c3 = line.indexOf(',', c2 + 1);
    const c4 = line.indexOf(',', c3 + 1);
    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) continue;

    const chainText = line.slice(c1 + 1, c2);
    if (seen.has(chainText)) continue;
    if (chains.length >= limit) {
      truncated++;
      seen.add(chainText);
      continue;
    }
    seen.add(chainText);

    const days = Number(line.slice(c3 + 1, c4));
    if (!Number.isFinite(days) || days <= 0) continue;
    const chain = chainText.split(' ').map(Number);
    if (chain.length < 2 || chain.some(v => !Number.isFinite(v))) continue;

    chains.push({ chain, days, prestiges: chain.length, lastCheckpoint: chain[chain.length - 2] });
  }

  return { currentTE, finalTE, chains, truncated };
}
