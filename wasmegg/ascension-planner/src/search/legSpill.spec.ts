import { describe, expect, it } from 'vitest';
import { LegSpill, MemorySpillBackend } from './legSpill';
import {
  buildChainsCsv,
  buildDeadlineCsv,
  chainsCsvChunksFull,
  deadlineCsvChunksFull,
  legTails,
  PRICED_LEG_ROW_TAG,
  PRICED_LEGS_SECTION_LINE,
  type CsvMeta,
} from './csv';
import { PricedRoutes } from './deadline';
import type { CacheEntry } from './driver';
import type { LegSummary } from './types';

const TZ = 'America/Denver';
const T0 = 1_800_000_000;

function leg(i: number, endTE: number, extra: Partial<LegSummary> = {}): LegSummary {
  return {
    key: i === 0 ? 'continue' : '2-sale-tier13',
    endTE,
    startTime: T0 + i * 86400 * 30,
    endTime: T0 + (i + 1) * 86400 * 30,
    durationSeconds: 86400 * 30,
    buildPhaseEndTime: T0 + i * 86400 * 30 + 86400,
    buildPhaseSaleCount: 2,
    tier13Unlocked: true,
    maxELR: 1e12,
    nightShifts: 1,
    shifts: [
      { at: T0 + i * 86400 * 30 + 3600, egg: 'kindness', fromEgg: 'curiosity' },
      { at: T0 + i * 86400 * 30 + 7200, egg: 'humility', fromEgg: 'kindness' },
    ],
    ...extra,
  } as unknown as LegSummary;
}

function route(chain: number[], seconds: number): CacheEntry {
  return { key: chain.join(','), seconds, legs: chain.map((te, i) => leg(i, te)) };
}

const meta: CsvMeta = {
  planStart: T0,
  timezone: TZ,
  currentTE: 190,
  final: 490,
  effort: 'exhaustive',
  firstAscension: 'auto',
  availability: null,
  seedChain: [],
  loadouts: [],
  generatedAt: 0,
} as unknown as CsvMeta;

async function collect(g: AsyncGenerator<string>): Promise<string> {
  let s = '';
  for await (const c of g) s += c;
  return s;
}

describe('LegSpill', () => {
  it('stores a route as its CSV leg cells and reads them back by key', async () => {
    const spill = new LegSpill(new MemorySpillBackend(), TZ);
    const r = route([200, 250, 490], 5e7);
    spill.put(r.key, r.legs);
    expect(spill.count).toBe(1);
    expect(await spill.tails([r.key, 'nope'])).toEqual([legTails(r.legs, TZ), null]);
  });

  it('a route priced again points at its newest legs; replayed legs never replace full ones', async () => {
    const spill = new LegSpill(new MemorySpillBackend(), TZ);
    const a = route([200, 490], 5e7);
    spill.put(a.key, a.legs);
    const b = { ...a, legs: [leg(0, 201), leg(1, 490)] };
    spill.put(b.key, b.legs);
    spill.put(a.key, [{ ...leg(0, 1), replayed: true } as LegSummary]);
    expect((await spill.tails([a.key]))[0]).toEqual(legTails(b.legs, TZ));
  });

  it('carry-on: cut back to the checkpoint length, index rebuilt from the file, later puts appended', async () => {
    const backend = new MemorySpillBackend();
    const spill = new LegSpill(backend, TZ);
    const a = route([200, 490], 5e7);
    const b = route([210, 490], 5.1e7);
    spill.put(a.key, a.legs);
    const at = await spill.commit();
    spill.put(b.key, b.legs);
    await spill.commit();
    // A new process: a fresh index over the same file, back to the checkpoint's length.
    const again = new LegSpill(backend, TZ);
    expect(await again.restore(at)).toEqual({ routes: 1, bytes: at });
    expect(await again.tails([a.key, b.key])).toEqual([legTails(a.legs, TZ), null]);
    again.put(b.key, b.legs);
    expect((await again.tails([b.key]))[0]).toEqual(legTails(b.legs, TZ));
    // A checkpoint length inside a record (a file that lost its tail) keeps only whole records.
    const third = new LegSpill(backend, TZ);
    expect((await third.restore(at + 5)).bytes).toBe(at);
    // A fresh run empties it.
    expect(await new LegSpill(backend, TZ).restore(0)).toEqual({ routes: 0, bytes: 0 });
    expect(backend.size()).toBe(0);
  });

  it('disk full: storing stops, the failed write is not indexed, and it says when', async () => {
    const spill = new LegSpill(new MemorySpillBackend(1500), TZ);
    const routes = Array.from({ length: 20 }, (_, i) => route([200 + i, 490], 5e7 + i));
    for (const r of routes) spill.put(r.key, r.legs);
    await spill.commit();
    expect(spill.stopped).toMatch(/^after 0 routes \(disk full\)/);
    expect(spill.count).toBe(0);
    expect(await spill.tails([routes[0].key])).toEqual([null]);
  });
});

