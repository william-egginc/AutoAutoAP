/**
 * MY RUNS' A1 CHOICE (spec-a1choice, 1 Nov 2026; lib/a1Choice.ts). On the unfinished-build path (the save's build isn't
 * finished: NowPage.unfinishedBuild.spec.ts) a build-up that buys wins even when it ends LATER than finishing without
 * buying. Right now now offers both, follows the sooner (continue) until the player picks, keeps the pick per account
 * and ascension over Your setup's First ascension (never changing it), and simulates the side followed under its own
 * setup key. Through useNowPage with the synthetic save (id EI0000000000000000, never printed: its build unfinished, two
 * small vehicles) and stand-in workers whose legs carry both ends and the build-up's buy count, as search/leg.ts gives
 * them (leg.a1Choice.spec.ts). Fixed save time; the waits are for answers, never for time.
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
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { A1_PICK_PREFIX, a1ChoiceWords } from '@/lib/a1Choice';
import { dateAt } from '@/lib/eventWhen';
import { CONTINUE_MAX_SECONDS } from '@/search/rules';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { FirstAscension } from '@/search/firstAscension';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 24 * H;
let mem: Map<string, string>;
let saveAt: number;
const WAIT = { timeout: 15_000, interval: 10 };

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
/** Every page made, stopped after each test even when it failed (a page left running writes into the next test's
 *  storage). */
const scopes: { stop: () => void }[] = [];
afterEach(() => {
  for (const s of scopes.splice(0)) s.stop();
  setChainPricer(null);
  setSimRunner(null);
  setSimTiming(null);
});

const A_ID = 'EI0000000000000000';
/** The synthetic save with two small vehicles: shipping below laying, the build unfinished. */
function save() {
  const b = syntheticBackup();
  Object.assign(b.farms[0], { habs: [18, 18, 18, 18], habPopulation: [1e10, 1e10, 1e10, 1e10], vehicles: [9, 9], trainLength: [1, 1] });
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = saveAt;
  b.approxTime = saveAt;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** A page on the save following 226 277 317 490; `fresh`: a new Pinia (a reload), the browser's storage kept. */
async function setup(o: { setting?: FirstAscension; fresh?: boolean } = {}) {
  if (o.fresh) setActivePinia(createPinia());
  loadAndSyncBackup(A_ID, save(), 'plan_next');
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

/** The two sides' ends: the build-up 7 days out (its build 10 h), continue 6 days. */
function ends(now: number, o: { build?: number; cont?: number } = {}) {
  return { buildup: o.build ?? now + 7 * D, continue: o.cont ?? now + 6 * D };
}
/** The build-up side's leg (its build to now + 10 h, Humility then Kindness), carrying both ends and N. */
function buildupLeg(now: number, o: { build?: number; cont?: number; buys?: number } = {}): LegSummary {
  const e = ends(now, o);
  return {
    key: 'buildup',
    endTE: 226,
    durationSeconds: e.buildup - (now - H),
    maxELR: 1e12,
    endTime: e.buildup,
    tier13Unlocked: false,
    startTime: now - H,
    buildPhaseEndTime: now + 10 * H,
    shifts: [
      { at: now + 12 * H, egg: 'humility', fromEgg: 'curiosity' },
      { at: now + 12 * H, egg: 'kindness', fromEgg: 'humility' },
    ],
    endEgg: { egg: 'kindness', te: 40 },
    firstLegEnds: e,
    ...(o.buys === 0 ? {} : { buildUpBuys: o.buys ?? 3 }),
  } as LegSummary;
}
/** The finish-without-buying side's leg: continue, Integrity first at now + 2 days. */
function continueLeg(now: number, o: { build?: number; cont?: number; buys?: number } = {}): LegSummary {
  const e = ends(now, o);
  return {
    key: 'continue',
    endTE: 226,
    durationSeconds: e.continue - (now - H),
    maxELR: 1e12,
    endTime: e.continue,
    tier13Unlocked: false,
    startTime: now - H,
    shifts: [{ at: now + 2 * D, egg: 'integrity', fromEgg: 'curiosity' }],
    endEgg: { egg: 'integrity', te: 40 },
    firstLegEnds: e,
    buildUpBuys: o.buys ?? 3,
  } as LegSummary;
}

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
    },
    {},
    [getActivePinia()!]
  );
}

const isBuildupAsk = (s: { inputs: SearchInputs }) => s.inputs.firstAscension === 'buildup' && s.inputs.continueMaxSeconds === 0;
const isContinueAsk = (s: { inputs: SearchInputs }) =>
  s.inputs.firstAscension === 'continue' && s.inputs.continuePinSeconds === CONTINUE_MAX_SECONDS && s.inputs.continueMaxSeconds === undefined;
