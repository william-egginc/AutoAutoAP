/**
 * STARTING FRESH WOULD BE SOONER ON RIGHT NOW (spec-r7verify, 1 Nov 2026; lib/freshSooner.ts). "Continue my build-up"
 * forced (Your setup's choice, or the unfinished build's build-up side) never compared the ascension you are in with a
 * fresh start; now My runs' simulation also prices the fresh start lazily (useNowPage `freshSim`), and Right now
 * says so when it ends more than an hour sooner, with "Switch to Soonest" for this ascension (kept per account and stop,
 * `aap.firstasc.*`, Setup untouched). Through useNowPage with synthetic saves (id EI0000000000000000, never printed) and
 * stand-in workers (the lazy fresh pricing, Prestige now, answered at once; leg.freshSooner.spec.ts runs the real
 * simulator). Fixed save time; the waits are for answers, never for time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary, SearchInputs } from '@/search/types';
import { oneCarShortBackup, syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { FASTEST_PICK_PREFIX, FASTEST_SETUP, FRESH_PRICE_SETUP } from '@/lib/freshSooner';
import { freshSoonerLine } from '@/lib/freshSoonerWords';
import { dateAt } from '@/lib/eventWhen';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { FirstAscension } from '@/search/firstAscension';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 24 * H;
const A_ID = 'EI0000000000000000';
const WAIT = { timeout: 15_000, interval: 10 };
let mem: Map<string, string>;
let saveAt: number;

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
  saveAt = Math.floor(Date.now() / 1000) - H;
  setChainPricer(
    (): ChainPricer => ({
      priceChain: (_url: string, _o: PolishOptions, _chain: number[]) => new Promise<Route | null>(() => undefined),
      terminate: () => undefined,
    })
  );
  setSimTiming({ delayMs: 0 });
});
const scopes: { stop: () => void }[] = [];
afterEach(() => {
  for (const s of scopes.splice(0)) s.stop();
  setChainPricer(null);
  setSimRunner(null);
  setSimTiming(null);
});

/** The synthetic save with two small vehicles: the build unfinished (NowPage.a1Choice.spec.ts). */
function unfinished() {
  const b = syntheticBackup();
  Object.assign(b.farms[0], { habs: [18, 18, 18, 18], habPopulation: [1e10, 1e10, 1e10, 1e10], vehicles: [9, 9], trainLength: [1, 1] });
  return b;
}
/** A farm the page calls built (its shipping above its laying: NowPage.a1Choice.realPage.spec.ts). */
const built = () => oneCarShortBackup();

