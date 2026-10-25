/**
 * The bug on Jordan's main account (24 Oct 2026, egg-beta2-int 88c0c64f): Egg Day 2027, "Following 225 → 300 (Egg
 * Day 2027 · your pick)", a follow read back from online (source instant, set under other hours: "This route was set
 * with a different hours window."), and Next step still "No timeline for your route on this save yet", with no
 * "working it out" and nothing in the console, even after "Work it out again" on By a date.
 *
 * The cause: My runs priced a followed route only with the `pricing` kept in the goal's OWN snapshot, and that is
 * written only once the background polish and "Prestige by" are done (InstantRoute.vue `saveSnapshot`), and never
 * for an answer restored from before this build (it has none, and a restore doesn't save). Neither the other hours
 * window (only a note) nor an older save's price (followPrice found nothing) blocked it.
 *
 * The fix: the instant answer keeps its pricing settings at once in a record by account, save and setup
 * (lib/followEstimate.ts `recordPricing`), My runs reads them by those, answers saved before them are worked out again
 * once (INSTANT_RULES), "working it out" shows the whole time it is asked, and with nothing to price with Right now
 * says so with what to do. The synthetic save (id EI0000000000000000, never printed); a stand-in route worker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, nextTick, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import { INSTANT_RULES, savedAnswerFits, tablesIdentity } from '@/search/instantTables';
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
import { accountOf } from '@/search/runSaves';
import { PRICING_RECORD_KEY, pricingSetupKey, readPricingRecords, recordPricing, type SnapPricing } from '@/lib/followEstimate';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const TABLE = 'precompute/table-v2.bin';
let mem: Map<string, string>;
let calls: { chain: number[]; options: PolishOptions; resolve: (r: Route | null) => void }[];

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
  calls = [];
  setChainPricer((): ChainPricer => ({ priceChain: (_u, options, chain) => new Promise(resolve => calls.push({ chain, options, resolve })), terminate: () => undefined }));
});
afterEach(() => setChainPricer(null));

const A_ID = 'EI0000000000000000';

/** Jordan's state: the save, an Egg Day instant answer of this save saved by an older build (no `pricing`), and the
 *  cloud follow 225 → 300, source instant, set under 7 am-5 am hours while the setup is any hour. */
