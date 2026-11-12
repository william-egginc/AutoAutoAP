/**
 * THE LEADERBOARD NEVER MENTIONS THE SILO TRICK (Jordan, 11 Nov 2026: "leaderboard rows must not mention the silo trick,
 * on or off"). Setup's Silo trick (stores/chainSearch.ts `siloTrick`) is local: it goes into the run fingerprint, the
 * result key and the instant answer key, none of which a board row carries, and the submission (search/submission.ts)
 * has no field for it. So a board row, whatever the run's setting, has no silo-trick words.
 *
 * A guard, not a failing-first spec: at 100c7b4d8 nothing on the board said it (spec-tidy). It pins that (1) a row's
 * details, with every setup field the board shows filled in, have no "silo", and (2) the board's components and the
 * modules that build or read its rows never name the setting.
 */
import { readFileSync, readdirSync } from 'node:fs';
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
  window: '8-23',
  holdShifts: true,
  firstAscension: 'continue',
  timeOff: [{ from: '2026-11-01', to: '2026-11-03' }],
  searched: '195-197:2; 209-240:1; last 300-320; ascensions: 3',
  level: 'fast',
  backupTE: 195,
  backupAgeHours: 2,
};

describe('the Leaderboard and the silo trick', () => {
  it("a row's details never say it", async () => {
    const t = textOf(await renderHtml(LeaderboardRunDetail, { row, csvRoot: 'https://collector.test/csv', viewZone: 'UTC' }));
    expect(t).toContain('What was searched');
    expect(t).not.toMatch(/silo/i);
  });

  it("the board's components and its row builders never name the setting", () => {
    const files = [
      'components/auto/LeaderboardPanel.vue',
      'components/auto/LeaderboardPlanList.vue',
      'components/auto/LeaderboardRunDetail.vue',
      'components/auto/MyRunsList.vue',
      'lib/leaderboardRank.ts',
      'lib/leaderboardSort.ts',
      'lib/boardWords.ts',
      'search/submission.ts',
      'search/csv.ts',
      'search/searched.ts',
      'search/startProvenance.ts',
      // Insights and the Route Explorer read the same rows.
      ...readdirSync(new URL('../../explorer/', import.meta.url), { recursive: true })
        .map(String)
        .filter(f => /\.(ts|vue)$/.test(f) && !f.includes('.spec.'))
        .map(f => `explorer/${f}`),
    ];
    for (const f of files) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/silo ?trick|siloTrick/i);
    }
  });
});