const simSetups = () => (JSON.parse(mem.get('aap-follow-sim') ?? '[]') as { setup: string }[]).map(r => JSON.parse(r.setup)[3] as string);

/** The first visit: the build-up side asked, it ends later and buys: the continue side asked and followed. */
async function laterAndDefault(o: { setting?: FirstAscension } = {}) {
  const sims = stubSims();
  const s = await setup(o);
  await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
  expect(isBuildupAsk(sims[0])).toBe(true);
  sims[0].resolve(buildupLeg(s.now));
  return { ...s, sims };
}

describe('(1) a buying build-up that ends later: both offered, the sooner (finish without buying) followed', () => {
  it('the choice with N and both dates; the continue side simulated and shown; never stuck working', async () => {
    const { page, scope, now, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(page.a1Choice.value).not.toBeNull(), WAIT);
    const c = page.a1Choice.value!;
    expect(c).toMatchObject({ side: 'continue', picked: false, buys: 3, buildEnd: now + 7 * D, contEnd: now + 6 * D });
    expect(c.keep).toMatch(/^Keep building \(buys 3 things, ends [A-Z][a-z]{2} \d{1,2}(, \d{4})? at \d{1,2}:\d{2} (am|AM|pm|PM)\)$/);
    expect(c.finish).toMatch(/^Finish without buying \(ends [A-Z][a-z]{2} \d{1,2}(, \d{4})? at \d{1,2}:\d{2} (am|AM|pm|PM)\)$/);
    // The default side is simulated under its own key: working meanwhile, then its leg.
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(isContinueAsk(sims[1])).toBe(true);
    expect(page.simWorking.value).toBe('working');
    sims[1].resolve(continueLeg(now));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    expect(page.simWorking.value).toBeNull();
    expect(page.nextShiftLines.value.some(l => l.kind === 'keepbuilding')).toBe(false);
    expect(page.nextShiftLines.value[0]).toMatchObject({ kind: 'shift', egg: 'integrity' });
    expect(page.a1Finish.value).toBe('default');
    const html = await cardHtml(page);
    expect(html).toContain('data-testid="now-a1-choice"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="now-a1-continue"/);
    expect(html).toMatch(/aria-checked="false"[^>]*data-testid="now-a1-buildup"/);
    const t = textOf(html);
    // In the card's own zone, as its Next shifts (the prestige line and the finish agree to the minute).
    const w = a1ChoiceWords(c, page.now.value, ZONE);
    expect(t).toContain(w.keep);
    expect(t).toContain(w.finish);
    expect(w.finish).toContain(dateAt(now + 6 * D, page.now.value, ZONE));
    expect(t).toMatch(/Next step Keep building ends this ascension later. Pick one:/);
    expect(t).not.toContain('Keep building: ');
    // The two sides kept apart.
    expect(simSetups().sort()).toEqual(['buildup, build unfinished', 'continue, build unfinished']);
    scope.stop();
  });

  it('singular: buys 1 thing', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup();
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupLeg(now, { buys: 1 }));
    await vi.waitFor(() => expect(page.a1Choice.value).not.toBeNull(), WAIT);
    expect(page.a1Choice.value!.keep).toMatch(/^Keep building \(buys 1 thing, ends /);
    scope.stop();
  });
});

describe('(2)(3) no choice', () => {
  it('a sooner build-up: no choice, the build-up followed as before, nothing else asked', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup();
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupLeg(now, { build: now + 5 * D }));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(page.a1Choice.value).toBeNull();
    expect(page.a1Finish.value).toBeNull();
    expect(sims).toHaveLength(1);
    expect(textOf(await cardHtml(page))).not.toContain('Pick one');
    scope.stop();
  });

  it('a tie: no choice shown, continue followed (ties go to continue)', async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup();
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    sims[0].resolve(buildupLeg(now, { build: now + 6 * D, cont: now + 6 * D }));
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(isContinueAsk(sims[1])).toBe(true);
    sims[1].resolve(continueLeg(now, { build: now + 6 * D, cont: now + 6 * D }));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    expect(page.a1Choice.value).toBeNull();
    scope.stop();
  });

  it("a build-up that buys nothing (spec-noemptybuild's state: the run comes back continue, no count): no choice", async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup();
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    const { buildUpBuys: _n, ...cont } = continueLeg(now);
    void _n;
    sims[0].resolve({ ...cont, firstLegEnds: { continue: now + 6 * D } } as LegSummary);
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    expect(page.a1Choice.value).toBeNull();
    expect(page.a1Finish.value).toBeNull();
    expect(sims).toHaveLength(1);
    scope.stop();
  });
});

