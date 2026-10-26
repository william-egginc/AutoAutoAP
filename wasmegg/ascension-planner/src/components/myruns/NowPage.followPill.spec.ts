/**
 * A FOLLOWED GOAL'S PILL (25 Oct 2026, Jordan): on My runs › Right now the Fastest to 490 TE pill said "no saved plan
 * yet" while the line under it said "Following 226 → 277 → 317 → 490 … not priced on this save yet". The pill of a
 * followed goal now says what is true of its route in the follow line's words, and every followed goal's route is
 * estimated on load (the picked one first, the others in the background), as Egg Day's was only once picked. Through
 * useNowPage with the synthetic save (id EI0000000000000000, never printed) and a stand-in route worker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import type { LegSummary } from '@/search/types';
import { instantSnapKey, writeSnapshot, type SnapWhatIf } from '@/search/instantSnapshot';
import type { SnapSearch } from '@/lib/searchPlan';
import { followOptionWords, goalFollowOf } from '@/lib/planGoals';
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
import { pricingSetupKey, recordPricing, type SnapPricing } from '@/lib/followEstimate';
import { accountOf } from '@/search/runSaves';
import { backupSecondsOf } from '@/lib/saveFreshness';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { readSimRecords } from '@/lib/followSim';
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
  setSimTiming({ delayMs: 0 });
});
afterEach(() => {
  setChainPricer(null);
  setSimRunner(null);
  setSimTiming(null);
});

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
  o: { fast?: boolean; final?: number; pricing?: boolean; startTE?: number; snapFor?: 'eggday' | 'race'; followKey?: string; select?: boolean; whatIf?: SnapWhatIf; tableTo?: number; record?: boolean } = {}
) {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage, useHoursFromStores } = await import('@/composables/useNowPage');
  const saveSecondsOf = () => backupSecondsOf(useInitialStateStore().rawBackup);
  resetGoalChoice();
  const store = useChainSearchStore();
  const te = saveTEOf(useInitialStateStore().rawBackup);
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = o.followKey ?? `eggday-${nextEggDayYear()}`;
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
    header: { from: 100, to: o.tableTo ?? 490 },
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
    ...(o.whatIf ? { whatIf: o.whatIf } : {}),
  } as never);
  if (o.record)
    recordPricing({
      account: accountOf(useInitialStateStore().rawBackup)!,
      backupTime: saveSecondsOf(),
      setup: pricingSetupKey({
        availability: store.availability,
        timeOff: store.timeOff,
        noPrestige: store.noPrestige,
        useHours: useHoursFromStores(),
        firstAscension: store.firstAscensionFor(),
      }),
      url: TABLE,
      tableTo: o.tableTo ?? 490,
      at: Date.now() - 30_000,
      pricing,
    });
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: followed }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  if (o.select !== false) {
    page.selectGoal(goalKey);
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
  }
  return { page, scope, now, eggDayAt, te };
}

async function renderProps(page: Awaited<ReturnType<typeof setup>>['page']) {
  return {
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
    ascensions: page.ascensions.value,
  };
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


const at = () => Date.now() - 60_000;
/** Jordan's route, 226 → 277 → 317 → 490 (the stand-in worker's answer). */
function route490(now: number, end: number): Route {
  return {
    chain: [226, 277, 317, 490],
    end,
    seconds: end - (now - H),
    legs: [
      { from: 194, to: 226, endTE: 226, start: now - H, end: now + 20 * H, sales: 0, tier13: false, label: 'continue' },
      { from: 226, to: 277, endTE: 277, start: now + 21 * H, end: now + 3 * D, sales: 1, tier13: false, label: '1-sale' },
      { from: 277, to: 317, endTE: 317, start: now + 3 * D, end: now + 6 * D, sales: 1, tier13: false, label: '1-sale' },
      { from: 317, to: 490, endTE: 490, start: now + 6 * D, end, sales: 1, tier13: false, label: '1-sale' },
    ],
  };
}
const FOLLOWED = { chain: [226, 277, 317, 490], from: 'typed', source: 'manual' };
/** The followed routes' requests: Egg Day's own instant route (200 → 238) is also priced again, for its shifts only
 *  (useNowPage `shiftRequest`, 26 Oct 2026). */
const followCalls = () => calls.filter(c => c.chain.join(',') !== '200,238');
const pillOf = (page: Awaited<ReturnType<typeof setup>>['page'], key: string) => page.goalChoices.value.find(g => g.key === key);

