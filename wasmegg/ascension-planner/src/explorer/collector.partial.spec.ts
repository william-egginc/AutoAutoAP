/**
 * A provisional row's CSV is a CSV SO FAR (a progress send, 10 Oct): part of a run, replaced by its
 * next send. Nothing on the Explorer that loads a run's CSV may read it as a run's whole table, and
 * every such reader goes by `hasCsv`, so the rows this module hands out never say `hasCsv` for one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllRows, fetchFlagged, onlyFinalCsv, parseRunCsv, type CollectorRow } from './collector';

const BASE = 'https://c.example.dev';
const ROWS = [
  { id: 'fin', chain: [140, 490], durationDays: 300, finalTE: 490, hasCsv: true },
  { id: 'prov', chain: [141, 490], durationDays: 310, finalTE: 490, hasCsv: true, provisional: true },
  { id: 'bare', chain: [142, 490], durationDays: 320, finalTE: 490, hasCsv: false, provisional: true },
  { id: 'byd', chain: [200, 335], durationDays: 20, deadline: 1_800_000_000, hasCsv: true, provisional: true },
];

afterEach(() => vi.unstubAllGlobals());

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ count: ROWS.length, rows: ROWS }), { status: 200 }))
  );
}

describe("a provisional row's CSV so far", () => {
  it('is never offered as a run table by /all, and the row says it has a partial one', async () => {
    stub();
    const all = await fetchAllRows(BASE);
    const by = new Map(all.rows.map(r => [r.id, r]));
    expect(by.get('fin')).toMatchObject({ hasCsv: true });
    expect(by.get('fin')).not.toHaveProperty('partialCsv');
    expect(by.get('prov')).toMatchObject({ hasCsv: false, partialCsv: true, provisional: true });
    expect(by.get('bare')).toMatchObject({ hasCsv: false });
    expect(by.get('bare')).not.toHaveProperty('partialCsv');
    expect(all.byDate[0]).toMatchObject({ hasCsv: false, partialCsv: true });
  });

  it('nor by the flagged board', async () => {
    stub();
    const rows = await fetchFlagged(BASE);
    expect(rows.find(r => r.id === 'prov')).toMatchObject({ hasCsv: false, partialCsv: true });
  });

  it('leaves a row it does not concern exactly as it was', () => {
    const row = ROWS[0] as unknown as CollectorRow;
    expect(onlyFinalCsv(row)).toBe(row);
  });

  it('so the readers that load a run by hasCsv (account tables, sweep curves, a run scatter) load only final CSVs', async () => {
    stub();
    const { rows } = await fetchAllRows(BASE);
    expect(rows.filter(r => r.hasCsv).map(r => r.id)).toEqual(['fin']);
  });

  it('says so in its own header, which parseRunCsv reads', () => {
    const head = [
      '# ascension-planner chain search — every chain this run priced',
      '# current TE 132 -> final target 490',
    ];
    const rows = ['rank,chain,prestiges,total_days', '1,140 490,2,300.5,0', ''];
    const partial = [head[0], '# in progress, 40 of 90 chains priced so far: a partial CSV', ...head.slice(1), ...rows];
    expect(parseRunCsv(partial.join('\n')).partial).toBe(true);
    expect(parseRunCsv([...head, ...rows].join('\n')).partial).toBe(false);
  });
});
