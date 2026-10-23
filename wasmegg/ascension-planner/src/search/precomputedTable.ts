/**
 * The precomputed table as one file: written by scripts/precompute.ts --pack, read by the site.
 *
 * LAYOUT. A little-endian uint32 header length, the header as UTF-8 JSON, padding to 8 bytes, then
 * float64s: for each start TE from `from` to `to`, each of the 168 Pacific hours, `slots` builds of
 * nine numbers each:
 *   [sales + 8 if tier 13 (0 = empty slot), waitStart, saleEnd, peakELR, delivered x 5 (EGG_ORDER)]
 * Float64 throughout, the egg counts above all: the tail compares them with TE thresholds exactly, and
 * a count rounded to just under its threshold would lose a whole TE.
 *
 * VERSION 2 (search/tableV2.ts): the same layout with more numbers per build, version 1's nine first
 * and then the extras the hours replay needs; the header names them in order (`fields`) and carries
 * the TE thresholds (`teThresholds`). `lookup` reads version 1's nine from either, so everything that
 * reads a table works on both; `extras` gives the rest.
 */
import { canonicalDelivered, EGG_ORDER, rebase, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import type { TableGear } from './tableGear';
import { jointSimVersion } from './simVersion';
import { readExtras, V1_FIELDS, V2_FIELDS, writeV2, type BuildExtras, type BuildWithExtras } from './tableV2';

const FIELDS = 9;

/** Numbers per build in a table with this header: nine in version 1, the header's `fields` in 2. */
export function fieldsPerBuild(header: Pick<TableHeader, 'version' | 'fields'>): number {
  return header.version === 2 ? (header.fields?.length ?? 0) : FIELDS;
}

export interface TableHeader {
  version: 1 | 2;
  /** Version 2: each build's numbers in file order (tableV2.ts V2_FIELDS); version 1's nine first. */
  fields?: string[];
  /** Version 2: the eggs delivered each TE threshold needs, the same for every egg (lib/truthEggs.ts
   *  TE_BREAKPOINTS), so a page can replay a tail without the simulator's copy. */
  teThresholds?: number[];
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
  /** The maxed table moved to a player's gear (gearShiftTable, search/instantGear.ts): the Clothed-TE
   *  row shift, the delivery scale below full research and the full-research peak. */
  gearShift?: { g: number; geo: number; cap: number; k: number };
  /** The simulator the cells came from (search/simVersion.ts SIM_VERSION). Absent on a table packed
   *  before stamping; the page then treats it as older (tableSimMismatch). */
  simVersion?: string;
  /** The simulation settings the cells were built with (the context's assumeDoubleEarnings and
   *  deferForEarningsMode). Absent on tables packed before 19 Oct 2026: our generator has always
   *  built with the doubler on and defer off (search/tableCheck.ts GENERATOR_SETTINGS). */
  settings?: { assumeDoubleEarnings: boolean; deferForEarnings: boolean };
  /** What the simulator reads of the account it was built on, for a table with no gear stamp (the
   *  maxed one): the epic research it models (tableGear.ts simEpicResearch) and the colleggtible
   *  effects (colleggtibleEffects). A gear table has both in `gear`. Absent before 19 Oct 2026. */
  epicResearch?: Record<string, number>;
  colleggtibleEffects?: Record<string, number>;
}

export interface Table {
  header: TableHeader;
  /** The builds for a start TE at a Pacific hour, or null outside the table. */
  lookup(te: number, hour: number): BuildParams[] | null;
  /** Version 2 only: the same builds' extra numbers (tableV2.ts), in the same order. */
  extras?(te: number, hour: number): BuildExtras[] | null;
}

/** Pack per-(TE, hour) builds into the file's bytes. */
export function packTable(
  header: Omit<TableHeader, 'slots'>,
  cells: { te: number; h: number; builds: (BuildParams & { extras?: BuildExtras })[] }[]
): Uint8Array {
  const slots = Math.max(1, ...cells.map(c => c.builds.length));
  const v2 = header.version === 2;
  const full: TableHeader = v2 ? { ...header, fields: [...V2_FIELDS], slots } : { ...header, slots };
  const stride = fieldsPerBuild(full);
  const json = new TextEncoder().encode(JSON.stringify(full));
  const start = Math.ceil((4 + json.length) / 8) * 8;
  const count = (header.to - header.from + 1) * WEEK_HOURS * slots * stride;
  const bytes = new Uint8Array(start + count * 8);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  const body = new Float64Array(bytes.buffer, start, count);
  for (const c of cells) {
    if (c.te < header.from || c.te > header.to) continue;
    c.builds.forEach((b, i) => {
      const at = (((c.te - header.from) * WEEK_HOURS + c.h) * slots + i) * stride;
      if (v2) {
        if (!b.extras) throw new Error(`TE ${c.te} hour ${c.h}: a version 2 table needs every build's extras`);
        writeV2(body, at, b, b.extras);
        return;
      }
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
 * The same file with header fields set (scripts/precompute.ts --stamp-sim): the header is rewritten
 * and the cells are copied byte for byte, so only the header can differ. Throws on a file that does
 * not read as a whole table.
 */
export function restampTable(buffer: ArrayBuffer, patch: Partial<Omit<TableHeader, 'slots' | 'from' | 'to'>>): Uint8Array {
  const old = readTable(buffer).header;
  const oldStart = Math.ceil((4 + new DataView(buffer).getUint32(0, true)) / 8) * 8;
  const json = new TextEncoder().encode(JSON.stringify({ ...old, ...patch }));
  const start = Math.ceil((4 + json.length) / 8) * 8;
  const body = new Uint8Array(buffer, oldStart);
  const bytes = new Uint8Array(start + body.length);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  bytes.set(body, start);
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
  if (header.version !== 1 && header.version !== 2)
    throw new Error(`precomputed table version ${header.version} is not supported`);
  // Version 2 names its numbers; version 1's nine must lead, in their order, or the cells would be
  // read as something they are not.
  if (
    header.version === 2 &&
    !(
      Array.isArray(header.fields) &&
      header.fields.length >= FIELDS &&
      V1_FIELDS.every((f, i) => header.fields![i] === f)
    )
  )
    throw new Error('precomputed table version 2 without its field list');
  const stride = fieldsPerBuild(header);
  const start = Math.ceil((4 + len) / 8) * 8;
  // Every cell must be there: a file cut short (a half-copied upload, a truncated response) would
  // otherwise read its missing cells as empty, and the finder would quietly route around them and
  // show a wrong answer as if it were real.
  const expected = start + (header.to - header.from + 1) * WEEK_HOURS * header.slots * stride * 8;
  if (!(header.slots > 0) || buffer.byteLength !== expected)
    throw new Error(`the precomputed table is incomplete (${buffer.byteLength} of ${expected} bytes)`);
  const body = new Float64Array(buffer, start);
  const cache = new LruCache<number, BuildParams[]>(maxCells);
  const v2 = header.version === 2 && header.fields!.length >= V2_FIELDS.length;
  return {
    header,
    ...(v2
      ? {
          extras(te: number, hour: number): BuildExtras[] | null {
            if (te < header.from || te > header.to || hour < 0 || hour >= WEEK_HOURS) return null;
            const key = (te - header.from) * WEEK_HOURS + hour;
            const out: BuildExtras[] = [];
            for (let i = 0; i < header.slots; i++) {
              const at = (key * header.slots + i) * stride;
              if (body[at]) out.push(readExtras(body, at));
            }
            return out;
          },
        }
      : {}),
    lookup(te, hour) {
      if (te < header.from || te > header.to || hour < 0 || hour >= WEEK_HOURS) return null;
      const key = (te - header.from) * WEEK_HOURS + hour;
      const hit = cache.get(key);
      if (hit) return hit;
      const builds: BuildParams[] = [];
      for (let i = 0; i < header.slots; i++) {
        const at = (key * header.slots + i) * stride;
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
    header: {
      ...low.header,
      to: Math.max(high.header.to, low.header.to),
      k3: high.header.k3,
      gearTo: top,
      simVersion: jointSimVersion(low.header.simVersion, high.header.simVersion),
    },
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

/**
 * A version 2 table whose `lookup` gives each build with its extras attached (`BuildWithExtras`), for
 * the finder's held replay (routeFinder.ts `TailOptions`). A version 1 table comes back as it is.
 */
export function withExtras(t: Table, maxCells = DECODED_CELLS): Table {
  const extras = t.extras;
  if (!extras) return t;
  const cache = new LruCache<number, BuildWithExtras[]>(maxCells);
  return {
    ...t,
    lookup(te, hour) {
      const key = te * WEEK_HOURS + hour;
      const hit = cache.get(key);
      if (hit) return hit;
      const builds = t.lookup(te, hour);
      if (!builds) return null;
      const x = extras(te, hour) ?? [];
      const out = builds.map((b, i) => (x[i] ? { ...b, extras: x[i] } : b));
      cache.set(key, out);
      return out;
    },
  };
}

/** The maxed table moved to a player's gear, named by one url string as composites are:
 *  `gearshift:URL|g,geo,cap,k` (search/instantGear.ts `gearShiftKey`). */
export function gearShiftUrl(url: string, key: string): string {
  return `gearshift:${url}|${key}`;
}

export function parseGearShiftUrl(url: string): { url: string; g: number; geo: number; cap: number; k: number } | null {
  if (!url.startsWith('gearshift:')) return null;
  const rest = url.slice('gearshift:'.length);
  const bar = rest.lastIndexOf('|');
  if (bar < 0) return null;
  const [g, geo, cap, k] = rest
    .slice(bar + 1)
    .split(',')
    .map(Number);
  if (![g, geo, cap, k].every(Number.isFinite)) return null;
  return { url: rest.slice(0, bar), g, geo, cap, k };
}

/**
 * The maxed table at a player's gear (search/instantGear.ts, the weak-gear form G): the builds for a
 * start TE are the maxed table's TE - g row (the two rows either side of a fractional g, blended by
 * sale count), moved onto TE's canonical counts, with every delivery rate x `geo` and the peak no
 * higher than `cap`. A row whose shifted rows fall below the table's first falls back to the old
 * single scale (the same row, peak x k): the table does not reach that far down.
 */
export function gearShiftTable(
  maxed: Table,
  shift: { g: number; geo: number; cap: number; k: number },
  maxCells = DECODED_CELLS
): Table {
  const g = Math.max(0, shift.g);
  const gf = Math.floor(g);
  const gc = Math.ceil(g);
  const w = g - gf;
  const { geo, cap, k } = shift;
  const cache = new LruCache<number, BuildWithExtras[] | null>(maxCells);
  const moved = (te: number, row: number, hour: number): BuildWithExtras[] | null => {
    const cell = maxed.lookup(row, hour) as BuildWithExtras[] | null;
    if (!cell) return null;
    const canon = canonicalDelivered(te);
    return cell.map(b => ({
      ...rebase(b, row, canon),
      peakELR: Math.min(b.peakELR * geo, cap),
      ...(b.extras
        ? {
            extras: {
              ...b.extras,
              layRate: b.extras.layRate * geo,
              shipRate: b.extras.shipRate * geo,
              h1Rate: b.extras.h1Rate * geo,
              k3Rate: b.extras.k3Rate * geo,
            },
          }
        : {}),
    }));
  };
  const mix = (a: number, b: number) => a * (1 - w) + b * w;
  const blend = (hi: BuildWithExtras[], lo: BuildWithExtras[]): BuildWithExtras[] => {
    if (w === 0) return hi;
    const out: BuildWithExtras[] = [];
    const sales = [...new Set([...hi, ...lo].map(x => x.sales))].sort((a, b) => a - b);
    for (const n of sales) {
      const x = hi.find(y => y.sales === n);
      const y = lo.find(z => z.sales === n);
      if (!x || !y) {
        out.push((x ?? y)!);
        continue;
      }
      const near = w < 0.5 ? x : y;
      out.push({
        sales: n,
        tier13: near.tier13,
        waitStart: mix(x.waitStart, y.waitStart),
        saleEnd: mix(x.saleEnd, y.saleEnd),
        peakELR: mix(x.peakELR, y.peakELR),
        delivered: x.delivered.map((d, i) => mix(d, y.delivered[i])),
        ...(x.extras && y.extras
          ? {
              extras: {
                layRate: mix(x.extras.layRate, y.extras.layRate),
                shipRate: mix(x.extras.shipRate, y.extras.shipRate),
                h1At: mix(x.extras.h1At, y.extras.h1At),
                h1Rate: mix(x.extras.h1Rate, y.extras.h1Rate),
                k3At: mix(x.extras.k3At, y.extras.k3At),
                k3Rate: mix(x.extras.k3Rate, y.extras.k3Rate),
                waitEgg: near.extras!.waitEgg,
              },
            }
          : {}),
      });
    }
    return out;
  };
  return {
    header: { ...maxed.header, gearShift: { g, geo, cap, k } },
    lookup(te, hour) {
      if (te < maxed.header.from || te > maxed.header.to || hour < 0 || hour >= WEEK_HOURS) return null;
      const key = te * WEEK_HOURS + hour;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const hi = moved(te, te - gf, hour);
      const lo = gc === gf ? hi : moved(te, te - gc, hour);
      let out: BuildWithExtras[] | null;
      if (hi && lo) out = blend(hi, lo);
      else if (hi) out = hi;
      else {
        // Below the table's first row once shifted: the old single scale on this row.
        const raw = maxed.lookup(te, hour) as BuildWithExtras[] | null;
        out = raw ? raw.map(b => ({ ...b, peakELR: b.peakELR * k })) : null;
      }
      cache.set(key, out);
      return out;
    },
  };
}