describe("A followed goal's pill says what is true of its route (25 Oct 2026, Jordan's Fastest to 490 TE)", () => {
  it("Jordan's state: Fastest to 490 TE followed, no kept result, Egg Day's instant answer of this save: the pill and the line agree, working, then estimated", async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    expect(page.selectedGoal.value).toBe('fastest-490');
    // Before: "no saved plan yet" on the pill, "not priced on this save yet" on the line.
    expect(page.follow.value).toMatchObject({ price: 'none', estimating: 'working' });
    let r = await render(page);
    expect(r.text).toContain('Fastest to 490 TE following · working out its times');
    expect(r.text).toContain('Following your pick · working out its times');
    expect(r.text).not.toContain('no saved plan yet');
    expect(r.text).not.toContain('not priced on this save yet');

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].chain).toEqual([226, 277, 317, 490]);
    const end = now + 9 * D;
    calls[0].resolve(route490(now, end));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(pillOf(page, 'fastest-490')?.follow).toEqual({ times: 'estimate', end });
    r = await render(page);
    expect(r.text).toMatch(/Fastest to 490 TE following · lands about [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    expect(r.text).toContain("Following your pick · estimated from the instant answer's data");
    expect(r.text).not.toContain('no saved plan yet');
    expect(r.html).toContain('data-follow="estimate"');
    scope.stop();
  });

  it('priced on load even when another goal is picked: the Fastest to 490 TE pill has its estimate before it is picked, and once picked nothing is asked again', async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', select: false });
    page.selectGoal(`eggday-${nextEggDayYear()}`);
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    expect(followCalls()[0].chain).toEqual([226, 277, 317, 490]);
    expect(pillOf(page, 'fastest-490')?.follow?.times).toBe('working');
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(pillOf(page, 'fastest-490')?.follow?.times).toBe('estimate'));
    // Next steps have its finish too (was only the selected goal's).
    expect(page.followsForSteps.value.find(s => s.goalKey === 'fastest-490')?.finish?.end).toBe(now + 9 * D);
    page.selectGoal('fastest-490');
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(followCalls()).toHaveLength(1);
    scope.stop();
  });

  it('picked while its background estimate is still out: one request, its answer used', async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', select: false });
    page.selectGoal(`eggday-${nextEggDayYear()}`);
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    page.selectGoal('fastest-490');
    await vi.waitFor(() => expect(page.follow.value?.estimating).toBe('working'));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(followCalls()).toHaveLength(1);
    scope.stop();
  });

  it('not while a search runs: the pill says it waits, the same words as the line', async () => {
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    store.isRunning = true;
    const { page, scope } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', select: false });
    page.selectGoal(`eggday-${nextEggDayYear()}`);
    await vi.waitFor(() => expect(pillOf(page, 'fastest-490')?.follow?.times).toBe('waiting'));
    expect(calls).toHaveLength(0);
    store.isRunning = false;
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    scope.stop();
  });
});

describe("each ascension's shifts (26 Oct 2026)", () => {
  it('a followed route is priced with its shifts asked for', async () => {
    const { scope } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    expect(followCalls()[0].options.shifts).toBe(true);
    scope.stop();
  });

  it("the instant answer's own route of this save is priced again in the background, and its shifts land on its legs", async () => {
    const { page, scope, now, eggDayAt } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', select: false });
    page.selectGoal(`eggday-${nextEggDayYear()}`);
    expect(page.cardPlan.value?.plan.chain).toEqual([200, 238]);
    // The followed goal's estimate first, then the shifts of Egg Day's route.
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(calls.find(c => c.chain.join(',') === '200,238')).toBeTruthy());
    const req = calls.find(c => c.chain.join(',') === '200,238')!;
    expect(req.options.shifts).toBe(true);
    req.resolve({
      chain: [200, 238],
      end: eggDayAt - 2 * D,
      seconds: eggDayAt - 2 * D - (now - H),
      legs: [
        { from: 194, to: 200, endTE: 200, start: now - H, end: now + 30 * H, sales: 0, tier13: false, label: 'continue' },
        {
          from: 200,
          to: 238,
          endTE: 238,
          start: now + 30 * H,
          end: eggDayAt - 2 * D,
          sales: 1,
          tier13: false,
          label: '1-sale',
          shifts: [
            { at: now + 60 * H, egg: 'humility' },
            { at: now + 61 * H, egg: 'kindness' },
          ],
        },
      ],
    });
    await vi.waitFor(() => expect(page.cardPlan.value?.plan.tableLegs?.[1].shifts).toHaveLength(2));
    expect(page.events.value.filter(e => e.kind === 'shift').map(e => e.eggs ?? [e.egg])).toEqual([['humility'], ['kindness']]);
    expect(page.plannedShifts.value).toMatchObject({ count: 2, partial: true });
    expect(page.ascensions.value.map(l => l.shifts.length)).toEqual([0, 2]);
    scope.stop();
  });
});

