/**
 * Right now's Next step always has a timeline (24 Oct 2026, Jordan: "No timeline for your route on this save yet:
 * Simulate it ›" and Single run ignores the hours). A followed route that no kept result prices on this save is priced
 * on the instant answer's data with what this save's instant answer priced its own routes with (its snapshot's
 * `pricing`: held hours, time off, no-prestige days), in a route worker (here a stand-in pricer), and its steps say
 * "estimated from the instant answer's data (times rounded to the hour)". A kept Fast result for the route still wins;
 * while it is worked out the Next step says so; a failure, a route past the data or no instant answer of this save keep
 * the old "Simulate it ›" line. Through useNowPage with the synthetic save (id EI0000000000000000, never printed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, nextTick, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import type { SnapSearch } from '@/lib/searchPlan';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { saveTEOf } from '@/lib/saveFreshness';
import { ESTIMATE_WORDS, type SnapPricing } from '@/lib/followEstimate';
import { setChainPricer, useFollowEstimate, type ChainPricer, type EstimateRequest } from '@/composables/useFollowEstimate';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
let mem: Map<string, string>;

/** The stand-in route worker: every request kept, answered by the spec. */
let calls: { url: string; options: PolishOptions; chain: number[]; resolve: (r: Route | null) => void; reject: (e: Error) => void }[];
let terminated: number;
function stubPricer(): void {
  calls = [];
  terminated = 0;
  setChainPricer(
    (): ChainPricer => ({
      priceChain: (url, options, chain) => new Promise((resolve, reject) => calls.push({ url, options, chain, resolve, reject })),
      terminate: () => void terminated++,
    })
  );
}

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
  stubPricer();
});
afterEach(() => setChainPricer(null));

const leg = (start: number, end: number, endTE: number) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts: [], endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;

const A_ID = 'EI0000000000000000';
function save() {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

const HOURS = { days: [], fromHour: 7, toHour: 23, timezone: ZONE };
const TABLE = 'precompute/table-v2.bin';

/**
 * This save's instant answer for Egg Day (200 → 238) with its pricing inputs (`pricing`, as InstantRoute.vue keeps
 * them: start TE the save's, held hours, a no-prestige day), optionally a Fast result (201 → 239) kept with it, and the
 * route followed. `snapFor: 'race'` keeps the snapshot under Fastest to 490 instead (another goal of this save).
 */
async function setup(
  followed: Record<string, unknown>,
  o: { fast?: boolean; final?: number; pricing?: boolean; startTE?: number; snapFor?: 'eggday' | 'race' } = {}
) {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const te = saveTEOf(useInitialStateStore().rawBackup);
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  const key = instantSnapKey(o.snapFor === 'race' ? instantKeyFromStores(null, 490) : instantKeyFromStores(eggDayAt, store.finalTE));
  const found: SnapSearch = {
    level: 'Fast',
    chain: [201, 239],
    end: eggDayAt - 2.5 * D,
    endTE: 239,
    legs: [leg(now - H, now + 28 * H, 201), leg(now + 28 * H, eggDayAt - 2.5 * D, 239)],
    at: Date.now() - 10_000,
    planStart: now - H,
  };
  const pricing: SnapPricing = {
    v: 1,
    final: o.final ?? 490,
    options: {
      startTE: o.startTE ?? te,
      start: now - H,
      firstLegs: [{ to: 205, endTE: 205, end: now + 20 * H, delivered: [1, 1, 1, 1, 1], label: 'continue' }],
      deliveryScale: 1,
      hours: HOURS,
      holdShifts: true,
      noPrestige: [{ from: now + 2 * D, to: now + 3 * D }],
      siloSeconds: 2 * D,
    },
  };
  writeSnapshot(key, {
    at: Date.now() - 60_000,
    header: { from: 100, to: 490 },
    tableUrl: TABLE,
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
    ...(o.fast ? { search: found } : {}),
    ...(o.pricing === false ? {} : { pricing }),
  } as never);
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: followed }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(goalKey);
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
  return { page, scope, now, eggDayAt, te };
}

