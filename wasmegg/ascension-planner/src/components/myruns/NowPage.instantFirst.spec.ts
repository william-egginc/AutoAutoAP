/**
 * Right now, instant first (part B, wireframes/price-route-v2 R1 and R2, 23 Oct 2026): the instant answer drives until
 * a Fast, Exact or Custom result for the same goal takes over (lib/searchPlan.ts). Through useNowPage with the
 * synthetic save (id EI0000000000000000, never printed), and the card server-rendered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import { drivingPlan, type SnapSearch } from '@/lib/searchPlan';
import type { CardPlan } from '@/composables/useNowPage';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { instantSnapKey, readSnapshot, writeSnapshot } from '@/search/instantSnapshot';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;

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
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts'] = []) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts, endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;

const A_ID = 'EI0000000000000000';
function save(hoursAgo: number) {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - hoursAgo * H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

describe('useNowPage: the instant answer drives until a better search result exists', () => {
  it('Egg Day: instant, then a Fast result that makes the date, Go back, and Use your Fast run', async () => {
    loadAndSyncBackup(A_ID, save(1), 'plan_next');
    rollUpPendingTE();
    const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
    resetGoalChoice();
    const store = useChainSearchStore();
    const target = store.finalTE;
    const now = Math.floor(Date.now() / 1000);
    const eggDayAt = eggDaySeconds(nextEggDayYear());
    const key = instantSnapKey(instantKeyFromStores(eggDayAt, target));
    const tableLegs = [
      { to: 200, endTE: 200, start: now - H, end: now + 30 * H },
      { to: 240, endTE: 240, start: now + 30 * H, end: eggDayAt - 2 * D },
    ];
    writeSnapshot(key, {
      at: Date.now() - 60_000,
      header: {},
      result: { best: null, byAscensions: [], byDate: { chain: [200, 240], end: eggDayAt - 2 * D, legs: tableLegs } },
      exact: {},
      dateExact: null,
      answerStart: now - H,
    } as never);

    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    page.selectGoal(`eggday-${nextEggDayYear()}`);
    expect(page.cardPlan.value?.plan.exact).toBe(false);
    expect(page.cardPlan.value?.plan.from).toBeUndefined();
    expect(page.cardPlan.value?.driving?.takeover).toBeNull();

    // A Fast result, kept with the snapshot: 1 TE less, more spare, makes the date: it drives.
    const found: SnapSearch = {
      level: 'Fast',
      chain: [201, 239],
      end: eggDayAt - 2.5 * D,
      endTE: 239,
      legs: [leg(now - H, now + 28 * H, 201, [{ at: now + 5 * H, egg: 'humility', fromEgg: 'integrity', te: 40 }]), leg(now + 28 * H, eggDayAt - 2.5 * D, 239)],
      at: Date.now() - 10_000,
      planStart: now - H,
    };
    writeSnapshot(key, { ...(readSnapshot(key) as object), search: found, at: Date.now() - 30_000 } as never);
    // A new page reads it (the snapshot is parsed once per key per page).
    resetGoalChoice();
    const page2 = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    page2.selectGoal(`eggday-${nextEggDayYear()}`);
    expect(page2.cardPlan.value?.plan.from).toEqual({ level: 'Fast', at: found.at });
    expect(page2.cardPlan.value?.plan.chain).toEqual([201, 239]);
    expect(page2.cardPlan.value?.driving?.takeover).toBe('makes-date');
    expect(page2.events.value.some(e => e.kind === 'shift' && e.egg === 'humility')).toBe(true);
    // The Egg Day tile names it the same way.
    expect(page2.eggDayTile.value.answer?.found).toBe('Fast');

    page2.goBackToInstant();
    expect(page2.cardPlan.value?.plan.from).toBeUndefined();
    expect(page2.cardPlan.value?.driving?.wentBack).toBe(true);
    page2.useSearchResult();
    expect(page2.cardPlan.value?.plan.from?.level).toBe('Fast');
    scope.stop();
  });

  it("Fastest: the store's finished result drives at once and is kept with the snapshot", async () => {
    loadAndSyncBackup(A_ID, save(1), 'plan_next');
    rollUpPendingTE();
    const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
    resetGoalChoice();
    const store = useChainSearchStore();
    const target = store.finalTE;
    const now = Math.floor(Date.now() / 1000);
    const first = Math.floor(store.currentTE) + 5;
    const key = instantSnapKey(instantKeyFromStores(null, target));
    writeSnapshot(key, {
      at: Date.now() - 60_000,
      header: {},
      result: {
        best: { chain: [first, target], end: now + 100 * H, legs: [{ to: first, endTE: first, start: now - H, end: now + 10 * H }, { to: target, endTE: target, start: now + 10 * H, end: now + 100 * H }] },
        byAscensions: [],
      },
      exact: {},
      answerStart: now - H,
    } as never);
    // A finished Exact run, 2 h sooner than the instant answer.
    store.bestChain = [first, target];
    store.bestDays = (99 * H - 1 * H) / D + 0; // ends at now + 98 h from a start an hour ago
    store.bestLegs = [leg(now - H, now + 9 * H, first), leg(now + 9 * H, now + 98 * H, target)];
    store.planStartUsed = now - H;
    store.chainResultAt = Date.now() - 5000;
    store.runKindUsed = 'smart';
    store.runSettingsUsed = { effort: 'normal' } as never;

    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    page.selectGoal(`fastest-${target}`);
    expect(page.cardPlan.value?.plan.from?.level).toBe('Exact');
    expect(page.cardPlan.value?.driving?.takeover).toBe('sooner');
    expect((readSnapshot(key) as { search?: SnapSearch } | null)?.search?.level).toBe('Exact');
    scope.stop();
  });
});

// ------------------------------------------------------------------------------------ the card (R1, R2)

const NOW = Date.UTC(2026, 9, 22, 18, 3) / 1000; // Thu Oct 22, 11:03 am Pacific
const DEADLINE = eggDaySeconds(2027); // Egg Day 2027's start
const snap = {
  at: NOW * 1000,
  answerStart: NOW,
  result: {
    best: null,
    byAscensions: [],
    byDate: {
      chain: [197, 228, 255, 278, 313],
      legs: [
        { to: 197, endTE: 197, start: NOW, end: NOW + 5 * D + 17 * H + 12 * 60 },
        { to: 228, endTE: 228, start: NOW + 6 * D, end: NOW + 60 * D },
        { to: 255, endTE: 255, start: NOW + 60 * D, end: NOW + 120 * D },
        { to: 278, endTE: 278, start: NOW + 120 * D, end: NOW + 200 * D },
        { to: 313, endTE: 313, start: NOW + 200 * D, end: DEADLINE - 1.46 * D },
      ],
      end: DEADLINE - 1.46 * D,
    },
    byDateByAscensions: [],
  },
};
const fastFound: SnapSearch = {
  level: 'Fast',
  chain: [197, 227, 257, 285, 312],
  end: DEADLINE - 1.74 * D,
  endTE: 312,
  legs: [
    leg(NOW, NOW + 5 * D + 17 * H + 9 * 60, 197, [{ at: NOW + 27 * H + 44 * 60, egg: 'humility', fromEgg: 'integrity', te: 40 }]),
    leg(NOW + 6 * D, DEADLINE - 1.74 * D, 312),
  ],
  at: (NOW + 5 * H + 44 * 60) * 1000,
  planStart: NOW,
};
function cardFor(d: ReturnType<typeof drivingPlan>): Record<string, unknown> {
  const plan = d.plan as NowPlan;
  const card: CardPlan = {
    plan,
    goal: { goal: 'date', target: 490, deadline: DEADLINE },
    state: 'this-save',
    key: 'eggday-2027',
    name: 'Egg Day 2027',
    driving: d,
  };
  const events = planEvents(plan, NOW);
  return {
    card,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 186,
    ascNow: 1,
    track: null,
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: NOW,
    eggDayYear: 2027,
  };
}

describe('the card', () => {
  it('R1, from the instant answer: the pill, times rounded to the hour, no calendar, "run Fast"', async () => {
    const html = await renderHtml(RightNowCard, cardFor(drivingPlan(snap as never, 'date', DEADLINE)));
    const t = textOf(html);
    expect(t).toContain('from the instant answer worked out ahead of time; times rounded to the hour');
    expect(t).toContain('(instant answer)');
    expect(t).toContain('Prestige at 197 TE Oct 28 at around 4:00 am');
    expect(t).toContain('Wed, Oct 28 at around 4:00 am');
    expect(t).toContain('in 5 days');
    expect(t).toContain('Egg Day 2027 goal: 313 TE');
    expect(t).toMatch(/Jul 14, 2027 at \d+:00 am/);
    expect(t).toMatch(/\d+\.\d h spare \(instant\)/);
    expect(t).toContain('The instant answer keeps when each ascension ends, not each shift: run Fast for the shifts on your account.');
    expect(t).toMatch(/From the instant answer, rounded to the hour. For exact times on your account, run Fast ?\./);
    expect(html).toContain('data-testid="now-run-fast"');
    expect(t).not.toContain('Add to calendar');
    expect(t).not.toContain('＋ Add');
    expect(t).toContain('Run Fast Opens Highest TE by a date with your save and Fast selected');
  });

  it('R2, from your Fast run: the pill, exact times, calendar Add buttons, Go back', async () => {
    const d = drivingPlan({ ...snap, search: fastFound } as never, 'date', DEADLINE);
    const html = await renderHtml(RightNowCard, cardFor(d));
    const t = textOf(html);
    expect(t).toContain('from your Fast run, on your account done Oct 22 at 4:47 pm, your save of Oct 22 at 11:03 am');
    expect(t).toContain('(Fast run)');
    expect(t).toContain('Makes the date on your account, so it replaces the instant answer for the same goal: Go back to the instant answer');
    expect(t).toContain('Shift to Humility tomorrow at 2:47 pm');
    expect(t).toContain('Wed, Oct 28 at 4:12 am');
    expect(t).toContain('Add to calendar');
    expect(t).toContain('＋ Add');
    expect(t).toMatch(/goal: 312 TE .* h spare/);
    expect(t).not.toContain('(instant)');
    expect(t).toContain('Run Fast again');
  });

  it('gone back: the instant answer with "Use your Fast run"; a late result: the one line', async () => {
    const back = textOf(
      await renderHtml(RightNowCard, cardFor(drivingPlan({ ...snap, search: fastFound } as never, 'date', DEADLINE, { back: fastFound.at })))
    );
    expect(back).toContain('You went back from your Fast run (done Oct 22 at 4:47 pm). Use your Fast run');
    expect(back).toContain('from the instant answer');
    const late = { ...fastFound, end: DEADLINE + 3 * H };
    const kept = textOf(await renderHtml(RightNowCard, cardFor(drivingPlan({ ...snap, search: late } as never, 'date', DEADLINE))));
    expect(kept).toContain('Your Fast run lands after Egg Day starts, so Right now follows the instant answer.');
    expect(kept).not.toContain('Go back to the instant answer');
  });
});
