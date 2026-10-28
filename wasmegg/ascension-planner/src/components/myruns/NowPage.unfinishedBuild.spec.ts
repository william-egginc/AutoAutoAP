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
/** `farm`: the virtue farm's habs, population and vehicles in place of the synthetic save's. */
function save(farm?: {
  habs: number[];
  habPopulation: number[];
  vehicles: number[];
  trainLength: number[];
  commonResearch?: { id: string; level: number }[];
}) {
  const b = syntheticBackup();
  if (farm)
    Object.assign(b.farms[0], {
      ...farm,
      commonResearch: [...b.farms[0].commonResearch, ...(farm.commonResearch ?? [])],
    });
  const t = Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

async function setup(farm?: Parameters<typeof save>[0]) {
  loadAndSyncBackup(A_ID, save(farm), 'plan_next');
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

describe("pieha's state: mid-ascension on Curiosity, habs not all bought", () => {
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
        { at: buildEnd, egg: 'kindness', fromEgg: 'curiosity' },
        { at: now + 30 * H, egg: 'humility', fromEgg: 'curiosity' },
        { at: now + 30 * H, egg: 'kindness', fromEgg: 'humility' },
      ],
      endEgg: { egg: 'kindness', te: 40 },
    } as LegSummary);
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'));
    expect(page.nextStep.value).toEqual({ kind: 'keepbuilding', until: buildEnd, left: ['habs'] });
    const kinds = page.nextShiftLines.value.map(l => [l.kind, l.egg ?? null]);
    expect(kinds[0]).toEqual(['keepbuilding', null]);
    expect(kinds[1]).toEqual(['shift', 'kindness']);
    const t = await cardText(page);
    expect(t).toMatch(/Next step Keep building: habs until about [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    expect(t).toMatch(/Next shifts Keep building: habs until about [^·]*Shift to Kindness · about/);
    expect(t).not.toMatch(/Next step (Shift to Curiosity|Prestige)/);
    scope.stop();
  });
});

/** A stand-in leg of the build-up kind ending its build at `buildEnd`, Humility then Kindness after it. */
function buildupLeg(now: number, buildEnd: number, firstShift: number): LegSummary {
  return {
    key: 'buildup',
    endTE: 226,
    durationSeconds: 40 * H,
    maxELR: 1e12,
    endTime: now + 39 * H,
    tier13Unlocked: false,
    startTime: now - H,
    buildPhaseEndTime: buildEnd,
    shifts: [
      { at: firstShift, egg: 'humility', fromEgg: 'curiosity' },
      { at: firstShift, egg: 'kindness', fromEgg: 'humility' },
    ],
    endEgg: { egg: 'kindness', te: 40 },
  } as LegSummary;
}
function stubSims() {
  const sims: { inputs: SearchInputs; resolve: (l: LegSummary | null) => void }[] = [];
  setSimRunner(
    (): SimRunner => ({
      run: inputs => new Promise(resolve => sims.push({ inputs, resolve })),
      terminate: () => undefined,
    })
  );
  return sims;
}
const CU = [18, 18, 18, 18];
const SHIPPING_RESEARCH = [
  'lightweight_boxes',
  'driver_training',
  'super_alloy',
  'quantum_storage',
  'hover_upgrades',
  'dark_containment',
  'neural_net_refine',
  'hyper_portalling',
];
const FULL = [1e10, 1e10, 1e10, 1e10];

