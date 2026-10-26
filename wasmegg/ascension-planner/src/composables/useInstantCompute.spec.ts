/**
 * My runs works the instant answer's pricing out itself (26 Oct 2026, composables/useInstantCompute.ts): after a Setup
 * change, or in a fresh browser, a followed goal said "not priced on this save yet" until Highest TE by a date was
 * opened on another tab. Now:
 *
 *   - EXACT: the record My runs builds (search/instantCompute.ts through `computeInstantPricing`) prices a route to the
 *     second as the record the instant answer keeps (InstantRoute.vue `run`, mirrored here step by step with the same
 *     shared functions), on a synthetic table, with hours, held shifts and a no-prestige day;
 *   - SCHEDULED: once per save and setup (a record already kept: nothing), again once after a Setup change, waiting
 *     while a search runs, one compute for every followed goal, stopped when leaving My runs, the newest setup winning;
 *     nothing without a save; a missing table said with its reason.
 *
 * The synthetic save (id EI0000000000000000, never printed); stand-in route workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, nextTick, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from '@/components/myruns/RightNowCard.vue';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { saveTEOf } from '@/lib/saveFreshness';
import { accountOf } from '@/search/runSaves';
import { readPricingRecords, recordPricing, snapPricing, type SnapPricing } from '@/lib/followEstimate';
import { setChainPricer, type ChainPricer } from './useFollowEstimate';
import {
  computeInstantPricing,
  instantFailureWords,
  setInstantComputeTiming,
  setInstantComputer,
  useInstantCompute,
  type InstantComputeRequest,
  type InstantComputer,
  type InstantPool,
  type InstantPricing,
} from './useInstantCompute';
import { chooseInstantTable, instantFirstLegs, instantPricingOptions } from '@/search/instantCompute';
import { cardDeliveryScale } from '@/search/instantScale';
import { getSimulationContext } from '@/engine/adapter';
import { canonicalDelivered, pacificHourOfWeek, type BuildParams } from '@/search/precomputedLeg';
import { firstLegOptions, priceChain, tailOptionsOf, type BuildLookup, type PolishOptions, type Route } from '@/search/routeFinder';
import { MAXED_TABLE_FILE } from '@/search/tableBracket';
import { ownTableNames } from '@/search/tableGear';
import { getNextSaleEnd } from '@/lib/events';
import type { TableHeader } from '@/search/precomputedTable';
import type { Availability } from '@/search/availabilitySchedule';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const A_ID = 'EI0000000000000000';
let mem: Map<string, string>;

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
});
afterEach(() => {
  setChainPricer(null);
  setInstantComputer(null);
  setInstantComputeTiming(null);
});

function loadSave(): void {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  loadAndSyncBackup(A_ID, markRaw(b), 'plan_next');
  rollUpPendingTE();
}

// ------------------------------------------------------------------------------------------- exact

/** A synthetic table (as routeFinder.noPrestige.spec.ts's), from 150 to 300 TE, every hour of the week. */
const FROM = 150;
const TO = 300;
const REF = Date.parse('2027-01-04T08:00:00Z') / 1000;
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > TO) return null;
  const cellStart = REF + ((hour - pacificHourOfWeek(REF) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (2 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};
const HEADER = { version: 2, referenceWeek: REF, cteBonus: 0, deliveryScore: 1, from: FROM, to: TO, slots: 1, builtAt: '' } as TableHeader;
const MAXED = `${import.meta.env.BASE_URL}precompute/${MAXED_TABLE_FILE}`;

/** The route worker in the page (workers/routeFinder.worker.ts 'header' and 'first-legs'), on the synthetic table. No
 *  own or gear table here (a 404, as for nearly everyone). */
function pool(): InstantPool & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async header(url: string) {
      asked.push(url === MAXED ? 'maxed' : 'other');
      if (url === MAXED) return HEADER;
      throw new Error('the instant answer could not be loaded (404)');
    },
    async firstLegs(m) {
      return JSON.parse(
        JSON.stringify(
          firstLegOptions({
            table,
            startTE: m.startTE,
            start: m.start,
            final: m.final,
            deliveryScale: m.deliveryScale,
            delivered: m.delivered,
            cont: m.cont,
            buildUp: m.buildUp ?? null,
            freshLive: m.freshLive ?? null,
            firstAscension: m.firstAscension,
            pinSeconds: m.pinSeconds,
            maxContinueSeconds: m.maxContinueSeconds,
            ...(m.hours ? { hours: m.hours } : {}),
            ...(m.contEgg !== undefined ? { contEgg: m.contEgg } : {}),
            ...tailOptionsOf(m),
          })
        )
      );
    },
  };
}