describe('the ascension you are in, simulated on the save (26 Oct 2026)', () => {
  it('once the route is estimated: its first stop simulated in the background, "Working out your shifts…", then its exact shifts', async () => {
    const sims: { inputs: import('@/search/types').SearchInputs; chain: number[]; resolve: (l: LegSummary | null) => void }[] = [];
    setSimRunner((): SimRunner => ({ run: (inputs, chain) => new Promise(resolve => sims.push({ inputs, chain, resolve })), terminate: () => undefined }));
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    expect(sims).toHaveLength(0);
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(sims[0].chain).toEqual([226]);
    expect(sims[0].inputs.milestones).toEqual([]);
    expect(page.simWorking.value).toBe('working');
    let r = await renderHtml(RightNowCard, { ...(await renderProps(page)), simWorking: page.simWorking.value }, {}, [getActivePinia()!]);
    expect(textOf(r)).toContain('Working out your shifts…');
    expect(textOf(r)).not.toContain('(can take a few minutes)');
    r = await renderHtml(RightNowCard, { ...(await renderProps(page)), simWorking: 'working', simSlow: true }, {}, [getActivePinia()!]);
    expect(textOf(r)).toContain('Working out your shifts… (can take a few minutes)');
    sims[0].resolve(leg(now - H, now + 18 * H, 226));
    await vi.waitFor(() => expect(page.cardPlan.value?.plan.tableLegs?.[0].simulated).toBe(true));
    expect(page.simWorking.value).toBeNull();
    expect(page.cardPlan.value?.plan.tableLegs?.[0].end).toBe(now + 18 * H);
    expect(readSimRecords()).toHaveLength(1);
    expect(JSON.stringify(readSimRecords())).not.toContain(A_ID);
    r = await renderHtml(RightNowCard, { ...(await renderProps(page)), simWorking: page.simWorking.value }, {}, [getActivePinia()!]);
    expect(textOf(r)).not.toContain('Working out your shifts…');
    scope.stop();
  });

  it('the Next step is the next action from the simulation: before it is in, the line from the table', async () => {
    const sims: { resolve: (l: LegSummary | null) => void }[] = [];
    setSimRunner((): SimRunner => ({ run: () => new Promise(resolve => sims.push({ resolve })), terminate: () => undefined }));
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(sims).toHaveLength(1));
    expect(page.nextStep.value).toBeNull();
    let t = textOf(await renderHtml(RightNowCard, { ...(await renderProps(page)), nextStep: page.nextStep.value }, {}, [getActivePinia()!]));
    expect(t).toContain('Prestige at 226 TE');
    // A continuing leg with a shift two hours from now.
    const l = leg(now - H, now + 18 * H, 226);
    sims[0].resolve({ ...l, buildPhaseEndTime: now - H, shifts: [{ at: now + 2 * H, egg: 'humility' }] });
    await vi.waitFor(() => expect(page.nextStep.value).toEqual({ kind: 'shift', egg: 'humility', at: now + 2 * H }));
    const html = await renderHtml(RightNowCard, { ...(await renderProps(page)), nextStep: page.nextStep.value }, {}, [getActivePinia()!]);
    expect(html).toContain('data-testid="now-next-action"');
    expect(textOf(html)).toMatch(/Next step Shift to Humility at [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    // Next shifts: the simulated one, then the prestige (the route's table legs list no shifts here).
    expect(page.nextShiftLines.value.map(l => l.kind)).toEqual(['shift', 'prestige', 'prestige', 'prestige', 'goal']);
    const withList = await renderHtml(RightNowCard, { ...(await renderProps(page)), nextShiftLines: page.nextShiftLines.value }, {}, [getActivePinia()!]);
    expect(withList).toContain('data-testid="now-next-shifts"');
    expect(textOf(withList)).toMatch(/Next shifts Shift to Humility · about [A-Z][a-z]{2} \d{1,2}, \d{4}, [^·]* Prestige at 226 TE · about/);
    scope.stop();
  });
});

describe("Jordan's Fastest to 490 TE route on a table whose rows end at 489 (26 Oct 2026: it said \"goes past what the instant answer covers\")", () => {
  it("priced from Egg Day's answer of this save (its snapshot), no Fastest to 490 answer at all", async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', tableTo: 489 });
    expect(page.follow.value?.estimating).not.toBe('beyond');
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    expect(followCalls()[0].chain).toEqual([226, 277, 317, 490]);
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    scope.stop();
  });

  it('priced from the pricing record alone (no snapshot keeps pricing)', async () => {
    const { page, scope } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490', tableTo: 489, pricing: false, record: true });
    expect(page.follow.value?.estimating).toBe('working');
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    scope.stop();
  });
});

