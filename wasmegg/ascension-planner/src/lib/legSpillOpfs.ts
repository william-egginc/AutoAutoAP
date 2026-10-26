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
import { LEG_SPILL_DIR, type LegSpillReply, type LegSpillRequest } from '@/workers/legSpill.protocol';

type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

class SpillWorker {
  private worker: Worker;
  private next = 1;
  private waiting = new Map<number, (r: LegSpillReply) => void>();

  constructor(make: () => Worker) {
    this.worker = make();
    this.worker.onmessage = (e: MessageEvent<LegSpillReply>) => {
      const done = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      done?.(e.data);
    };
  }

  async ask(body: Body<LegSpillRequest>, transfer: Transferable[] = []): Promise<LegSpillReply & { ok: true }> {
    const id = this.next++;
    const reply = await new Promise<LegSpillReply>(resolve => {
      this.waiting.set(id, resolve);
      this.worker.postMessage({ ...body, id } as LegSpillRequest, transfer);
    });
    if (!reply.ok) {
      const err = new Error(reply.quota ? `disk full (${reply.error})` : reply.error);
      throw err;
    }
    return reply;
  }
}

let shared: SpillWorker | null = null;
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
  if (typeof Worker === 'undefined' || typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const w = spillWorker();
    const name = legSpillName(kind, partitionHash);
    await w.ask({ op: 'open', name });
    return new LegSpill(new OpfsSpillBackend(w, name), timezone);
  } catch (e) {
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
  const name = 'download.csv';
  try {
    let start = true;
    let text = '';
    for await (const c of chunks) {
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
    // The browser has the file by the time the click's download starts; let go of the URL a little later.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (e) {
    console.warn('chain search: could not write the download through OPFS', e);
    return false;
  }
}