/** What InstantRoute.vue `run` keeps (`answerPricing = snapPricing(polishOptions, target.value)`), step by step: the
 *  same table choice, delivery scale, hours, first ascensions and options, the card's target and date. */
async function cardPricing(final: number, deadline: number | undefined, useHours: boolean): Promise<SnapPricing | null> {
  const store = useChainSearchStore();
  const p = pool();
  const te = Math.floor(store.currentTE);
  const choice = await chooseInstantTable({
    pool: p,
    maxedUrl: MAXED,
    base: `${import.meta.env.BASE_URL}precompute/`,
    ownTableUrls: async () => (await ownTableNames(A_ID)).map(n => `${import.meta.env.BASE_URL}precompute/${n}`),
    inputs: () => store.collectInputs(),
    earnings: () => store.readInventory().earnings,
  });
  const inputs = store.collectInputs();
  // The card's `deliveryScale` (own: not the maxed table and not the form G).
  const own = choice.url !== MAXED && !choice.gearShifted;
  const scale = choice.gearShifted ? 1 : (cardDeliveryScale(own, choice.header, getSimulationContext) ?? 1);
  const hours = useHours && store.availability ? (JSON.parse(JSON.stringify(store.availability)) as Availability) : null;
  const legs = (await instantFirstLegs({
    pool: p,
    url: choice.url,
    header: choice.header,
    inputs,
    te,
    final,
    scale,
    hours,
    deferShifts: store.deferShifts,
    liveFresh: (t, at) => store.liveFreshBuilds(t, at),
    buildUpTails: () => store.buildUpTails(),
  }))!;
  const polishOptions = instantPricingOptions({
    te,
    start: inputs.planStart,
    firstLegs: legs.firstLegs,
    scale,
    ...(deadline ? { deadline } : {}),
    hours,
    tail: legs.tail,
  });
  return snapPricing(polishOptions, final);
}

function req(final: number, useHours: boolean): InstantComputeRequest {
  return { key: `k|${final}`, account: 'a', backupTime: 1, setup: 's', final, useHours };
}

const price = (p: SnapPricing, chain: number[]): Route | null =>
  priceChain(table, { ...(JSON.parse(JSON.stringify(p.options)) as PolishOptions), shifts: true }, chain);

/** The Setup of the exact case: awake 7 am-11 pm, shifts held for them, a no-prestige day the day after tomorrow.
 *  (`hold` false up to 490: the synthetic save's continue held for the hours never reaches 490, an invalid date.) */
function withSetup(hold = true): void {
  const store = useChainSearchStore();
  useAutoPlannerStore().timezone = ZONE;
  store.scheduleEnabled = true;
  store.deferShifts = hold;
  const day = new Date((Math.floor(Date.now() / 1000) + 2 * D - 8 * H) * 1000).toISOString().slice(0, 10);
  store.noPrestige = [{ from: day, to: day }];
}

