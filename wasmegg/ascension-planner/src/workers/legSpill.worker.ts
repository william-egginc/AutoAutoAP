/**
 * The page's leg spill files (search/legSpill.ts), in the origin private file system: a sync access handle
 * per file, which only a worker may hold, so appends and positioned reads are plain calls with no awaiting
 * per record. Messages are handled one after another, so a read always sees every append before it.
 */
import { LEG_SPILL_DIR, type LegSpillReply, type LegSpillRequest } from './legSpill.protocol';

interface SyncHandle {
  read(buffer: Uint8Array, options: { at: number }): number;
  write(buffer: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}

const ctx = self as unknown as Worker;
const handles = new Map<string, { h: SyncHandle; size: number }>();
let dir: FileSystemDirectoryHandle | null = null;
const enc = new TextEncoder();

async function folder(): Promise<FileSystemDirectoryHandle> {
  if (!dir) dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(LEG_SPILL_DIR, { create: true });
  return dir;
}

async function open(name: string): Promise<{ h: SyncHandle; size: number }> {
  let f = handles.get(name);
  if (!f) {
    const fh = await (await folder()).getFileHandle(name, { create: true });
    const h = (await (fh as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle()) as SyncHandle;
    f = { h, size: h.getSize() };
    handles.set(name, f);
  }
  return f;
}

function reply(m: LegSpillReply, transfer: Transferable[] = []): void {
  ctx.postMessage(m, transfer);
}

/** One request at a time, in order (an async step inside one must not let the next overtake it). */
let queue: Promise<void> = Promise.resolve();
ctx.onmessage = (event: MessageEvent<LegSpillRequest>) => {
  const m = event.data;
  queue = queue.then(() => handle(m));
};

async function handle(m: LegSpillRequest): Promise<void> {
  try {
    switch (m.op) {
      case 'open': {
        const f = await open(m.name);
        return reply({ id: m.id, ok: true, size: f.size });
      }
      case 'append': {
        const f = await open(m.name);
        let o = 0;
        while (o < m.bytes.length) o += f.h.write(m.bytes.subarray(o), { at: f.size + o });
        f.size += m.bytes.length;
        return reply({ id: m.id, ok: true, size: f.size });
      }
      case 'readMany': {
        const f = await open(m.name);
        const parts: Uint8Array[] = [];
        for (let i = 0; i + 1 < m.spans.length; i += 2) {
          const buf = new Uint8Array(m.spans[i + 1]);
          const n = f.h.read(buf, { at: m.spans[i] });
          parts.push(n === buf.length ? buf : buf.slice(0, n));
        }
        return reply({ id: m.id, ok: true, parts }, parts.map(p => p.buffer));
      }
      case 'sync': {
        (await open(m.name)).h.flush();
        return reply({ id: m.id, ok: true });
      }
      case 'truncate': {
        const f = await open(m.name);
        f.h.truncate(m.size);
        f.size = Math.min(f.size, m.size);
        return reply({ id: m.id, ok: true, size: f.size });
      }
      case 'close': {
        const f = handles.get(m.name);
        if (f) {
          f.h.flush();
          f.h.close();
          handles.delete(m.name);
        }
        if (m.remove) await (await folder()).removeEntry(m.name).catch(() => {});
        return reply({ id: m.id, ok: true });
      }
      case 'write': {
        if (m.start) {
          const old = handles.get(m.name);
          if (old) {
            old.h.close();
            handles.delete(m.name);
          }
        }
        const f = await open(m.name);
        if (m.start) {
          f.h.truncate(0);
          f.size = 0;
        }
        const bytes = enc.encode(m.text);
        let o = 0;
        while (o < bytes.length) o += f.h.write(bytes.subarray(o), { at: f.size + o });
        f.size += bytes.length;
        return reply({ id: m.id, ok: true, size: f.size });
      }
      case 'done': {
        const f = handles.get(m.name);
        if (f) {
          f.h.flush();
          f.h.close();
          handles.delete(m.name);
        }
        return reply({ id: m.id, ok: true });
      }
    }
  } catch (e) {
    const name = (e as { name?: string })?.name;
    reply({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e), quota: name === 'QuotaExceededError' });
  }
}
