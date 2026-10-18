/**
 * A run's details (LeaderboardRunDetail.vue, opened on My runs and Compare): its "What was searched"
 * line, from the row's `searched` (search/searched.ts `searchedWords`), or "not recorded (older run)".
 */
import { describe, expect, it } from 'vitest';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { BoardRow } from '@/lib/leaderboardRank';

const row: BoardRow = {
  id: 'r1',
  chain: [195, 230, 320],
  finalTE: 320,
  durationDays: 100,
  timezone: 'UTC',
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-10T00:00:00Z',
};
const render = async (r: BoardRow) =>
  textOf(await renderHtml(LeaderboardRunDetail, { row: r, csvRoot: 'https://collector.test/csv', viewZone: 'UTC' }));

describe('What was searched', () => {
  it('recorded: the boxes in words', async () => {
    const t = await render({ ...row, searched: '195-197:2; 209-240:1; last 300-320; ascensions: 3' });
    expect(t).toContain('What was searched Stops: 195-197 (every 2), 209-240; last stop 300-320; 3 ascensions');
  });
  it('not recorded: an older run says so', async () => {
    expect(await render(row)).toContain('What was searched not recorded (older run)');
  });
  it('a re-check line was never searched: no line', async () => {
    expect(await render({ ...row, recheckOf: 'r0' })).not.toContain('What was searched');
  });
});
