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

/** The collector's cap on a gzipped CSV (collector/worker.js, MAX.CSV_BYTES), mid-run as at the end. */
export const PROGRESS_CSV_LIMIT_BYTES = 8 * 1024 * 1024;

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

/** A macrotask, so the page paints and the workers' messages are handled between chunks. */
const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));

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
      return `${count}; no CSV (the board doesn't take one mid-run yet)`;
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
 * to say. Too big mid-run is too big at the end too (the same 8 MB cap), so it says where the file is
 * kept rather than promising the final will carry it.
 */
export function csvNote(csv: ProgressCsv): string {
  switch (csv.kind) {
    case 'too-big':
      return ` The CSV so far is too big to send (over ${sizeLabel(PROGRESS_CSV_LIMIT_BYTES)} compressed), so only the best so far and diagnostics went; Download CSV keeps it on this computer.`;
    case 'not-taken':
      return " The CSV so far wasn't sent: the board doesn't take one mid-run yet.";
    case 'failed':
      return ` The CSV so far didn't upload (${csv.why}); the next send tries again.`;
    case 'superseded':
      return ' The run finished while its CSV so far was being built, so that CSV was dropped: the final send carries the whole CSV.';
    default:
      return '';
  }
}
