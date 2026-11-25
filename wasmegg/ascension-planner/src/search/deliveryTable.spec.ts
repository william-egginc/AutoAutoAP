/**
 * DELIVERY-SET TABLES (Jordan, 23 Nov 2026: "just the artifacts is how you distinguish them"). A table built on one
 * delivery set (Carpet's combinations: metronome, compass and gusset at a tier and rarity, on the best earnings set) is
 * found by those three artifacts alone, no stones and not the fourth slot (it is the stone holder), and read moved to
 * the player's own gear (the form G, from that table instead of the maxed one).
 */
import { describe, expect, it } from 'vitest';
import { deliveryKey, deliveryTableFile } from './tableGear';
import {
  compositeTable,
  deliveryUrl,
  gearShiftTable,
  parseCompositeUrl,
  parseDeliveryUrl,
  parseGearShiftUrl,
  type Table,
  type TableHeader,
} from './precomputedTable';
import { tableAtUrl } from './tableUrlLoad';
import { tableFileProblem } from './tableBracket';
import type { BuildParams } from './precomputedLeg';
import type { LoadoutSlot } from './csv';

const slot = (artifact: string, stones: string[] = []): LoadoutSlot => ({ artifact, stones });
const LEL = [
  slot('T4L Quantum metronome', ['T4 Tachyon', 'T4 Tachyon', 'T4 Quantum']),
  slot('T4E Interstellar compass', ['T4 Quantum', 'T4 Quantum']),
  slot('T4L Gusset', ['T4 Quantum', 'T4 Quantum', 'T4 Quantum']),
  slot('T4L Lunar totem', ['T4 Tachyon', 'T4 Tachyon', 'T4 Tachyon']),
];

describe('deliveryKey: the delivery artifacts, no stones', () => {
  it('metronome / compass / gusset, tier and rarity', () => {
    expect(deliveryKey(LEL)).toBe('T4L-T4E-T4L');
  });
  it('the same whatever the stones, the fourth slot or the order', () => {
    const other = [
      slot('T3L Tungsten ankh', ['T4 Quantum']),
      slot('T4L Gusset'),
      slot('T4L Quantum metronome'),
      slot('T4E Interstellar compass', ['T4 Tachyon']),
    ];
    expect(deliveryKey(other)).toBe(deliveryKey(LEL));
  });
  it('a different tier or rarity is a different key', () => {
    expect(deliveryKey([slot('T3E Quantum metronome'), slot('T4E Interstellar compass'), slot('T2E Gusset')])).toBe(
      'T3E-T4E-T2E'
    );
    expect(deliveryKey([slot('T4E Quantum metronome'), slot('T4L Interstellar compass'), slot('T4L Gusset')])).toBe(
      'T4E-T4L-T4L'
    );
  });
  it('none without a set, or with none of the three', () => {
    expect(deliveryKey(null)).toBeNull();
    expect(deliveryKey([])).toBeNull();
    expect(deliveryKey([slot('T4L Lunar totem'), slot('T4L Puzzle cube'), slot('T4L Demeters necklace')])).toBeNull();
  });
  // X FOR ONE NOT WORN (orchestrator for Jordan, 24 Nov 2026, as earningsKey): Carpet's 09f8b316 set at full research
  // drops its T4C compass for a puzzle cube, so its table and every player with that gear need a key without a compass.
  it('X for a delivery artifact not in the set', () => {
    expect(
      deliveryKey([slot('T2E Gusset'), slot('T3E Quantum metronome'), slot('T4L Puzzle cube'), slot('T4L Lunar totem')])
    ).toBe('T3E-X-T2E');
    expect(
      deliveryKey([slot('T4L Quantum metronome'), slot('T4L Interstellar compass'), slot('T4L Lunar totem')])
    ).toBe('T4L-T4L-X');
    expect(deliveryKey([slot('T4E Interstellar compass'), slot('T4L Puzzle cube')])).toBe('X-T4E-X');
  });
});

