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
  /** Set only on the flagged board, on a row whose owner code this browser presented. */
  yours?: boolean;
  /** Last segment of the KV key. Also the id `GET /csv?id=` wants. */
  id: string;
  /** Whether this run's full chain table was uploaded alongside the summary. Never true here for a
   *  provisional row (see `onlyFinalCsv`): its CSV is a CSV so far, and `partialCsv` says so. */
  hasCsv?: boolean;
  /** A provisional row with its CSV so far on the collector: partial, and read by nothing on this page. */
  partialCsv?: boolean;
  /**
   * The player, exactly (collector phase 2): a short HMAC of the sender's owner code, only on named
   * rows sent with one. Read by the Leaderboard's rules (lib/leaderboardRank.ts `BoardRow`), which
   * this page reuses to judge which finishes still stand. Never shown.
   */
  acct?: string;
  /** ISO 8601, stamped by the collector when the row arrived (phase 2). See `BoardRow.receivedAt`. */
  receivedAt?: string;
  /** The first row with the same result found by a different search, from the same sender. */
  dupOf?: string;
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

/**
 * The build's own collector's `GET /all`, requested before the page has mounted.
 *
 * The Explorer can show nothing until this answers, and the component only asks from `onMounted`,
 * after the whole bundle has downloaded and run. So the request starts earlier and `fetchAll` picks
 * up the pending response instead of sending a second one:
 *
 *   - from explorer.html itself, while the scripts are still downloading: vite.config.ts
 *     (`aap-collector-early-start`) writes a few lines there that leave it on `window.__aapEarlyAll`;
 *   - otherwise from `prefetchAll`, which explorer/main.ts calls just before mounting.
 *
 * ONCE, AND ONLY FOR THE SAME BASE. The first `fetchAll` for that base takes it; every later call
 * (a Reload click, a typed collector) fetches fresh, and a response older than a minute is not used
 * at all -- this saves the first page load a round trip, it is not a cache. Only the build-time
 * default is started early: `?collector=` means someone asked for a different collector.
 */
interface EarlyAll {
  base: string;
  response: Promise<Response>;
  /** `Date.now()` when the request started. */
  at: number;
}

const EARLY_MAX_AGE_MS = 60_000;
let early: EarlyAll | null = null;

/** Starts (or adopts, when explorer.html already started it) the default collector's `/all`. */
export function prefetchAll(search = typeof location === 'undefined' ? '' : location.search): void {
  if (early || new URLSearchParams(search).get('collector')) return;
  const base = resolveCollectorBase(search);
  if (!base) return;
  const holder = globalThis as { __aapEarlyAll?: EarlyAll };
  const fromHtml = holder.__aapEarlyAll;
  holder.__aapEarlyAll = undefined;
  if (fromHtml && fromHtml.base === base && fromHtml.response instanceof Promise) {
    early = fromHtml;
    return;
  }
  if (typeof fetch !== 'function') return;
  const response = fetch(`${base}/all`);
  // Nobody may ever await this (the page could be pointed elsewhere first); a failure here must
  // not surface as an unhandled rejection. `fetchAll` still sees the rejection when it does await.
  response.catch(() => {});
  early = { base, response, at: Date.now() };
}