describe('the crash lesson: the pricing setup key without collectInputs (26 Oct 2026)', () => {
  it('a throwing collectInputs does not take Right now down; the follow keeps its estimate', async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    const store = useChainSearchStore();
    vi.spyOn(store, 'collectInputs').mockImplementation(() => {
      throw new Error('boom');
    });
    store.noPrestige = [{ from: '2026-12-01', to: '2026-12-01' }];
    expect(() => [page.follow.value, page.cardPlan.value, page.goalChoices.value, page.events.value, page.ascensions.value]).not.toThrow();
    const r = await render(page);
    expect(r.text).toContain('Right now');
    scope.stop();
  });

  it('an edit to a day off reads the setup key once, never through collectInputs', async () => {
    const { page, scope, now } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    await vi.waitFor(() => expect(followCalls()).toHaveLength(1));
    followCalls()[0].resolve(route490(now, now + 9 * D));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    const store = useChainSearchStore();
    const first = vi.spyOn(store, 'firstAscensionFor');
    store.noPrestige = [{ from: '2026-12-01', to: '2026-12-01' }];
    // Every computed that prices the follows reads the key: the card, the pills, Next steps.
    void [page.follow.value, page.cardPlan.value, page.goalChoices.value, page.followsForSteps.value];
    void [page.follow.value, page.goalChoices.value];
    expect(first.mock.calls.length).toBeLessThanOrEqual(1);
    const src = (await import('node:fs')).readFileSync(new URL('../../composables/useNowPage.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('store.collectInputs().firstAscension');
    scope.stop();
  });
});

describe('the pill words (lib/planGoals.ts)', () => {
  const day = (t: number) => `day ${t}`;
  it('every state of a followed route, never "no saved plan yet"', () => {
    expect(followOptionWords({ times: 'working', end: null }, day, 'after your date')).toBe('following · working out its times');
    expect(followOptionWords({ times: 'waiting', end: null }, day, 'after your date')).toBe('following · its times once the search running now ends');
    expect(followOptionWords({ times: 'none', end: null }, day, 'after your date')).toBe('following · not priced on this save yet');
    expect(followOptionWords({ times: 'estimate', end: 5 }, day, 'after your date')).toBe('following · lands about day 5');
    expect(followOptionWords({ times: 'timeline', end: 5 }, day, 'after your date')).toBe('following · lands day 5');
    expect(followOptionWords({ times: 'finish', end: 5, late: true }, day, 'after Egg Day starts')).toBe('following · lands day 5, after Egg Day starts');
  });
  it('from the follow card', () => {
    expect(goalFollowOf({ price: 'instant' }, 9)).toEqual({ times: 'timeline', end: 9 });
    expect(goalFollowOf({ price: 'estimate', missesDate: true }, 9)).toEqual({ times: 'estimate', end: 9, late: true });
    expect(goalFollowOf({ price: 'finish', finish: { end: 7 } }, null)).toEqual({ times: 'finish', end: 7 });
    expect(goalFollowOf({ price: 'none', estimating: 'working' }, null)).toEqual({ times: 'working', end: null });
    for (const e of ['nosource', 'beyond', 'failed', undefined]) expect(goalFollowOf({ price: 'none', estimating: e }, null).times).toBe('none');
  });
});

describe("the gear block's perfect-set line reads the goal's own instant answer, followed or not (25 Oct 2026)", () => {
  it('a followed Egg Day route priced as an estimate (its plan has no what-if) still gets the what-if kept with the instant answer', async () => {
    const whatIf: SnapWhatIf = { at: Date.now(), end: 1, te: 252, mineEnd: 2_000_000, mineTE: 248, sameEnd: 2_000_000 - 3 * D };
    const { page, scope, now, eggDayAt } = await setup({ chain: [205, 238], from: 'typed', at: at(), source: 'manual' }, { whatIf });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0].resolve({
      chain: [205, 238],
      end: eggDayAt - 3 * D,
      seconds: eggDayAt - 3 * D - now,
      legs: [
        { from: 194, to: 205, endTE: 205, start: now - H, end: now + 20 * H, sales: 0, tier13: false, label: 'continue' },
        { from: 205, to: 238, endTE: 238, start: now + 21 * H, end: eggDayAt - 3 * D, sales: 1, tier13: false, label: '1-sale' },
      ],
    });
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(page.cardPlan.value?.plan.whatIf).toBeNull();
    await vi.waitFor(() => expect(page.gear.value).not.toBeNull());
    expect(page.gear.value?.whatIf).toEqual(whatIf);
    scope.stop();
  });

  it('no what-if kept: none', async () => {
    const { page, scope } = await setup({ ...FOLLOWED, at: at() }, { followKey: 'fastest-490' });
    await vi.waitFor(() => expect(page.gear.value).not.toBeNull());
    expect(page.gear.value?.whatIf).toBeNull();
    scope.stop();
  });
});