describe('the key as the collector takes it (collector 5a156536e: [A-Za-z0-9_-]{1,24}, no player id)', () => {
  const every = ['T', 'R', 'E', 'L', 'C'].flatMap(r => [1, 2, 3, 4].map(t => `T${t}${r}`));
  it('every tier and rarity, longest included, fits, and delivery:<key> stays within 33 characters', () => {
    for (const m of every)
      for (const c of every) {
        const key = deliveryKey([
          slot(`${m} Quantum metronome`),
          slot(`${c} Interstellar compass`),
          slot(`${m} Gusset`),
        ])!;
        expect(key).toMatch(/^[A-Za-z0-9_-]{1,24}$/);
        expect(`delivery:${key}`.length).toBeLessThanOrEqual(33);
        expect(key).not.toMatch(/EI\d{16}/);
      }
  });
  it('with an X for one not worn too', () => {
    for (const m of [...every, null])
      for (const c of [...every, null]) {
        const set = [
          m && slot(`${m} Quantum metronome`),
          c && slot(`${c} Interstellar compass`),
          slot('T4L Puzzle cube'),
        ];
        const key = deliveryKey(set.filter((s): s is LoadoutSlot => !!s));
        if (!m && !c) {
          expect(key).toBeNull();
          continue;
        }
        expect(key).toMatch(/^[A-Za-z0-9_-]{1,24}$/);
        expect(key).toMatch(/-X$/);
        expect(`delivery:${key}`.length).toBeLessThanOrEqual(33);
        expect(key).not.toMatch(/EI\d{16}/);
      }
  });
});

describe('deliveryTableFile: the name a delivery table is served under (an alias, aliases.json)', () => {
  it('a version 2 gear name, the same for the same key, another for another', async () => {
    const a = await deliveryTableFile('T4L-T4E-T4L');
    expect(a).toMatch(/^gear-[0-9a-f]{24}\.v2\.bin$/);
    expect(tableFileProblem(a, 2)).toBeNull();
    expect(await deliveryTableFile('T4L-T4E-T4L')).toBe(a);
    expect(await deliveryTableFile('T4E-T4L-T4L')).not.toBe(a);
  });
});

describe('the delivery url: the delivery table moved to the player, the maxed one (moved too) above it', () => {
  const d = 'https://x/precompute/gear-aaaaaaaaaaaaaaaaaaaaaaaa.v2.bin';
  const m = 'https://x/precompute/table-v2.bin';
  it('round-trips, and is neither a composite nor a form G url', () => {
    const url = deliveryUrl(
      d,
      '0.5000,0.980000,123.0000000,0.970000',
      m,
      '1.2000,0.950000,120.0000000,0.940000,0.990000',
      261
    );
    expect(parseCompositeUrl(url)).toBeNull();
    expect(parseGearShiftUrl(url)).toBeNull();
    const p = parseDeliveryUrl(url)!;
    expect(p.low).toEqual({ url: d, g: 0.5, geo: 0.98, cap: 123, k: 0.97 });
    expect(p.high).toEqual({ url: m, g: 1.2, geo: 0.95, cap: 120, k: 0.94, geoEr: 0.99 });
    expect(p.split).toBe(261);
  });
  it('the maxed half unmoved when the player is as good as maxed', () => {
    const p = parseDeliveryUrl(deliveryUrl(d, '0.0000,1.000000,100.0000000,1.000000', m, '', 261))!;
    expect(p.high).toEqual({ url: m });
  });
  it('anything else is not a delivery url', () => {
    expect(parseDeliveryUrl(m)).toBeNull();
    expect(parseDeliveryUrl(`gearshift:${m}|0,1,1,1`)).toBeNull();
  });

  // Two one-build tables whose cells say which table and row they came from.
  const header = (from: number, to: number): TableHeader =>
    ({ version: 2, from, to, cteBonus: 128, k3: { research: {}, delivery: [], peak: 100 } }) as unknown as TableHeader;
  const table = (tag: number, from: number, to: number): Table => ({
    header: header(from, to),
    lookup: (te, hour) =>
      te < from || te > to || hour !== 0
        ? null
        : [
            {
              sales: 1,
              tier13: false,
              waitStart: tag * 1000 + te,
              saleEnd: 0,
              peakELR: 100,
              delivered: [1],
            } as unknown as BuildParams,
          ],
  });
  it('loads as the two moved tables joined at the split (tableAtUrl)', async () => {
    const files: Record<string, Table> = { [d]: table(1, 150, 260), [m]: table(2, 55, 489) };
    const url = deliveryUrl(
      d,
      '0.0000,0.900000,1000.0000000,0.900000',
      m,
      '0.0000,0.800000,1000.0000000,0.800000',
      261
    );
    const t = await tableAtUrl(url, async u => files[u]);
    const low = gearShiftTable(files[d], { g: 0, geo: 0.9, cap: 1000, k: 0.9 });
    const high = gearShiftTable(files[m], { g: 0, geo: 0.8, cap: 1000, k: 0.8 });
    const both = compositeTable(low, high, 261, 1);
    for (const te of [150, 200, 260, 261, 300])
      expect(t.lookup(te, 0)?.[0].peakELR, `TE ${te}`).toBeCloseTo(both.lookup(te, 0)![0].peakELR, 9);
    expect(t.lookup(200, 0)![0].peakELR).toBeCloseTo(90, 9);
    expect(t.lookup(300, 0)![0].peakELR).toBeCloseTo(80, 9);
    expect(t.header.gearTo).toBe(260);
    expect(t.header.gearShift).toEqual({ g: 0, geo: 0.9, cap: 1000, k: 0.9 });
  });
});

