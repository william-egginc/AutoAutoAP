/**
 * Fix 22 on screen (server-rendered): Right now names the hours its plan was priced with and shows a better plan
 * priced with other hours only as a secondary line, as the Fastest tile does; two shifts at the same minute are one
 * row (and one calendar event); the next TE under two days is in hours.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import SavedTile from './SavedTile.vue';
import EventsTable from './EventsTable.vue';
import YourEggs from './YourEggs.vue';
import type { LegSummary } from '@/search/types';
import { mergeSimultaneousShifts, planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';
import { currentSetup, otherSetupLabel, pickCardPlan, pricedWithWords, setupCheck, todayIn, type PricedSetup } from '@/lib/currentAnswer';
import { buildTile } from '@/lib/savedTiles';
import { formatDate } from '@/lib/leaderboardRank';

/** The tile's own date format (the browser's locale: "Sep 17, 2028" or "17 Sept 2028"). */
const day = (unix: number) => formatDate(unix * 1000, ZONE, { month: 'short', day: 'numeric', year: 'numeric' });

const ZONE = 'America/Denver';
const SAVE = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Oct 15, 2:40 pm Denver
const NOW = Date.UTC(2026, 9, 16, 20, 0) / 1000; // Oct 16, 2:00 pm Denver
const TODAY = todayIn(NOW * 1000, ZONE);
const H = 3600;
const ANY: PricedSetup = { availability: null, timeOff: [] };
const MINE: PricedSetup = { availability: { days: [], fromHour: 7, toHour: 1, timezone: ZONE }, timeOff: [] };

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

const T = Date.UTC(2026, 9, 17, 10, 16) / 1000; // Sat Oct 17, 4:16 am Denver
const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts']) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts, endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;
const plan = (at: number, chain: number[], end: number, legs: LegSummary[] | null): NowPlan => ({
  goal: 'fastest',
  deadline: null,
  chain,
  end,
  endTE: 490,
  legs,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: at,
  planStart: SAVE,
  spareHours: null,
  runnerUpHours: 30,
  meta: { account: 'acct', goal: 'target 490', backupTime: SAVE },
  whatIf: null,
});
// 11:59 pm, 7 am to 1 am: 6 ascensions, Sep 22 2028; its first ascension shifts to Humility and straight on to
// Kindness at 4:16 am (Joo's H1 step, then K3).
const B = plan(Date.UTC(2026, 9, 16, 5, 59), [197, 240, 300, 350, 420, 490], Date.UTC(2028, 8, 22, 18) / 1000, [
  leg(SAVE, T + 13 * H, 197, [
    { at: T, egg: 'humility', fromEgg: 'integrity', te: 39 },
    { at: T + 25, egg: 'kindness', fromEgg: 'humility', te: 39 },
  ]),
]);
// 11:51 pm, any hour: 7 ascensions, Sep 17 2028.
const A = plan(Date.UTC(2026, 9, 16, 5, 51), [160, 197, 230, 280, 350, 420, 490], Date.UTC(2028, 8, 17, 18) / 1000, null);

function cardOf(): CardPlan {
  const pick = pickCardPlan(
    [
      { plan: B, goalIndex: 0, ownKey: true, check: currentSetup(MINE) },
      { plan: A, goalIndex: 0, ownKey: false, check: setupCheck(ANY, MINE, TODAY) },
    ],
    SAVE
  )!;
  return {
    plan: pick.candidate.plan,
    goal: { goal: 'fastest', target: 490, deadline: null },
    state: pick.state,
    pricedWith: pricedWithWords(pick.candidate.check),
    secondary: pick.secondary ? { plan: pick.secondary.plan, label: otherSetupLabel(pick.secondary.check) } : null,
  };
}
const cardProps = (card: CardPlan) => {
  const events = mergeSimultaneousShifts(planEvents(card.plan, NOW), ZONE);
  return {
    card,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 191,
    ascNow: 1,
    track: { kind: 'same-save' },
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: SAVE,
    eggDayYear: 2027,
  };
};

describe('Right now and the Fastest tile: one plan, the other hours secondary', () => {
  it('the card names the hours and the 11:59 pm plan; the 11:51 pm one is the secondary line', async () => {
    const html = await renderHtml(RightNowCard, cardProps(cardOf()));
    const t = textOf(html);
    expect(t).toContain('Plan for Race to 490 calculated Oct 15 at 11:59 pm');
    expect(t).toContain('(simulator check) · priced with your hours 7 am to 1 am, no time off · from your save of Oct 15 at 2:40 pm');
    expect(html).toContain('data-testid="now-secondary"');
    expect(t).toContain(`With any hour (before your hours changed): 7 ascensions, 490 TE on ${day(A.end)} (calculated Oct 15 at 11:51 pm)`);
  });

  it('the tile leads with the same plan and shows the same secondary line', async () => {
    const tile = buildTile({
      goal: 'fastest',
      target: 490,
      deadline: null,
      nowMs: NOW * 1000,
      save: { seconds: SAVE, te: 191 },
      snapshot: B,
      otherSnapshots: [{ plan: A, recorded: ANY }],
      lastChecked: null,
      history: [],
      board: [],
      saved: [],
      setupNow: { setup: MINE, today: TODAY },
    });
    const t = textOf(
      await renderHtml(SavedTile, { tile, goal: 'fastest', title: 'Fastest to 490', target: 490, now: NOW, zone: ZONE, standing: '', standingLabel: '' })
    );
    expect(t).toContain(day(B.end));
    expect(t).toContain('6 ascensions');
    expect(t).toContain('Calculated Oct 15 at 11:59 pm');
    expect(t).toContain(`With any hour (before your hours changed): 7 ascensions, 490 TE on ${day(A.end)} (calculated Oct 15 at 11:51 pm`);
  });
});

describe('two shifts at the same minute: one row', () => {
  it('the events table, Next step and "Add all upcoming" carry one row for the pair', async () => {
    const card = cardOf();
    const html = await renderHtml(RightNowCard, cardProps(card));
    const t = textOf(html);
    const pair = "Shift to Humility (Joo's H1 step: artifact swap), then straight to Kindness";
    expect(t).toContain(`${pair} tomorrow at 4:16 am`);
    expect(t.split(pair).length - 1).toBe(2); // Next step and the table, once each
    expect(t).not.toContain('Shift to Kindness');
    const events = mergeSimultaneousShifts(planEvents(card.plan, NOW), ZONE);
    const table = textOf(
      await renderHtml(EventsTable, { events, goal: 'fastest', goalName: 'Fastest to 490', now: NOW, zone: ZONE, saveWhen: 'x', calculatedWhen: 'y' })
    );
    // The pair and the prestige: two upcoming events, not three.
    expect(table).toContain('Add all 2 upcoming to calendar');
  });
});

describe('the next TE under two days: hours', () => {
  it('"next TE in 33 h", not "in 1 day"', async () => {
    const t = textOf(
      await renderHtml(YourEggs, {
        eggs: [{ egg: 'integrity', te: 38, progress: 0.35, current: true, nextInSeconds: 33 * H + (NOW - SAVE) }],
        facts: null,
        shiftsDone: 214,
        nextShiftCost: null,
        plannedShifts: null,
        clothedEquipped: null,
        clothedEarnings: null,
        now: NOW,
        saveSeconds: SAVE,
      })
    );
    expect(t).toContain('next TE in 33 h');
  });
});
