/**
 * MY RUNS' A1 CHOICE ON THE REAL PAGE PATH (spec-r7redteam-f, 1 Nov 2026; QA's follow-up in redteam-r7: the choice never
 * showed in the live page, not even on `oneCarShortBackup`, while leg.a1Choice.spec.ts (runLeg with 'buildup' forced) and
 * NowPage.a1Choice.spec.ts (stand-in legs) passed). Here nothing is forced: useNowPage on a synthetic save (id
 * EI0000000000000000, never printed) with the real stores, its build judged by lib/saveBuild.ts `buildLeft` from the
 * page's own rates (`fullHabRates`: the save's equipped set read from its inventory), and every simulation the page asks
 * for run by the REAL simulator in-process (search/chain.ts `createChainEvaluator`, as the chain worker runs it). Fixed
 * save time; the waits are for answers, never for time.
 *
 * WHY QA NEVER SAW IT (measured here first, on 35f61806): on `oneCarShortBackup` the page HAS its rates (laying
 * 1.72e12/s, delivery at full habs 1.72e12/s: 169 cars ship more than the farm lays), so buildLeft says built ([]),
 * the simulation is asked with Your setup ('auto') and the A1 choice's path is never entered. That is ux30's rule
 * working (a laying-limited farm is built, whatever its slots): the fixture was not an unfinished build. The page's
 * case is `shippingShortBackup` (nine full hyperloops: shipping about 0.955 of laying), below.
 */
import '../../../scripts/node-shims';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { SearchInputs } from '@/search/types';
import { nothingToBuyBackup, oneCarShortBackup, ONE_CAR_SHORT_SHAPE, shippingShortBackup } from '@/test/syntheticSave';
import { CONTINUE_MAX_SECONDS } from '@/search/rules';
import { a1ChoiceWords } from '@/lib/a1Choice';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { createChainEvaluator } from '@/search/chain';
import { workerCopy } from '@/search/workerCopy';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 24 * H;
const A_ID = 'EI0000000000000000';
/** Real simulations of a whole ascension: the ceiling only says how long a failing wait takes to fail. */
const WAIT = { timeout: 120_000, interval: 20 };
/** A test's own ceiling: above every wait in it. */
const SLOW = 300_000;
let mem: Map<string, string>;
let saveAt: number;
/** The clock, pinned (5 Nov 2026: two tests failed on a Thursday). The simulated A1 shifts for the Friday 9am PT
 *  Research Sale (lib/events.ts), so near a Friday its shifts before the prestige pass Next shifts' 5 (lib/nextAction.ts
 *  `nextShifts`) and the prestige line these tests read is rightly cut off. A Tuesday, the sale days away. */
const CLOCK = Date.UTC(2026, 10, 3, 12, 0);

beforeEach(() => {
  // Only Date: vi.waitFor and the simulations keep real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLOCK);
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
  vi.useRealTimers();
  for (const s of scopes.splice(0)) s.stop();
  setChainPricer(null);
  setSimRunner(null);
  setSimTiming(null);
});

/** Every simulation the page asks for, run by the real simulator on the page's own inputs (a worker's plain copy). */
function realSims() {
  const asked: { inputs: SearchInputs; chain: number[] }[] = [];
  setSimRunner(
    (): SimRunner => ({
      run: async (inputs, chain, opts) => {
        // The lazy fresh-start pricing beside a forced build-up (useNowPage `freshSim`, NowPage.freshSooner.spec.ts): left unanswered here.
        if (inputs.firstAscension === 'fresh') return new Promise(() => undefined);
        asked.push({ inputs, chain });
        await Promise.resolve();
        return createChainEvaluator(workerCopy(inputs)).evaluate(chain, opts)?.legs ?? null;
      },
      terminate: () => undefined,
    })
  );
  return asked;
}
/** Asks recorded, never answered: what the page asks for, not the (slow) simulation of a farm off the unfinished path. */
function heldSims() {
  const asked: { inputs: SearchInputs; chain: number[] }[] = [];
  setSimRunner(
    (): SimRunner => ({
      run: (inputs, chain) => {
        // The lazy fresh-start pricing beside a forced build-up (useNowPage `freshSim`, NowPage.freshSooner.spec.ts): left unanswered here.
        if (inputs.firstAscension === 'fresh') return new Promise(() => undefined);
        asked.push({ inputs, chain });
        return new Promise(() => undefined);
      },
      terminate: () => undefined,
    })
  );
  return asked;
}
type Ask = { inputs: SearchInputs };
/** My runs' unfinished-build path, each side (useNowPage `simRequest`, lib/a1Choice.ts `a1Inputs`). */
const isBuildupAsk = (s: Ask) => s.inputs.firstAscension === 'buildup' && s.inputs.continueMaxSeconds === 0;
const isContinueAsk = (s: Ask) =>
  s.inputs.firstAscension === 'continue' &&
  s.inputs.continuePinSeconds === CONTINUE_MAX_SECONDS &&
  s.inputs.continueMaxSeconds === undefined;
