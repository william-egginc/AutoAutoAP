/**
 * EVERY ROUTE'S LEGS, ON DISK (Jordan, 26 Oct 2026: the downloaded CSV of a big run keeps every route's
 * per-ascension detail; aaap-tools/notes/legspill-2026-10-26.md).
 *
 * A run keeps per-leg detail in memory for its fastest routes only (search/legBudget.ts): an 800,000-route
 * run's legs are some 3 GB of text, which no tab or Node heap holds. A leg spill writes each priced route's
 * leg cells to a file as it goes, and the full CSV (search/csv.ts `chainsCsvChunksFull`,
 * `deadlineCsvChunksFull`) reads them back route by route. Memory keeps an index: one key, two numbers a
 * route.
 *
 * THE FILE. One line a route, appended: `key \t legTail0 \x1f legTail1 ... \n`, each tail the route's leg
 * cells from `leg` on (csv.ts `legTails`), formatted once in the run's timezone, so the file is about the
 * size of the CSV's own leg rows. A route priced again gets a new line and the index points at it; the old
 * line is left as garbage. Appends are buffered and handed to the backend a megabyte at a time.
 *
 * CRASH AND CARRY-ON. `commit` writes the buffer and makes the file durable, and returns its length: the
 * run's checkpoint stores it. A carry-on calls `restore(length)`, which cuts the file back to it (whatever
 * came after was priced after the checkpoint, and the carried-on run prices it again) and scans it to
 * rebuild the index. A file shorter than its checkpoint says (lost, or an older run's) keeps what it has.
 *
 * DISK FULL. An append that fails stops the spill for the rest of the run (`stopped` says when); the
 * routes in the failed write lose their entry, and the CSV says so. Nothing else changes: those routes
 * have the in-memory detail they had before spills existed.
 *
 * The backend is the platform's: a file for the CLI (scripts/nodeLegSpill.ts), OPFS or IndexedDB for
 * the page. No backend: no spill, and every file is written as it always was.
 */
import { legTails, type LegTailSource } from './csv';
import type { LegSummary } from './types';

/** Bytes appended, read back and cut: what a platform provides. Reads and cuts may be async. */
export interface SpillBackend {
  /** Append at the end. Throws when it cannot (disk full). */
  append(bytes: Uint8Array): void | Promise<void>;
  /** `len` bytes from `at`. */
  read(at: number, len: number): Uint8Array | Promise<Uint8Array>;
  /** Several spans at once ([at, len] each), for a backend where each read is a round trip (a worker). */
  readMany?(spans: readonly (readonly [number, number])[]): Promise<Uint8Array[]>;
  /** Make what has been appended durable. */
  sync(): void | Promise<void>;
  /** Cut the file to `size` bytes. */
  truncate(size: number): void | Promise<void>;
  /** Bytes in the file. */
  size(): number | Promise<number>;
  /** Close (and with `remove`, delete) the file. */
  close(remove?: boolean): void | Promise<void>;
}

const TAB = 9;
const NL = 10;
const SEP = '\x1f';
/** Buffered bytes past which appends go to the backend. */
const DRAIN_BYTES = 1 << 20;
/** Bytes read at a time when the file is scanned. */
const SCAN_BYTES = 4 << 20;

/** A leg cell never holds these (`cell` quotes commas and quotes, not tabs or newlines); a stray one
 *  would split a record, so it becomes a space. */
// eslint-disable-next-line no-control-regex
const clean = (s: string): string => (/[\t\n\r\x1f]/.test(s) ? s.replace(/[\t\n\r\x1f]/g, ' ') : s);

