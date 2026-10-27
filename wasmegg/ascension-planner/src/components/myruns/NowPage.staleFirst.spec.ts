/**
 * CACHED ANSWERS FIRST, THEN RECHECK on My runs (Jordan, 27 Oct 2026: "answers recalculating with nothing shown"). A
 * followed route whose pricing record for this save and setup is missing (a Setup change, a new save at the same TE)
 * is priced at once with the account's newest record that starts at the save's TE, marked "From <time>, checking…",
 * while the record for this setup is worked out (composables/useInstantCompute.ts); then the fresh estimate replaces
 * it, and the stale one stays on screen until it is in (never a blank in between). The estimate shown last is also
 * kept in this browser (lib/heldEstimate.ts), so a reload shows it at once, marked, while it is priced again.
 * The synthetic save (id EI0000000000000000, never printed); a stand-in route worker and instant computer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, nextTick, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { saveTEOf } from '@/lib/saveFreshness';
import { accountOf } from '@/search/runSaves';
import { recordPricing, type SnapPricing } from '@/lib/followEstimate';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setInstantComputer, setInstantComputeTiming, type InstantPricing } from '@/composables/useInstantCompute';
import { HELD_ESTIMATE_KEY } from '@/lib/heldEstimate';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const TABLE = 'precompute/table-v2.bin';
let mem: Map<string, string>;
let calls: { chain: number[]; options: PolishOptions; resolve: (r: Route | null) => void }[];
let computes: { resolve: (p: InstantPricing | null) => void }[];

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
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  calls = [];
  computes = [];
  setChainPricer((): ChainPricer => ({ priceChain: (_u, options, chain) => new Promise(resolve => calls.push({ chain, options, resolve })), terminate: () => undefined }));
  setInstantComputer(() => ({ compute: () => new Promise(resolve => computes.push({ resolve })), terminate: () => undefined }));
  setInstantComputeTiming({ delayMs: 0 });
});
afterEach(() => {
  setChainPricer(null);
  setInstantComputer(null);
  setInstantComputeTiming(null);
});

const A_ID = 'EI0000000000000000';

/** `saveAt`: the save's backup time (a reload keeps the same save; a second boundary between two loads must not make
 *  it another save). */
async function setUp(saveAt?: number) {
  const b = syntheticBackup();
  const t = saveAt ?? Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  loadAndSyncBackup(A_ID, markRaw(b), 'plan_next');
  rollUpPendingTE();
  const { pricingSetupFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: { chain: [225, 300], from: 'answer', at: Date.now() - 3 * H } }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const te = saveTEOf(useInitialStateStore().rawBackup);
  const pricingOf = (tag: number): SnapPricing => ({
    v: 1,
    final: 490,
    options: { startTE: te, start: now - H, firstLegs: [{ to: 225, endTE: 225, end: now + tag * H, delivered: [1, 1, 1, 1, 1], label: 'continue' }], deliveryScale: 1 },
  });
  /** A record kept for another setup (or another save at the same TE) `ago` ms before now. */
  const keepOther = (ago: number, over: { setup?: string; backupTime?: number; startTE?: number } = {}) => {
    const p = pricingOf(20);
    if (over.startTE != null) p.options.startTE = over.startTE;
    expect(
      recordPricing({
        account: accountOf(useInitialStateStore().rawBackup)!,
        backupTime: over.backupTime ?? t,
        setup: over.setup ?? '["another setup"]',
        url: TABLE,
        tableTo: 490,
        at: Date.now() - ago,
        pricing: p,
      })
    ).toBe(true);
  };
  const open = async () => {
    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
    page.selectGoal(goalKey);
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
    return { page, scope };
  };
  return { keepOther, open, now, eggDayAt, pricingOf, setup: () => pricingSetupFromStores(), saveAt: t };
}

async function render(page: Awaited<ReturnType<Awaited<ReturnType<typeof setUp>>['open']>>['page']) {
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
      followSetWith: page.followSetWith.value,
    },
    {},
    [getActivePinia()!]
  );
  return { html, text: textOf(html) };
}

const route = (now: number, end: number): Route => ({
  chain: [225, 300],
  end,
  seconds: end - now,
  legs: [
    { from: 194, to: 225, endTE: 225, start: now - H, end: now + 20 * H, sales: 0, tier13: false, label: 'continue' },
    { from: 225, to: 300, endTE: 300, start: now + 21 * H, end, sales: 1, tier13: false, label: '1-sale' },
  ],
});