describe("the record My runs builds prices a route exactly as the instant answer's record", () => {
  it('Fastest to a target: the same record, to the byte, and the same priced routes (hours, held shifts, a no-prestige day)', async () => {
    loadSave();
    withSetup();
    const te = Math.floor(useChainSearchStore().currentTE);
    const card = (await cardPricing(260, undefined, true))!;
    const mine = (await computeInstantPricing(req(260, true), pool(), () => true))!;
    expect(card).not.toBeNull();
    expect(mine.url).toBe(MAXED);
    expect(mine.tableTo).toBe(TO);
    expect(JSON.stringify(mine.pricing)).toBe(JSON.stringify(card));
    // The setup reached the options: held hours, the day as a window, the save's silo seconds.
    expect(mine.pricing.options).toMatchObject({ startTE: te, holdShifts: true, hours: { fromHour: 7, toHour: 23, timezone: ZONE } });
    expect(mine.pricing.options.noPrestige).toHaveLength(1);
    expect(mine.pricing.options.siloSeconds).toBeGreaterThan(0);
    for (const chain of [[te + 6, 230, 260], [te + 11, 260], [te + 3, te + 20, 240, 260]]) {
      const a = price(card, chain);
      expect(a, chain.join(' ')).not.toBeNull();
      expect(JSON.stringify(price(mine.pricing, chain))).toBe(JSON.stringify(a));
    }
  });

  it("By a date: the card's record has the date, My runs' none; pricing a route never reads it, so the routes are the same", async () => {
    loadSave();
    withSetup(false);
    const te = Math.floor(useChainSearchStore().currentTE);
    const deadline = eggDaySeconds(nextEggDayYear());
    const card = (await cardPricing(490, deadline, true))!;
    const mine = (await computeInstantPricing(req(490, true), pool(), () => true))!;
    expect(card.options.deadline).toBe(deadline);
    expect(mine.pricing.options.deadline).toBeUndefined();
    const { deadline: _d, ...rest } = card.options;
    void _d;
    expect(JSON.stringify({ ...card, options: rest })).toBe(JSON.stringify(mine.pricing));
    for (const chain of [[te + 6, 230, 260], [te + 15, 280, 300]]) expect(JSON.stringify(price(mine.pricing, chain))).toBe(JSON.stringify(price(card, chain)));
  });

  it("one record up to 490 (a date goal also followed) prices a Fastest route as the card's record to its target", async () => {
    loadSave();
    withSetup(false);
    const te = Math.floor(useChainSearchStore().currentTE);
    const card = (await cardPricing(260, undefined, true))!;
    const mine = (await computeInstantPricing(req(490, true), pool(), () => true))!;
    // The first ascensions to every stop up to the target are the same (each is its own sweep, not the target's).
    expect(JSON.stringify(mine.pricing.options.firstLegs!.filter(l => l.to <= 260))).toBe(JSON.stringify(card.options.firstLegs));
    for (const chain of [[te + 6, 230, 260], [te + 11, 260]]) expect(JSON.stringify(price(mine.pricing, chain))).toBe(JSON.stringify(price(card, chain)));
  });

  it('without the hours ticked: no hours and no held shifts, as the card', async () => {
    loadSave();
    withSetup();
    const card = (await cardPricing(260, undefined, false))!;
    const mine = (await computeInstantPricing(req(260, false), pool(), () => true))!;
    expect(mine.pricing.options.hours).toBeUndefined();
    expect(mine.pricing.options.holdShifts).toBeUndefined();
    expect(JSON.stringify(mine.pricing)).toBe(JSON.stringify(card));
  });

  it('one pipeline: InstantRoute.vue reads its table, first ascensions and options through the same functions (no copy)', () => {
    const card = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
    expect(card).toContain('const choice = await chooseInstantTable({');
    expect(card).toContain('const legs = await instantFirstLegs({');
    expect(card).toContain('const polishOptions: PolishOptions = instantPricingOptions({');
    expect(card).not.toContain('probeFirst(');
    expect(card).not.toContain('p.firstLegs(');
    expect(card).not.toContain('instantFirstLegsBase(');
  });

  it('the table missing (offline, a 404): a plain failure with the reason, never a silent fallback', async () => {
    loadSave();
    const gone: InstantPool = {
      header: async () => {
        throw new Error('the instant answer could not be loaded (404)');
      },
      firstLegs: async () => [],
    };
    const err = await computeInstantPricing(req(490, false), gone, () => true).catch(e => e);
    expect(instantFailureWords(err)).toBe("the instant answer couldn't be loaded (no connection, or the file is missing)");
    expect(instantFailureWords(new Error('Failed to fetch'))).toBe("the instant answer couldn't be loaded (no connection, or the file is missing)");
    expect(instantFailureWords(new Error(`precomputed table version 9 is not supported for ${A_ID}`))).toBe('an older version of this page is open: reload it');
  });

  it('a save below the instant answer: said with the TEs', async () => {
    loadSave();
    const high: InstantPool = { header: async () => ({ ...HEADER, from: 400 }), firstLegs: async () => [] };
    const err = await computeInstantPricing(req(490, false), high, () => true).catch(e => e);
    expect(instantFailureWords(err)).toMatch(/^the instant answer starts at 400 TE and your save is at \d+ TE$/);
  });
});