describe('the full chain-search CSV', () => {
  const routes = [route([200, 250, 490], 5e7), route([205, 490], 5.2e7), route([210, 300, 490], 5.1e7)];

  it('is the in-memory file row for row when every route is on disk and memory dropped the legs', async () => {
    const spill = new LegSpill(new MemorySpillBackend(), TZ);
    for (const r of routes) spill.put(r.key, r.legs);
    const memory = buildChainsCsv(routes, meta);
    const dropped = routes.map(r => ({ ...r, legs: [] as LegSummary[] }));
    const full = await collect(chainsCsvChunksFull(dropped, meta, spill));
    const rows = (s: string) => s.split('\n').filter(l => /^\d/.test(l));
    expect(rows(full)).toEqual(rows(memory));
    expect(rows(full)).toHaveLength(8);
  });

  it('legRoutes: legs for the fastest N only, one blank row for the rest', async () => {
    const spill = new LegSpill(new MemorySpillBackend(), TZ);
    for (const r of routes) spill.put(r.key, r.legs);
    const dropped = routes.map(r => ({ ...r, legs: [] as LegSummary[] }));
    const out = await collect(chainsCsvChunksFull(dropped, meta, spill, 1));
    const rows = out.split('\n').filter(l => /^\d/.test(l));
    expect(rows.filter(l => l.startsWith('1,'))).toHaveLength(3);
    expect(rows.filter(l => l.startsWith('2,'))).toHaveLength(1);
    expect(out).toContain('One row per leg for the fastest 1 chains');
  });
});

describe('the full By a date CSV', () => {
  it('adds every priced route with its legs after the summary section, tagged rows in its order', async () => {
    const deadline = T0 + 86400 * 380;
    const all = new PricedRoutes();
    const spill = new LegSpill(new MemorySpillBackend(), TZ);
    const priced = [route([200, 300], 0), route([200, 310], 0), route([205, 320], 0)];
    priced.forEach((r, i) => {
      const reach = T0 + 86400 * (300 + i * 50);
      all.add(r.key, reach, reach);
      spill.put(r.key, r.legs);
    });
    const kept = [{ chain: [200, 310], reachAt: all.reachAt(1), ascendAt: all.ascendAt(1), spare: deadline - all.ascendAt(1), legs: priced[1].legs }];
    const info = { deadline, priced: 3, all };
    const plain = buildDeadlineCsv(kept, meta, info);
    const full = await collect(deadlineCsvChunksFull(kept, meta, info, spill));
    expect(full.startsWith(plain)).toBe(true);
    const tail = full.slice(plain.length);
    expect(tail).toContain(PRICED_LEGS_SECTION_LINE);
    const rows = tail.split('\n').filter(l => l.startsWith(PRICED_LEG_ROW_TAG + ','));
    // Two legs a route; the one that misses the date (320 at day 400, after day 380) comes last.
    expect(rows).toHaveLength(6);
    expect(rows[0].split(',').slice(1, 3)).toEqual(['1', '200 310']);
    expect(rows[5].split(',').slice(1, 3)).toEqual(['3', '205 320']);
    expect(rows[0].endsWith(legTails(priced[1].legs, TZ)[0])).toBe(true);
  });
});
