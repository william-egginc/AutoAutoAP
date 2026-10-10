/**
 * By a date's CSV with every priced route (search/csv.ts `pricedSummaryChunks`): legs for the top
 * routes, then one summary line per route priced, those that miss the date included, and the
 * Explorer reading both the new files and the old ones.
 */
import { describe, expect, it } from 'vitest';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { buildDeadlineCsv, deadlineCsvChunks, DEADLINE_PRICED_COLUMNS, pricedOrder } from './csv';
import { PricedRoutes } from './deadline';
import { byDateCsvLine, parseByDateCsv, parseRunCsv } from '@/explorer/collector';
import type { LegSummary } from './types';

const ZONE = 'America/Denver';
const START = getLocalTimestampInTimezone('2026-09-04', '21:30', ZONE);
const DEADLINE = START + 100 * 86400;
const META = {
  planStart: START,
  timezone: ZONE,
  currentTE: 176,
  final: 490,
  effort: 'deadline',
  firstAscension: 'auto' as const,
  availability: null,
  seedChain: [],
  loadouts: [{ label: 'equipped in the backup', loadout: null }],
  generatedAt: START * 1000,
};
const leg = (endTE: number): LegSummary =>
  ({
    key: '2-sale-tier13',
    endTE,
    durationSeconds: 86400,
    maxELR: 1e12,
    endTime: START + 86400,
    tier13Unlocked: true,
  }) as LegSummary;
const route = (chain: number[], days: number) => ({
  chain,
  reachAt: START + days * 86400,
  ascendAt: START + days * 86400,
  spare: DEADLINE - (START + days * 86400),
  legs: chain.map(leg),
});

function log(rows: [string, number | null][]): PricedRoutes {
  const all = new PricedRoutes();
  for (const [key, days] of rows) {
    const t = days === null ? NaN : START + days * 86400;
    all.add(key, t, t);
  }
  return all;
}

describe('every priced route in the By a date CSV', () => {
  const all = log([
    ['200,248', 99],
    ['200,250', 101], // misses the date
    ['195,248', 90],
    ['205,260', 140], // misses, by more
    ['210,300', null], // could not be priced
    ['198,252', 98],
  ]);
  const kept = [route([198, 252], 98), route([195, 248], 90), route([200, 248], 99)];
  const csv = buildDeadlineCsv(kept, META, { deadline: DEADLINE, priced: 6, all }, 2);
  const lines = csv.split('\n');
  const summary = lines.filter(l => l.startsWith('priced,'));

  it('gives every priced route one summary line under its own header, after the leg rows', () => {
    expect(summary).toHaveLength(6);
    const head = lines.indexOf(DEADLINE_PRICED_COLUMNS.join(','));
    const firstLeg = lines.findIndex(l => /^\d/.test(l));
    expect(head).toBeGreaterThan(firstLeg);
    expect(lines.findIndex(l => l.startsWith('priced,'))).toBe(head + 1);
    expect(csv).toContain('# every route priced, one summary line each');
    // The leg section stops at the cap: the third kept route has its summary line only.
    const legRoutes = new Set(lines.filter(l => /^\d/.test(l)).map(l => l.split(',')[1]));
    expect([...legRoutes]).toEqual(['198 252', '195 248']);
  });

  it('orders them: making it (highest last stop, most spare), then missing, then unpriced', () => {
    expect(summary.map(l => l.split(',')[1])).toEqual([
      '198 252',
      '195 248',
      '200 248',
      '205 260',
      '200 250',
      '210 300',
    ]);
    const cells = summary.map(l => l.split(','));
    expect(cells.map(c => c[8])).toEqual([
      'yes',
      'yes',
      'yes',
      "doesn't make it",
      "doesn't make it",
      "couldn't be priced",
    ]);
    // Late is negative spare; unpriced has no times.
    expect(Number(cells[4][6])).toBeCloseTo(-24, 5);
    expect(cells[5].slice(4, 8)).toEqual(['', '', '', '']);
    expect(Number(cells[0][7])).toBeCloseTo(98, 4);
  });

  it('is read back by the Explorer, and old readers pass the summary lines by', () => {
    const parsed = parseByDateCsv(csv);
    expect(parsed.priced).toHaveLength(6);
    expect(parsed.priced.filter(r => r.makes)).toHaveLength(3);
    expect(parsed.priced[5].makes).toBeNull();
    expect(parsed.kept.map(r => r.chain.join(' '))).toEqual(['198 252', '195 248']);
    expect(parsed.pricedStated).toBe(6);
    const run = parseRunCsv(csv);
    expect(run.chains).toEqual([]);
    expect(run.byDate?.priced).toHaveLength(6);
    expect(byDateCsvLine(parsed)).toMatch(/6 routes priced, 3 make the date/);
  });

  it('still reads a By a date CSV written before the summary lines', () => {
    const old = buildDeadlineCsv(kept, META, { deadline: DEADLINE, priced: 6 });
    expect(old).not.toContain('priced,');
    const parsed = parseByDateCsv(old);
    expect(parsed.priced).toEqual([]);
    expect(parsed.kept.map(r => r.chain.join(' '))).toEqual(['198 252', '195 248', '200 248']);
    expect(byDateCsvLine(parsed)).toMatch(/3 routes kept/);
  });

  it('comes out a chunk at a time, the same text as built whole', () => {
    const chunks = [...deadlineCsvChunks(kept, META, { deadline: DEADLINE, priced: 6, all }, 2)];
    expect(chunks.join('')).toBe(csv);
  });

  it('sorts a big list quickly and stably', () => {
    const big = new PricedRoutes();
    for (let i = 0; i < 50_000; i++)
      big.add(`${100 + (i % 50)},${200 + (i % 97)}`, START + (i % 1000) * 3600, START + (i % 1000) * 3600);
    const t0 = performance.now();
    const order = pricedOrder(big, DEADLINE);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(order).toHaveLength(50_000);
  });
});
