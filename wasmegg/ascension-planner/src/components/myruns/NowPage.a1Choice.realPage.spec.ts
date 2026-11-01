/**
 * MY RUNS' A1 CHOICE ON THE REAL PAGE PATH (spec-r7redteam-f, 1 Nov 2026; QA's follow-up in redteam-r7: the choice never
 * showed in the live page, not even on `oneCarShortBackup`, while leg.a1Choice.spec.ts (runLeg with 'buildup' forced) and
 * NowPage.a1Choice.spec.ts (stand-in legs) passed). Here nothing is forced: useNowPage on a synthetic save (id
 * EI0000000000000000, never printed) with the real stores, its build judged by lib/saveBuild.ts `buildLeft` from the
 * page's own rates (`fullHabRates`: the save's equipped set read from its inventory), and every simulation the page asks
 * for run by the REAL simulator in-process (search/chain.ts `createChainEvaluator`, as the chain worker runs it). Fixed
 * save time; the waits are for answers, never for time.
 */
import '../../../scripts/node-shims';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { SearchInputs } from '@/search/types';
import { oneCarShortBackup } from '@/test/syntheticSave';
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

/** Every simulation the page asks for, run by the real simulator on the page's own inputs (a worker's plain copy). */
function realSims() {
  const asked: { inputs: SearchInputs; chain: number[] }[] = [];
  setSimRunner(
    (): SimRunner => ({
      run: async (inputs, chain, opts) => {
        asked.push({ inputs, chain });
        await Promise.resolve();
        return createChainEvaluator(workerCopy(inputs)).evaluate(chain, opts)?.legs ?? null;
      },
      terminate: () => undefined,
    })
  );
  return asked;
}

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

async function setup(make: () => any) {
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
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
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

/** What buildLeft was given and said on this page (printed when a test fails). */
function why(page: Page) {
  const r = page.fullHabRates.value;
  return JSON.stringify({
    rates: r ? { laying: r.perChicken * r.maxHabs, maxElr: r.maxElr, shippingShare: r.maxElr / (r.perChicken * r.maxHabs) } : null,
    buildLeft: page.saveBuildLeft.value,
  });
}

describe("QA's oneCarShortBackup through the real page", () => {
  it('the A1 choice appears: build-up buys N > 0 and ends later than continue (6.90 d vs 6.39 d)', async () => {
    const asked = realSims();
    const { page } = await setup(oneCarShortBackup);
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0), WAIT);
    process.stderr.write(`\n[a1 real page] ${why(page)} first ask: ${asked[0].inputs.firstAscension} continueMaxSeconds ${asked[0].inputs.continueMaxSeconds}\n`);
    await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
    expect(page.a1Choice.value, why(page)).not.toBeNull();
    const c = page.a1Choice.value!;
    expect(c.buys).toBeGreaterThan(0);
    expect(c.buildEnd).toBeGreaterThan(c.contEnd);
    expect(await cardHtml(page)).toContain('data-testid="now-a1-choice"');
    void D;
    void textOf;
  });
});
