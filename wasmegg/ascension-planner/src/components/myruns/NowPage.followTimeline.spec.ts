/**
 * Right now with a followed route keeps the route's timeline (regression, 23 Oct 2026): following the instant answer's
 * own route kept "Following your pick · not priced on this save yet" and "No timeline for your route on this save yet"
 * where the instant timeline had been. Now (lib/followPrice.ts step 0): the instant answer's route keeps the instant
 * timeline and its pill; this save's kept Fast result keeps the Fast timeline; then an older save's kept result, with "priced on
 * your save of …, may have drifted"; only a route that is none of these is "not priced on this save yet". Through useNowPage with the synthetic save (id
 * EI0000000000000000, never printed), the card server-rendered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { instantGoal, instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import { recordKeptSearch, type SnapSearch } from '@/lib/searchPlan';
import { accountOf } from '@/search/runSaves';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map<string, string>();
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

const leg = (start: number, end: number, endTE: number) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts: [], endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;

const A_ID = 'EI0000000000000000';
const SAVE_AGO = 1 * H;
function save() {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - SAVE_AGO;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/**
 * Egg Day: this save's instant answer (200 → 238, no Check exactly) and a Fast result (201 → 239) for the same goal,
 * kept with the snapshot (`where` 'snap'), beyond it in aap-search-plans ('kept'), only there with no snapshot
 * ('kept-only'), or kept for an OLDER save ('stale'). Then the route followed, as given.
 */
async function eggDay(followed: Record<string, unknown>, where: 'snap' | 'kept' | 'kept-only' | 'stale' = 'snap', staleHours = 5) {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  const key = instantSnapKey(instantKeyFromStores(eggDayAt, store.finalTE));
  const found: SnapSearch = {
    level: 'Fast',
    chain: [201, 239],
    end: eggDayAt - 2.5 * D,
    endTE: 239,
    legs: [leg(now - H, now + 28 * H, 201), leg(now + 28 * H, eggDayAt - 2.5 * D, 239)],
    at: Date.now() - 10_000,
    planStart: now - H,
  };
  if (where !== 'kept-only')
    writeSnapshot(key, {
      at: Date.now() - 60_000,
      header: {},
      result: {
        best: null,
        byAscensions: [],
        byDate: {
          chain: [200, 238],
          end: eggDayAt - 2 * D,
          legs: [
            { to: 200, endTE: 200, start: now - H, end: now + 30 * H },
            { to: 238, endTE: 238, start: now + 30 * H, end: eggDayAt - 2 * D },
          ],
        },
      },
      exact: {},
      dateExact: null,
      answerStart: now - H,
      ...(where === 'snap' ? { search: found } : {}),
    } as never);
  if (where !== 'snap')
    recordKeptSearch({
      account: accountOf(useInitialStateStore().rawBackup),
      goal: instantGoal(eggDayAt, store.finalTE),
      // 'stale': priced on a save `staleHours` before this one.
      backupTime: now - SAVE_AGO - (where === 'stale' ? staleHours * H : 0),
      setup: { availability: store.availability ? JSON.parse(JSON.stringify(store.availability)) : null, timeOff: JSON.parse(JSON.stringify(store.timeOff ?? [])) },
      search: found,
    });
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: followed }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(goalKey);
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
  return { page, scope, found };
}

async function render(page: Awaited<ReturnType<typeof eggDay>>['page']) {
  const html = await renderHtml(
    RightNowCard,
    {
      card: page.cardPlan.value,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 190,
      ascNow: page.ascNow.value,
      track: null,
      events: page.events.value,
      shownEvents: page.shownEvents.value,
      gear: null,
      now: page.now.value,
      zone: ZONE,
      saveSeconds: page.saveSeconds.value,
      eggDayYear: page.eggDayYear,
      goals: page.goalChoices.value,
      selectedGoal: page.selectedGoal.value,
      follow: page.follow.value,
      betterRoute: page.betterRoute.value,
      followSetWith: page.followSetWith.value,
      followSaveWords: page.followSaveWords.value,
    },
    {},
    [getActivePinia()!]
  );
  return { html, text: textOf(html) };
}

const NOT_PRICED = 'not priced on this save yet';
const NO_TIMELINE = 'No timeline for your route on this save yet';
const now = () => Date.now() - 60_000;

