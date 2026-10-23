/**
 * A run's details against its player's instant baseline (wireframe B2, lib/instantBaseline.ts): the line and the list
 * Instant baseline, Fast, Exact, Custom, only when the row carries `baseline` (the collector must keep that field).
 */
import { describe, expect, it } from 'vitest';
import { ref, type Plugin } from 'vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import BaselineChip from '../myruns/BaselineChip.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { BOARD_ROWS } from '@/lib/instantBaseline';
import type { BoardRow } from '@/lib/leaderboardRank';

const baseline = { chain: [197, 246, 298, 352, 418, 490], end: Date.UTC(2028, 1, 9, 22, 0) / 1000, endTE: 490, at: Date.UTC(2026, 9, 19, 2, 1) };
const exact: BoardRow = {
  id: 'r3',
  chain: [197, 248, 301, 356, 421, 490],
  finalTE: 490,
  durationDays: 477.2,
  timezone: 'UTC',
  startUtc: '2026-10-20T04:00:00Z',
  endUtc: '2028-02-08T10:00:00Z',
  backupAgeHours: 26,
  level: 'normal',
  acct: 'a1',
  submittedAt: '2026-10-20T04:12:00Z',
  baseline,
};
const fast: BoardRow = { ...exact, id: 'r2', level: 'quick', endUtc: '2028-02-08T17:10:00Z', submittedAt: '2026-10-19T05:00:00Z' };
const board = (rows: BoardRow[]): Plugin => ({ install: app => void app.provide(BOARD_ROWS, ref(rows)) });
const render = async (r: BoardRow, rows: BoardRow[] = [r]) =>
  renderHtml(LeaderboardRunDetail, { row: r, csvRoot: 'https://collector.test/csv', viewZone: 'UTC' }, {}, [board(rows)]);

describe('vs their instant baseline (B2)', () => {
  it("another player's run: their line and the list, this run marked, Custom not run", async () => {
    const html = await render(exact, [exact, fast]);
    const t = textOf(html);
    expect(t).toContain('vs their instant baseline: 1.5 days sooner (Exact)');
    expect(t).toContain('Compared with their instant baseline');
    // Dates in the viewer's zone, in the runner's locale.
    expect(t).toMatch(/Instant baseline \S+ \S+ 2028, 10:00 pm \(UTC\) · /i);
    expect(t).toMatch(/Fast \S+ \S+ 2028, 0?5:10 pm \(UTC\) 1.2 days sooner/i);
    expect(t).toMatch(/Exact this run \S+ \S+ 2028, 10:00 am \(UTC\) 1.5 days sooner/i);
    expect(t).toMatch(/Custom not run ·/);
    expect(html).toContain('data-testid="run-baseline-exact"');
  });
  it('your own run says "your"', async () => {
    expect(textOf(await render({ ...exact, yours: true }))).toContain('vs your instant baseline: 1.5 days sooner (Exact)');
  });
  it('no baseline on the row: neither the line nor the list', async () => {
    const html = await render({ ...exact, baseline: undefined });
    expect(html).not.toContain('data-testid="run-baseline"');
    expect(textOf(html)).not.toContain('instant baseline');
  });
});

describe('BaselineChip', () => {
  it('green when the run beats the baseline; nothing without one', async () => {
    const html = await renderHtml(BaselineChip, { line: { lead: 'vs your instant baseline:', words: '1.2 days sooner', tail: '(Fast)', tone: 'better' } });
    expect(textOf(html)).toBe('vs your instant baseline: 1.2 days sooner (Fast)');
    expect(html).toContain('data-tone="better"');
    expect(await renderHtml(BaselineChip, { line: null })).not.toContain('baseline-chip');
  });
});