describe('My runs: the last pricing first, marked, then the fresh one', () => {
  it("a Setup change: priced at once with the account's newest record, 'From <time>, checking…', then swapped", async () => {
    const { keepOther, open, now, eggDayAt, pricingOf } = await setUp();
    keepOther(2 * H * 1000);
    const { page, scope } = await open();
    // The stale record prices the route straight away, while this setup's record is worked out.
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    calls[0].resolve(route(now, eggDayAt - 6 * H));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    const staleAt = page.follow.value?.staleAt;
    expect(staleAt).toBeGreaterThan(0);
    let r = await render(page);
    expect(r.html).toMatch(/role="status"[^>]*data-testid="now-follow-stale"|data-testid="now-follow-stale"[^>]*role="status"/);
    expect(r.text).toMatch(/From .+, checking…/);
    expect(r.text).not.toContain('Working out the instant answer for your setup…');
    // The pill says it is being checked too.
    const pill = page.goalChoices.value.find(g => g.key === page.selectedGoal.value);
    expect(pill?.follow?.checking).toBe(true);

    // This setup's record comes in: priced again with it; the stale estimate stays on screen meanwhile.
    computes[0].resolve({ url: TABLE, tableTo: 490, pricing: pricingOf(18) });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(page.cardPlan.value?.plan.chain).toEqual([225, 300]);
    expect(page.follow.value?.staleAt).toBe(staleAt);
    calls[1].resolve(route(now, eggDayAt - 8 * H));
    await vi.waitFor(() => expect(page.follow.value?.staleAt).toBeUndefined());
    expect(page.follow.value?.price).toBe('estimate');
    r = await render(page);
    expect(r.text).not.toContain('checking…');
    scope.stop();
  });

  it('never a record of another account or another starting TE; none at all: today’s "Working out the instant answer"', async () => {
    const { keepOther, open } = await setUp();
    keepOther(H * 1000, { startTE: 5 });
    const { page, scope } = await open();
    await nextTick();
    expect(calls).toHaveLength(0);
    expect(page.follow.value?.estimating).toBe('instant');
    expect(page.follow.value?.staleAt).toBeUndefined();
    const { text } = await render(page);
    expect(text).toContain('Working out the instant answer for your setup…');
    scope.stop();
  });

  it('a reload: the estimate shown last is put back at once, marked, while it is priced again', async () => {
    const { open, now, eggDayAt, setup, pricingOf, saveAt } = await setUp();
    // This save and setup's own record: the estimate is priced with it.
    recordPricing({ account: accountOf(useInitialStateStore().rawBackup)!, backupTime: useInitialStateStore().lastBackupTime, setup: setup(), url: TABLE, tableTo: 490, at: Date.now() - H * 1000, pricing: pricingOf(20) });
    let { page, scope } = await open();
    // Every route worker request answered (the estimate, and the shifts' one when asked), whatever their order.
    const answerAll = () => calls.forEach(c => c.resolve(route(now, eggDayAt - 6 * H)));
    await vi.waitFor(() => {
      answerAll();
      expect(page.follow.value?.price).toBe('estimate');
    }, { timeout: 8000 });
    expect(page.follow.value?.staleAt).toBeUndefined();
    expect(mem.get(HELD_ESTIMATE_KEY) ?? '').not.toMatch(/EI\d{16}/i);
    scope.stop();
    // The next page load: nothing priced yet (the estimates of this load forgotten), the held estimate shown at once, marked.
    calls = [];
    setChainPricer((): ChainPricer => ({ priceChain: (_u, options, chain) => new Promise(resolve => calls.push({ chain, options, resolve })), terminate: () => undefined }));
    setActivePinia(createPinia());
    ({ page, scope } = await (await setUp(saveAt)).open());
    expect(page.follow.value?.price).toBe('estimate');
    expect(page.follow.value?.staleAt).toBeGreaterThan(0);
    await vi.waitFor(() => {
      answerAll();
      expect(page.follow.value?.staleAt).toBeUndefined();
    }, { timeout: 8000 });
    scope.stop();
  }, 30_000);
});