const simSetups = () =>
  (JSON.parse(mem.get('aap-follow-sim') ?? '[]') as { setup: string }[]).map(r => JSON.parse(r.setup)[3] as string);

/** The fixture as a save of this account, synced an hour ago (its farm stepped then too). */
function save(make: () => any) {
  const b = make();
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = saveAt;
  b.approxTime = saveAt;
  b.farms[0].lastStepTime = saveAt - 1800;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** The followed route starts at 194 TE (the leg specs' goal from the fixture's 190). */
const ROUTE = [194, 226, 277, 317, 490];

async function setup(make: () => any, o: { fresh?: boolean } = {}) {
  if (o.fresh) setActivePinia(createPinia());
  loadAndSyncBackup(A_ID, save(make), 'plan_next');
  rollUpPendingTE();
  const { resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  mem.set(
    `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
    JSON.stringify({ 'fastest-490': { chain: ROUTE, from: 'typed', source: 'manual', at: Date.now() - 60_000 } })
  );
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''), WAIT);
  const scope = effectScope();
  scopes.push(scope);
  const page = scope.run(() =>
    useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) })
  )!;
  page.selectGoal('fastest-490');
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull(), WAIT);
  return { page, scope };
}
type Page = Awaited<ReturnType<typeof setup>>['page'];

async function cardHtml(page: Page) {
  return renderHtml(
    RightNowCard,
    {
      card: page.cardPlan.value,
      onVirtue: true,
      currentEgg: 'kindness',
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
    },
    {},
    [getActivePinia()!]
  );
}

/** When Next shifts says to prestige (the end of the ascension followed); null when it doesn't say. */
function prestigeAt(page: Page): number | null {
  return page.nextShiftLines.value.find(l => l.kind === 'prestige')?.at ?? null;
}

/** What buildLeft was given and said on this page (printed when a test fails). */
function why(page: Page) {
  const r = page.fullHabRates.value;
  return JSON.stringify({
    rates: r
      ? { laying: r.perChicken * r.maxHabs, maxElr: r.maxElr, shippingShare: r.maxElr / (r.perChicken * r.maxHabs) }
      : null,
    buildLeft: page.saveBuildLeft.value,
  });
}

/** Shipping far short of laying: every slot the weakest vehicle. */
function weakestSlots() {
  const b = nothingToBuyBackup(ONE_CAR_SHORT_SHAPE);
  b.farms[0].vehicles = Array(17).fill(0);
  b.farms[0].trainLength = Array(17).fill(1);
  return b;
}

describe('a farm that ships less than it lays at full habs (shippingShortBackup): the A1 choice on the real page', () => {
  it(
    "the page's own rates say vehicles; every ask on the unfinished path; the choice shows (buys N > 0, later), Finish followed; never stuck",
    async () => {
      const asked = realSims();
      const { page } = await setup(shippingShortBackup);
      await vi.waitFor(() => expect(asked).toHaveLength(2), WAIT);
      await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
      // buildLeft's inputs: the rates are there (the save's equipped set), shipping below laying at full habs.
      const r = page.fullHabRates.value!;
      expect(r, why(page)).not.toBeNull();
      expect(r.maxElr / (r.perChicken * r.maxHabs)).toBeLessThan(0.97);
      expect(page.saveBuildLeft.value).toEqual(['vehicles']);
      // Both sides asked, the build-up first; never Your setup's rule ('auto') before the rates were in.
      expect(isBuildupAsk(asked[0]), why(page)).toBe(true);
      expect(isContinueAsk(asked[1])).toBe(true);
      expect(asked.every(a => a.inputs.firstAscension !== 'auto')).toBe(true);
      const c = page.a1Choice.value!;
      expect(c, why(page)).not.toBeNull();
      expect(c).toMatchObject({ side: 'continue', picked: false });
      expect(c.buys).toBeGreaterThan(0);
      // Measured: the build-up ends about 0.2 days after finishing without buying.
      expect((c.buildEnd - c.contEnd) / D).toBeGreaterThan(0.1);
      expect(page.a1Finish.value).toBe('default');
      expect(page.nextStep.value?.kind).not.toBe('keepbuilding');
      const html = await cardHtml(page);
      expect(html).toContain('data-testid="now-a1-choice"');
      expect(html).toMatch(/aria-checked="true"[^>]*data-testid="now-a1-continue"/);
      // In the card's own zone (A1Choice.vue formats the dates with the card's `zone`).
      const w = a1ChoiceWords(c, page.now.value, ZONE);
      expect(textOf(html)).toContain(w.keep);
      expect(textOf(html)).toContain(w.finish);
      expect(w.keep).toMatch(new RegExp(`^Keep building \\(buys ${c.buys} things, ends `));
      expect(simSetups().sort()).toEqual(['buildup, build unfinished', 'continue, build unfinished']);
    },
    SLOW
  );

  it(
    'Keep building / Finish without buying: the side followed and its request change; a reload asks for the picked side only',
    async () => {
      const asked = realSims();
      const { page, scope } = await setup(shippingShortBackup);
      await vi.waitFor(() => expect(page.a1Choice.value).not.toBeNull(), WAIT);
      await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
      const { buildEnd, contEnd } = page.a1Choice.value!;
      // Followed by default: finishing without buying, its prestige at continue's end.
      expect(prestigeAt(page)).toBeCloseTo(contEnd, 0);
      page.pickA1('buildup');
      await vi.waitFor(() => expect(prestigeAt(page)).toBeCloseTo(buildEnd, 0), WAIT);
      expect(page.a1Choice.value).toMatchObject({ side: 'buildup', picked: true });
      expect(page.a1Finish.value).toBeNull();
      expect(page.simWorking.value).toBeNull();
      // A reload with no kept simulations: the pick decides the first ask (the build-up side), and nothing else is asked.
      scope.stop();
      mem.delete('aap-follow-sim');
      const n = asked.length;
      const again = await setup(shippingShortBackup, { fresh: true });
      await vi.waitFor(() => expect(again.page.a1Choice.value).toMatchObject({ side: 'buildup', picked: true }), WAIT);
      await vi.waitFor(() => expect(again.page.simWorking.value).toBeNull(), WAIT);
      expect(asked.slice(n).map(isBuildupAsk)).toEqual([true]);
      expect(prestigeAt(again.page)).toBeCloseTo(buildEnd, 0);
      // Finish without buying: the continue side is asked for now, and followed.
      again.page.pickA1('continue');
      await vi.waitFor(() => expect(asked.length).toBe(n + 2), WAIT);
      expect(isContinueAsk(asked[n + 1])).toBe(true);
      await vi.waitFor(() => expect(prestigeAt(again.page)).toBeCloseTo(contEnd, 0), WAIT);
      expect(again.page.simWorking.value).toBeNull();
      expect(again.page.a1Finish.value).toBe('picked');
    },
    SLOW
  );

  it(
    'shipping far short (every slot the weakest vehicle): the unfinished path, a sooner build-up, so no choice',
    async () => {
      const asked = realSims();
      const { page } = await setup(weakestSlots);
      await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0), WAIT);
      await vi.waitFor(() => expect(prestigeAt(page)).not.toBeNull(), WAIT);
      expect(page.simWorking.value).toBeNull();
      expect(page.saveBuildLeft.value).toEqual(['vehicles']);
      // The build-up side only: it ends sooner, so finishing without buying is never asked for.
      expect(asked.map(isBuildupAsk)).toEqual([true]);
      expect(page.a1Choice.value).toBeNull();
      expect(page.a1Finish.value).toBeNull();
    },
    SLOW
  );
});

describe('farms the page rightly calls built (delivery limited by laying): off the unfinished path, no choice', () => {
  it.each([
    // QA's fixture: the last hyperloop one car short, but 169 cars ship far more than the farm lays.
    ['oneCarShortBackup', oneCarShortBackup],
    // Truly finished: seventeen full hyperloops.
    ['nothingToBuyBackup', () => nothingToBuyBackup(ONE_CAR_SHORT_SHAPE)],
  ])(
    '%s: delivery at full habs = laying; asked with Your setup, no choice, no keep-building line',
    async (_name, make) => {
      const asked = heldSims();
      const { page } = await setup(make);
      await vi.waitFor(() => expect(asked).toHaveLength(1), WAIT);
      const r = page.fullHabRates.value!;
      expect(r.maxElr).toBeCloseTo(r.perChicken * r.maxHabs, -6);
      expect(page.saveBuildLeft.value).toEqual([]);
      expect(asked[0].inputs.firstAscension).toBe('auto');
      expect(asked[0].inputs.continueMaxSeconds).toBeUndefined();
      expect(page.a1Choice.value).toBeNull();
      expect(page.nextShiftLines.value.some(l => l.kind === 'keepbuilding')).toBe(false);
      expect(textOf(await cardHtml(page))).not.toMatch(/Keep building|Pick one/);
    },
    SLOW
  );
});
