import { describe, expect, it } from 'vitest';
import { packTable, readTable } from './precomputedTable';
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
});
