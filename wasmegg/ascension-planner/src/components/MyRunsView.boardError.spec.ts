/**
 * My runs when the leaderboard can't be read (QA break-it #3, 22 Oct 2026): a 500, 413, 429 or a body that
 * isn't JSON used to read "Your runs on the board · none yet", the same as an account that never sent a run.
 * Now the count, the scatter and the panel each say the board couldn't be read, and never "none yet".
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import RouteScatter from './myruns/RouteScatter.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const base = { eggDayAt: 1_815_840_000, eggDayYear: 2027, zone: 'UTC', rows: [] };

describe('Your routes at a glance, with the board unread', () => {
  it('says the board could not be read and the runs are safe, not "none yet"', async () => {
    const t = textOf(await renderHtml(RouteScatter, { ...base, boardFailed: 'read' }));
    expect(t).toMatch(/Couldn't read the leaderboard right now\. Your runs are safe on this \w+\./);
    expect(t).toContain("· couldn't read the leaderboard");
    expect(t).not.toContain('none yet');
    expect(t).not.toContain('No routes of yours yet');
  });

  it('unreachable: the same, in its own words', async () => {
    const t = textOf(await renderHtml(RouteScatter, { ...base, boardFailed: 'unreachable' }));
    expect(t).toContain("Couldn't reach the leaderboard.");
    expect(t).not.toContain('none yet');
  });

  it('a board that answered empty still says none yet', async () => {
    const t = textOf(await renderHtml(RouteScatter, { ...base, boardFailed: null }));
    expect(t).toContain('none yet');
  });
});

describe('MyRunsView wiring', () => {
  const view = read('MyRunsView.vue');
  it('the board part listens for the failure, says so in its count, and stays open', () => {
    expect(view).toContain('@failed="k => (boardFailed = k)"');
    expect(view).toContain('{{ boardCountText }}');
    expect(view).toContain(`" · couldn't read the leaderboard"`);
    expect(view).toContain('if (!boardFailed.value) return countText(boardCount.value);');
    expect(view).toContain('(open.board = n !== 0 || !!failed)');
    expect(view).toContain(':board-failed="boardFailed"');
  });
  it('the panel emits why its load failed, and null once it answers', () => {
    const panel = read('auto/LeaderboardPanel.vue');
    expect(panel).toContain("watch(failedKind, k => myRunsMode.value && emit('failed', k));");
    expect(panel).toMatch(/failedKind\.value = null;\n {2}\} catch \(e\) \{/);
  });
});
