/**
 * Your runs' chip bar (RunsExploreBar.vue) rendered on the server at several run sets, through the list that holds it
 * (MyRunsList.vue): no bar under 4 runs, chips only for values the runs have, 44 px tap targets on a phone, chips
 * that wrap and nothing that scrolls sideways, and the player's words.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import MyRunsList from '../auto/MyRunsList.vue';
import RunsExploreBar from './RunsExploreBar.vue';
import type { BoardRow } from '@/lib/leaderboardRank';
import { chipGroups, emptyExplore } from '@/lib/runsExplore';
import { EGG_DAY, mix } from '@/test/myRunsMix';

const NOW = Date.parse('2026-10-12T18:00:00Z');
const base = { csvRoot: 'https://collector.test/csv', viewZone: 'UTC', eggDayAt: EGG_DAY, eggDayYear: 2027, nowMs: NOW };
let n = 0;
const race = (over: Partial<BoardRow> = {}): BoardRow => ({
  id: `x${++n}`,
  chain: [250, 300, 490],
  finalTE: 490,
  durationDays: 20 + n,
  startUtc: `2026-10-0${(n % 9) + 1}T00:00:00Z`,
  timezone: 'UTC',
  receivedAt: '2026-10-12T12:00:00Z',
  level: 'quick',
  ...over,
});
const list = (rows: BoardRow[], extra: Record<string, unknown> = {}) => renderHtml(MyRunsList, { ...base, rows, ...extra });

describe('RunsExploreBar at several run sets', () => {
  it('1 and 3 runs: no bar', async () => {
    expect(await list([race()])).not.toContain('data-testid="runs-explore"');
    expect(await list([race(), race({ level: 'normal' }), race({ chain: [490] })])).not.toContain('data-testid="runs-explore"');
  });

  it('4 runs all alike: the bar is only Sort, Stops and "4 of 4 runs"', async () => {
    const html = await list([race(), race(), race(), race()]);
    const t = textOf(html);
    expect(html).toContain('data-testid="runs-explore"');
    expect(t).toContain('4 of 4 runs');
    expect(html).not.toMatch(/data-testid="runs-explore-(goal|asc|level|hours|when)"/);
    expect(t).toContain('Sort Best first Newest Fastest finish Most TE Fewest ascensions');
  });

  it('4 runs with two levels and two lengths: only those groups, only those chips', async () => {
    const html = await list([race(), race({ level: 'light', atOnce: true }), race({ chain: [490] }), race()]);
    expect(html).toContain('data-testid="runs-explore-level"');
    expect(html).toContain('data-testid="runs-explore-asc"');
    expect(html).not.toContain('data-testid="runs-explore-goal"');
    expect(html).toContain('data-testid="runs-chip-level-instant"');
    expect(html).toContain('data-testid="runs-chip-level-Fast"');
    expect(html).not.toContain('data-testid="runs-chip-level-Exact"');
    expect(html).not.toContain('data-testid="runs-chip-level-Custom"');
    expect(textOf(html)).toContain('Level Instant answer 1 Fast 3');
  });

  it('the 25-run mix: goal, ascensions, hours and sent chips; a pick and Clear filters', async () => {
    const html = await list(mix(), { initialExplore: { hours: ['mine'] } });
    for (const g of ['goal', 'asc', 'hours', 'when']) expect(html).toContain(`data-testid="runs-explore-${g}"`);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="runs-chip-hours-mine"/);
    expect(html).toContain('data-testid="runs-explore-clear"');
    expect(textOf(html)).toMatch(/\d+ of 25 runs Clear filters/);
  });
});

describe('RunsExploreBar on a phone', () => {
  const groups = chipGroups(mix(), emptyExplore(), { eggDayAt: EGG_DAY, eggDayYear: 2027, mainTarget: 490, nowMs: NOW, zone: 'UTC' });
  const render = () => renderHtml(RunsExploreBar, { groups, sort: 'best', stops: '', shown: 3, total: 25, active: 1 });

  it('every button and the stops box are 44 px tall on a phone', async () => {
    const html = await render();
    const controls = html.match(/<(button|input)[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThan(10);
    for (const c of controls) expect(c).toContain('min-h-[44px]');
  });

  it('chips wrap; nothing scrolls sideways or refuses to wrap', async () => {
    const html = await render();
    expect(html).not.toMatch(/overflow-x-(auto|scroll)|whitespace-nowrap|flex-nowrap|\bw-\[\d{3,}px\]/);
    expect(html.match(/flex flex-wrap/g)?.length).toBeGreaterThanOrEqual(groups.length + 2);
  });

  it('player words only', async () => {
    const t = textOf(await render());
    expect(t).toContain('3 of 25 runs');
    expect(t).toContain('Clear filters');
    expect(t).not.toMatch(/\b(Light|table|chain|checkpoint)\b/i);
    expect(t).not.toMatch(/\d{1,2}:\d\d(?! ?[ap]m)/);
  });
});
