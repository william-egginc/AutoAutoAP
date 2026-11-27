/**
 * The page's leg spill (search/legSpill.ts): one OPFS file per account and screen, held by a worker
 * (workers/legSpill.worker.ts). Where the browser has no OPFS sync access (an old browser, some private
 * windows) or another tab holds the file, opening fails and the run has no spill: its files keep detail for
 * the routes memory kept, as before spills existed.
 *
 * Also the full download (`saveFullCsv`): the CSV written into an OPFS file by the same worker and saved
 * from there, so a multi-gigabyte file is never one Blob in the page's memory.
 */
import { LegSpill, type SpillBackend } from '@/search/legSpill';
import type { BigCsvSink, BigCsvSource } from '@/search/bigCsvUpload';
import { LEG_SPILL_DIR, type LegSpillReply, type LegSpillRequest } from '@/workers/legSpill.protocol';
import { DOWNLOAD_FILE_TTL_MS, spillOpenFailure, withBom, type SpillUnavailable } from './legSpillText';

/** Why the last open failed (Setup > Memory says so); null after one that worked. */
let lastFailure: SpillUnavailable | null = null;
export function lastSpillOpenFailure(): SpillUnavailable | null {
  return lastFailure;
}
/** The download's OPFS copy, deleted a while after each save and at the first spill opened per visit. */
const DOWNLOAD_FILE = 'download.csv';
let staleDownloadCleared = false;

type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

/**
 * THE SPILL WORKER IS BOUNDED (spec-stuck3, 7 Nov 2026). Every ask used to wait for its reply for good: a worker that
 * never loaded, threw, or sat in an OPFS call that never returns (a file handle Safari thinks a dead page still holds)
 * kept a run's start, its checkpoint and its end waiting forever, with the running flags set. The worker answers its
 * requests one at a time, so one stuck request holds every later one: past `SPILL_ASK.ms` with asks waiting and no
 * reply of any kind (a worker busy with a long queue still replies to each), or on the worker's own error, every
 * waiting ask is rejected, the worker is let go, and the next open starts a new one. The store then treats the spill
 * as unavailable, as when another tab holds the file. 30 s: one request is an append or read of a few MB, a sync or
 * an open, which takes milliseconds to a few seconds; the same bound db.ts gives an IndexedDB transaction.
 */
const SPILL_ASK = { ms: 30_000 };
/** Specs: another bound (null: back to the default). */
export function setSpillAskMs(ms: number | null): void {
  SPILL_ASK.ms = ms ?? 30_000;
}
/** When the spill worker last answered anything, ms; 0 when never. A start that waits on the spill reads it as
 *  progress (stores/chainSearch.ts `storageLimit`). */
let lastAnswerAt = 0;
export function lastSpillAnswerAt(): number {
  return lastAnswerAt;
}

class SpillWorker {
  private worker: Worker;
  private next = 1;
  private waiting = new Map<number, { resolve: (r: LegSpillReply) => void; reject: (e: Error) => void }>();
  private heardAt = Date.now();
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  /** Why it was let go; null while it is usable. */
  private dead: Error | null = null;

  constructor(make: () => Worker) {
    this.worker = make();
    this.worker.onmessage = (e: MessageEvent<LegSpillReply>) => {
      this.heardAt = lastAnswerAt = Date.now();
      const done = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      done?.resolve(e.data);
      this.arm();
    };
    this.worker.onerror = (e: ErrorEvent) => {
      e.preventDefault?.();
      this.fail(new Error(`the spill worker failed (${e.message || 'it did not load'})`));
    };
    this.worker.onmessageerror = () => this.fail(new Error('the spill worker sent a message that could not be read'));
  }

  /** The watchdog: due `SPILL_ASK.ms` after the last reply (or the ask that started the wait), while asks wait. */
  private arm(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    if (!this.waiting.size || this.dead) return;
    this.watchdog = setTimeout(
      () => {
        this.watchdog = null;
        if (!this.waiting.size) return;
        if (Date.now() - this.heardAt < SPILL_ASK.ms) return this.arm();
        this.fail(new Error(`the spill worker did not answer within ${Math.round(SPILL_ASK.ms / 1000)} s`));
      },
      Math.max(0, this.heardAt + SPILL_ASK.ms - Date.now())
    );
  }