// ------------------------------------------------------------------------------------------ scheduled

/** The stand-in computer: every request kept, answered by the spec. */
let computes: { req: InstantComputeRequest; alive: () => boolean; resolve: (p: InstantPricing | null) => void; reject: (e: Error) => void }[];
let terminated: number;
function stubComputer(): void {
  computes = [];
  terminated = 0;
  setInstantComputer(
    (): InstantComputer => ({
      compute: (r, alive) => new Promise((resolve, reject) => computes.push({ req: r, alive, resolve, reject })),
      terminate: () => void terminated++,
    })
  );
  setInstantComputeTiming({ delayMs: 0 });
}
/** The stand-in pricing worker (the estimate after the record). */
let prices: { chain: number[]; options: PolishOptions; resolve: (r: Route | null) => void }[];
function stubPricer(): void {
  prices = [];
  setChainPricer((): ChainPricer => ({ priceChain: (_u, options, chain) => new Promise(resolve => prices.push({ chain, options, resolve })), terminate: () => undefined }));
}

const EGG_DAY = () => `eggday-${nextEggDayYear()}`;
const pricingOf = (te: number, now: number): InstantPricing => ({
  url: MAXED,
  tableTo: 489,
  pricing: { v: 1, final: 490, options: { startTE: te, start: now - H, firstLegs: [{ to: 205, endTE: 205, end: now + 20 * H, delivered: [1, 1, 1, 1, 1], label: 'continue' }, { to: 226, endTE: 226, end: now + 40 * H, delivered: [1, 1, 1, 1, 1], label: '1-sale' }], deliveryScale: 1 } },
});
const routeOf = (chain: number[], now: number): Route => ({
  chain,
  end: now + 30 * D,
  seconds: 30 * D,
  legs: chain.map((to, i) => ({ from: i ? chain[i - 1] : 194, to, endTE: to, start: now + i * 5 * D, end: now + (i + 1) * 5 * D, sales: 1, tier13: false, label: '1-sale' })),
});

/** My runs with the save, nothing of the instant answer kept, and these goals followed. */
async function myRuns(followed: Record<string, { chain: number[] }>, o: { record?: boolean; noSave?: boolean } = {}) {
  if (!o.noSave) loadSave();
  const { pricingSetupFromStores, resetGoalChoice, useNowPage } = await import('./useNowPage');
  resetGoalChoice();
  const now = Math.floor(Date.now() / 1000);
  const raw = useInitialStateStore().rawBackup;
  const te = o.noSave ? 0 : saveTEOf(raw);
  if (o.record)
    recordPricing({ account: accountOf(raw)!, backupTime: useInitialStateStore().lastBackupTime, setup: pricingSetupFromStores(), at: Date.now(), ...pricingOf(te, now) });
  const entries = Object.fromEntries(Object.entries(followed).map(([k, v]) => [k, { chain: v.chain, from: 'typed', at: Date.now() - H, source: 'manual' }]));
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify(entries));
  if (!o.noSave) {
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  }
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(EGG_DAY());
  return { page, scope, now, te };
}

