/**
 * My runs review, 22 Oct 2026 (bug 2): the shift due just after the save showed greyed as "passed" and Next step
 * skipped it while the save was still on the egg before it, so the plan's first action never showed. Done is now the
 * save's state (lib/nowPlan.ts `planEvents`): a step whose time has passed but whose effect the save doesn't show is
 * "Not done yet: shift to Curiosity (due 8:03 pm)", and Next step leads with it. Server-rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { mergeSimultaneousShifts, planEvents, tableEvents, type NowPlan, type SaveDone } from '@/lib/nowPlan';
import { howFar, nextStepText } from '@/lib/nowWords';
import type { CardPlan } from '@/composables/useNowPage';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const ZONE = 'America/Denver';
const H = 3600;
const D = 24 * H;
const SAVE = Date.UTC(2026, 9, 19, 0, 33) / 1000; // Sun Oct 18, 2026 at 6:33 pm in Denver
const NOW = SAVE + 2.5 * H; // 9:03 pm: an hour after the shift was due

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
// The review's plan from the alt save (Humility, 142 TE): the shift to Curiosity at 8:03 pm comes first.
const CURIOSITY_AT = SAVE + 1.5 * H; // 8:03 pm
const HUMILITY_AT = Date.UTC(2026, 9, 23, 22, 6) / 1000; // Fri Oct 23 at 4:06 pm
const KINDNESS_AT = Date.UTC(2026, 9, 24, 18, 7) / 1000; // Sat Oct 24 at 12:07 pm
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
const NOT_DONE = 'Not done yet: shift to Curiosity (due 8:03 pm)';

describe('a step due before now that the save hasn’t done', () => {
  it('the save still on Humility after 8:03 pm: the shift to Curiosity is not done yet, and it is next', () => {
    const ev = eventsFor(ON_HUMILITY);
    expect(ev[0]).toMatchObject({ kind: 'shift', egg: 'curiosity', past: false, notDone: true, next: true });
    expect(ev[1]).toMatchObject({ egg: 'humility', past: false, next: false });
    expect(ev[1].notDone).toBeUndefined();
    expect(howFar(ev[0], NOW, ZONE)).toBe('not done yet, due 1 h ago');
    expect(nextStepText(ev, 'fastest', NOW, ZONE)).toBe(`${NOT_DONE}, then Humility Oct 23 at 4:06 pm`);
  });

  it('Right now: Next step leads with it, the events show it in amber, not greyed "passed", with no calendar button', async () => {
    const html = await renderHtml(RightNowCard, cardProps(ON_HUMILITY));
    const t = textOf(html);
    expect(t).toContain(`Next step ${NOT_DONE}, then Humility Oct 23 at 4:06 pm`);
    expect(html).toContain('data-testid="now-event-notdone"');
    expect(html).not.toContain('data-testid="now-event-past"');
    expect(t).not.toContain('passed');
    expect(t).toContain(NOT_DONE);
    // The calendar: the shifts ahead and the prestige; a step already due is not added.
    expect(t).toContain('Add all 3 upcoming to calendar');
  });

  it('the save already on Curiosity: the shift is passed and Next step moves on', async () => {
    const ev = eventsFor(ON_CURIOSITY);
    expect(ev[0]).toMatchObject({ egg: 'curiosity', past: true, next: false });
    expect(ev[0].notDone).toBeUndefined();
    expect(ev[1]).toMatchObject({ egg: 'humility', next: true });
    const html = await renderHtml(RightNowCard, cardProps(ON_CURIOSITY));
    const t = textOf(html);
    expect(t).toContain('Next step Shift to Humility Oct 23 at 4:06 pm (in 4 days), then Kindness Oct 24 at 12:07 pm');
    expect(t).not.toContain('Not done yet');
    expect(html).toContain('data-testid="now-event-past"');
    expect(t).toContain('passed');
  });

  it('before 8:03 pm nothing is due: the shift is simply next', () => {
    const ev = eventsFor(ON_HUMILITY, SAVE + H);
    expect(ev[0]).toMatchObject({ egg: 'curiosity', past: false, next: true });
    expect(ev[0].notDone).toBeUndefined();
    expect(nextStepText(ev, 'fastest', SAVE + H, ZONE)).toBe(
      'Shift to Curiosity today at 8:03 pm (in 30 min), then Humility Oct 23 at 4:06 pm'
    );
  });

  it('a later step the save shows done marks the earlier ones done: on Humility after Oct 23, the Curiosity shift passed', () => {
    const later = HUMILITY_AT + H;
    const ev = eventsFor({ egg: 'humility', te: 148 }, later);
    expect(ev.slice(0, 2).map(e => [e.egg, e.past, !!e.notDone])).toEqual([
      ['curiosity', true, false],
      ['humility', true, false],
    ]);
    // Still on Curiosity then: the shift back to Humility is the one not done.
    const behind = eventsFor({ egg: 'curiosity', te: 148 }, later);
    expect(behind.slice(0, 2).map(e => [e.egg, e.past, !!e.notDone, e.next])).toEqual([
      ['curiosity', true, false, false],
      ['humility', false, true, true],
    ]);
  });

  it('a prestige is done when the save has its TE; short of it after its time, not done yet', () => {
    const after = SAVE + 51 * D + H;
    const short = eventsFor({ egg: 'kindness', te: 163 }, after).find(e => e.kind === 'prestige')!;
    expect(short).toMatchObject({ past: false, notDone: true, next: true });
    const there = eventsFor({ egg: 'kindness', te: 165 }, after).find(e => e.kind === 'prestige')!;
    expect(there).toMatchObject({ past: true, next: false });
  });

  it('without the save’s state (or its egg): the clock decides, as before', () => {
    expect(eventsFor(null)[0]).toMatchObject({ egg: 'curiosity', past: true, next: false });
    expect(eventsFor({ egg: null, te: 142 })[0]).toMatchObject({ egg: 'curiosity', past: true, next: false });
  });

  it('wiring: Right now passes the save’s egg and TE; the calendar skips a step already due', () => {
    const page = read('../../composables/useNowPage.ts');
    expect(page).toContain(
      'planEvents(cardPlan.value.plan, now.value, hasSave.value ? { egg: currentEgg.value, te: teSoFar.value } : null)'
    );
    expect(read('./RightNowCard.vue')).toContain("props.events.find(e => !e.past && !e.notDone && e.kind !== 'goal')");
    expect(read('./EventsTable.vue')).toContain("const addable = (e: PlanEvent) => !e.past && !e.notDone && e.kind !== 'goal';");
  });
});
