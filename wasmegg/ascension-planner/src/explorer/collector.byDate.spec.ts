/** `fetchAll` still hands the charts no By a date rows; `fetchAllRows` hands those back separately. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAll, fetchAllRows } from './collector';

const BASE = 'https://c.example.dev';
const ROWS = [
  { id: 'a', chain: [140, 490], durationDays: 300 },
  { id: 'd1', chain: [200, 335], durationDays: 20, deadline: 1_800_000_000 },
  { id: 'd2', chain: [335], durationDays: 10, deadline: 1_800_000_000 },
  { id: 'bad', chain: [], durationDays: 1 },
];

afterEach(() => vi.unstubAllGlobals());

function stub() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ count: ROWS.length, rows: ROWS }), { status: 200 }))
  );
}

describe('By a date rows', () => {
  it('keeps them out of the chart rows', async () => {
    stub();
    const rows = await fetchAll(BASE);
    expect(rows.map(r => r.id)).toEqual(['a']);
  });

  it('returns them separately, one-stop answers included', async () => {
    stub();
    const all = await fetchAllRows(BASE);
    expect(all.rows.map(r => r.id)).toEqual(['a']);
    expect(all.byDate.map(r => r.id)).toEqual(['d1', 'd2']);
  });
});