  /** Every waiting ask rejected, the worker let go; a later ask fails at once, and the next open makes a new one. */
  private fail(err: Error): void {
    if (this.dead) return;
    this.dead = err;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    console.warn('chain search: the leg spill stopped answering, so this page goes on without it', err.message);
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const w of waiting) w.reject(err);
    try {
      this.worker.terminate();
    } catch {
      // already gone
    }
    if (shared === this) shared = null;
  }

  async ask(body: Body<LegSpillRequest>, transfer: Transferable[] = []): Promise<LegSpillReply & { ok: true }> {
    if (this.dead) throw this.dead;
    const id = this.next++;
    const reply = await new Promise<LegSpillReply>((resolve, reject) => {
      // A wait starts now: an idle worker's last reply may be long ago.
      if (!this.waiting.size) this.heardAt = Date.now();
      this.waiting.set(id, { resolve, reject });
      this.arm();
      try {
        this.worker.postMessage({ ...body, id } as LegSpillRequest, transfer);
      } catch (e) {
        this.waiting.delete(id);
        this.arm();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    if (!reply.ok) {
      const err = new Error(reply.quota ? `disk full (${reply.error})` : reply.error);
      throw err;
    }
    return reply;
  }
}

let shared: SpillWorker | null = null;
/** Specs: the next open makes a new worker. */
export function resetSpillWorker(): void {
  shared = null;
  staleDownloadCleared = false;
}
function spillWorker(): SpillWorker {
  if (!shared)
    shared = new SpillWorker(() => new Worker(new URL('../workers/legSpill.worker.ts', import.meta.url), { type: 'module' }));
  return shared;
}

/** A spill file through the worker. Appends are sent without waiting; their failures reach LegSpill. */
export class OpfsSpillBackend implements SpillBackend {
  constructor(
    private readonly w: SpillWorker,
    private readonly name: string
  ) {}

  async append(bytes: Uint8Array): Promise<void> {
    await this.w.ask({ op: 'append', name: this.name, bytes }, [bytes.buffer]);
  }

  async read(at: number, len: number): Promise<Uint8Array> {
    return (await this.readMany([[at, len]]))[0];
  }

  async readMany(spans: readonly (readonly [number, number])[]): Promise<Uint8Array[]> {
    const flat = new Float64Array(spans.length * 2);
    spans.forEach(([at, len], i) => {
      flat[2 * i] = at;
      flat[2 * i + 1] = len;
    });
    return (await this.w.ask({ op: 'readMany', name: this.name, spans: flat }, [flat.buffer])).parts ?? [];
  }

  async sync(): Promise<void> {
    await this.w.ask({ op: 'sync', name: this.name });
  }

  async truncate(size: number): Promise<void> {
    await this.w.ask({ op: 'truncate', name: this.name, size });
  }

  async size(): Promise<number> {
    return (await this.w.ask({ op: 'open', name: this.name })).size ?? 0;
  }

  async close(remove = false): Promise<void> {
    await this.w.ask({ op: 'close', name: this.name, remove });
  }
}

/** The spill file's name for an account (its hashed id) and screen. */
export function legSpillName(kind: 'fastest' | 'deadline', partitionHash: string): string {
  return `legs-${kind}-${partitionHash.slice(0, 32)}.spill`;
}

/** Open (or create) a screen's spill for an account, or null where the browser cannot. */
export async function openPageLegSpill(
  kind: 'fastest' | 'deadline',
  partitionHash: string,
  timezone: string
): Promise<LegSpill | null> {
  if (typeof Worker === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    lastFailure = 'no-opfs';
    return null;
  }
  try {
    const w = spillWorker();
    const name = legSpillName(kind, partitionHash);
    await w.ask({ op: 'open', name });
    lastFailure = null;
    // A download's copy an earlier visit left behind (a big run's is gigabytes).
    if (!staleDownloadCleared) {
      staleDownloadCleared = true;
      void w.ask({ op: 'close', name: DOWNLOAD_FILE, remove: true }).catch(() => {});
    }
    return new LegSpill(new OpfsSpillBackend(w, name), timezone);
  } catch (e) {
    lastFailure = spillOpenFailure(e);
    console.warn('chain search: no leg spill (the files keep detail for the top routes only)', e);
    return null;
  }
}

/**
 * Save a CSV streamed from `chunks` as `filename` by way of an OPFS file (never one Blob of the whole text).
 * False when OPFS is not there; the caller then builds the Blob as before.
 */
export async function saveFullCsv(chunks: AsyncIterable<string>, filename: string): Promise<boolean> {
  if (typeof Worker === 'undefined' || !navigator.storage?.getDirectory) return false;
  const w = spillWorker();
  const name = DOWNLOAD_FILE;
  try {
    let start = true;
    let text = '';
    // The BOM first, as every other CSV download has (utils/export.ts): Excel then reads it as UTF-8.
    for await (const c of withBom(chunks)) {
      text += c;
      // About a megabyte a message: few round trips, no large string held for long.
      if (text.length >= 1 << 20) {
        await w.ask({ op: 'write', name, text, start });
        start = false;
        text = '';
      }
    }
    await w.ask({ op: 'write', name, text, start });
    await w.ask({ op: 'done', name });
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(LEG_SPILL_DIR);
    const file = await (await dir.getFileHandle(name)).getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The browser copies the file out as the click's download starts; the URL and the OPFS copy (as big
    // as the CSV) go a while later, and any left by a closed tab at the next visit's first spill.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      void w.ask({ op: 'close', name, remove: true }).catch(() => {});
    }, DOWNLOAD_FILE_TTL_MS);
    return true;
  } catch (e) {
    console.warn('chain search: could not write the download through OPFS', e);
    return false;
  }
}