async function jordan() {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  loadAndSyncBackup(A_ID, markRaw(b), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useHoursFromStores, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  // The old build's snapshot: its own route (200 → 238) and no `pricing` field at all.
  writeSnapshot(instantSnapKey(instantKeyFromStores(eggDayAt, store.finalTE)), {
    at: Date.now() - 60_000,
    header: { from: 100, to: 490 },
    tableUrl: TABLE,
    result: {
      best: null,
      byAscensions: [],
      byDate: { chain: [200, 238], end: eggDayAt - 2 * D, legs: [{ to: 200, endTE: 200, start: now - H, end: now + 30 * H }, { to: 238, endTE: 238, start: now + 30 * H, end: eggDayAt - 2 * D }] },
    },
    exact: {},
    dateExact: null,
    answerStart: now - H,
  } as never);
  mem.set(
    `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
    JSON.stringify({ [goalKey]: { chain: [225, 300], from: 'answer', at: Date.now() - 3 * H, source: 'instant', cloud: true, hours: { start: '07:00', end: '05:00' } } })
  );
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const te = saveTEOf(useInitialStateStore().rawBackup);
  const setup = () =>
    pricingSetupKey({
      availability: store.availability,
      timeOff: store.timeOff,
      noPrestige: store.noPrestige,
      useHours: useHoursFromStores(),
      firstAscension: store.collectInputs().firstAscension,
    });
  /** What InstantRoute.vue keeps the moment an answer is in (`keepPricing`). */
  const keep = (over: { setup?: string; backupTime?: number; final?: number } = {}) => {
    const pricing: SnapPricing = {
      v: 1,
      final: over.final ?? 490,
      options: { startTE: te, start: now - H, firstLegs: [{ to: 225, endTE: 225, end: now + 20 * H, delivered: [1, 1, 1, 1, 1], label: 'continue' }], deliveryScale: 1 },
    };
    expect(
      recordPricing({
        account: accountOf(useInitialStateStore().rawBackup)!,
        backupTime: over.backupTime ?? t,
        setup: over.setup ?? setup(),
        url: TABLE,
        tableTo: 490,
        at: Date.now(),
        pricing,
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
  return { keep, open, now, eggDayAt };
}

async function render(page: Awaited<ReturnType<Awaited<ReturnType<typeof jordan>>['open']>>['page']) {
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

describe("Jordan's Egg Day follow: the estimate whenever this save has an instant answer", () => {
  it('reproduced: an old-build snapshot and nothing else: it says so in plain words, with what to do (was the silent old line)', async () => {
    const { open } = await jordan();
    const { page, scope } = await open();
    expect(page.follow.value).toMatchObject({ chain: [225, 300], price: 'none', estimating: 'nosource' });
    await nextTick();
    expect(calls).toHaveLength(0);
    const { text } = await render(page);
    expect(text).toContain('This route was set with a different hours window.');
    expect(text).toContain("No timeline for your route yet: the instant answer hasn't been worked out for this save and setup");
    expect(text).toContain('Open Highest TE by a date once so the instant answer can price it ›');
    expect(text).not.toContain('No timeline for your route on this save yet');
    scope.stop();
  });

  it('once the instant answer has run (its record kept at once, the snapshot still the old one): working it out the whole time, then the estimate; the other hours window and the cloud follow block nothing', async () => {
    const { keep, open, now, eggDayAt } = await jordan();
    keep();
    const { page, scope } = await open();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].chain).toEqual([225, 300]);
    expect(page.follow.value?.estimating).toBe('working');
    let r = await render(page);
    expect(r.text).toContain("Working out your route's times from the instant answer's data…");
    expect(r.text).toContain('This route was set with a different hours window.');
    calls[0].resolve(route(now, eggDayAt - 4.5 * H));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(page.cardPlan.value?.plan).toMatchObject({ chain: [225, 300], estimated: true, endTE: 300 });
    r = await render(page);
    expect(r.text).toContain("Your route's steps, estimated from the instant answer's data (times rounded to the hour).");
    expect(r.text).not.toContain('No timeline for your route');
    scope.stop();
  });

  it('"working it out" from the first render: asked but no answer yet is never the old line', async () => {
    const { keep, open } = await jordan();
    keep();
    const { page, scope } = await open();
    // Before the stand-in worker has even been asked or answered.
    expect(page.follow.value?.estimating).toBe('working');
    scope.stop();
  });

  it("another save's or another setup's record is never used", async () => {
    for (const over of [{ backupTime: 1 }, { setup: '["other"]' }]) {
      setActivePinia(createPinia());
      mem.clear();
      calls = [];
      const { keep, open } = await jordan();
      keep(over);
      const { page, scope } = await open();
      await nextTick();
      expect(calls, JSON.stringify(over)).toHaveLength(0);
      expect(page.follow.value?.estimating).toBe('nosource');
      scope.stop();
    }
  });

  it('a failure says so and logs a console line', async () => {
    const { keep, open } = await jordan();
    keep();
    const { page, scope } = await open();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0].resolve(null);
    await vi.waitFor(() => expect(page.follow.value?.estimating).toBe('failed'));
    expect(vi.mocked(console.warn).mock.calls.some(c => String(c[0]).includes('225 300'))).toBe(true);
    const { text } = await render(page);
    expect(text).toContain("Your route couldn't be priced on the instant answer's data: Simulate it ›");
    scope.stop();
  });
});

describe('the pricing record and the saved answers from before it', () => {
  it('keeps the newest few, one per account, save and setup, and survives a full storage by keeping fewer', () => {
    const p: SnapPricing = { v: 1, final: 490, options: { startTE: 194, start: 1, firstLegs: [{ to: 200, endTE: 200, end: 2, delivered: [1] }] } };
    const rec = (backupTime: number, setup = 's') => ({ account: 'a', backupTime, setup, url: TABLE, tableTo: 490, at: backupTime, pricing: p });
    for (const b of [1, 2, 2, 3, 4]) recordPricing(rec(b));
    expect(readPricingRecords().map(r => r.backupTime)).toEqual([4, 3, 2]);
    expect(readPricingRecords().filter(r => r.backupTime === 2)).toHaveLength(1);
    mem.set(PRICING_RECORD_KEY, 'not json');
    expect(readPricingRecords()).toEqual([]);
    expect(recordPricing({ ...rec(5), pricing: { ...p, options: { ...p.options, firstLegs: [] } } })).toBe(false);
  });

  it('an answer saved before this build (older INSTANT_RULES) is worked out again, so it is saved with its pricing', () => {
    expect(INSTANT_RULES).toBe('2026-10-24-pricing');
    const now = tablesIdentity([], ['table-v2.bin']);
    const before = now!.replace(`rules=${INSTANT_RULES}`, 'rules=2026-10-24-heldfix');
    expect(savedAnswerFits({ tables: before }, 1, now)).toBe(false);
    expect(savedAnswerFits({ tables: now }, 1, now)).toBe(true);
  });

  it('InstantRoute keeps the record the moment the first answer is in, and again when a saved one is put back', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../auto/InstantRoute.vue'), 'utf8');
    expect(src).toMatch(/answerPricing = snapPricing\(polishOptions, target\.value\);\n\s+keepPricing\(\);/);
    expect(src.indexOf('keepPricing();')).toBeLessThan(src.indexOf('result.value = answer;'));
    const apply = src.slice(src.indexOf('function applySnapshot('));
    expect(apply.slice(0, apply.indexOf('\n}'))).toMatch(/answerPricing = readPricing\(s\.pricing\);[\s\S]*keepPricing\(\);/);
  });
});