describe("Jordan's producing farm (28 Oct 2026): four Chicken Universes, habs full, a few slots short of a full hyperloop", () => {
  it('delivery limited by laying: built; no forced build-up, no keep-building line', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({
      habs: CU,
      habPopulation: FULL,
      vehicles: [...Array(13).fill(11), 11, 10, 9, 9],
      trainLength: [...Array(13).fill(10), 6, 5, 5, 3],
      // Its shipping research done (each at its top: the levels are clamped).
      commonResearch: SHIPPING_RESEARCH.map(id => ({ id, level: 999 })),
    });
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].inputs.firstAscension).toBe('auto');
    expect(sims[0].inputs.continueMaxSeconds).toBeUndefined();
    // Even a build-up leg (Soonest may take one): the build isn't said.
    sims[0].resolve(buildupLeg(now, now + 17 * 24 * H, now + 16 * 24 * H));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'));
    expect(page.nextShiftLines.value.some(l => l.kind === 'keepbuilding')).toBe(false);
    const t = await cardText(page);
    expect(t).not.toContain('Keep building');
    scope.stop();
  });

  it('shipping below laying (two small vehicles): Keep building: vehicles', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ habs: CU, habPopulation: FULL, vehicles: [9, 9], trainLength: [1, 1] });
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].inputs.firstAscension).toBe('buildup');
    sims[0].resolve(buildupLeg(now, now + 10 * H, now + 12 * H));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'));
    expect(page.nextStep.value).toEqual({ kind: 'keepbuilding', until: now + 10 * H, left: ['vehicles'] });
    expect(await cardText(page)).toMatch(/Next step Keep building: vehicles until about/);
    scope.stop();
  });

  it('a build that ends after the first shift: no keep-building line, the shift first', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ habs: CU, habPopulation: FULL, vehicles: [9, 9], trainLength: [1, 1] });
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    // Jordan's: the build "until Nov 14, 10:00 AM", Humility Nov 13, 9:05 PM.
    sims[0].resolve(buildupLeg(now, now + 17 * 24 * H, now + 16 * 24 * H + 11 * H));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'));
    expect(page.nextShiftLines.value[0]).toMatchObject({ kind: 'shift', egg: 'humility' });
    expect(page.nextShiftLines.value.some(l => l.kind === 'keepbuilding')).toBe(false);
    scope.stop();
  });
});

/**
 * A RECORD KEPT UNDER THE OLD RULE (28 Oct 2026, Jordan's iPhone: after the producing-farm fix, Chrome said "Shift to
 * Humility" but the phone still read the build-up). Suspected: the phone kept the simulation of the ascension you are
 * in (lib/followSim.ts, localStorage `aap-follow-sim`) made when every slot short of a full hyperloop counted as
 * unfinished vehicles, the build-up forced, its build ending before Humility; or the estimate shown last
 * (lib/heldEstimate.ts, "From <time>, checking…") carrying it. Same account, save and route: a build the save now says
 * is finished reads neither as a build-up.
 */
