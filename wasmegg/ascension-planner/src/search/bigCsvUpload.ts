/**
 * THE FULL CSV OF A VERY LARGE RUN, TO THE COLLECTOR'S PRIVATE STORE (Jordan, 26-27 Oct 2026; the Collector's
 * contract: aaap-tools/notes/bigcsv-contract.md, collector/bigcsv.js).
 *
 * The board keeps its rule (`/csv`: every route's summary, the top 20,000 routes' legs). This is the OTHER file:
 * the whole `.csv.gz` with every route's legs (store `streamFullCsv`), for a run that priced more than 100,000
 * routes, uploaded after the run's final send with that row's own upload token, in parts the Worker passes to
 * R2 multipart. Resumable: `start` on an open upload says which parts the server has, and only the rest go.
 *
 * Two halves, both platform-neutral: `gzipCsvTo` writes the scrubbed, gzipped text into a sink (an OPFS file
 * on the page, a file in the CLI) a chunk at a time; `uploadBigCsv` reads that file back by parts (one part,
 * 64 MB, in memory at a time) and sends them. Never the whole file in memory.
 */

/** Runs at or under this many routes priced go through `/csv` alone (the contract's "too small"). */
export const BIG_CSV_MIN_ROUTES = 100_000;
/** The contract's suggested part: 370 MB is 6 parts. */
export const BIG_CSV_PART_BYTES = 64_000_000;

/** Where the gzipped bytes go while they are made. */
export interface BigCsvSink {
  write(bytes: Uint8Array): Promise<void> | void;
  /** Done writing: the file, to read back. */
  close(): Promise<BigCsvSource> | BigCsvSource;
}

/** The finished file. */
export interface BigCsvSource {
  size: number;
  read(at: number, len: number): Promise<Uint8Array> | Uint8Array;
}

/**
 * The CSV text from `chunks`, each scrubbed (`scrub`: no player id ever leaves; chunks end on a line, so an id is
 * never split across two), gzipped into `sink`. Resolves to the finished file.
 */
export async function gzipCsvTo(
  chunks: AsyncIterable<string> | Iterable<string>,
  sink: BigCsvSink,
  scrub: (text: string) => string,
  onBytes?: (gzBytes: number) => void
): Promise<BigCsvSource> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  let out = 0;
  const drain = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      await sink.write(value);
      out += value.byteLength;
      onBytes?.(out);
    }
  })();
  const enc = new TextEncoder();
  try {
    for await (const chunk of chunks) await writer.write(enc.encode(scrub(chunk)));
    await writer.close();
  } catch (e) {
    await writer.abort(e).catch(() => {});
    await drain.catch(() => {});
    throw e;
  }
  await drain;
  return sink.close();
}

export type BigCsvOutcome =
  | { kind: 'kept'; bytes: number; parts: number; sent: number }
  /** Not on this collector (no R2 store): the KV CSV stands. */
  | { kind: 'unavailable' }
  /** The collector's refusals that a retry won't change: too small, already kept, the account's monthly 3,
   *  the store's byte budget, a bad token. */
  | { kind: 'refused'; status: number; why: string; retryAfter?: number }
  | { kind: 'failed'; why: string }
  | { kind: 'stopped' };

