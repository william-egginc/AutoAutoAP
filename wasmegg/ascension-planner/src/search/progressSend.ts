/**
 * A progress send: what a long run sends now and then while it goes ("Send my progress every ...",
 * and the Send best so far button). The provisional row as before (search/submission.ts
 * `asProvisional`), plus the run's DATA: the CSV of everything priced so far, and the private
 * diagnostics when "Also send diagnostics" is ticked. Two reasons, from the user (10 Oct): the work is
 * saved as it goes, so a browser that runs out of memory loses less, and a long run can be watched
 * from elsewhere. The collector side is collector/README.md, "Provisional rows".
 *
 * This module is the part that does not need the store: compressing the CSV so far without holding
 * the whole text at once, and the words for what went.
 */
import { fetchFailureWhy } from './uploadWhy';
import { thisDevice } from '@/search/device';

/** The collector's cap on one upload of a gzipped CSV (collector/worker.js, MAX.CSV_BYTES). */
export const CSV_PART_BYTES = 8 * 1024 * 1024;
/** The most parts the collector takes for one CSV (collector/worker.js, MAX.CSV_PARTS). */
export const CSV_MAX_PARTS = 8;
/**
 * The biggest gzipped CSV the collector takes, mid-run as at the end: over CSV_PART_BYTES it goes in
 * parts (`uploadCsv`), up to CSV_MAX_PARTS of them -- 64 MB compressed, about 1.5 GB of raw CSV.
 */
export const PROGRESS_CSV_LIMIT_BYTES = CSV_PART_BYTES * CSV_MAX_PARTS;

/** "640 KB", "2.1 MB": KB under a tenth of a megabyte, so a small CSV never reads "0.0 MB". */
export function sizeLabel(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 100 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** `gzipChunksCapped` was told to stop part-way (its `stopped`). */
export class GzipStopped extends Error {
  constructor() {
    super('stopped');
  }
}

/** How long a progress send may spend on its CSV so far before it gives up and says so. */
export const PROGRESS_CSV_TIMEOUT_MS = 5 * 60_000;

/**
 * A macrotask, so the page paints and the workers' messages are handled between chunks.
 *
 * NOT `setTimeout`. In a hidden tab Chromium holds chained timers to one a second, and after five
 * minutes hidden to one a MINUTE (intensive wake-up throttling): with a few hundred chunks the CSV so
 * far of a big run could not be built in the five minutes a progress send gives it. That is what the
 * PC run of 12 Oct hit after its carry-on (its reopened tab was in the background: "building it took
 * over 5 minutes"). A MessageChannel message is a task too, and is not throttled; the timer stays
 * only where there is no MessageChannel.
 */
export function breathe(): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

/**
 * Gzip text that arrives a chunk at a time, stopping as soon as the compressed size passes `cap`.
 *
 * WHY CHUNKS. The CSV so far of a big run is tens of megabytes of text, and building it as one string
 * (then encoding it, then compressing it) holds two or three copies at once -- on the very tab this is
 * meant to protect from running out of memory. Each chunk is encoded, compressed and dropped; only the
 * compressed bytes (about 23x smaller) are kept. `scrub` runs on each chunk before it is compressed,
 * since nothing can sweep an opaque gzip stream afterwards (stores/chainSearch.ts `gzip`).
 */
export async function gzipChunksCapped(
  chunks: Iterable<string>,
  cap: number,
  scrub: (text: string) => string = t => t,
  /** Checked between chunks: true gives up, rejecting with `GzipStopped` (a timeout, the run's end). */
  stopped: () => boolean = () => false
): Promise<{ ok: true; body: ArrayBuffer } | { ok: false; tooBig: true; atLeast: number }> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let over = false;
  const drain = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      size += value.byteLength;
      if (size > cap) {
        over = true;
        await reader.cancel().catch(() => {});
        return;
      }
      parts.push(value);
    }
  })();
  const encoder = new TextEncoder();
  let gaveUp = false;
  try {
    for (const chunk of chunks) {
      if (over) break;
      if (stopped()) {
        gaveUp = true;
        break;
      }
      await writer.write(encoder.encode(scrub(chunk)));
      await breathe();
    }
    if (gaveUp) {
      await writer.abort().catch(() => {});
      await reader.cancel().catch(() => {});
    } else if (!over) await writer.close();
    else await writer.abort().catch(() => {});
  } catch {
    // A write after the reader gave up (over the cap) rejects: that is the cap, not a fault.
    if (!over && !gaveUp) throw new Error('the CSV could not be compressed in this browser');
  }
  await drain.catch(() => {});
  if (gaveUp) throw new GzipStopped();
  if (over) return { ok: false, tooBig: true, atLeast: size };
  const body = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.byteLength;
  }
  return { ok: true, body: body.buffer };
}