/** The full CSV's gzipped file for the private store (search/bigCsvUpload.ts), in OPFS beside the spills. */
const BIG_CSV_FILE = 'bigcsv.csv.gz';

/**
 * A sink writing the full CSV's gzip into OPFS through the worker (appends), and the finished file read back by
 * slices from the page (the worker lets go of it first: OPFS gives a file one holder). Null without OPFS.
 */
export async function openBigCsvSink(): Promise<BigCsvSink | null> {
  if (typeof Worker === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const w = spillWorker();
    await w.ask({ op: 'open', name: BIG_CSV_FILE });
    await w.ask({ op: 'truncate', name: BIG_CSV_FILE, size: 0 });
    let size = 0;
    return {
      async write(bytes: Uint8Array) {
        const copy = bytes.slice();
        await w.ask({ op: 'append', name: BIG_CSV_FILE, bytes: copy }, [copy.buffer]);
        size += bytes.byteLength;
      },
      async close(): Promise<BigCsvSource> {
        await w.ask({ op: 'close', name: BIG_CSV_FILE, remove: false });
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(LEG_SPILL_DIR);
        const file = await (await dir.getFileHandle(BIG_CSV_FILE)).getFile();
        return {
          size: file.size || size,
          read: async (at, len) => new Uint8Array(await file.slice(at, at + len).arrayBuffer()),
        };
      },
    };
  } catch (e) {
    console.warn('chain search: no file for the full CSV upload', e);
    return null;
  }
}

/** That file as the last upload left it (closed by the worker), or null when it is not here. */
async function bigCsvGzFile(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(LEG_SPILL_DIR);
    return await (await dir.getFileHandle(BIG_CSV_FILE)).getFile();
  } catch {
    return null;
  }
}

/** The kept full CSV's .csv.gz still on this computer: its size, or null (cleared, or never made here). */
export async function bigCsvGzSize(): Promise<number | null> {
  return (await bigCsvGzFile())?.size ?? null;
}

/**
 * Save that .csv.gz as `filename` (Jordan, 28 Oct 2026: the full CSV kept on the collector, for the player too),
 * when it is still the file uploaded (`bytes` long). False: gone, or a newer run's file in its place.
 */
export async function saveBigCsvGz(filename: string, bytes: number): Promise<boolean> {
  const file = await bigCsvGzFile();
  if (!file || file.size !== bytes) return false;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_FILE_TTL_MS);
  return true;
}
