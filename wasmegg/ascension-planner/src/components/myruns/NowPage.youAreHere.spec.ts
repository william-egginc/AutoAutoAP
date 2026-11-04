/**
 * YOU ARE HERE (Jordan, 1 Nov 2026): a row between the last passed row and the next one in Right now's events table,
 * and a tag on the step you are in under Full timeline, whose ascension opens by default. Copy of notDone.spec's setup.
 * My runs review, 22 Oct 2026 (bug 2): the shift due just after the save showed greyed as "passed" and Next step
 * skipped it while the save was still on the egg before it, so the plan's first action never showed. Done is now the
 * save's state (lib/nowPlan.ts `planEvents`): a step whose time has passed but whose effect the save doesn't show is
 * "Not done yet: shift to Curiosity (due 8:03 PM)", and Next step leads with it. Server-rendered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { mergeSimultaneousShifts, planEvents, tableEvents, type NowPlan, type SaveDone } from '@/lib/nowPlan';
import { howFar, nextStepText } from '@/lib/nowWords';
import type { CardPlan } from '@/composables/useNowPage';

const ZONE = 'America/Denver';
const H = 3600;
const D = 24 * H;
const SAVE = Date.UTC(2026, 9, 19, 0, 33) / 1000; // Sun Oct 18, 2026 at 6:33 PM in Denver
const NOW = SAVE + 2.5 * H; // 9:03 PM: an hour after the shift was due

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts']) =>
  ({
    key: 'continue',
    endTE,
    durationSeconds: end - start,
    maxELR: 0,
    endTime: end,
    tier13Unlocked: false,
    startTime: start,
    shifts,
    endEgg: { egg: 'kindness', te: 30 },
  }) as LegSummary;
// The review's plan from the alt save (Humility, 142 TE): the shift to Curiosity at 8:03 PM comes first.
const CURIOSITY_AT = SAVE + 1.5 * H; // 8:03 PM
const HUMILITY_AT = Date.UTC(2026, 9, 23, 22, 6) / 1000; // Fri Oct 23 at 4:06 PM
const KINDNESS_AT = Date.UTC(2026, 9, 24, 18, 7) / 1000; // Sat Oct 24 at 12:07 PM
const legs = [
  leg(SAVE, SAVE + 51 * D, 165, [
    { at: CURIOSITY_AT, egg: 'curiosity', fromEgg: 'humility', te: 34 },
    { at: HUMILITY_AT, egg: 'humility', fromEgg: 'curiosity', te: 33 },
    { at: KINDNESS_AT, egg: 'kindness', fromEgg: 'humility', te: 36 },
  ]),
  leg(SAVE + 52 * D, SAVE + 300 * D, 490, []),
];
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [165, 490],
  end: SAVE + 300 * D,
  endTE: 490,
  legs,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: (SAVE + 600) * 1000,
  planStart: SAVE,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
};
const card: CardPlan = { plan, goal: { goal: 'fastest', target: 490, deadline: null }, state: 'this-save' };
const eventsFor = (save: SaveDone | null, now = NOW) => mergeSimultaneousShifts(planEvents(plan, now, save), ZONE);
const cardProps = (save: SaveDone | null, now = NOW) => {
  const events = eventsFor(save, now);
  return {
    card,
    onVirtue: true,
    currentEgg: save?.egg ?? 'humility',
    teSoFar: save?.te ?? 142,
    ascNow: 1,
    track: { kind: 'same-save' },
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now,
    zone: ZONE,
    saveSeconds: SAVE,
    eggDayYear: 2027,
  };
};
const ON_HUMILITY: SaveDone = { egg: 'humility', te: 142 };
const ON_CURIOSITY: SaveDone = { egg: 'curiosity', te: 142 };
const table = (html: string) => {
  const t = textOf(html);
  return t.slice(t.indexOf('What When How far'));
};
const HERE = 'You are here · Curiosity · 142 TE · from your save of Oct 18 at 6:33 PM';

describe('You are here, in the events table', () => {
  it('sits between the last passed row and the next one', async () => {
    const t = table(await renderHtml(RightNowCard, cardProps(ON_CURIOSITY)));
    const passed = t.indexOf('Shift to Curiosity');
    const here = t.indexOf(HERE);
    const next = t.indexOf('Shift to Humility');
    expect(here).toBeGreaterThan(passed);
    expect(next).toBeGreaterThan(here);
  });
  it('has no Add button and its own test id', async () => {
    const html = await renderHtml(RightNowCard, cardProps(ON_CURIOSITY));
    expect(html).toContain('data-testid="now-event-here"');
    const row = html.slice(html.indexOf('data-testid="now-event-here"'));
    const rowEnd = row.slice(0, row.indexOf('</tr>'));
    expect(rowEnd).not.toContain('Add');
  });
  it('before the first row: at the top, when nothing has passed', async () => {
    const t = table(await renderHtml(RightNowCard, cardProps({ egg: 'humility', te: 142 }, SAVE + H)));
    expect(t).toContain('You are here · Humility');
    expect(t.indexOf('You are here · Humility')).toBeLessThan(t.indexOf('Shift to Curiosity'));
  });
  it('a not-done row comes after it (it has not passed)', async () => {
    const t = table(await renderHtml(RightNowCard, cardProps(ON_HUMILITY)));
    expect(t).toContain('You are here · Humility · 142 TE');
    expect(t.indexOf('You are here · Humility · 142 TE')).toBeLessThan(t.indexOf('Not done yet'));
  });
  it('not shown when the save’s egg is unknown or off virtue', async () => {
    const p = { ...cardProps(ON_CURIOSITY), currentEgg: null };
    expect(textOf(await renderHtml(RightNowCard, p))).not.toContain('You are here');
  });
});

describe('You are here, in the Full timeline', () => {
  it('tags the step you are in and opens its ascension', async () => {
    const html = await renderHtml(RightNowCard, cardProps(ON_CURIOSITY));
    const tl = html.slice(html.indexOf('data-testid="route-timeline"'));
    const tagged = tl.slice(0, tl.indexOf('data-testid="route-timeline-egg-summary"'));
    expect(tagged).toContain('data-testid="you-are-here"');
    // A1's line is open, A2's is not.
    const lines = tl.split('data-testid="route-timeline-line"');
    expect(lines[0]).toMatch(/<details[^>]*open/);
    expect(lines[1]).not.toMatch(/^[^>]*open/);
    // the Curiosity step carries it, the Humility opener does not
    const steps = tl.split('data-testid="route-timeline-step"').slice(1);
    const withTag = steps.filter(s => s.slice(0, s.indexOf('</li>')).includes('you are here'));
    expect(withTag).toHaveLength(1);
    expect(withTag[0].slice(0, 400)).toContain('Curiosity');
  });
  it('no tag when the time is before the route or after it', async () => {
    expect(await renderHtml(RightNowCard, cardProps(ON_CURIOSITY, SAVE + 400 * D))).not.toContain('you-are-here');
    expect(await renderHtml(RightNowCard, cardProps(ON_CURIOSITY))).toContain('you-are-here');
  });
});