export interface BigCsvUploadOptions {
  /** The collector's origin (the submit URL without `/submit`). */
  base: string;
  /** The board row's id and its FINAL upload token (the one `/csv` takes). */
  id: string;
  token: string;
  source: BigCsvSource;
  fetch?: typeof fetch;
  partSize?: number;
  /** Bytes the server has, after each part. */
  onProgress?: (sent: number, total: number) => void;
  /** True to give up between parts (the open upload stays; a later call resumes it). */
  shouldStop?: () => boolean;
  /** Tries per request on a network error or a 5xx (backoff 2 s, 8 s, ...). */
  tries?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface PartsAnswer {
  ok?: boolean;
  state?: 'open' | 'done';
  partSize?: number;
  parts?: number;
  bytes?: number;
  uploaded?: { n: number; size: number }[];
  error?: string;
  problems?: string[];
  missing?: number[];
  retryAfter?: number;
}

/** Upload `source` to the row's private big-CSV slot, resuming an open upload. */
export async function uploadBigCsv(o: BigCsvUploadOptions): Promise<BigCsvOutcome> {
  const f = o.fetch ?? fetch;
  const tries = Math.max(1, o.tries ?? 4);
  const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const base = o.base.replace(/\/+$/, '');
  const q = (path: string, extra = '') => `${base}/bigcsv/${path}?id=${encodeURIComponent(o.id)}${extra}`;
  const headers = { 'x-upload-token': o.token };

  /** One request, retried on a network error or a 5xx other than 503 (which means "not set up here"). */
  async function call(url: string, init: RequestInit): Promise<{ status: number; body: PartsAnswer }> {
    let last = '';
    for (let t = 0; t < tries; t++) {
      if (t) await sleep(2000 * 4 ** (t - 1));
      try {
        const res = await f(url, init);
        const body = (await res.json().catch(() => ({}))) as PartsAnswer;
        if (res.status >= 500 && res.status !== 503) {
          last = `the collector answered ${res.status}`;
          continue;
        }
        return { status: res.status, body };
      } catch (e) {
        last = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(last || 'no answer');
  }

  const why = (b: PartsAnswer, status: number) => b.error ?? b.problems?.join('; ') ?? `the collector answered ${status}`;
  const refusedOrFailed = (status: number, b: PartsAnswer): BigCsvOutcome =>
    status === 503
      ? { kind: 'unavailable' }
      : [403, 404, 409, 413, 422, 429].includes(status)
        ? { kind: 'refused', status, why: why(b, status), ...(b.retryAfter ? { retryAfter: b.retryAfter } : {}) }
        : { kind: 'failed', why: why(b, status) };

  try {
    const size = o.source.size;
    const start = await call(q('start', `&bytes=${size}&partSize=${o.partSize ?? BIG_CSV_PART_BYTES}`), {
      method: 'POST',
      headers,
    });
    if (start.status !== 200 || !start.body.ok) return refusedOrFailed(start.status, start.body);
    const partSize = start.body.partSize!;
    const parts = start.body.parts!;
    // A resumed upload keeps the size it started with: a different file is not this one.
    if (start.body.bytes !== size) return { kind: 'failed', why: `an open upload of ${start.body.bytes} bytes is not this file` };
    const have = new Map((start.body.uploaded ?? []).map(p => [p.n, p.size]));
    const sizeOf = (n: number) => (n < parts ? partSize : size - partSize * (parts - 1));
    let done = [...have.values()].reduce((a, b) => a + b, 0);
    let sent = 0;
    o.onProgress?.(done, size);
    const send = async (n: number): Promise<BigCsvOutcome | null> => {
      const bytes = await o.source.read((n - 1) * partSize, sizeOf(n));
      if (bytes.byteLength !== sizeOf(n)) return { kind: 'failed', why: `part ${n} read ${bytes.byteLength} of ${sizeOf(n)} bytes` };
      const put = await call(q('part', `&n=${n}`), {
        method: 'PUT',
        // fetch sets content-length for a byte body (browsers refuse it as a header; the contract needs it).
        headers: { ...headers, 'content-type': 'application/octet-stream' },
        body: bytes as Uint8Array<ArrayBuffer>,
      });
      if (put.status !== 200) return refusedOrFailed(put.status, put.body);
      done += bytes.byteLength;
      sent++;
      o.onProgress?.(done, size);
      return null;
    };
    for (let n = 1; n <= parts; n++) {
      if (have.get(n) === sizeOf(n)) continue;
      if (o.shouldStop?.()) return { kind: 'stopped' };
      const bad = await send(n);
      if (bad) return bad;
    }
    for (let round = 0; round < 2; round++) {
      const end = await call(q('complete'), { method: 'POST', headers });
      if (end.status === 200 && end.body.ok) return { kind: 'kept', bytes: end.body.bytes ?? size, parts, sent };
      // Parts the server lost (or never got): send those, then complete again, once.
      if (end.status === 409 && end.body.missing?.length && round === 0) {
        for (const n of end.body.missing) {
          const bad = await send(n);
          if (bad) return bad;
        }
        continue;
      }
      return refusedOrFailed(end.status, end.body);
    }
    return { kind: 'failed', why: 'parts still missing after a second complete' };
  } catch (e) {
    return { kind: 'failed', why: e instanceof Error ? e.message : String(e) };
  }
}

/** The player-facing line for an outcome. */
export function bigCsvMessage(r: BigCsvOutcome): string {
  switch (r.kind) {
    case 'kept':
      return `The full CSV (every route's per-ascension detail, ${(r.bytes / 1e6).toFixed(0)} MB) is kept privately for analysis.`;
    case 'unavailable':
      return '';
    case 'refused':
      return r.status === 429
        ? `The full CSV was not kept: ${r.why}${r.retryAfter ? ` (try again in ${Math.ceil(r.retryAfter / 3600)} h)` : ''}.`
        : r.status === 409
          ? 'The full CSV was already kept.'
          : `The full CSV was not kept: ${r.why}.`;
    case 'failed':
      return `The full CSV did not upload (${r.why}); the board's CSV is in. It carries on from where it stopped next time.`;
    case 'stopped':
      return 'The full CSV upload paused; it carries on from where it stopped next time.';
  }
}