async function render(page: Awaited<ReturnType<typeof myRuns>>['page']) {
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

describe('My runs works the instant answer out by itself, in the background', () => {
  beforeEach(() => {
    stubComputer();
    stubPricer();
  });

  it('nothing kept (a fresh browser): worked out once, said while it runs, then the route is priced and its timeline shows', async () => {
    const { page, scope, now, te } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } });
    await vi.waitFor(() => expect(page.follow.value?.estimating).toBe('instant'));
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    expect(computes[0].req).toMatchObject({ final: 490, useHours: false });
    expect(computes[0].req.key).not.toContain(A_ID);
    const r = await render(page);
    expect(r.html).toMatch(/role="status"[^>]*data-testid="now-follow-instant"[^>]*data-state="instant"/);
    expect(r.text).toContain('Working out the instant answer for your setup…');
    expect(r.text).not.toContain('Open Highest TE by a date once');
    expect(r.text).not.toContain('not priced on this save yet');
    computes[0].resolve(pricingOf(te, now));
    // The record is kept, the route priced with it.
    await vi.waitFor(() => expect(prices).toHaveLength(1));
    expect(readPricingRecords()).toHaveLength(1);
    expect(prices[0].chain).toEqual([205, 238]);
    prices[0].resolve(routeOf([205, 238], now));
    await vi.waitFor(() => expect(page.follow.value?.price).toBe('estimate'));
    expect(page.cardPlan.value?.plan).toMatchObject({ chain: [205, 238], estimated: true });
    expect(computes).toHaveLength(1);
    scope.stop();
  });

  it('a record already kept for this save and setup (a reload): nothing worked out again', async () => {
    const { page, scope } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } }, { record: true });
    await vi.waitFor(() => expect(prices).toHaveLength(1));
    await new Promise(r => setTimeout(r, 20));
    expect(computes).toHaveLength(0);
    expect(page.follow.value?.estimating).toBe('working');
    scope.stop();
  });

  it('a Setup change (a no-prestige day, the time zone, held shifts, the target): worked out again once for the new setup', async () => {
    const { page, scope, now, te } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } }, { record: true });
    await vi.waitFor(() => expect(prices).toHaveLength(1));
    const store = useChainSearchStore();
    const changes: (() => void)[] = [
      () => (store.noPrestige = [{ from: '2030-01-02', to: '2030-01-02' }]),
      () => (useAutoPlannerStore().timezone = 'America/New_York'),
      () => {
        store.scheduleEnabled = true;
      },
      () => (store.deferShifts = !store.deferShifts),
      () => (store.finalTE = 400),
    ];
    let n = 0;
    for (const change of changes) {
      change();
      n++;
      await vi.waitFor(() => expect(computes).toHaveLength(n));
      expect(page.follow.value?.estimating).toBe('instant');
      computes[n - 1].resolve(pricingOf(te, now));
      await vi.waitFor(() => expect(page.follow.value?.estimating).not.toBe('instant'));
      // Once: the record for that setup is now kept.
      await new Promise(r => setTimeout(r, 10));
      expect(computes).toHaveLength(n);
    }
    scope.stop();
  });

  it('a search running: it waits, said so, and starts when the search ends; a search starting lets the running one go', async () => {
    const store = useChainSearchStore();
    store.isRunning = true;
    const { page, scope } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } });
    await vi.waitFor(() => expect(page.follow.value?.estimating).toBe('instantwait'));
    expect(computes).toHaveLength(0);
    const { text } = await render(page);
    expect(text).toContain('The instant answer for your setup is worked out once the search running now ends.');
    expect(text).toContain('following · its times once the search running now ends');
    store.isRunning = false;
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    store.deadlineRunning = true;
    await nextTick();
    expect(terminated).toBe(1);
    expect(computes[0].alive()).toBe(false);
    expect(page.follow.value?.estimating).toBe('instantwait');
    store.deadlineRunning = false;
    await vi.waitFor(() => expect(computes).toHaveLength(2));
    scope.stop();
  });

  it('two followed goals: one record serves both (up to 490), each priced in turn after it', async () => {
    const { page, scope, now, te } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] }, 'fastest-490': { chain: [226, 277, 317, 490] } });
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    expect(computes[0].req.final).toBe(490);
    expect(page.goalChoices.value.find(g => g.key === 'fastest-490')?.follow).toMatchObject({ times: 'working' });
    computes[0].resolve(pricingOf(te, now));
    // The selected goal's route first, then the other's (one worker at a time: composables/useFollowEstimate.ts).
    await vi.waitFor(() => expect(prices).toHaveLength(1));
    expect(prices[0].chain).toEqual([205, 238]);
    prices[0].resolve(routeOf([205, 238], now));
    await vi.waitFor(() => expect(prices).toHaveLength(2));
    expect(prices[1].chain).toEqual([226, 277, 317, 490]);
    prices[1].resolve(routeOf([226, 277, 317, 490], now));
    await vi.waitFor(() => expect(page.goalChoices.value.find(g => g.key === 'fastest-490')?.follow).toMatchObject({ times: 'estimate' }));
    expect(computes).toHaveLength(1);
    scope.stop();
  });

  it('leaving My runs lets it go: the worker stopped, nothing kept', async () => {
    const { scope, now, te } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } });
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    scope.stop();
    expect(terminated).toBe(1);
    expect(computes[0].alive()).toBe(false);
    computes[0].resolve(pricingOf(te, now));
    await new Promise(r => setTimeout(r, 10));
    expect(readPricingRecords()).toHaveLength(0);
  });

  it('no save loaded: nothing worked out', async () => {
    const { page, scope } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } }, { noSave: true });
    await new Promise(r => setTimeout(r, 20));
    expect(computes).toHaveLength(0);
    expect(page.follow.value).toBeNull();
    scope.stop();
  });

  it('it fails (the instant answer missing): the failure line with the short reason, the pill says so, not tried again on this page', async () => {
    const { page, scope } = await myRuns({ [EGG_DAY()]: { chain: [205, 238] } });
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    computes[0].reject(new Error('the instant answer could not be loaded (404)'));
    await vi.waitFor(() => expect(page.follow.value?.estimating).toBe('nosource'));
    expect(page.follow.value?.instantFailure).toBe("the instant answer couldn't be loaded (no connection, or the file is missing)");
    const { text, html } = await render(page);
    expect(text).toContain("No timeline for your route yet: the instant answer for your setup couldn't be worked out here (the instant answer couldn't be loaded (no connection, or the file is missing)).");
    expect(html).toContain('data-testid="now-follow-open-screen"');
    // The pill: never "not priced on this save yet" (the ascension you are in is being simulated meanwhile, lib/followSim.ts).
    expect(text).not.toContain('not priced on this save yet');
    expect(text).toMatch(/following · (its times couldn't be estimated|working out the first ascension)/);
    expect(vi.mocked(console.warn).mock.calls.some(c => String(c[0]).includes('working out the instant answer'))).toBe(true);
    await new Promise(r => setTimeout(r, 20));
    expect(computes).toHaveLength(1);
    scope.stop();
  });
});