describe('a gear table shorter than the split (an exact-stamp match on a 150-260 table, 24 Nov 2026)', () => {
  const tbl = (tag: number, from: number, to: number): Table => ({
    header: {
      version: 2,
      from,
      to,
      cteBonus: 128,
      k3: { research: {}, delivery: [], peak: 100 },
    } as unknown as TableHeader,
    lookup: (te, hour) =>
      te < from || te > to || hour !== 0
        ? null
        : [
            {
              sales: 1,
              tier13: false,
              waitStart: tag,
              saleEnd: 0,
              peakELR: 100,
              delivered: [1],
            } as unknown as BuildParams,
          ],
  });
  it('reads it to its own last TE, then the maxed one (it read nothing from 261 to 339)', () => {
    const both = compositeTable(tbl(1, 150, 260), tbl(2, 55, 489), 340, 1);
    expect(both.lookup(260, 0)![0].waitStart).toBe(1);
    expect(both.lookup(261, 0)![0].waitStart).toBe(2);
    expect(both.lookup(339, 0)![0].waitStart).toBe(2);
    expect(both.header.gearTo).toBe(260);
  });
  it('a full gear table is read all the way, as before', () => {
    const both = compositeTable(tbl(1, 75, 489), tbl(2, 55, 489), 340, 1);
    expect(both.lookup(400, 0)![0].waitStart).toBe(1);
    expect(both.header.gearTo).toBe(489);
  });
});

