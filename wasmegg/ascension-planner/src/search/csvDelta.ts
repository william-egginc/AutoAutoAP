/**
 * "CSV so far in deltas" (12 Oct 2026; collector/README.md, "CSV so far in deltas").
 *
 * WHY. A progress send used to rebuild the WHOLE CSV of everything priced so far: on the PC's
 * 34-hour run that was ~255,000 summary lines plus the legs of up to 20,000 routes, tens of megabytes
 * of text built on the page every few hours while 19 workers filled the browser's 4 GB cage, uploaded
 * whole, stored whole and deleted whole at the next send. Now each send uploads only:
 *  - a DELTA: the summary lines of the routes priced since the last send that landed, in the order
 *    they were priced (`csvd:<run>:<seq>` on the collector, kept for the run), and
 *  - a small HEAD for the new row: the header, legs for the top DELTA_HEAD_LEG_ROUTES routes, and the
 *    summary section's header (`csv:<row id>`, replaced with the row as before).
 * GET /csv?id= joins head and deltas into ONE gzip file, the same link and readers as ever. The FINAL
 * send is unchanged: the whole ranked CSV, built after the workers are gone (nothing shares the cage
 * then), and it takes the run's deltas off the collector.
 *
 * HOW ONE FILE. Each piece is a raw DEFLATE segment ended with a SYNC FLUSH and no final block (pako;
 * the browser's CompressionStream always ends a stream). Compressed independently, segments can be
 * laid end to end; the collector adds the gzip header, an empty final block and the trailer, whose
 * CRC-32 it combines from each piece's (`crc`, `len` sent with it) without inflating anything.
 *
 * WHICH ROUTES ARE SENT. `PricedRoutes` grows in the search's own batch order, which a carry-on
 * replays exactly, so "routes 0 to `sent`" names the same routes after a crash. The state (`run`,
 * next `seq`, `sent`, and the running hash of the keys at `sent`) goes into the run's checkpoint; a
 * carry-on whose routes hash differently at `sent` starts a fresh run key from route 0 rather than
 * trust it, so a delta is never missing or counted twice.
 */
import { Deflate, constants as zc } from 'pako';
import { breathe } from './progressSend';
import { fetchFailureWhy } from './uploadWhy';

export { BLOCKED_WHY, fetchFailureWhy } from './uploadWhy';
export { hashKey } from './routeHash';

/** Routes whose legs a progress send's head carries (the final file has DEADLINE_LEG_ROUTES). */
export const DELTA_HEAD_LEG_ROUTES = 500;
/** The collector's most deltas a run (collector/worker.js MAX.CSV_DELTAS). */
export const MAX_DELTAS = 256;

/** Where a run's deltas stand: kept in its checkpoint, so a carry-on goes on from there. */
export interface DeltaState {
  /** The run's key on the collector: 16 hex, made when the run starts. */
  run: string;
  /** The next delta's number. */
  seq: number;
  /** Routes (of `PricedRoutes`, in order) already in a stored delta. */
  sent: number;
  /** `PricedRoutes.hashAt(sent - 1)`, 0 with nothing sent: the carry-on check. */
  hash: number;
}

export function newRunKey(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function freshDeltaState(): DeltaState {
  return { run: newRunKey(), seq: 0, sent: 0, hash: 0 };
}

/** A stored state, checked; null for anything unusable (then the run starts a fresh one). */
export function readDeltaState(v: unknown): DeltaState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.run !== 'string' || !/^[a-f0-9]{16,32}$/.test(o.run)) return null;
  const whole = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  if (!whole(o.seq) || !whole(o.sent) || !whole(o.hash)) return null;
  return { run: o.run, seq: o.seq as number, sent: o.sent as number, hash: o.hash as number };
}

/** Routes priced so far, with the running hash of their keys (search/deadline.ts `PricedRoutes`). */
export interface HashedRoutes {
  readonly size: number;
  hashAt(i: number): number;
}

/**
 * The state to send from now: as kept, when the routes priced so far still agree with it (or have
 * not been replayed that far yet: `wait`); a fresh run key from route 0 when they do not (a carry-on
 * that priced in another order), or when the collector's delta cap is reached.
 */
export function checkDeltaState(s: DeltaState, all: HashedRoutes): { state: DeltaState; wait: boolean } {
  if (s.seq >= MAX_DELTAS) return { state: freshDeltaState(), wait: false };
  if (s.sent === 0) return { state: s, wait: false };
  if (all.size < s.sent) return { state: s, wait: true };
  return all.hashAt(s.sent - 1) === s.hash ? { state: s, wait: false } : { state: freshDeltaState(), wait: false };
}

let CRC_TABLE: Uint32Array | null = null;
/** CRC-32 (the gzip one) of `bytes`, continuing from `crc`. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One piece: raw deflate, sync-flushed, no final block; with the CRC-32 and length of its text. */
export type Segment = { ok: true; body: Uint8Array; crc: number; len: number; empty: boolean } | { ok: false; tooBig: true };