describe('(4)(5)(9) picking', () => {
  it("Keep building: the build-up side's request and record again (no new run), its Next step; kept per account and ascension", async () => {
    const { page, scope, now, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    sims[1].resolve(continueLeg(now));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    page.pickA1('buildup');
    // The same pick reuses the kept record of that side: nothing simulated again, never left working.
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(sims).toHaveLength(2);
    expect(page.simWorking.value).toBeNull();
    expect(page.a1Choice.value).toMatchObject({ side: 'buildup', picked: true });
    expect(page.a1Finish.value).toBeNull();
    const acct = page.account.value;
    expect(mem.get(`${A1_PICK_PREFIX}${acct}.226`)).toBe('buildup');
    expect([...mem.keys()].filter(k => k.startsWith(A1_PICK_PREFIX))).toEqual([`${A1_PICK_PREFIX}${acct}.226`]);
    // And back: Finish without buying, its record.
    page.pickA1('continue');
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    expect(sims).toHaveLength(2);
    expect(page.a1Finish.value).toBe('picked');
    expect(mem.get(`${A1_PICK_PREFIX}${acct}.226`)).toBe('continue');
    scope.stop();
  });

  it('a reload keeps the pick: its side read from the kept record at once, nothing simulated', async () => {
    const { page, scope, now, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    sims[1].resolve(continueLeg(now));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    page.pickA1('buildup');
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    scope.stop();
    const again = await setup({ fresh: true });
    await vi.waitFor(() => expect(again.page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(again.page.a1Choice.value).toMatchObject({ side: 'buildup', picked: true });
    expect(sims).toHaveLength(2);
    again.scope.stop();
  });

  it('another ascension (another stop) or account has no pick', async () => {
    const acct = 'someotheraccount';
    mem.set(`${A1_PICK_PREFIX}${acct}.226`, 'buildup');
    const { page, scope } = await laterAndDefault();
    mem.set(`${A1_PICK_PREFIX}${page.account.value}.277`, 'buildup');
    await vi.waitFor(() => expect(page.a1Choice.value).not.toBeNull(), WAIT);
    expect(page.a1Choice.value!.side).toBe('continue');
    scope.stop();
  });

  it('a pick while the other side is still being simulated: that run let go, the picked side shown, never stuck', async () => {
    const { page, scope, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    expect(page.simWorking.value).toBe('working');
    page.pickA1('buildup');
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(page.simWorking.value).toBeNull();
    // Picking back asks for continue again (its first run was let go): working, then done.
    page.pickA1('continue');
    await vi.waitFor(() => expect(sims).toHaveLength(3), WAIT);
    expect(isContinueAsk(sims[2])).toBe(true);
    expect(page.simWorking.value).toBe('working');
    sims[2].resolve(continueLeg(page.now.value));
    await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
    scope.stop();
  });

  it('storage that refuses the pick: the pick still holds on this page', async () => {
    const { page, scope, now, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    sims[1].resolve(continueLeg(now));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    const set = localStorage.setItem;
    vi.stubGlobal('localStorage', {
      ...localStorage,
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k.startsWith(A1_PICK_PREFIX)) throw new Error('quota');
        set(k, v);
      },
    });
    page.pickA1('buildup');
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(page.a1Choice.value?.side).toBe('buildup');
    scope.stop();
  });
});

describe("(6) Your setup's First ascension", () => {
  it('never overwritten by a pick', async () => {
    const { page, scope, now, sims } = await laterAndDefault();
    await vi.waitFor(() => expect(sims).toHaveLength(2), WAIT);
    sims[1].resolve(continueLeg(now));
    const store = useChainSearchStore();
    page.pickA1('buildup');
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(store.firstAscensionChoice).toBe('auto');
    page.pickA1('continue');
    expect(store.firstAscensionChoice).toBe('auto');
    scope.stop();
  });

  it("explicit 'Continue my build-up': the choice shows, keep building by default, nothing else asked", async () => {
    const { page, scope, sims } = await laterAndDefault({ setting: 'buildup' });
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('keepbuilding'), WAIT);
    expect(page.a1Choice.value).toMatchObject({ side: 'buildup', picked: false });
    expect(sims).toHaveLength(1);
    scope.stop();
  });

  it("explicit 'Finish without buying': its side asked first, the choice shows on it", async () => {
    const sims = stubSims();
    const { page, scope, now } = await setup({ setting: 'continue' });
    await vi.waitFor(() => expect(sims).toHaveLength(1), WAIT);
    expect(isContinueAsk(sims[0])).toBe(true);
    sims[0].resolve(continueLeg(now));
    await vi.waitFor(() => expect(page.nextStep.value?.kind).toBe('shift'), WAIT);
    expect(page.a1Choice.value).toMatchObject({ side: 'continue', picked: false });
    expect(sims).toHaveLength(1);
    expect(useChainSearchStore().firstAscensionChoice).toBe('continue');
    scope.stop();
  });
});
