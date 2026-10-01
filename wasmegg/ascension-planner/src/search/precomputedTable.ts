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
  /** Rows below what was generated filled from the nearest real ones (--pack --fake-below), for
   *  trying the page while the table is built. Never a real answer; the page says so. */
  fake?: boolean;
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

/** Read the file's bytes back; builds are made on first lookup of each cell and kept. */
export function readTable(buffer: ArrayBuffer): Table {
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
  const body = new Float64Array(buffer, start);
  const cache = new Map<number, BuildParams[]>();
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
