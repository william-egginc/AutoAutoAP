/**
 * B1 (spec-r7qa, QA 3 Nov 2026, Willsalt in Safari): Right now's badge said Producing and the Build-up tracker "nothing to
 * buy until your next prestige", but Next step read "Building up until about Nov 3, 2026 at 1:26 PM". Measured on the
 * alt's own save (NowPage.producingNextStep.alt.save.spec.ts): with Your setup's first ascension on Prestige now the
 * simulation of the ascension you are in is a fresh start (variant '1-sale', not 'continue'/'buildup'), started at the
 * moment it was asked, so lib/nextAction.ts read the clock as inside its build-up. The save says otherwise: it wears its
 * production set on a virtue egg (Producing, lib/nowPhase.ts: the save wins) and the tracker, whose `building` is that
 * badge, says nothing to buy. One build state for the three: with Producing a fresh start's build-up hasn't begun, so
 * Next step is its prestige (useNowPage `unstarted`, lib/nextAction.ts `unstarted`).
 *
 * Through useNowPage with the real stores and the Build-up tracker wired as MyRunsView.vue wires it, on the synthetic
 * save in the alt's shape (`nothingToBuyBackup`: Kindness, its production set worn, its farm maxed; id EI0000000000000000,
 * never printed), every simulation run by the REAL simulator in-process. Fixed save time; the waits are for answers.
 */
import '../../../scripts/node-shims';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { SearchInputs } from '@/search/types';
import { nothingToBuyBackup, ONE_CAR_SHORT_SHAPE } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { nextActionWords } from '@/lib/nextAction';
import { ascensionStartOf } from '@/lib/buildUpTracker';
import { useBuildUpTracker } from '@/composables/useBuildUpTracker';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { createChainEvaluator } from '@/search/chain';
import { workerCopy } from '@/search/workerCopy';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const A_ID = 'EI0000000000000000';
const WAIT = { timeout: 120_000, interval: 20 };
const SLOW = 300_000;
const ROUTE = [194, 226, 277, 317, 490];
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
  saveAt = Math.floor(Date.now() / 1000) - 5 * 60;
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

/** Every simulation asked for, run by the real simulator (a worker's plain copy of the inputs). */
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

function save() {
  const b = nothingToBuyBackup(ONE_CAR_SHORT_SHAPE);
  // Worn as the page's delivery set (lib/gearMatch.ts 'production', as the alt wears it): the fixture's quantum stones
  // in the worn metronome and compass are tachyon stones here (the page reads the fixture's own stones as "a mix").
  for (const it of b.artifactsDb.virtueAfxDb.inventoryItems.slice(0, 3))
    for (const st of it.artifact.stones) if (st.name === 36) st.name = 1;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = saveAt;
  b.approxTime = saveAt;
  b.farms[0].lastStepTime = saveAt - 1800;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

async function setup(firstAscension: 'fresh' | 'auto') {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  useChainSearchStore().setFirstAscension(firstAscension);
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
  const { page, tracker } = scope.run(() => {
    const page = useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) });
    // As MyRunsView.vue wires it: the tracker builds only while the badge says Building.
    const tracker = useBuildUpTracker({
      account: computed(() => page.account.value || null),
      hasSave: page.hasSave,
      onVirtue: page.onVirtue,
      followed: computed(() => !!page.follow.value),
      building: computed(() => page.phase.value?.phase === 'building'),
      ascensionStart: computed(() => ascensionStartOf(page.cardPlan.value?.plan ?? null, page.now.value)),
      saveSeconds: page.saveSeconds,
      zone: page.zone,
      hours: computed(() => null),
      now: page.now,
      fresh: page.buildUpPlan,
      sim: page.buildUpSim,
      saveFarm: page.buildUpSave,
      finishChosen: page.a1Finish,
    });
    return { page, tracker };
  })!;
  page.selectGoal('fastest-490');
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull(), WAIT);
  return { page, tracker };
}
type Page = Awaited<ReturnType<typeof setup>>['page'];

async function cardText(page: Page) {
  return textOf(
    await renderHtml(
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
        phase: page.phase.value,
      },
      {},
      [getActivePinia()!]
    )
  );
}

describe('B1: a producing save never reads "Building up until"', () => {
  it(
    'Prestige now: Producing, tracker nothing to buy, Next step the prestige (then the fresh start\'s shifts)',
    async () => {
      const asked = realSims();
      const { page, tracker } = await setup('fresh');
      await vi.waitFor(() => expect(page.nextStep.value).not.toBeNull(), WAIT);
      // The ask is the fresh start, and the farm is built: no unfinished-build path.
      expect(asked[0].inputs.firstAscension).toBe('fresh');
      expect(page.saveBuildLeft.value).toEqual([]);
      expect(page.phase.value?.phase).toBe('producing');
      expect(tracker.state.value).toBe('notBuilding');
      const words = nextActionWords(page.nextStep.value!, t => String(t));
      expect(words).not.toMatch(/Building up/);
      expect(page.nextStep.value!.kind).toBe('prestige');
      // At once (the clock is past the fresh start's start), never in the past.
      expect((page.nextStep.value as { at: number }).at).toBeGreaterThanOrEqual(page.now.value);
      const lines = page.nextShiftLines.value;
      expect(lines.map(l => l.kind)).not.toContain('build');
      expect(lines[0]).toMatchObject({ kind: 'prestige', te: page.teSoFar.value });
      expect(lines.slice(1).some(l => l.kind === 'shift')).toBe(true);
      const t = await cardText(page);
      expect(t).toMatch(/Next step Prestige at /);
      expect(t).not.toMatch(/Building up until/);
    },
    SLOW
  );

  it(
    'Your setup as it comes (Soonest): the farm carried on, Next step a shift',
    async () => {
      realSims();
      const { page, tracker } = await setup('auto');
      await vi.waitFor(() => expect(page.nextStep.value).not.toBeNull(), WAIT);
      expect(page.phase.value?.phase).toBe('producing');
      expect(tracker.state.value).toBe('notBuilding');
      expect(['shift', 'prestige']).toContain(page.nextStep.value!.kind);
      expect(nextActionWords(page.nextStep.value!, t => String(t))).not.toMatch(/Building up/);
    },
    SLOW
  );
});