/** What happened to the CSV so far on one progress send. */
export type ProgressCsv =
  /** Stored on the collector. */
  | { kind: 'sent'; bytes: number }
  /** Past the collector's cap: not posted. `bytes` is how far compression got before it stopped. */
  | { kind: 'too-big'; bytes: number }
  /** "Send my CSV too" is unticked. */
  | { kind: 'off' }
  /** Nothing priced yet to put in one. */
  | { kind: 'none' }
  /** The collector handed back no upload token: one from before progress sends (it needs updating). */
  | { kind: 'not-taken' }
  /** It did not upload; `why` in words. The next send tries again. */
  | { kind: 'failed'; why: string }
  /** The run finished while it was being built: the run's final send carries the whole CSV instead. */
  | { kind: 'superseded' };

/** Whether this outcome is settled (nothing more to gain by sending the same progress again). */
export function csvSettled(c: ProgressCsv): boolean {
  return c.kind !== 'failed';
}

/** "3,735 chains, CSV 2.1 MB" -- the part of the status line after the best. */
export function progressDetail(done: number, unit: string, csv: ProgressCsv): string {
  const count = `${Math.max(0, Math.floor(done)).toLocaleString('en-US')} ${unit}`;
  switch (csv.kind) {
    case 'sent':
      return `${count}, CSV ${sizeLabel(csv.bytes)}`;
    case 'too-big':
      return `${count}; CSV too big to send (over ${sizeLabel(PROGRESS_CSV_LIMIT_BYTES)} compressed)`;
    case 'off':
      return `${count}; no CSV ("Send my CSV too" is unticked)`;
    case 'not-taken':
      return `${count}; no CSV (the Leaderboard doesn't take one mid-run yet)`;
    case 'failed':
      return `${count}; the CSV didn't upload`;
    case 'superseded':
      return `${count}; the CSV so far gave way to the final send`;
    default:
      return count;
  }
}

/**
 * The sentence after "Sent ..." in the button's status for the CSV so far, '' when there is nothing
 * to say. Too big mid-run is too big at the end too (the same 64 MB cap), so it says where the file is
 * kept rather than promising the final will carry it.
 */
export function csvNote(csv: ProgressCsv): string {
  switch (csv.kind) {
    case 'too-big':
      return ` The CSV so far is too big to send (over ${sizeLabel(PROGRESS_CSV_LIMIT_BYTES)} compressed), so only the best so far and diagnostics went; Download CSV keeps it on ${thisDevice()}.`;
    case 'not-taken':
      return " The CSV so far wasn't sent: the Leaderboard doesn't take one mid-run yet.";
    case 'failed':
      return ` The CSV so far didn't upload (${csv.why}); the next send tries again.`;
    case 'superseded':
      return ' The run finished while its CSV so far was being built, so that CSV was dropped: the final send carries the whole CSV.';
    default:
      return '';
  }
}

/**
 * The gzip BYTES of one CSV cut into slices of at most `partBytes`, in order. Joined they are the
 * original file exactly, which is what the collector serves from GET /csv. One slice when it fits.
 */
export function csvParts(body: ArrayBuffer, partBytes = CSV_PART_BYTES): ArrayBuffer[] {
  if (body.byteLength <= partBytes) return [body];
  const out: ArrayBuffer[] = [];
  for (let at = 0; at < body.byteLength; at += partBytes) out.push(body.slice(at, at + partBytes));
  return out;
}

/** How one CSV upload went (`uploadCsv`). */
export type CsvUpload =
  /** Stored: `parts` is 1 for a single upload. */
  | { kind: 'stored'; parts: number }
  /** A CSV was already stored for that row (409): most likely an earlier try whose answer was lost. */
  | { kind: 'already' }
  /** Past the collector's cap (413), or more parts than it takes: sending again cannot help. */
  | { kind: 'too-big' }
  /** The token was refused (403): a tab on an old build, or a collector that changed its rules. */
  | { kind: 'refused' }
  /** A big CSV's parts were refused as bad requests (400): a collector from before parts. */
  | { kind: 'no-parts' }
  /** It did not upload; `why` in words (search/uploadWhy.ts: blocked or offline, or the board's
   *  answer), `status` when the collector answered. Worth another go. */
  | { kind: 'failed'; why: string; status?: number };