export class LegSpill implements LegTailSource {
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();
  /** key -> record number; each record's offset and length. */
  private readonly index = new Map<string, number>();
  private at = new Float64Array(1024);
  private len = new Uint32Array(1024);
  private records = 0;
  /** Bytes the backend has (appended and not failed). */
  private written = 0;
  private buffer: Uint8Array[] = [];
  private buffered = 0;
  /** Keys whose records are in `buffer`, to drop from the index if their write fails. */
  private bufferedKeys: string[] = [];
  private stoppedText: string | null = null;
  /** Appends in flight on an async backend, in order. */
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly backend: SpillBackend,
    /** The timezone the leg cells are written in (the run's); a full CSV says this one. */
    readonly timezone: string
  ) {}

  /** Routes with leg cells stored. */
  get count(): number {
    return this.index.size;
  }

  /** Why storing stopped (disk full), or null. */
  get stopped(): string | null {
    return this.stoppedText;
  }

  /** Bytes in the file, buffered ones included. */
  get bytes(): number {
    return this.written + this.buffered;
  }

  has(key: string): boolean {
    return this.index.has(key);
  }

  /**
   * Store a route's legs. Nothing for a route without legs, once storing has stopped, or for legs replayed
   * from a checkpoint (four numbers a leg) over a route already stored with its full detail.
   */
  put(key: string, legs: readonly LegSummary[]): void {
    if (this.stoppedText || !legs.length) return;
    if (this.index.has(key) && legs.some(l => l.replayed)) return;
    const line = `${key}\t${legTails(legs, this.timezone).map(clean).join(SEP)}\n`;
    const bytes = this.enc.encode(line);
    const n = this.records++;
    if (n >= this.at.length) {
      const at = new Float64Array(this.at.length * 2);
      at.set(this.at);
      this.at = at;
      const len = new Uint32Array(this.len.length * 2);
      len.set(this.len);
      this.len = len;
    }
    this.at[n] = this.written + this.buffered;
    this.len[n] = bytes.length;
    this.index.set(key, n);
    this.buffer.push(bytes);
    this.buffered += bytes.length;
    this.bufferedKeys.push(key);
    if (this.buffered >= DRAIN_BYTES) this.drain();
  }

  /** Hand what is buffered to the backend now (not made durable: `commit` does that). Called on the run's
   *  progress beat, so the file keeps up with the routes priced instead of a megabyte at a time. */
  flush(): void {
    this.drain();
  }

  /** Hand the buffer to the backend. */
  private drain(): void {
    if (!this.buffered) return;
    const out = new Uint8Array(this.buffered);
    let o = 0;
    for (const b of this.buffer) {
      out.set(b, o);
      o += b.length;
    }
    const keys = this.bufferedKeys;
    const base = this.written;
    this.buffer = [];
    this.buffered = 0;
    this.bufferedKeys = [];
    this.written += out.length;
    const fail = (e: unknown) => {
      // Those routes were never stored: back to what memory has for them, and no more storing.
      for (const k of keys) {
        const n = this.index.get(k);
        if (n !== undefined && this.at[n] >= base) this.index.delete(k);
      }
      this.written = base;
      if (!this.stoppedText)
        this.stoppedText = `after ${this.index.size.toLocaleString('en-US')} routes (${e instanceof Error ? e.message : String(e)})`;
    };
    try {
      const r = this.backend.append(out);
      if (r && typeof (r as Promise<void>).then === 'function') this.pending = this.pending.then(() => r).catch(fail);
    } catch (e) {
      fail(e);
    }
  }

  /** Write the buffer, make the file durable, and return its length (for the checkpoint). */
  async commit(): Promise<number> {
    this.drain();
    await this.pending;
    try {
      await this.backend.sync();
    } catch (e) {
      if (!this.stoppedText) this.stoppedText = `after ${this.index.size.toLocaleString('en-US')} routes (${String(e)})`;
    }
    return this.written;
  }

  /** Each key's leg cells, or null when it has none stored. */
  async tails(keys: readonly string[]): Promise<(string[] | null)[]> {
    this.drain();
    await this.pending;
    const parse = (bytes: Uint8Array): string[] | null => {
      const text = this.dec.decode(bytes);
      const tab = text.indexOf('\t');
      return tab < 0 ? null : text.slice(tab + 1).replace(/\n$/, '').split(SEP);
    };
    const found = keys.map(k => this.index.get(k));
    if (this.backend.readMany) {
      const spans: [number, number][] = [];
      for (const n of found) if (n !== undefined) spans.push([this.at[n], this.len[n]]);
      const parts = spans.length ? await this.backend.readMany(spans) : [];
      let i = 0;
      return found.map(n => (n === undefined ? null : parse(parts[i++] ?? new Uint8Array(0))));
    }
    const out: (string[] | null)[] = [];
    for (const n of found) out.push(n === undefined ? null : parse(await this.backend.read(this.at[n], this.len[n])));
    return out;
  }

  /**
   * Start from a checkpoint: cut the file to `size` bytes (0: a fresh run) and rebuild the index from what
   * is left. Returns the routes found and the bytes kept (less than `size` when the file was shorter).
   */
  async restore(size: number): Promise<{ routes: number; bytes: number }> {
    await this.pending;
    this.index.clear();
    this.records = 0;
    this.buffer = [];
    this.buffered = 0;
    this.bufferedKeys = [];
    this.stoppedText = null;
    const have = await this.backend.size();
    let keep = Math.max(0, Math.min(size, have));
    // Only whole records: a cut inside one (a checkpoint length from a file that lost its tail) drops it.
    let pos = 0;
    let lastWhole = 0;
    let carry = new Uint8Array(0);
    while (pos < keep) {
      const n = Math.min(SCAN_BYTES, keep - pos);
      const chunk = await this.backend.read(pos, n);
      const buf = new Uint8Array(carry.length + chunk.length);
      buf.set(carry);
      buf.set(chunk, carry.length);
      const base = pos - carry.length;
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] !== NL) continue;
        let tab = start;
        while (tab < i && buf[tab] !== TAB) tab++;
        if (tab < i) {
          const key = this.dec.decode(buf.subarray(start, tab));
          const r = this.records++;
          if (r >= this.at.length) {
            const at = new Float64Array(this.at.length * 2);
            at.set(this.at);
            this.at = at;
            const len = new Uint32Array(this.len.length * 2);
            len.set(this.len);
            this.len = len;
          }
          this.at[r] = base + start;
          this.len[r] = i + 1 - start;
          this.index.set(key, r);
        }
        start = i + 1;
        lastWhole = base + start;
      }
      carry = buf.slice(start);
      pos += n;
    }
    keep = lastWhole;
    if (have !== keep) await this.backend.truncate(keep);
    this.written = keep;
    return { routes: this.index.size, bytes: keep };
  }

  /** Close the file; with `remove`, delete it (the run is over and its files are written). */
  async close(remove = false): Promise<void> {
    await this.pending;
    await this.backend.close(remove);
  }
}

/** A backend in memory, for tests (and a page without disk access, where it only moves the problem). */
export class MemorySpillBackend implements SpillBackend {
  private data = new Uint8Array(1024);
  private n = 0;
  /** Bytes past which `append` throws, to test a full disk. */
  constructor(private readonly limit = Infinity) {}
  append(bytes: Uint8Array): void {
    if (this.n + bytes.length > this.limit) throw new Error('disk full');
    if (this.n + bytes.length > this.data.length) {
      const d = new Uint8Array(Math.max(this.data.length * 2, this.n + bytes.length));
      d.set(this.data.subarray(0, this.n));
      this.data = d;
    }
    this.data.set(bytes, this.n);
    this.n += bytes.length;
  }
  read(at: number, len: number): Uint8Array {
    return this.data.slice(at, Math.min(at + len, this.n));
  }
  sync(): void {}
  truncate(size: number): void {
    this.n = Math.min(this.n, size);
  }
  size(): number {
    return this.n;
  }
  close(): void {}
}