/** The early response for `base`, at most once, wired to `signal` so an abort still aborts. */
function takeEarly(base: string, signal?: AbortSignal): Promise<Response> | null {
  const taken = early;
  early = null;
  if (!taken || taken.base !== base || Date.now() - taken.at > EARLY_MAX_AGE_MS) return null;
  if (!signal) return taken.response;
  const aborted = () => new DOMException('The operation was aborted.', 'AbortError');
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    taken.response.then(
      res => {
        signal.removeEventListener('abort', onAbort);
        resolve(res);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/**
 * A provisional row's CSV is the CSV SO FAR, sent mid-run with its progress (collector/README.md,
 * "Provisional rows"): part of a run, replaced by the next send. Every reader on this page that loads
 * a run's CSV goes by `hasCsv` (the account tables, the sweep curves, a run's own scatter), so it is
 * turned off here, once, for every row this module hands out, and `partialCsv` keeps the fact.
 */
export function onlyFinalCsv<T extends CollectorRow>(r: T): T {
  return r.provisional === true && r.hasCsv ? { ...r, hasCsv: false, partialCsv: true } : r;
}

/** What `GET /all` holds, split: the runs to a target TE (every chart's rows) and the By a date answers. */
export interface AllRows {
  rows: CollectorRow[];
  /** Deadline answers (schema 8): "the highest TE by this date". Kept apart from `rows`. */
  byDate: CollectorRow[];
}

/** Every submission the collector holds, newest KV page first. Throws with a readable message. */
export async function fetchAll(base: string, signal?: AbortSignal): Promise<CollectorRow[]> {
  return (await fetchAllRows(base, signal)).rows;
}

/** `fetchAll`, and the By a date answers it leaves out, handed back separately. */
export async function fetchAllRows(base: string, signal?: AbortSignal): Promise<AllRows> {
  const res = await (takeEarly(base, signal) ?? fetch(`${base}/all`, { signal }));
  if (!res.ok) throw new Error(`The collector answered ${res.status} for /all.`);
  const body = (await res.json()) as AllResponse;
  if (!body || !Array.isArray(body.rows)) throw new Error('The collector answered something that is not a run list.');
  // A row without a chain cannot be placed on any chart here, and one bad record should not empty
  // the page. Same posture the Worker takes when a stored value will not parse.
  // Deadline answers (schema 8) too: they are ranked on the leaderboard's By a date tab, and a
  // route cut short at whatever TE a date allowed says nothing about chain shapes to a target.
  const isByDate = (r: CollectorRow) => typeof (r as { deadline?: unknown }).deadline === 'number';
  const rows = body.rows.map(r => (r && typeof r === 'object' ? onlyFinalCsv(r) : r));
  return {
    rows: rows.filter(
      r => Array.isArray(r.chain) && r.chain.length >= 2 && Number.isFinite(r.durationDays) && !isByDate(r)
    ),
    // A By a date answer can be one ascension straight to its last stop, so a one-stop chain stays.
    byDate: rows.filter(r => r && Array.isArray(r.chain) && r.chain.length >= 1 && isByDate(r)),
  };
}

/**
 * The flagged board: runs from accounts the planner cannot help yet, kept apart from the main board.
 *
 * Anonymous, except rows whose owner code is presented: `tokens` are the codes this browser holds
 * (search/owner.ts), and each is asked about separately so one account's code never vouches for
 * another's rows. A row that comes back as `yours` from any of them replaces its anonymous copy.
 */
export async function fetchFlagged(base: string, tokens: string[] = [], signal?: AbortSignal): Promise<CollectorRow[]> {
  const ask = async (token?: string) => {
    const res = await fetch(`${base}/flagged`, { signal, headers: token ? { 'x-owner-token': token } : {} });
    if (res.status === 404) {
      throw new Error(
        'This collector has no flagged board yet: it is running a Worker from before 2026-09-24 and needs redeploying.'
      );
    }
    if (!res.ok) throw new Error(`The collector answered ${res.status} for /flagged.`);
    const body = (await res.json()) as AllResponse;
    return Array.isArray(body?.rows) ? body.rows : [];
  };
  const byId = new Map<string, CollectorRow>();
  for (const row of await ask()) byId.set(row.id, row);
  for (const token of tokens) {
    for (const row of await ask(token)) if (row.yours) byId.set(row.id, row);
  }
  return [...byId.values()].filter(r => Array.isArray(r.chain) && Number.isFinite(r.durationDays)).map(onlyFinalCsv);
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
  /** A CSV so far, sent while its run was still going (`# in progress, N of M ...`, search/csv.ts). */
  partial: boolean;
  /** A By a date run's CSV (`# highest TE by ...`): its routes, read by `parseByDateCsv`. `chains` is
   *  then empty: its columns are not a chain search's, and reading them as one gave nonsense. */
  byDate?: ParsedByDateCsv;
}

/** One route in a By a date CSV. */
export interface ByDateCsvRoute {
  chain: number[];
  lastStop: number;
  /** `2027-07-14 08:12` in the file's zone; '' when it could not be priced. */
  reachedLocal: string;
  /** Hours to spare at the deadline; negative when late; null when it could not be priced. */
  spareHours: number | null;
  /** Plan start to the last stop, days; null when unknown (an old file's kept rows have it too). */
  totalDays: number | null;
  /** Whether it makes the date; null when it could not be priced. */
  makes: boolean | null;
}

export interface ParsedByDateCsv {
  /** The kept routes with their legs (rank order, one entry per route). Every file has these. */
  kept: ByDateCsvRoute[];
  /** Every route priced, one per summary line (search/csv.ts `PRICED_ROW_TAG`). Empty in files from
   *  before 10 Oct 2026, which listed the kept routes only. */
  priced: ByDateCsvRoute[];
  /** The header's own "N routes priced". */
  pricedStated: number;
  partial: boolean;
}

/** What a By a date run's CSV holds, in a line: the Explorer's charts are for chain searches. */
export function byDateCsvLine(p: ParsedByDateCsv): string {
  const best = p.kept[0];
  const head = best ? `best ${best.lastStop} TE via ${best.chain.join(' ')}` : 'no route made the date';
  if (!p.priced.length)
    return `That is a By a date run (${head}; ${p.kept.length.toLocaleString('en-US')} routes kept). The charts here are for Fastest route runs.`;
  const makes = p.priced.filter(r => r.makes).length;
  return `That is a By a date run (${head}): ${p.priced.length.toLocaleString('en-US')} routes priced, ${makes.toLocaleString('en-US')} make the date. The charts here are for Fastest route runs.`;
}

/**
 * A By a date CSV (search/csv.ts `deadlineCsvChunks`), old or new. The kept routes are the rows
 * that start with a rank number, one per leg (the first of each route is read); the summary lines
 * start with `priced,`. Same index scan as `parseRunCsv`, and the same naive comma split: none of
 * the cells read here can hold a comma.
 */
export function parseByDateCsv(text: string): ParsedByDateCsv {
  const out: ParsedByDateCsv = { kept: [], priced: [], pricedStated: 0, partial: false };
  const seen = new Set<string>();
  const num = (s: string | undefined): number | null => {
    if (s === undefined || s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    let end = text.indexOf('\n', i);
    if (end === -1) end = n;
    const line = text[end - 1] === '\r' ? text.slice(i, end - 1) : text.slice(i, end);
    i = end + 1;
    if (!line) continue;
    if (line.charCodeAt(0) === 35 /* # */) {
      const m = /^# (\d+) routes priced/.exec(line);
      if (m) out.pricedStated = Number(m[1]);
      else if (line.startsWith('# in progress, ')) out.partial = true;
      continue;
    }
    const cells = line.split(',');
    if (cells[0] === 'priced') {
      // kind,route,stops,last_stop,reached_local,ascend_from_local,spare_hours,total_days,makes_it
      const chain = cells[1].split(' ').map(Number);
      if (!chain.length || chain.some(v => !Number.isFinite(v))) continue;
      const makesText = cells[8] ?? '';
      out.priced.push({
        chain,
        lastStop: chain[chain.length - 1],
        reachedLocal: cells[4] ?? '',
        spareHours: num(cells[6]),
        totalDays: num(cells[7]),
        makes: makesText === 'yes' ? true : makesText.startsWith("couldn't") ? null : false,
      });
      continue;
    }
    const code = line.charCodeAt(0);
    if (code < 48 || code > 57) continue;
    // rank,route,stops,last_stop,reached_local,ascend_from_local,spare_hours,chain,prestiges,total_days,...
    const routeText = cells[1];
    if (!routeText || seen.has(routeText)) continue;
    seen.add(routeText);
    const chain = routeText.split(' ').map(Number);
    if (!chain.length || chain.some(v => !Number.isFinite(v))) continue;
    out.kept.push({
      chain,
      lastStop: chain[chain.length - 1],
      reachedLocal: cells[4] ?? '',
      spareHours: num(cells[6]),
      totalDays: num(cells[9]),
      makes: true,
    });
  }
  return out;
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
  if (text.startsWith('# highest TE by ')) {
    const header = /current TE (\d+)\s*->\s*final target (\d+)/.exec(text.slice(0, 4000));
    const byDate = parseByDateCsv(text);
    return {
      currentTE: header ? Number(header[1]) : 0,
      finalTE: header ? Number(header[2]) : 0,
      chains: [],
      truncated: 0,
      partial: byDate.partial,
      byDate,
    };
  }
  let currentTE = 0;
  let finalTE = 0;
  const chains: PricedChain[] = [];
  const seen = new Set<string>();
  let truncated = 0;
  let partial = false;

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
      } else if (line.startsWith('# in progress, ')) partial = true;
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

  return { currentTE, finalTE, chains, truncated, partial };
}
