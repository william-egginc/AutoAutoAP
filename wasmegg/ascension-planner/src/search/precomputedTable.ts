/**
 * The precomputed table as one file: written by scripts/precompute.ts --pack, read by the site.
 *
 * LAYOUT. A little-endian uint32 header length, the header as UTF-8 JSON, padding to 8 bytes, then
 * float64s: for each start TE from `from` to `to`, each of the 168 Pacific hours, `slots` builds of
 * nine numbers each:
 *   [sales + 8 if tier 13 (0 = empty slot), waitStart, saleEnd, peakELR, delivered x 5 (EGG_ORDER)]
 * Float64 throughout, the egg counts above all: the tail compares them with TE thresholds exactly, and
 * a count rounded to just under its threshold would lose a whole TE.
 */
import { EGG_ORDER, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import type { TableGear } from './tableGear';

const FIELDS = 9;

export interface TableHeader {
  version: 1;
  /** Unix second of the Monday 00:00 Pacific every entry was simulated from. */
  referenceWeek: number;
  /** The account it was built on: its earnings set's Clothed TE bonus and delivery score. */
  cteBonus: number;
  deliveryScore: number;
  from: number;
  to: number;
  slots: number;
  builtAt: string;
  /** The research a build waits with and the table's delivery set there (scripts/precompute.ts
   *  --k3): a player's peak delivery rate is compared with the table's at that research. */
  k3?: {
    research: Record<string, number>;
    delivery: { artifactId: string | null; stones: (string | null)[] }[];
    /** The table's own peak delivery rate (eggs/s) at search/tableBuild.ts PEAK_TE and the reference
     *  week's first hour: a player's own build there, against this, is their delivery scale. */
    peak?: number;
  };
  /** Rows below what was generated filled from the nearest real ones (--pack --fake-below), for
   *  trying the page while the table is built. Never a real answer; the page says so. */
  fake?: boolean;
  /** An account's own table: the gear it was built on (search/tableGear.ts). The page uses it only
   *  for a save whose stamp matches. Absent on the maxed reference table. */
  gear?: TableGear;
  /** A gear table joined to the maxed one (compositeTable): the last start TE from the gear table. */
  gearTo?: number;
}

export interface Table {
  header: TableHeader;
  /** The builds for a start TE at a Pacific hour, or null outside the table. */
  lookup(te: number, hour: number): BuildParams[] | null;
}

/** Pack per-(TE, hour) builds into the file's bytes. */
export function packTable(
  header: Omit<TableHeader, 'slots'>,
  cells: { te: number; h: number; builds: BuildParams[] }[]
): Uint8Array {
  const slots = Math.max(1, ...cells.map(c => c.builds.length));
  const full: TableHeader = { ...header, slots };
  const json = new TextEncoder().encode(JSON.stringify(full));
  const start = Math.ceil((4 + json.length) / 8) * 8;
  const count = (header.to - header.from + 1) * WEEK_HOURS * slots * FIELDS;
  const bytes = new Uint8Array(start + count * 8);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  const body = new Float64Array(bytes.buffer, start, count);
  for (const c of cells) {
    if (c.te < header.from || c.te > header.to) continue;
    c.builds.forEach((b, i) => {
      const at = (((c.te - header.from) * WEEK_HOURS + c.h) * slots + i) * FIELDS;
      body[at] = b.sales + (b.tier13 ? 8 : 0);
      body[at + 1] = b.waitStart;
      body[at + 2] = b.saleEnd;
      body[at + 3] = b.peakELR;
      for (let e = 0; e < EGG_ORDER.length; e++) body[at + 4 + e] = b.delivered[e];
    });
  }
  return bytes;
}

/**
 * Decoded cells kept per table (and per composite's scaled half). A cell is ~1.3 KB decoded (three
 * builds), and a whole table is 62,160 cells: ~78 MB of heap per route worker if every cell were
 * kept, which an unbounded cache drifts towards over a session (another start time, another target,
 * the strong polish). Past this the least recently used cells are dropped and decoded again from the
 * bytes if wanted; the bytes stay in the ArrayBuffer, off the JS heap. Decoding is cheap next to the
 * route arithmetic: a full answer from TE 138 (73,000 lookups, measured in Node) took the same time
 * with 2,048 cells kept as with every one, so this is about 5 MB a table.
 */
export const DECODED_CELLS = 4096;

/**
 * A `Map` capped at `max` entries, dropping the least recently used. A hit moves the entry to the
 * newest end (delete and set again: Map keeps insertion order).
 */
export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }
  get size(): number {
    return this.map.size;
  }
}