describe("Jordan's producing farm with records kept under the old rule", () => {
  const JORDAN = {
    habs: CU,
    habPopulation: FULL,
    vehicles: [...Array(13).fill(11), 11, 10, 9, 9],
    trainLength: [...Array(13).fill(10), 6, 5, 5, 3],
    commonResearch: SHIPPING_RESEARCH.map(id => ({ id, level: 999 })),
  };
  type Kept = { setup: string; leg: Record<string, unknown> };
  /** A first visit keeps this build's record for the account, save and route; it is returned and the browser emptied. */
  async function keptNow(): Promise<{ kept: Kept; now: number }> {
    const sims = stubSims();
    const first = await setup(JORDAN);
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    const now = first.now;
    sims[0].resolve({ ...buildupLeg(now, now - H, now + 16 * 24 * H), key: 'continue' } as LegSummary);
    await vi.waitFor(() => expect(first.page.nextStep.value?.kind).toBe('shift'));
    first.scope.stop();
    const kept = JSON.parse(mem.get('aap-follow-sim') ?? '[]') as Kept[];
    expect(kept).toHaveLength(1);
    mem.clear();
    setActivePinia(createPinia());
    return { kept: kept[0], now };
  }
  /** The record as the old rule made it: the build-up's setup, the forced build-up whose build ends before Humility. */
  function oldRule(k: Kept, now: number, setupAs: 'old' | 'same'): Kept {
    const s = JSON.parse(k.setup) as unknown[];
    return {
      ...k,
      setup: setupAs === 'old' ? JSON.stringify(s.map((x, i) => (i === 3 ? 'buildup, build unfinished' : x))) : k.setup,
      leg: { ...k.leg, key: 'buildup', buildPhaseEndTime: now + 10 * H },
    };
  }
  const noBuildLine = async (page: Awaited<ReturnType<typeof setup>>['page']) => {
    expect(page.nextStep.value?.kind ?? null).not.toBe('keepbuilding');
    expect(page.nextStep.value?.kind ?? null).not.toBe('build');
    expect(page.nextShiftLines.value.some(l => l.kind === 'keepbuilding' || l.kind === 'build')).toBe(false);
    const t = await cardText(page);
    expect(t).not.toContain('Keep building');
    expect(t).not.toContain('Building up');
  };

  it('the old build-up record is not reused: simulated again with Your setup, no keep-building line, the shift first', async () => {
    const { kept, now } = await keptNow();
    mem.set('aap-follow-sim', JSON.stringify([oldRule(kept, now, 'old')]));
    const sims = stubSims();
    const again = await setup(JORDAN);
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].inputs.firstAscension).toBe('auto');
    await noBuildLine(again.page);
    sims[0].resolve({ ...buildupLeg(now, now - H, now + 16 * 24 * H), key: 'continue' } as LegSummary);
    await vi.waitFor(() => expect(again.page.nextStep.value?.kind).toBe('shift'));
    await noBuildLine(again.page);
    again.scope.stop();
  });

  it("even a build-up leg kept under today's key says no build: the build words follow the save, not the record", async () => {
    const { kept, now } = await keptNow();
    mem.set('aap-follow-sim', JSON.stringify([oldRule(kept, now, 'same')]));
    const sims = stubSims();
    const again = await setup(JORDAN);
    await vi.waitFor(() => expect(again.page.nextStep.value?.kind).toBe('shift'));
    expect(sims).toHaveLength(0);
    await noBuildLine(again.page);
    again.scope.stop();
  });

  it('the estimate shown last ("From <time>, checking…"), even one with a build-up leg in it, says no build', async () => {
    const { kept, now } = await keptNow();
    mem.set('aap-follow-sim', JSON.stringify([oldRule(kept, now, 'old')]));
    const { planFromEstimate } = await import('@/lib/followEstimate');
    const plan = planFromEstimate(
      {
        chain: [226, 277, 317, 490],
        end: now + 60 * 24 * H,
        seconds: 60 * 24 * H,
        legs: [
          {
            from: 196,
            to: 226,
            endTE: 226,
            start: now - H,
            end: now + 17 * 24 * H,
            sales: 0,
            tier13: false,
            label: 'continue',
          },
          {
            from: 226,
            to: 277,
            endTE: 277,
            start: now + 18 * 24 * H,
            end: now + 30 * 24 * H,
            sales: 0,
            tier13: false,
            label: '1-sale',
          },
          {
            from: 277,
            to: 317,
            endTE: 317,
            start: now + 31 * 24 * H,
            end: now + 45 * 24 * H,
            sales: 0,
            tier13: false,
            label: '1-sale',
          },
          {
            from: 317,
            to: 490,
            endTE: 490,
            start: now + 46 * 24 * H,
            end: now + 60 * 24 * H,
            sales: 0,
            tier13: false,
            label: '1-sale',
          },
        ],
      },
      { goal: 'fastest', deadline: null },
      {
        meta: null,
        pricing: { v: 1, final: 490, options: { startTE: 196, start: now - H, firstLegs: [], deliveryScale: 1 } },
      } as never,
      Date.now() - 2 * H * 1000
    );
    // As an older build might have kept it: the first ascension the simulated build-up, its build before Humility.
    plan.tableLegs![0] = {
      ...plan.tableLegs![0],
      simulated: true,
      variant: 'buildup',
      buildEnd: now + 10 * H,
      shifts: [
        { at: now + 16 * 24 * H, egg: 'humility' },
        { at: now + 16 * 24 * H, egg: 'kindness' },
      ],
    };
    const card = {
      chain: [226, 277, 317, 490],
      from: 'typed',
      price: 'estimate',
      source: 'this-save',
      pricedSave: null,
    };
    const { keepHeld } = await import('@/lib/heldEstimate');
    const { accountOf } = await import('@/search/runSaves');
    const b = save(JORDAN);
    expect(
      keepHeld({
        account: accountOf(b),
        goalKey: 'fastest-490',
        chain: [226, 277, 317, 490],
        at: Date.now() - 2 * H * 1000,
        plan: {
          plan,
          goal: { goal: 'fastest', target: 490, deadline: null },
          state: 'this-save',
          secondary: null,
          key: 'fastest-490',
          name: 'Fastest to 490 TE',
          followed: card,
        },
        card,
      })
    ).toBe(true);
    const sims = stubSims();
    const again = await setup(JORDAN);
    await vi.waitFor(() => expect(again.page.follow.value?.staleAt).toBeGreaterThan(0));
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].inputs.firstAscension).toBe('auto');
    await noBuildLine(again.page);
    expect(await cardText(again.page)).toMatch(/From .+, checking…/);
    sims[0].resolve({ ...buildupLeg(now, now - H, now + 16 * 24 * H), key: 'continue' } as LegSummary);
    await vi.waitFor(() => expect(again.page.nextStep.value?.kind).toBe('shift'));
    await noBuildLine(again.page);
    again.scope.stop();
  });
});