/**
 * Compress text chunks into one segment (see the top of this file). `scrub` runs on each chunk first;
 * `stopped` is checked between chunks (a timeout, the run's end) and throws `GzipStopped`'s sibling,
 * here a plain Error('stopped'). Over `cap` compressed bytes: `tooBig`.
 */
export async function deflateSegment(
  chunks: Iterable<string>,
  cap: number,
  scrub: (text: string) => string = t => t,
  stopped: () => boolean = () => false
): Promise<Segment> {
  const d = new Deflate({ raw: true, level: 6 });
  const out: Uint8Array[] = [];
  let size = 0;
  d.onData = (c: Uint8Array) => {
    out.push(c);
    size += c.length;
  };
  const enc = new TextEncoder();
  let crc = 0;
  let len = 0;
  for (const chunk of chunks) {
    if (stopped()) throw new Error('stopped');
    const bytes = enc.encode(scrub(chunk));
    crc = crc32(bytes, crc);
    len += bytes.length;
    d.push(bytes, zc.Z_NO_FLUSH);
    if (size > cap) return { ok: false, tooBig: true };
    await breathe();
  }
  d.push(new Uint8Array(0), zc.Z_SYNC_FLUSH);
  if (d.err) throw new Error(`could not be compressed (${d.msg || d.err})`);
  if (size > cap) return { ok: false, tooBig: true };
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of out) {
    body.set(c, at);
    at += c.length;
  }
  return { ok: true, body, crc, len, empty: len === 0 };
}

/** How one delta upload went. */
export type DeltaUpload =
  /** Stored, or stored before (a retry whose answer was lost): `count` routes are in it. */
  | { kind: 'stored'; count: number }
  | { kind: 'failed'; why: string; status?: number };

/** POST one delta (collector "CSV so far in deltas"). Never throws. */
export async function uploadDelta(
  base: string,
  a: { run: string; seq: number; token: string; seg: { body: Uint8Array; crc: number; len: number }; count: number },
  doFetch: typeof fetch = (...x) => fetch(...x)
): Promise<DeltaUpload> {
  const url = `${base}/csvd?run=${a.run}&seq=${a.seq}&len=${a.seg.len}&crc=${a.seg.crc}&count=${a.count}`;
  // The last try's reason, for the run timeline and the page's note.
  let last: { why: string; status?: number } = { why: 'the connection dropped' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, attempt * 3000));
    let r: Response;
    try {
      r = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-upload-token': a.token },
        body: a.seg.body as Uint8Array<ArrayBuffer>,
      });
    } catch (e) {
      last = { why: fetchFailureWhy(e) };
      continue;
    }
    if (r.ok) return { kind: 'stored', count: a.count };
    if (r.status === 409) {
      const got = (await r.json().catch(() => null)) as { count?: unknown } | null;
      const n = got && typeof got.count === 'number' && Number.isInteger(got.count) ? got.count : null;
      return n === null ? { kind: 'failed', why: 'the Leaderboard had that piece already but did not say what was in it', status: 409 } : { kind: 'stored', count: n };
    }
    if (r.status >= 500 || r.status === 429) {
      last = { why: `the Leaderboard answered ${r.status}`, status: r.status };
      continue;
    }
    return { kind: 'failed', why: `the Leaderboard answered ${r.status}`, status: r.status };
  }
  return { kind: 'failed', ...last };
}

/** POST the head of a row whose CSV is in deltas: it seals the row's file at `deltas` pieces. */
export async function uploadDeltaHead(
  base: string,
  a: { id: string; run: string; deltas: number; token: string; deltaToken: string; seg: { body: Uint8Array; crc: number; len: number } },
  doFetch: typeof fetch = (...x) => fetch(...x)
): Promise<{ kind: 'stored' } | { kind: 'failed'; why: string; status?: number; missing?: number[] }> {
  const url = `${base}/csv?id=${encodeURIComponent(a.id)}&run=${a.run}&deltas=${a.deltas}&len=${a.seg.len}&crc=${a.seg.crc}`;
  // The last try's reason, for the run timeline and the page's note.
  let last: { why: string; status?: number } = { why: 'the connection dropped' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, attempt * 3000));
    let r: Response;
    try {
      r = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-upload-token': a.token, 'x-delta-token': a.deltaToken },
        body: a.seg.body as Uint8Array<ArrayBuffer>,
      });
    } catch (e) {
      last = { why: fetchFailureWhy(e) };
      continue;
    }
    if (r.ok || r.status === 409) return { kind: 'stored' };
    if (r.status === 422) {
      const got = (await r.json().catch(() => null)) as { missing?: unknown } | null;
      const missing = Array.isArray(got?.missing) ? got!.missing.filter((n): n is number => Number.isInteger(n)) : [];
      return { kind: 'failed', why: 'the Leaderboard was missing a piece of it', status: 422, missing };
    }
    if (r.status >= 500 || r.status === 429) {
      last = { why: `the Leaderboard answered ${r.status}`, status: r.status };
      continue;
    }
    return { kind: 'failed', why: `the Leaderboard answered ${r.status}`, status: r.status };
  }
  return { kind: 'failed', ...last };
}