async function setup(o: { setting?: FirstAscension; fresh?: boolean; make?: () => any } = {}) {
  if (o.fresh) setActivePinia(createPinia());
  const b = (o.make ?? unfinished)();
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = saveAt;
  b.approxTime = saveAt;
  resolveColleggtibleContracts(b);
  loadAndSyncBackup(A_ID, markRaw(b), 'plan_next');
  rollUpPendingTE();
  if (o.setting) useChainSearchStore().setFirstAscension(o.setting);
  const { resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const now = Math.floor(Date.now() / 1000);
  mem.set(
    `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
    JSON.stringify({ 'fastest-490': { chain: [226, 277, 317, 490], from: 'typed', source: 'manual', at: Date.now() - 60_000 } })
  );
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''), WAIT);
  const scope = effectScope();
  scopes.push(scope);
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal('fastest-490');
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull(), WAIT);
  return { page, scope, now };
}
type Page = Awaited<ReturnType<typeof setup>>['page'];

/** The fresh start's end (from now) the stand-in worker answers the lazy fresh pricing with (useNowPage `freshSim`). */
let freshAt = 5.5 * D;
/** The lazy fresh pricings asked for (answered at once, kept apart from `sims`). */
let freshAsks: SearchInputs[] = [];
function stubSims() {
  const sims: { inputs: SearchInputs; resolve: (l: LegSummary | null) => void }[] = [];
  freshAsks = [];
  setSimRunner(
    (): SimRunner => ({
      run: inputs => {
        if (inputs.firstAscension === 'fresh') {
          freshAsks.push(inputs);
          const now = Math.floor(Date.now() / 1000);
          return Promise.resolve(legOf(now, '1-sale', now + freshAt, {}));
        }
        return new Promise(resolve => sims.push({ inputs, resolve }));
      },
      terminate: () => undefined,
    })
  );
  return sims;
}

/** A simulated A1: `key` ending at `end`, carrying the ends given. */
function legOf(now: number, key: string, end: number, ends: Partial<Record<'continue' | 'buildup' | 'fresh', number>>, buys = 3): LegSummary {
  return {
    key,
    endTE: 226,
    durationSeconds: end - (now - H),
    maxELR: 1e12,
    endTime: end,
    tier13Unlocked: false,
    startTime: now - H,
    ...(key === 'buildup' ? { buildPhaseEndTime: now + 10 * H } : {}),
    shifts: [
      { at: now + 12 * H, egg: 'humility', fromEgg: 'curiosity' },
      { at: now + 12 * H, egg: 'kindness', fromEgg: 'humility' },
    ],
    endEgg: { egg: 'kindness', te: 40 },
    firstLegEnds: ends,
    ...(key === 'buildup' || key === 'continue' ? { buildUpBuys: buys } : {}),
  } as LegSummary;
}
/** The build-up followed (sooner than continue: no A1 choice); the lazy fresh pricing will say `fresh` from now. */
const buildupWithFresh = (now: number, fresh: number) => {
  freshAt = fresh;
  return legOf(now, 'buildup', now + 12 * D, { buildup: now + 12 * D, continue: now + 20 * D });
};
/** What Fastest gives on the same save: the fresh start. */
const freshLeg = (now: number) => legOf(now, '3-sale', now + 5.5 * D, { buildup: now + 12 * D, continue: now + 20 * D, fresh: now + 5.5 * D });

async function cardHtml(page: Page) {
  return renderHtml(
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
      nextStep: page.nextStep.value,
      nextShiftLines: page.nextShiftLines.value,
      simWorking: page.simWorking.value,
      a1Choice: page.a1Choice.value,
      freshSooner: page.freshLine.value,
      fastestFollowed: !!page.fastestFollowed.value,
    },
    {},
    [getActivePinia()!]
  );
}
const simSetups = () => (JSON.parse(mem.get('aap-follow-sim') ?? '[]') as { setup: string }[]).map(r => JSON.parse(r.setup)[3] as string);
const isForcedAsk = (s: { inputs: SearchInputs }) => s.inputs.firstAscension === 'buildup';
const isFastestAsk = (s: { inputs: SearchInputs }) => s.inputs.firstAscension === 'auto' && s.inputs.continueMaxSeconds === undefined;

describe('the line: a forced build-up ending over an hour after a fresh start', () => {
  for (const [what, o] of [
    ["Your setup's Continue my build-up (build finished)", { setting: 'buildup' as const, make: built }],
    ['the unfinished build under Fastest (its build-up side)', { make: unfinished }],
    ["the unfinished build under Continue my build-up", { setting: 'buildup' as const, make: unfinished }],
  ] as const)
    it(`${what}: the fresh start asked for, the line with N and both dates`, async () => {
      const sims = stubSims();
      const { page, scope, now } = await setup(o);
      await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
      expect(isForcedAsk(sims[0])).toBe(true);
      sims[0].resolve(buildupWithFresh(now, 5.5 * D));
      await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
      expect(page.freshLine.value).toMatchObject({ freshEnd: now + 5.5 * D, legEnd: now + 12 * D, seconds: 6.5 * D });
      // Priced lazily, once, after the build-up was on screen: Prestige now, the same route's first stop.
      expect(freshAsks).toHaveLength(1);
      expect(freshAsks[0].continueMaxSeconds).toBeUndefined();
      expect(page.a1Choice.value).toBeNull();
      const t = textOf(await cardHtml(page));
      expect(t).toContain(
        `Starting fresh would end this ascension 6d 12h sooner: ${dateAt(now + 5.5 * D, page.now.value, ZONE)} vs ${dateAt(now + 12 * D, page.now.value, ZONE)}.`
      );
      expect(t).toContain('Switch to Soonest');
      expect(page.simWorking.value).toBeNull();
      scope.stop();
    });

  it('Switch to Soonest: kept for this account and ascension, asked as Fastest under its own key, Setup untouched, never stuck', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ setting: 'buildup', make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupWithFresh(now, 5.5 * D));
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    page.switchToFastest();
    const acct = page.account.value;
    expect(mem.get(`${FASTEST_PICK_PREFIX}${acct}.226`)).toBe('auto');
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(isFastestAsk(sims[1])).toBe(true);
    expect(page.simWorking.value).toBe('working');
    expect(page.freshLine.value).toBeNull();
    sims[1].resolve(freshLeg(now));
    await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
    expect(page.freshLine.value).toBeNull();
    expect(page.fastestFollowed.value).not.toBeNull();
    // The A1 followed is now the fresh start: its prestige at its end.
    expect(page.nextShiftLines.value.find(l => l.kind === 'prestige')?.at).toBe(now + 5.5 * D);
    expect(simSetups().sort()).toEqual([FASTEST_SETUP, FRESH_PRICE_SETUP, 'buildup'].sort());
    // Fastest is no forced build-up: nothing more priced.
    expect(freshAsks).toHaveLength(1);
    expect(useChainSearchStore().firstAscensionChoice).toBe('buildup');
    const t = textOf(await cardHtml(page));
    expect(t).toContain('Following Soonest for this ascension.');
    expect(t).not.toContain('Starting fresh would end');
    // Undo: back to the setting's record, nothing simulated again.
    page.switchToFastest(false);
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    expect(sims).toHaveLength(2);
    expect(mem.has(`${FASTEST_PICK_PREFIX}${acct}.226`)).toBe(false);
    expect(useChainSearchStore().firstAscensionChoice).toBe('buildup');
    scope.stop();
  });

  it('the unfinished build: Switch to Soonest leaves the unfinished-build path (no carry-on inputs)', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ make: unfinished });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    expect(sims[0].inputs.continueMaxSeconds).toBe(0);
    sims[0].resolve(buildupWithFresh(now, 5.5 * D));
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    page.switchToFastest();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(isFastestAsk(sims[1])).toBe(true);
    sims[1].resolve(freshLeg(now));
    await vi.waitFor(() => expect(page.fastestFollowed.value).not.toBeNull(), WAIT);
    expect(page.a1Choice.value).toBeNull();
    expect(useChainSearchStore().firstAscensionChoice).toBe('auto');
    scope.stop();
  });

  it('a reload keeps the switch (its record read, nothing simulated); another stop or account has none', async () => {
    const sims = stubSims();
    const first = await setup({ setting: 'buildup', make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupWithFresh(first.now, 5.5 * D));
    await vi.waitFor(() => expect(first.page.freshLine.value).not.toBeNull(), WAIT);
    first.page.switchToFastest();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    sims[1].resolve(freshLeg(first.now));
    await vi.waitFor(() => expect(first.page.fastestFollowed.value).not.toBeNull(), WAIT);
    const acct = first.page.account.value;
    first.scope.stop();
    const again = await setup({ setting: 'buildup', make: built, fresh: true });
    await vi.waitFor(() => expect(again.page.fastestFollowed.value).not.toBeNull(), WAIT);
    await vi.waitFor(() => expect(again.page.nextShiftLines.value.find(l => l.kind === 'prestige')?.at).toBe(first.now + 5.5 * D), WAIT);
    expect(sims).toHaveLength(2);
    expect(again.page.simWorking.value).toBeNull();
    again.scope.stop();
    // Another stop (another ascension) or another account: not switched.
    mem.delete(`${FASTEST_PICK_PREFIX}${acct}.226`);
    mem.set(`${FASTEST_PICK_PREFIX}${acct}.277`, 'auto');
    mem.set(`${FASTEST_PICK_PREFIX}someotheraccount.226`, 'auto');
    const third = await setup({ setting: 'buildup', make: built, fresh: true });
    await vi.waitFor(() => expect(third.page.freshLine.value).not.toBeNull(), WAIT);
    expect(third.page.fastestFollowed.value).toBeNull();
    third.scope.stop();
  });

  it('storage that refuses the switch: it still holds on this page', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ setting: 'buildup', make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupWithFresh(now, 5.5 * D));
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    const set = localStorage.setItem;
    vi.stubGlobal('localStorage', {
      ...localStorage,
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k.startsWith(FASTEST_PICK_PREFIX)) throw new Error('quota');
        set(k, v);
      },
    });
    page.switchToFastest();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(isFastestAsk(sims[1])).toBe(true);
    scope.stop();
  });
});

describe('no line', () => {
  it('the fresh start only an hour sooner', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ setting: 'buildup', make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupWithFresh(now, 12 * D - H));
    await vi.waitFor(() => expect(page.nextShiftLines.value.find(l => l.kind === 'prestige')?.at).toBe(now + 12 * D), WAIT);
    expect(page.freshLine.value).toBeNull();
    expect(textOf(await cardHtml(page))).not.toContain('Starting fresh');
    scope.stop();
  });

  it("Your setup's Fastest on a built farm: asked as 'auto', no line even if a leg carried a fresh end", async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    expect(sims[0].inputs.firstAscension).toBe('auto');
    sims[0].resolve(buildupWithFresh(now, 5.5 * D));
    await vi.waitFor(() => expect(page.nextShiftLines.value.find(l => l.kind === 'prestige')?.at).toBe(now + 12 * D), WAIT);
    expect(page.freshLine.value).toBeNull();
    expect(freshAsks).toHaveLength(0);
    scope.stop();
  });

  it("the A1 choice's Finish without buying side (the default when the build-up ends later)", async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ make: unfinished });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    // The build-up ends after continue: the choice, continue followed by default.
    freshAt = 2 * D;
    sims[0].resolve(legOf(now, 'buildup', now + 7 * D, { buildup: now + 7 * D, continue: now + 6 * D }));
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(sims[1].inputs.firstAscension).toBe('continue');
    sims[1].resolve(legOf(now, 'continue', now + 6 * D, { buildup: now + 7 * D, continue: now + 6 * D }));
    await vi.waitFor(() => expect(page.a1Finish.value).toBe('default'), WAIT);
    expect(page.freshLine.value).toBeNull();
    expect(freshAsks).toHaveLength(0);
    // Keep building picked: the build-up side's record, the line.
    page.pickA1('buildup');
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    expect(sims).toHaveLength(2);
    scope.stop();
  });
});

describe('words in the card', () => {
  it("the card's own zone, as the A1 choice", async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ setting: 'buildup', make: built });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupWithFresh(now, 5.5 * D));
    await vi.waitFor(() => expect(page.freshLine.value).not.toBeNull(), WAIT);
    expect(textOf(await cardHtml(page))).toContain(freshSoonerLine(page.freshLine.value!, page.now.value, ZONE));
    scope.stop();
  });
});