describe('useInstantCompute: one at a time, the newest wins', () => {
  beforeEach(() => stubComputer());

  it('a newer setup while one runs: the running one let go, its answer never kept', async () => {
    const request = ref<InstantComputeRequest | null>({ key: 'one', account: 'a', backupTime: 5, setup: 's1', final: 490, useHours: false });
    const kept = vi.fn();
    const scope = effectScope();
    const { state } = scope.run(() => useInstantCompute(request, ref(false), kept))!;
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    request.value = { key: 'two', account: 'a', backupTime: 5, setup: 's2', final: 490, useHours: false };
    await vi.waitFor(() => expect(computes).toHaveLength(2));
    expect(computes[0].alive()).toBe(false);
    computes[0].resolve(pricingOf(194, 1_800_000_000));
    await new Promise(r => setTimeout(r, 10));
    expect(readPricingRecords()).toHaveLength(0);
    expect(state.value).toMatchObject({ key: 'two', status: 'working' });
    computes[1].resolve(pricingOf(194, 1_800_000_000));
    await vi.waitFor(() => expect(state.value).toMatchObject({ key: 'two', status: 'done' }));
    expect(readPricingRecords().map(r => r.setup)).toEqual(['s2']);
    expect(kept).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('settles first: a burst of edits starts one computation, for the last', async () => {
    setInstantComputeTiming({ delayMs: 30 });
    const request = ref<InstantComputeRequest | null>(null);
    const scope = effectScope();
    scope.run(() => useInstantCompute(request, ref(false), () => undefined));
    for (const k of ['a', 'b', 'c']) {
      request.value = { key: k, account: 'a', backupTime: 5, setup: k, final: 490, useHours: false };
      await nextTick();
    }
    await vi.waitFor(() => expect(computes).toHaveLength(1));
    expect(computes[0].req.key).toBe('c');
    scope.stop();
  });
});
