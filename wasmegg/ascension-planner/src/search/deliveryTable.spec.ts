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
  it('none without all three (no save, or a set without one of them)', () => {
    expect(deliveryKey(null)).toBeNull();
    expect(deliveryKey([])).toBeNull();
    expect(
      deliveryKey([slot('T4L Quantum metronome'), slot('T4L Interstellar compass'), slot('T4L Lunar totem')])
    ).toBeNull();
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
