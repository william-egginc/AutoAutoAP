/**
 * THE ASCENSION YOU ARE IN WITH ITS BUILD UNFINISHED (27 Oct 2026, pieha and Jordan). pieha is mid-ascension with not
 * all vehicles bought; Next step said "Shift to Curiosity", then the delivery loop from Humility: no build-up, Kindness
 * not first. The simulation of the ascension you are in took Your setup's first-ascension rule (Soonest: whichever of
 * finish without buying, carry on the build or prestige ends first), so a frozen farm's delivery loop could win, and a
 * build-up leg's build was never said (a live leg never "builds up"). Now: a save whose build isn't finished is
 * simulated as the build-up carried on from it, and Next step and Next shifts start with "Keep building: … until
 * about <the build phase's end>". Through useNowPage with the synthetic save (id EI0000000000000000, never printed:
 * its virtue farm on Curiosity, habs and vehicles not all bought) and stand-in workers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary, SearchInputs } from '@/search/types';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
let mem: Map<string, string>;
let calls: { chain: number[]; resolve: (r: Route | null) => void }[];

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
  setChainPricer(
    (): ChainPricer => ({
      priceChain: (_url: string, _o: PolishOptions, chain: number[]) =>
        new Promise(resolve => calls.push({ chain, resolve })),
      terminate: () => undefined,
    })
  );
  setSimTiming({ delayMs: 0 });
});
afterEach(() => {
  setChainPricer(null);
  setSimRunner(null);
  setSimTiming(null);
});

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

async function setup() {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const now = Math.floor(Date.now() / 1000);
  mem.set(
    `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
    JSON.stringify({
      'fastest-490': { chain: [226, 277, 317, 490], from: 'typed', source: 'manual', at: Date.now() - 60_000 },
    })
  );
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() =>
    useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) })
  )!;
  page.selectGoal('fastest-490');
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
  return { page, scope, now };
}

async function cardText(page: Awaited<ReturnType<typeof setup>>['page']) {
  return textOf(
    await renderHtml(
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
      },
      {},
      [getActivePinia()!]
    )
  );
}

describe("pieha's state: mid-ascension on Curiosity, vehicles and habs not all bought", () => {
  it('simulated as the build-up carried on from the save (never a frozen farm), and Next step and Next shifts start with Keep building', async () => {
    const sims: { inputs: SearchInputs; chain: number[]; resolve: (l: LegSummary | null) => void }[] = [];
    setSimRunner(
      (): SimRunner => ({
        run: (inputs, chain) => new Promise(resolve => sims.push({ inputs, chain, resolve })),
        terminate: () => undefined,
      })
    );
    const { page, scope, now } = await setup();
    // No instant answer kept for this save: the ascension you are in alone (lib/nextAction.ts, `more`).
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].chain).toEqual([226]);
    // Your setup says Soonest; the save's build isn't finished: the build-up, and no frozen farm as a candidate.
    expect(sims[0].inputs.firstAscension).toBe('buildup');
    expect(sims[0].inputs.continueMaxSeconds).toBe(0);

    const buildEnd = now + 14 * H + 17 * 60;
    sims[0].resolve({
      key: 'buildup',
      endTE: 226,
      durationSeconds: 40 * H,
      maxELR: 1e12,
      endTime: now + 39 * H,
      tier13Unlocked: false,
      startTime: now - H,
      buildPhaseEndTime: buildEnd,
      shifts: [
        { at: now + 2 * H, egg: 'kindness', fromEgg: 'curiosity' },
        { at: buildEnd, egg: 'curiosity', fromEgg: 'kindness' },
        { at: now + 30 * H, egg: 'humility', fromEgg: 'curiosity' },
        { at: now + 30 * H, egg: 'kindness', fromEgg: 'humility' },
      ],
      endEgg: { egg: 'kindness', te: 40 },
    } as LegSummary);
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'));
    expect(page.nextStep.value).toEqual({ kind: 'keepbuilding', until: buildEnd, left: ['vehicles', 'habs'] });
    const kinds = page.nextShiftLines.value.map(l => [l.kind, l.egg ?? null]);
    expect(kinds[0]).toEqual(['keepbuilding', null]);
    expect(kinds[1]).toEqual(['shift', 'kindness']);
    const t = await cardText(page);
    expect(t).toMatch(/Next step Keep building: vehicles and habs until about [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    expect(t).toMatch(/Next shifts Keep building: vehicles and habs until about [^·]*Shift to Kindness · about/);
    expect(t).not.toMatch(/Next step (Shift to Curiosity|Prestige)/);
    scope.stop();
  });
});