async function render(page: Awaited<ReturnType<typeof setup>>['page']) {
  const html = await renderHtml(
    RightNowCard,
    {
      card: page.cardPlan.value,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: page.teSoFar.value,
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
    },
    {},
    [getActivePinia()!]
  );
  return { html, text: textOf(html) };
}

const NO_TIMELINE = 'No timeline for your route on this save yet';
const WORKING = "Working out your route's times from the instant answer's data";
const at = () => Date.now() - 60_000;
/** The priced route the stand-in worker answers with. */
function route(now: number, end: number): Route {
  return {
    chain: [205, 238],
    end,
    seconds: end - (now - H),
    legs: [
      { from: 194, to: 205, endTE: 205, start: now - H, end: now + 20 * H, sales: 0, tier13: false, label: 'continue' },
      { from: 205, to: 238, endTE: 238, start: now + 21 * H, end, sales: 1, tier13: false, label: '1-sale' },
    ],
  };
}

describe("Right now: a followed route with no kept price is estimated on the instant answer's data", () => {
  it('(a) working it out, then its steps with the estimate words; the held hours and no-prestige days go to the worker', async () => {
    const { page, scope, now, eggDayAt, te } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(TABLE);
    expect(calls[0].chain).toEqual([205, 238]);
    expect(calls[0].options).toMatchObject({ startTE: te, hours: HOURS, holdShifts: true, noPrestige: [{ from: now + 2 * D, to: now + 3 * D }] });
    expect(page.follow.value).toMatchObject({ price: 'none', estimating: 'working' });
    let r = await render(page);
    expect(r.text).toContain(WORKING);
    expect(r.html).toContain('role="status"');
    expect(r.text).not.toContain(NO_TIMELINE);

    calls[0].resolve(route(now, eggDayAt - 3 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(page.cardPlan.value?.plan).toMatchObject({ chain: [205, 238], exact: false, estimated: true, end: eggDayAt - 3 * D });
    expect(page.events.value.length).toBeGreaterThan(0);
    r = await render(page);
    expect(r.text).toMatch(/Next step .*at around \d+:\d\d [ap]m/);
    expect(r.text).toContain(`Your route's steps, ${ESTIMATE_WORDS}.`);
    expect(r.html).toContain('data-testid="now-next-estimated"');
    expect(r.text).toContain("Following your pick · estimated from the instant answer's data");
    expect(r.text).not.toContain(NO_TIMELINE);
    expect(r.text).not.toContain(WORKING);
    // Rounded: no calendar buttons; Run Fast and Simulate it still offered for exact times.
    expect(r.html).not.toContain('data-testid="calendar-button"');
    expect(r.html).toContain('data-testid="now-follow-price"');
    expect(r.html).toContain('data-testid="now-follow-simulate"');
    expect(r.text).not.toMatch(/\btables?\b|\bchain\b|checkpoint|\bLight\b/);
    // The worker is let go once it has answered.
    expect(terminated).toBeGreaterThan(0);
    scope.stop();
  });

  it('(b) a kept Fast result that is the followed route still wins: exact times, nothing estimated', async () => {
    const { page, scope } = await setup({ chain: [201, 239], from: 'saved', at: at(), source: 'fast' }, { fast: true });
    expect(page.follow.value).toMatchObject({ price: 'exact', source: 'this-save' });
    expect(page.cardPlan.value?.plan.estimated).toBeUndefined();
    await nextTick();
    expect(calls).toHaveLength(0);
    scope.stop();
  });

  it("(c) the worker fails or can't price it: the old 'Simulate it' line, nothing thrown", async () => {
    for (const how of ['reject', 'null'] as const) {
      setActivePinia(createPinia());
      mem.clear();
      stubPricer();
      const { page, scope } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' });
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      if (how === 'reject') calls[0].reject(new Error('A route worker stopped'));
      else calls[0].resolve(null);
      await vi.waitFor(() => expect(page.follow.value?.estimating).toBeUndefined());
      expect(page.follow.value?.price, how).toBe('none');
      expect(page.cardPlan.value).toBeNull();
      const { text } = await render(page);
      expect(text, how).toContain(`${NO_TIMELINE}: Simulate it ›`);
      scope.stop();
    }
  });

  it('(d) a route longer than the instant answer covers: said, never sent to the worker', async () => {
    const { page, scope } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' }, { final: 230 });
    expect(page.follow.value).toMatchObject({ price: 'none', estimating: 'beyond' });
    await nextTick();
    expect(calls).toHaveLength(0);
    const { text } = await render(page);
    expect(text).toContain('Your route goes past what the instant answer covers, so it has no estimate: Simulate it ›');
    scope.stop();
  });

  it("(e) no instant answer of this save to price with (none kept, an older one's, another save's start): the old line", async () => {
    for (const o of [{ pricing: false }, { startTE: 150 }]) {
      setActivePinia(createPinia());
      mem.clear();
      stubPricer();
      const { page, scope } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' }, o);
      await nextTick();
      expect(calls, JSON.stringify(o)).toHaveLength(0);
      expect(page.follow.value?.estimating).toBeUndefined();
      const { text } = await render(page);
      expect(text).toContain(`${NO_TIMELINE}: Simulate it ›`);
      scope.stop();
    }
  });

  it("(f) the goal has no instant answer of this save, another goal's does: priced with that one's inputs", async () => {
    const { page, scope, now, eggDayAt } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' }, { snapFor: 'race' });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0].resolve(route(now, eggDayAt - 3 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(page.cardPlan.value?.plan.deadline).toBe(eggDayAt);
    scope.stop();
  });

  it('(g) while a search runs it waits (the search has the memory), then works it out', async () => {
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    store.isRunning = true;
    const { page, scope } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' });
    expect(page.follow.value?.estimating).toBe('waiting');
    expect(calls).toHaveLength(0);
    const { text } = await render(page);
    expect(text).toContain("Your route's times are worked out from the instant answer's data once the search running now ends.");
    store.isRunning = false;
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    scope.stop();
  });
});

describe('useFollowEstimate: the save changing underneath', () => {
  it("an answer for an older request is never shown for the new one, and is kept for when it's asked again", async () => {
    const req = (key: string): EstimateRequest => ({ key, url: TABLE, options: { startTE: 194, start: 0 }, chain: [205, 238] });
    const request = ref<EstimateRequest | null>(req('save-1'));
    const busy = ref(false);
    const scope = effectScope();
    const { state } = scope.run(() => useFollowEstimate(request, busy))!;
    expect(state.value).toMatchObject({ key: 'save-1', status: 'working' });
    request.value = req('save-2');
    await nextTick();
    expect(state.value).toMatchObject({ key: 'save-2', status: 'working' });
    expect(calls).toHaveLength(2);
    calls[0].resolve(route(0, 100));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await nextTick();
    expect(state.value).toMatchObject({ key: 'save-2', status: 'working' });
    calls[1].resolve(route(0, 200));
    await vi.waitFor(() => expect(state.value).toMatchObject({ key: 'save-2', status: 'done' }));
    expect((state.value as { route: Route }).route.end).toBe(200);
    // Back to the first: its answer was kept, nothing asked again.
    request.value = req('save-1');
    await nextTick();
    expect(state.value).toMatchObject({ key: 'save-1', status: 'done' });
    expect(calls).toHaveLength(2);
    request.value = null;
    await nextTick();
    expect(state.value).toBeNull();
    scope.stop();
  });

  it('no route worker in this browser: failed, never thrown', async () => {
    setChainPricer(() => null);
    const scope = effectScope();
    const { state } = scope.run(() => useFollowEstimate(ref<EstimateRequest | null>({ key: 'k', url: TABLE, options: { startTE: 1, start: 0 }, chain: [2] }), ref(false)))!;
    await vi.waitFor(() => expect(state.value).toMatchObject({ key: 'k', status: 'failed' }));
    scope.stop();
  });
});
