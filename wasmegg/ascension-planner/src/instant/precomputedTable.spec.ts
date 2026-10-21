import { describe, expect, it } from 'vitest';
import { compositeTable, LruCache, packTable, readTable } from './precomputedTable';
import type { BuildParams } from './precomputedLeg';

const build = (sales: number, tier13: boolean, k: number): BuildParams => ({
  sales,
  tier13,
  waitStart: 123456.789 + k,
  saleEnd: 654321.5 + k,
  peakELR: 3.3e12 + k,
  // Egg counts on and just past TE thresholds: they must survive the round trip exactly.
  delivered: [5e18 + k, 1.25e19, 3.3e15, 7e20, 1e21 + 0.5e5],
});

describe('precomputed table file', () => {
  it('round-trips every build exactly, empty slots included', () => {
    const cells = [
      { te: 200, h: 0, builds: [build(1, false, 0), build(2, false, 1), build(1, true, 2)] },
      { te: 201, h: 167, builds: [build(3, false, 3)] },
    ];
    const bytes = packTable(
      { version: 1, referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: 200, to: 201, builtAt: 'x' },
      cells
    );
    const t = readTable(bytes.buffer as ArrayBuffer);
    expect(t.header.slots).toBe(3);
    expect(t.lookup(200, 0)).toEqual(cells[0].builds);
    expect(t.lookup(201, 167)).toEqual(cells[1].builds);
    expect(t.lookup(200, 5)).toEqual([]);
    expect(t.lookup(199, 0)).toBeNull();
    expect(t.lookup(201, 168)).toBeNull();
  });

  it('refuses a file that is not a table (the server answering with a web page)', () => {
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    expect(() => readTable(html.buffer as ArrayBuffer)).toThrow('not a precomputed table');
  });

  it('refuses a file cut short, or one with bytes to spare, rather than reading missing cells as empty', () => {
    const bytes = packTable(
      { version: 1, referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: 200, to: 201, builtAt: 'x' },
      [{ te: 201, h: 167, builds: [build(1, false, 0)] }]
    );
    expect(() => readTable(bytes.slice(0, bytes.length - 8).buffer as ArrayBuffer)).toThrow('incomplete');
    expect(() => readTable(bytes.slice(0, Math.floor(bytes.length / 2)).buffer as ArrayBuffer)).toThrow('incomplete');
    const longer = new Uint8Array(bytes.length + 8);
    longer.set(bytes);
    expect(() => readTable(longer.buffer as ArrayBuffer)).toThrow('incomplete');
    expect(readTable(bytes.buffer as ArrayBuffer).lookup(201, 167)).toHaveLength(1);
  });

  it('keeps only the most recently used cells decoded, and decodes a dropped one again exactly', () => {
    const cells = [200, 201, 202].flatMap(te =>
      [0, 1, 2].map(h => ({ te, h, builds: [build(1, false, te * 10 + h), build(2, true, te * 10 + h + 1)] }))
    );
    const bytes = packTable(
      { version: 1, referenceWeek: 1, cteBonus: 1, deliveryScore: 1, from: 200, to: 202, builtAt: 'x' },
      cells
    );
    const t = readTable(bytes.buffer as ArrayBuffer, 2);
    const a = t.lookup(200, 0);
    expect(t.lookup(200, 0)).toBe(a); // a hit
    t.lookup(201, 1);
    t.lookup(200, 0); // 200/0 is now the most recent: 201/1 goes next
    t.lookup(202, 2);
    expect(t.lookup(200, 0)).toBe(a);
    // Every cell, however often dropped, decodes to the same builds.
    for (const c of cells) expect(t.lookup(c.te, c.h)).toEqual(c.builds);
    for (const c of [...cells].reverse()) expect(t.lookup(c.te, c.h)).toEqual(c.builds);
  });

  it('LruCache drops the least recently used entry', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1);
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });
});

describe('compositeTable: an account or gear table joined to the maxed one, per leg', () => {
  const header = { version: 1 as const, referenceWeek: 1, cteBonus: 1, deliveryScore: 1, builtAt: 'x' };
  const maxed = readTable(
    packTable({ ...header, from: 75, to: 339 }, [
      { te: 100, h: 3, builds: [build(1, false, 0)] },
      { te: 200, h: 3, builds: [build(2, false, 0)] },
    ]).buffer as ArrayBuffer
  );
  const own = readTable(
    packTable({ ...header, from: 120, to: 339, simVersion: 'own' }, [{ te: 200, h: 3, builds: [build(3, false, 0)] }])
      .buffer as ArrayBuffer
  );
  const joined = compositeTable(own, maxed, 0.5);

  it('in the own table’s range: its cells as they are (built at the player’s own rate)', () => {
    expect(joined.lookup(200, 3)).toEqual(own.lookup(200, 3));
    expect(joined.lookup(120, 3)).toEqual([]);
  });

  it('below it: the maxed table’s cells, scaled to the player’s delivery rate', () => {
    const b = maxed.lookup(100, 3)![0];
    expect(joined.lookup(100, 3)).toEqual([{ ...b, peakELR: b.peakELR * 0.5 }]);
    expect(joined.lookup(119, 3)).toEqual([]);
    expect(compositeTable(own, maxed, 1).lookup(100, 3)).toBe(maxed.lookup(100, 3));
  });

  it('a delivery table’s cells scaled by their own scale (ownScale), the maxed ones by theirs; 1 leaves them be', () => {
    const both = compositeTable(own, maxed, 0.5, 0.8);
    const o = own.lookup(200, 3)![0];
    const m = maxed.lookup(100, 3)![0];
    expect(both.lookup(200, 3)).toEqual([{ ...o, peakELR: o.peakELR * 0.8 }]);
    expect(both.lookup(100, 3)).toEqual([{ ...m, peakELR: m.peakELR * 0.5 }]);
    expect(compositeTable(own, maxed, 0.5, 1).lookup(200, 3)).toBe(own.lookup(200, 3));
  });

  it('above both (and below the maxed one): no cell', () => {
    expect(joined.lookup(340, 3)).toBeNull();
    expect(joined.lookup(74, 3)).toBeNull();
  });

  it('the header is the own table’s with the range of both', () => {
    expect(joined.header).toMatchObject({ simVersion: 'own', from: 75, to: 339 });
  });
});