/** Waits between tries of one part: a dropped connection or a 5xx is usually gone in seconds. */
const PART_RETRY_MS = [2_000, 8_000];

export interface UploadCsvOptions {
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Per part; tests pass 0. */
  retryMs?: number[];
  partBytes?: number;
  /** Called before every POST (each part, each retry): the run timeline counts the tries. */
  onTry?: () => void;
}

/**
 * Upload one gzipped CSV to `url` (`<collector>/csv?id=<id>`) with its `token`.
 *
 * Up to CSV_PART_BYTES it is one POST, exactly as it always was (no retry here: the callers offer
 * theirs). Over it, the bytes go in parts (collector/README.md, "A CSV in parts"): parts 1..m-1, then
 * part 0, which seals the file; each part tried up to three times. A seal refused for missing parts
 * (422, a part KV had not shown yet or that was lost) sends those again, then the seal, once more.
 * Never throws.
 */
export async function uploadCsv(
  url: string,
  token: string,
  body: ArrayBuffer,
  opts: UploadCsvOptions = {}
): Promise<CsvUpload> {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const retryMs = opts.retryMs ?? PART_RETRY_MS;
  const parts = csvParts(body, opts.partBytes ?? CSV_PART_BYTES);
  if (parts.length > CSV_MAX_PARTS) return { kind: 'too-big' };

  const once = async (n: number | null): Promise<Response | Error> => {
    opts.onTry?.();
    try {
      return await doFetch(n === null ? url : `${url}&part=${n}&parts=${parts.length}`, {
        method: 'POST',
        // Deliberately not `content-encoding: gzip`, which would invite something in the path to
        // inflate the body before the Worker sees it: these are gzip bytes posted as data.
        headers: { 'content-type': 'application/gzip', 'x-upload-token': token },
        body: n === null ? body : parts[n],
      });
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };
  /** A final answer, or null to try again. */
  const outcome = (r: Response | Error, multi: boolean): CsvUpload | null => {
    if (r instanceof Error) return null;
    if (r.ok) return { kind: 'stored', parts: parts.length };
    if (r.status === 409) return { kind: 'already' };
    if (r.status === 413) return { kind: 'too-big' };
    if (r.status === 403) return { kind: 'refused' };
    if (multi && r.status === 400) return { kind: 'no-parts' };
    if (r.status >= 500 || r.status === 429) return null;
    return { kind: 'failed', why: `the Leaderboard answered ${r.status}`, status: r.status };
  };
  const failedFrom = (r: Response | Error): CsvUpload =>
    r instanceof Error
      ? { kind: 'failed', why: fetchFailureWhy(r) }
      : { kind: 'failed', why: `the Leaderboard answered ${r.status}`, status: r.status };

  if (parts.length === 1) {
    const r = await once(null);
    return outcome(r, false) ?? failedFrom(r);
  }

  /** One part, with its retries. The 422 of a seal is handed back as is, for the caller to act on. */
  const sendPart = async (n: number): Promise<CsvUpload | Response> => {
    let r: Response | Error = new Error('not sent');
    for (let attempt = 0; attempt <= retryMs.length; attempt++) {
      if (attempt > 0) await new Promise(res => setTimeout(res, retryMs[attempt - 1]));
      r = await once(n);
      if (n === 0 && !(r instanceof Error) && r.status === 422) return r;
      const done = outcome(r, true);
      if (done) return done;
    }
    return failedFrom(r);
  };
  const isUpload = (x: CsvUpload | Response): x is CsvUpload => !(x instanceof Response);

  for (let n = 1; n < parts.length; n++) {
    const r = await sendPart(n);
    if (isUpload(r) && r.kind !== 'stored') return r;
  }
  for (let round = 0; round < 2; round++) {
    const sealed = await sendPart(0);
    if (isUpload(sealed)) return sealed.kind === 'stored' ? { kind: 'stored', parts: parts.length } : sealed;
    // 422: some parts are not there. Send them again, then the seal.
    const missing = ((await sealed.json().catch(() => null)) as { missing?: unknown } | null)?.missing;
    const list = Array.isArray(missing)
      ? missing.filter((n): n is number => Number.isInteger(n) && n > 0 && n < parts.length)
      : [];
    for (const n of list.length ? list : parts.map((_, i) => i).slice(1)) {
      const r = await sendPart(n);
      if (isUpload(r) && r.kind !== 'stored') return r;
    }
  }
  return { kind: 'failed', why: 'the Leaderboard kept saying a part was missing', status: 422 };
}