// THE NEAREST TABLE'S CHAIN (R10, Jordan 25 Nov 2026: search/nearestTable.ts): the nearest delivery table at the save's
// TE, the nearest covering the TE past its last, and so on to the maxed one, as one delivery url: the two-table url
// with a (url, key, split) more for each further table. A two-table url reads as before.
describe('the delivery url with more tables (the nearest-table chain)', () => {
  const d = 'https://x/precompute/gear-dddddddddddddddddddddddd.v2.bin';
  const n = 'https://x/precompute/gear-nnnnnnnnnnnnnnnnnnnnnnnn.v2.bin';
  const m = 'https://x/precompute/table-v2.bin';
  const header = (from: number, to: number): TableHeader =>
    ({ version: 2, from, to, cteBonus: 128, k3: { research: {}, delivery: [], peak: 100 } }) as unknown as TableHeader;
  const table = (tag: number, from: number, to: number): Table => ({
    header: header(from, to),
    lookup: (te, hour) =>
      te < from || te > to || hour !== 0
        ? null
        : [{ sales: 1, tier13: false, waitStart: tag, saleEnd: 0, peakELR: 100, delivered: [1] } as unknown as BuildParams],
  });
  const dKey = '0.0000,1.000000,1000.0000000,1.000000';
  const nKey = '0.0000,0.900000,1000.0000000,0.900000';
  const mKey = '0.0000,0.800000,1000.0000000,0.800000';
  it('round-trips: the first two as low and high, the rest as more, each with where it starts', () => {
    const url = deliveryUrl(d, dKey, n, nKey, 150, [{ url: m, key: mKey, split: 340 }]);
    expect(parseCompositeUrl(url)).toBeNull();
    expect(parseGearShiftUrl(url)).toBeNull();
    const p = parseDeliveryUrl(url)!;
    expect(p.low).toEqual({ url: d, g: 0, geo: 1, cap: 1000, k: 1 });
    expect(p.high).toEqual({ url: n, g: 0, geo: 0.9, cap: 1000, k: 0.9 });
    expect(p.split).toBe(150);
    expect(p.more).toEqual([{ url: m, g: 0, geo: 0.8, cap: 1000, k: 0.8, split: 340 }]);
  });
  it('the last (maxed) one unmoved when the player is as good as maxed', () => {
    const p = parseDeliveryUrl(deliveryUrl(d, dKey, n, nKey, 150, [{ url: m, key: '', split: 340 }]))!;
    expect(p.more).toEqual([{ url: m, split: 340 }]);
  });
  it('a two-table url is as it was (no more), and the same string as before', () => {
    expect(deliveryUrl(d, dKey, m, mKey, 150)).toBe(`delivery:${[d, dKey, m, mKey, 150].join('~')}`);
    expect(deliveryUrl(d, dKey, m, mKey, 150, [])).toBe(deliveryUrl(d, dKey, m, mKey, 150));
    expect(parseDeliveryUrl(deliveryUrl(d, dKey, m, mKey, 150))!.more).toBeUndefined();
  });
  it('a broken more is not a delivery url', () => {
    expect(parseDeliveryUrl(`${deliveryUrl(d, dKey, n, nKey, 150)}~${m}~${mKey}`)).toBeNull();
    expect(parseDeliveryUrl(`${deliveryUrl(d, dKey, n, nKey, 150)}~${m}~x,y~340`)).toBeNull();
    expect(parseDeliveryUrl(`${deliveryUrl(d, dKey, n, nKey, 150)}~${m}~${mKey}~many`)).toBeNull();
  });
  it('loads as each moved table to its own last TE, then the next (tableAtUrl)', async () => {
    const files: Record<string, Table> = { [d]: table(1, 75, 149), [n]: table(2, 75, 339), [m]: table(3, 55, 489) };
    const url = deliveryUrl(d, dKey, n, nKey, 150, [{ url: m, key: mKey, split: 340 }]);
    const t = await tableAtUrl(url, async u => files[u]);
    expect(t.lookup(110, 0)![0].waitStart).toBe(1);
    expect(t.lookup(149, 0)![0].waitStart).toBe(1);
    expect(t.lookup(150, 0)![0].waitStart).toBe(2);
    expect(t.lookup(339, 0)![0].waitStart).toBe(2);
    expect(t.lookup(340, 0)![0].waitStart).toBe(3);
    expect(t.lookup(150, 0)![0].peakELR).toBeCloseTo(90, 9);
    expect(t.lookup(400, 0)![0].peakELR).toBeCloseTo(80, 9);
    expect(t.header.gearTo).toBe(149);
    expect(t.header.to).toBe(489);
    expect(t.header.gearShift).toEqual({ g: 0, geo: 1, cap: 1000, k: 1 });
  });
  it('each file fetched once', async () => {
    const asked: string[] = [];
    const files: Record<string, Table> = { [d]: table(1, 75, 149), [n]: table(2, 75, 339), [m]: table(3, 55, 489) };
    await tableAtUrl(deliveryUrl(d, dKey, n, nKey, 150, [{ url: m, key: '', split: 340 }]), async u => {
      asked.push(u);
      return files[u];
    });
    expect(asked.sort()).toEqual([d, m, n].sort());
  });
});