/** Read the file's bytes back; builds are made on lookup of a cell and the most recently used
 *  `maxCells` kept (DECODED_CELLS). */
export function readTable(buffer: ArrayBuffer, maxCells = DECODED_CELLS): Table {
  const view = new DataView(buffer);
  const len = buffer.byteLength >= 4 ? view.getUint32(0, true) : 0;
  let header: TableHeader;
  try {
    if (!len || 4 + len > buffer.byteLength) throw new Error('bad length');
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, len))) as TableHeader;
  } catch {
    throw new Error('that file is not a precomputed table');
  }
  if (header.version !== 1) throw new Error(`precomputed table version ${header.version} is not supported`);
  const start = Math.ceil((4 + len) / 8) * 8;
  // Every cell must be there: a file cut short (a half-copied upload, a truncated response) would
  // otherwise read its missing cells as empty, and the finder would quietly route around them and
  // show a wrong answer as if it were real.
  const expected = start + (header.to - header.from + 1) * WEEK_HOURS * header.slots * FIELDS * 8;
  if (!(header.slots > 0) || buffer.byteLength !== expected)
    throw new Error(`the precomputed table is incomplete (${buffer.byteLength} of ${expected} bytes)`);
  const body = new Float64Array(buffer, start);
  const cache = new LruCache<number, BuildParams[]>(maxCells);
  return {
    header,
    lookup(te, hour) {
      if (te < header.from || te > header.to || hour < 0 || hour >= WEEK_HOURS) return null;
      const key = (te - header.from) * WEEK_HOURS + hour;
      const hit = cache.get(key);
      if (hit) return hit;
      const builds: BuildParams[] = [];
      for (let i = 0; i < header.slots; i++) {
        const at = (key * header.slots + i) * FIELDS;
        const flags = body[at];
        if (!flags) continue;
        builds.push({
          sales: flags % 8,
          tier13: flags >= 8,
          waitStart: body[at + 1],
          saleEnd: body[at + 2],
          peakELR: body[at + 3],
          delivered: Array.from(body.subarray(at + 4, at + 4 + EGG_ORDER.length)),
        });
      }
      cache.set(key, builds);
      return builds;
    },
  };
}

/**
 * A gear table below a start TE and the maxed table from it, as one table (a board gear
 * combination's table covers the TEs where gear shows, below 340; from there the maxed table at the
 * player's delivery rate is exact). Named by one url string so the worker protocol carries it as any
 * table: `LOW_URL|HIGH_URL|SPLIT|SCALE`.
 */
export function compositeUrl(low: string, high: string, split: number, scale: number): string {
  return [low, high, split, scale].join('|');
}

export function parseCompositeUrl(url: string): { low: string; high: string; split: number; scale: number } | null {
  const parts = url.split('|');
  if (parts.length !== 4) return null;
  return { low: parts[0], high: parts[1], split: Number(parts[2]), scale: Number(parts[3]) };
}

/** The two as one: the low table's rows below `split` (and all it has, when it reaches higher), the
 *  high table's above that with their peak delivery rate scaled to the player's (so the route search
 *  runs at a scale of 1). `gearTo` in the header says where the gear table's own rows end. */
export function compositeTable(low: Table, high: Table, split: number, scale: number, maxCells = DECODED_CELLS): Table {
  const scaled = new LruCache<number, BuildParams[]>(maxCells);
  const top = Math.max(split - 1, low.header.to);
  return {
    header: { ...low.header, to: Math.max(high.header.to, low.header.to), k3: high.header.k3, gearTo: top },
    lookup(te, hour) {
      if (te <= top) return low.lookup(te, hour);
      const raw = high.lookup(te, hour);
      if (!raw || scale === 1) return raw;
      const key = te * WEEK_HOURS + hour;
      let hit = scaled.get(key);
      if (!hit) {
        hit = raw.map(b => ({ ...b, peakELR: b.peakELR * scale }));
        scaled.set(key, hit);
      }
      return hit;
    },
  };
}