describe("Right now: a followed route keeps its route's timeline", () => {
  it("(a) followed from the instant card, the instant answer's own route: the instant timeline, its pill, Next step with rounded times", async () => {
    const { page, scope } = await eggDay({ chain: [200, 238], from: 'answer', at: now(), source: 'instant' });
    expect(page.follow.value).toMatchObject({ price: 'instant', source: 'this-save', chain: [200, 238] });
    expect(page.cardPlan.value?.plan).toMatchObject({ chain: [200, 238], exact: false });
    expect(page.events.value.length).toBeGreaterThan(0);
    const { html, text } = await render(page);
    expect(html).toContain('data-testid="now-source-pill"');
    expect(text).toContain('from the instant answer');
    expect(text).toContain('worked out ahead of time; times rounded to the hour');
    expect(text).toContain('Following your pick');
    expect(text).not.toContain(NOT_PRICED);
    expect(text).not.toContain(NO_TIMELINE);
    // Next step with its (rounded) time, no calendar buttons, "use Run Fast above" under the events (no second link).
    expect(text).toMatch(/Next step .*at around \d+:\d\d [AP]M/);
    expect(html).not.toContain('data-testid="calendar-button"');
    expect(text).toContain('For exact times on your account, use Run Fast above.');
    expect(html).toContain('data-testid="now-recalc-button"');
    // The follow line offers nothing more to price it (the card's Run Fast does).
    expect(html).not.toContain('data-testid="now-follow-price"');
    scope.stop();
  });

  it("(b) followed from a Fast run, the same route as this save's Fast result: the Fast timeline, exact times, calendar", async () => {
    for (const where of ['snap', 'kept', 'kept-only'] as const) {
      setActivePinia(createPinia());
      mem.clear();
      const { page, scope, found } = await eggDay({ chain: [201, 239], from: 'saved', at: now(), source: 'fast' }, where);
      expect(page.follow.value, where).toMatchObject({ price: 'exact', source: 'this-save' });
      expect(page.cardPlan.value?.plan, where).toMatchObject({ chain: found.chain, exact: true, from: { level: 'Fast' } });
      const { html, text } = await render(page);
      expect(text, where).toContain('from your Fast run, on your account');
      expect(text, where).not.toContain(NOT_PRICED);
      expect(text, where).not.toContain(NO_TIMELINE);
      expect(html, where).toContain('data-testid="calendar-button"');
      expect(html, where).not.toContain('data-testid="now-events-rounded"');
      scope.stop();
    }
  });

  it("(c) a typed route that is neither: Following your pick · not priced on this save yet, no timeline", async () => {
    const { page, scope } = await eggDay({ chain: [205, 238], from: 'typed', at: now(), source: 'manual' });
    expect(page.follow.value?.price).toBe('none');
    expect(page.cardPlan.value).toBeNull();
    const { html, text } = await render(page);
    expect(text).toContain(`Following your pick · ${NOT_PRICED}`);
    // No pricing settings kept for this save (an answer from before 24 Oct 2026): said in plain words.
    expect(text).toContain("No timeline for your route yet: the instant answer hasn't been worked out for this save and setup");
    expect(html).toContain('data-testid="now-follow-price"');
    expect(html).not.toContain('data-testid="now-source-pill"');
    scope.stop();
  });

  it("(d) read back from online with source instant and the same stops: the instant timeline", async () => {
    const eggDayAt = eggDaySeconds(nextEggDayYear());
    const { page, scope } = await eggDay({
      chain: [200, 238],
      from: 'answer',
      at: now(),
      source: 'instant',
      finish: eggDayAt - 2 * D,
      endTE: 238,
      cloud: true,
    });
    expect(page.follow.value).toMatchObject({ price: 'instant', chain: [200, 238] });
    const { text } = await render(page);
    expect(text).toContain('from the instant answer');
    expect(text).not.toContain(NOT_PRICED);
    scope.stop();
  });

  it('(e) a Fast result kept for a save 5 h or 17 h older: its timeline, with the drift note and Add buttons', async () => {
    for (const hours of [5, 17]) {
      setActivePinia(createPinia());
      mem.clear();
      const { page, scope } = await eggDay({ chain: [201, 239], from: 'saved', at: now(), source: 'fast' }, 'stale', hours);
      expect(page.follow.value, `${hours} h`).toMatchObject({ price: 'exact', source: 'older-save' });
      expect(page.cardPlan.value?.plan.from?.level).toBe('Fast');
      const { html, text } = await render(page);
      expect(text, `${hours} h`).toMatch(/Following your pick · priced on your save of .+, may have drifted/);
      expect(text).not.toContain(NOT_PRICED);
      expect(text).not.toContain(NO_TIMELINE);
      expect(html).toContain('data-testid="calendar-button"');
      scope.stop();
    }
  });
});
