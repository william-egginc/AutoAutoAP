/**
 * The Egg Day rule's words on My runs (lib/eggDayRule.ts, Jordan 22 Oct 2026), server-rendered:
 *   - Right now, a goal whose kept plans all land late: "No route finishes before Egg Day starts. The nearest is 7 hours
 *     after." with the nearest route marked "after Egg Day starts" (By a date: "before your date", "after your date");
 *   - the Egg Day tile: the same words instead of an answer, the nearest marked, the screen still offered;
 *   - a followed route that lands late: "· after Egg Day starts".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import SavedTile from './SavedTile.vue';
import type { GoalOption } from '@/lib/planGoals';
import type { Tile, TileAnswer } from '@/lib/savedTiles';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000;
const H = 3600;
const EGG_DAY_AT = Date.UTC(2027, 6, 14, 16) / 1000;
const MAR3 = Date.UTC(2027, 2, 3, 7) / 1000;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const race: GoalOption = {
  key: 'fastest-490',
  kind: 'race',
  label: 'Race to 490',
  name: 'Race to 490',
  deadline: null,
  state: 'plan',
  calculatedAt: (NOW - 3 * H) * 1000,
  open: { auto: 'fastest', depth: 'smart', target: 490 },
};
const eggLate: GoalOption = {
  key: 'eggday-2027',
  kind: 'eggday',
  label: 'Egg Day 2027',
  name: 'Egg Day 2027',
  deadline: EGG_DAY_AT,
  state: 'late',
  calculatedAt: null,
  open: { auto: 'by-date', byDate: { eggDay: true } },
  late: { count: 2, chain: [197, 222, 249], seconds: 7 * H },
};
const props = (o: Record<string, unknown> = {}) => ({
  card: null,
  onVirtue: true,
  currentEgg: 'integrity',
  teSoFar: 200,
  ascNow: 0,
  track: null,
  events: [],
  shownEvents: [],
  gear: null,
  now: NOW,
  zone: ZONE,
  saveSeconds: NOW - 3 * H,
  eggDayYear: 2027,
  goals: [race, eggLate],
  selectedGoal: 'eggday-2027',
  ...o,
});

describe('Right now: a goal with no plan in time', () => {
  it('Egg Day: said plainly, the nearest route marked, never shown as the plan', async () => {
    const html = await renderHtml(RightNowCard, props());
    const t = textOf(html);
    expect(t).toContain(
      'No route finishes before Egg Day starts. The nearest is 7 hours after. 197 222 249 · after Egg Day starts · Work it out ›'
    );
    expect(html).toContain('data-testid="now-no-route-in-time"');
    expect(html).not.toContain('data-testid="now-events"');
    // The switch's own line.
    expect(t).toContain('Egg Day 2027 no route in time');
  });

  it('By a date: "before your date", "after your date"', async () => {
    const date: GoalOption = { ...eggLate, key: `date-${MAR3}`, kind: 'date', label: 'By a date', name: 'By Mar 3, 2027', deadline: MAR3, late: { count: 1, chain: [230], seconds: 3 * H } };
    const t = textOf(await renderHtml(RightNowCard, props({ goals: [race, date], selectedGoal: `date-${MAR3}` })));
    expect(t).toContain('No route finishes before your date. The nearest is 3 hours after. 230 · after your date');
  });

  it('no timed nearest: the first sentence only', async () => {
    const t = textOf(await renderHtml(RightNowCard, props({ goals: [race, { ...eggLate, late: { count: 1, chain: null, seconds: null } }] })));
    expect(t).toContain('No route finishes before Egg Day starts. · Work it out ›');
    expect(t).not.toContain('The nearest');
  });

  it('a followed route that lands late is marked "after Egg Day starts"', async () => {
    const follow = { chain: [197, 222, 249], from: 'board', price: 'none', source: null, pricedSave: null, missesDate: true };
    const t = textOf(await renderHtml(RightNowCard, props({ goals: [race, { ...eggLate, state: 'none', late: undefined }], follow })));
    expect(t).toContain('Following your pick');
    expect(t).toContain('· after Egg Day starts');
    expect(t).not.toContain('lands after the date');
  });
});

describe('the Egg Day tile with no answer in time', () => {
  const lateAnswer: TileAnswer = {
    chain: [161, 198, 218, 249],
    end: EGG_DAY_AT + 7 * H,
    endTE: 249,
    spareHours: -7,
    calculatedAt: (NOW - H) * 1000,
    saveSeconds: NOW - 3 * H,
    fromTE: 186,
    source: 'board',
    how: 'search',
  };
  const tile = (late: Tile['late']): Tile => ({ goal: 'date', answer: null, olderSave: false, saveGapSeconds: null, sure: null, late });
  const render = (t: Tile) =>
    renderHtml(SavedTile, { tile: t, goal: 'date', title: 'Egg Day 2027', target: 490, now: NOW, zone: ZONE, standing: '', standingLabel: 'Egg Day' });

  it('says so, shows the nearest marked, and still offers the screen', async () => {
    const html = await render(tile({ answer: lateAnswer, seconds: 7 * H, count: 1 }));
    const t = textOf(html);
    expect(t).toContain('No route finishes before Egg Day starts. The nearest is 7 hours after.');
    expect(t).toContain('249 TE · 161 198 218 249 · after Egg Day starts');
    expect(t).toContain('Open Egg Day');
    expect(t).not.toContain('Not worked out for this save yet.');
    expect(t).not.toContain('How sure');
  });

  it('untimed: the first sentence only', async () => {
    const t = textOf(await render(tile({ answer: null, seconds: null, count: 1 })));
    expect(t).toContain('No route finishes before Egg Day starts.');
    expect(t).not.toContain('The nearest');
  });

  it('nothing at all: as before', async () => {
    const t = textOf(await render(tile(undefined)));
    expect(t).toContain('Not worked out for this save yet.');
    expect(t).not.toContain('No route finishes');
  });
});
