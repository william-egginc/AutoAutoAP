/**
 * My runs › Your latest run (was Leaderboard › Your latest run, #/compare/latest, until 16 Oct 2026): the newest
 * search's routes with their arrows; for Fastest its other options and charts, moved off its results (15 Oct
 * 2026); for By a date its best route for each stop count and its top 50, and while it runs its top routes so far
 * (moved off By a date's result, 16 Oct 2026). This account's runs only (16 Oct 2026). Fastest's panels and By a
 * date's link here with "Dig deeper into your plan ›".
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import LatestRunView from './LatestRunView.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import type { ShortlistRow } from '@/search/shortlist';
import { accountHash } from '@/lib/accountHash';

/** The two accounts of these specs (placeholders), and their hashes (worked out in beforeEach). */
const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
let hashA = '';
let hashB = '';
/** The view for account `id` (A by default). */
const view = (id = A) => renderHtml(LatestRunView, { playerId: id }, {}, [pinia]);

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
beforeEach(async () => {
  hashA = await accountHash(A);
  hashB = await accountHash(B);
});
/** A store whose in-memory runs are account A's (as a run, an opened save or a read-back tags them). */
function storeOfA() {
  const store = useChainSearchStore();
  store.chainResultOwner = hashA;
  store.deadlineResultOwner = hashA;
  return store;
}

const row = (chain: number[], days: number, reason: ShortlistRow['reason']): ShortlistRow => ({
  chain,
  seconds: days * 86400,
  gapSeconds: (days - 700) * 86400,
  prestiges: chain.length,
  legs: [],
  nightShifts: null,
  prestigeWaitSeconds: null,
  shiftHoldSeconds: null,
  reason,
});

describe('LatestRunView (My runs › Your latest run)', () => {
  it('no run in this visit: says so plainly, and nothing else', async () => {
    const html = await view();
    expect(html).toContain('data-testid="latest-run-empty"');
    const t = textOf(html);
    expect(t).toContain('Run a search on Fastest to 490 TE or Highest TE by a date and its routes show here');
    // Names both ways of searching (the pricing after Check exactly, and its note, went with it on 23 Oct 2026).
    expect(t).toContain('Either way of searching counts (Nearby routes or Exhaustive)');
    expect(t).not.toContain('Check exactly');
    expect(html).not.toContain('data-testid="other-options"');
    expect(html).not.toContain('data-testid="search-shape"');
  });

  it('a run with priced routes: where it came from, the other options and the shape of the search', async () => {
    const store = storeOfA();
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best'), row([230, 490], 701, 'prestige-count')];
    const html = await view();
    const t = textOf(html);
    expect(html).not.toContain('data-testid="latest-run-empty"');
    expect(t).toContain(`From your Nearby routes run on`);
    expect(html).toContain('href="#/auto/fastest"');
    expect(html).toContain('data-testid="other-options"');
    expect(t).toContain('Other options worth considering');
    for (const label of ['A good mix', 'Fastest', 'Kindest to my schedule', 'By ascension count', 'By finish date'])
      expect(t).toContain(label);
    expect(html).toContain('data-testid="shortlist"');
    expect(t).toContain('212 280 490');
    expect(html).toContain('data-testid="search-shape"');
    expect(t).toContain('The shape of this search');
  });

  it("an Exhaustive run: named so, linked back to Exhaustive, and no Nearby routes' stage words", async () => {
    const store = storeOfA();
    store.pricedCount = 1;
    store.searchSpace = { bands: [] } as never;
    const html = await view();
    expect(textOf(html)).toContain('From your Exhaustive run on');
    expect(html).toContain('href="#/auto/fastest/full"');
    expect(textOf(html)).not.toMatch(/Finished:|Nothing left to price:/);
  });

  it('the charts load only when shown on this view (async), not with the page', () => {
    const src = read('LatestRunView.vue');
    expect(src).toMatch(/const RunCharts = safeAsyncComponent\(\(\) => import\('\.\/charts\/RunCharts\.vue'\)\)/);
    expect(src).not.toMatch(/import RunCharts from/);
    // The view is on My runs now (inside its Your runs section, 17 Oct 2026), not on the Leaderboard.
    expect(read('../MyRunsView.vue')).toMatch(/<LatestRunView\s+:player-id="playerId"\s+:want="[^"]+"\s+@has="v => \(latestHas = v\)"/);
    expect(read('LeaderboardPanel.vue')).not.toMatch(/<LatestRunView|import\('\.\/LatestRunView\.vue'\)/);
    // Its Leaderboard tab stays, as one line to My runs (the integrator, 16 Oct).
    expect(read('LeaderboardPanel.vue')).toMatch(/v-else-if="tab === 'latest'"[^>]*data-testid="latest-moved"/);
    expect(read('LeaderboardPanel.vue')).toContain('>{{ NAMES.latest }} is now in {{ NAMES.myRuns }} ›</a');
    // The store builds the chart's data only while a chart is mounted.
    expect(read('charts/RunCharts.vue')).toContain('onMounted(() => store.chartMounted(true))');
    expect(read('charts/RunCharts.vue')).toContain('onBeforeUnmount(() => store.chartMounted(false))');
  });
});

describe("Fastest's results: one line in place of the moved blocks", () => {
  for (const file of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
    it(`${file}: "Dig deeper into your plan ›" to My runs, and no longer has the blocks`, () => {
      const src = read(file);
      expect(src).toMatch(/<DigDeeperLink\s+v-if="ownRun && store.pricedCount"/);
      expect(src).not.toContain('Other options worth considering');
      expect(src).not.toContain('The shape of this search');
      expect(src).not.toMatch(/<RunCharts\b/);
      expect(src).not.toContain('data-testid="shortlist"');
    });
  }

  it('By a date links there too, under its result card, and still has no charts or other-options views', () => {
    const src = read('DeadlinePanel.vue');
    expect(src).toMatch(/<DigDeeperLink v-if="best && !store.deadlineRunning"/);
    expect(src).not.toMatch(/<RunCharts\b|Other options worth considering/);
  });

  it("By a date's result keeps its best, its best for each stop count and the share box; its top routes moved", () => {
    const src = read('DeadlinePanel.vue');
    // Moved to My runs › Your latest run (Jordan, 16 Oct): the priced summary and the top routes, and the live
    // "Top routes so far".
    expect(src).not.toMatch(/>Every route in your boxes/);
    expect(src).not.toMatch(/title="Top routes so far"/);
    expect(src).not.toContain('result.routes.slice(0, 15)');
    // Kept.
    expect(src).toMatch(/title="Best for each stop count"/);
    expect(src).toMatch(/<ByDateRouteCard\s+v-if="best"/);
    expect(src).toMatch(/<ShareResult\b/);
    // While it runs, a line to the top routes so far.
    expect(src).toMatch(/<DigDeeperLink\s+v-if="store.deadlineProgress.top.length > 1"/);
  });

  it('the link: its words and where it goes', async () => {
    const { default: DigDeeperLink } = await import('./DigDeeperLink.vue');
    const html = await renderHtml(DigDeeperLink, {});
    expect(textOf(html)).toContain('Dig deeper into your plan ›');
    expect(textOf(html)).toContain('(My runs › Your runs)');
    // Its click asks My runs to open on Your runs (lib/myRunsFocus.ts).
    expect(read('DigDeeperLink.vue')).toContain('@click="askYourRuns()"');
    expect(html).toContain('href="#/myruns"');
    expect(html).not.toContain('#/compare/latest');
  });
});

const H = 3600;
const T0 = Date.parse('2027-03-01T15:00:00Z') / 1000;
/** A By a date route with legs that kept their shifts and TE. */
const dateRoute = (chain: number[], reachAt: number) => ({
  chain,
  reachAt,
  ascendAt: reachAt,
  spare: 86400,
  legs: chain.map((te, i) => ({
    key: '1-sale',
    endTE: te,
    durationSeconds: 100 * H,
    maxELR: 1,
    endTime: T0 + (i + 1) * 100 * H,
    startTime: T0 + i * 100 * H,
    tier13Unlocked: false,
    shifts: [{ at: T0 + i * 100 * H + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 40 + i }],
    endEgg: { egg: 'integrity', te: 45 + i },
  })),
});
function dateResult(at: number, n = 60) {
  const routes = Array.from({ length: n }, (_, k) => dateRoute([220 + k, 300 + k], T0 + 200 * H));
  return {
    simple: true,
    routes,
    byStops: [dateRoute([250], T0 + 100 * H), routes[0]],
    deadline: T0 + 300 * H,
    planStart: T0,
    te: 200,
    step: 0,
    shapes: 3,
    priced: 1234,
    stoppedEarly: false,
    ascendNeeded: false,
    lastHi: 490,
    at,
  };
}

describe('Your latest run: By a date', () => {
  it('its summary says how much was priced: every route in the space, run complete', async () => {
    const store = storeOfA();
    store.deadlineResult = dateResult(Date.parse('2026-10-15T18:00:00Z')) as never;
    expect(textOf(await view())).toContain('1,234 routes priced: every route in your boxes, run complete.');
  });

  it('a By a date run going now: its top routes so far (moved off By a date)', async () => {
    const store = storeOfA();
    store.deadlineRunning = true;
    store.deadlineProgress = {
      stage: 'pricing',
      priced: 321,
      best: null,
      open: 0,
      shapes: 1,
      top: [dateRoute([230, 300], T0 + 200 * H), dateRoute([231, 301], T0 + 200 * H)],
    } as never;
    const html = await view();
    const t = textOf(html);
    expect(html).toContain('data-testid="latest-run-date-running"');
    expect(t).toContain('run is going: 321 routes priced so far');
    expect(html).toContain('data-testid="latest-run-top-so-far"');
    expect(t).toContain('Top routes so far');
    expect(t).toContain('231 301');
    // On another account: nothing of it.
    const other = await view(B);
    expect(other).toContain('data-testid="latest-run-empty"');
    expect(textOf(other)).not.toContain('has started');
  });

  it('a By a date result and no Fastest run: its best for each stop count and its top 50, with arrows', async () => {
    const store = storeOfA();
    store.deadlineResult = dateResult(Date.parse('2026-10-15T18:00:00Z')) as never;
    const html = await view();
    const t = textOf(html);
    expect(html).not.toContain('data-testid="latest-run-empty"');
    expect(html).toContain('data-testid="latest-run-from-date"');
    expect(t).toContain('From your Highest TE by a date run (Nearby routes, by');
    expect(t).toContain('1,234 routes priced');
    expect(html).toContain('href="#/auto/by-date"');
    expect(t).toContain('Best for each stop count');
    expect(t).toContain('Top routes (50 of 1,234 priced)');
    // The top 50, not 15 (and not all 60).
    expect(t).toContain('269 349');
    expect(t).not.toContain('270 350');
    // Every row with legs has its arrow.
    expect(html.match(/data-testid="result-row-expand"/g)?.length).toBe(52);
    expect(html).not.toContain('data-testid="other-options"');
  });

  it('the newer of the two runs shows, by when each was found, and the other is a click away', async () => {
    const store = storeOfA();
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best')];
    store.chainResultAt = Date.parse('2026-10-15T12:00:00Z');
    // Restored from IndexedDB, but found BEFORE the Fastest run: Fastest shows.
    store.deadlineResult = dateResult(Date.parse('2026-10-14T12:00:00Z')) as never;
    let html = await view();
    expect(textOf(html)).toContain('From your Nearby routes run on');
    expect(html).toContain('data-testid="latest-run-other"');
    expect(textOf(html)).toContain('Show your Highest TE by a date run instead');
    // Found after it: By a date shows.
    store.deadlineResult = dateResult(Date.parse('2026-10-15T13:00:00Z')) as never;
    html = await view();
    expect(textOf(html)).toContain('From your Highest TE by a date run');
    expect(textOf(html)).toContain('Show your Fastest to 490 TE run instead');
  });

  it('a Fastest run going now is the newest, whatever By a date restored', async () => {
    const store = storeOfA();
    store.pricedCount = 2;
    store.isRunning = true;
    store.deadlineResult = dateResult(Date.now()) as never;
    const html = await view();
    expect(textOf(html)).toContain('From your Nearby routes run on');
  });

  it('source: the shortlist and By a date tables use RouteTimeline, and the eggBlocks copy is gone', () => {
    const src = read('LatestRunView.vue');
    expect(src).toMatch(/<RouteTimeline v-if="row.legs.length" :chain="row.chain" :legs="row.legs" :zone="zone" \/>/);
    expect(src).toMatch(/<RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" \/>/);
    expect(src).toContain('dateResult.routes.slice(0, 50)');
    expect(src).not.toMatch(/function eggBlocks/);
    expect(read('ChainSearchPanel.vue')).not.toMatch(/function eggBlocks/);
  });
});

describe('Your latest run: one account at a time (Jordan, 16 Oct: another account\'s run showed)', () => {
  it('a run on A shows on A, nothing of it on B, and again on A when switched back', async () => {
    const store = storeOfA();
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best')];
    store.chainResultAt = Date.parse('2026-10-15T12:00:00Z');
    store.deadlineResult = dateResult(Date.parse('2026-10-15T13:00:00Z'), 48) as never;
    const onA = await view(A);
    expect(textOf(onA)).toContain('From your Highest TE by a date run');
    expect(textOf(onA)).toContain('Show your Fastest to 490 TE run instead');
    // B loaded: neither run, not even the "other run" line; the placeholder instead.
    const onB = await view(B);
    expect(onB).toContain('data-testid="latest-run-empty"');
    expect(onB).not.toContain('data-testid="latest-run-from-date"');
    expect(onB).not.toContain('data-testid="latest-run-from"');
    expect(onB).not.toContain('data-testid="latest-run-other"');
    expect(textOf(onB)).not.toContain('1,234');
    expect(textOf(onB)).not.toContain('212 280 490');
    // Back on A: still there (ignored on B, never cleared).
    expect(textOf(await view(A))).toContain('From your Highest TE by a date run');
  });

  it("B's own runs show on B, A's don't, each side on its own", async () => {
    const store = useChainSearchStore();
    store.chainResultOwner = hashA;
    store.pricedCount = 3;
    store.shortlist = [row([212, 280, 490], 700, 'best')];
    store.deadlineResultOwner = hashB;
    store.deadlineResult = dateResult(Date.parse('2026-10-14T13:00:00Z')) as never;
    const onB = await view(B);
    expect(textOf(onB)).toContain('From your Highest TE by a date run');
    expect(onB).not.toContain('data-testid="latest-run-other"');
    const onA = await view(A);
    expect(textOf(onA)).toContain('From your Nearby routes run on');
    expect(onA).not.toContain('data-testid="latest-run-other"');
  });

  it('a run with no account tag is never shown', async () => {
    const store = useChainSearchStore();
    store.pricedCount = 3;
    store.deadlineResult = dateResult(Date.now()) as never;
    expect(await view(A)).toContain('data-testid="latest-run-empty"');
  });

  it('a result read back under this account whose save was another account\'s is hidden', async () => {
    const store = storeOfA();
    store.deadlineResult = { ...dateResult(Date.now()), inputsKey: 'k1' } as never;
    store.runSaves = [{ key: 'k1', account: 'someone-else' }] as never;
    // The loaded save is this account's (a different save account than the stored one).
    const { useInitialStateStore } = await import('@/stores/initialState');
    useInitialStateStore().rawBackup = { eiUserId: A } as never;
    expect(await view(A)).toContain('data-testid="latest-run-empty"');
  });

  it('the store tags its runs with the account (hashes only), and the view reads this account\'s back', () => {
    const store = fs.readFileSync(path.join(__dirname, '../../stores/chainSearch.ts'), 'utf8');
    // Both Fastest starts and an opened saved run.
    expect(store.match(/tagChainResult\(playerId\);/g)?.length).toBe(2);
    expect(store).toMatch(/chainResultAt\.value = summary\.savedAt \|\| 0;\s*chainRunSaveAt\.value = [^;]*;\s*chainOwnerSeq\+\+;\s*chainResultOwner\.value = owner;/);
    // By a date: read back from IndexedDB, an opened saved answer, a run.
    expect(store).toMatch(/deadlineResult\.value = loadedResult;\s*deadlineResultOwner\.value = owner;/);
    expect(store).toContain('deadlineResultOwner.value = savedAnswersOwner;');
    expect(store).toContain('deadlineResultOwner.value = accountHashNow(currentPlayerId);');
    const src = read('LatestRunView.vue');
    expect(src).toContain('store.deadlineResultOwner !== h) await store.loadDeadlineState(id)');
  });
});

describe("My runs' Showing switch: each option shows only its own kind (beta, 16 Oct)", () => {
  const wanted = (want: 'fastest' | 'date') => renderHtml(LatestRunView, { playerId: A, want }, {}, [pinia]);
  const fastestRun = (store: ReturnType<typeof storeOfA>) => {
    store.pricedCount = 7;
    store.shortlist = [row([212, 280, 490], 700, 'best')];
  };

  it('By a date with only a Fastest run: "none yet on this account", never the Fastest run', async () => {
    fastestRun(storeOfA());
    const html = await wanted('date');
    const t = textOf(html);
    expect(html).toContain('data-testid="latest-run-none-date"');
    expect(t).toContain('No Highest TE by a date run yet on this account');
    expect(t).not.toContain('run on Fastest to 490 TE');
    expect(t).not.toContain('212 280 490');
    expect(html).not.toContain('data-testid="latest-run-other"');
  });

  it('Fastest with only a By a date run: "none yet on this account"', async () => {
    const store = storeOfA();
    store.deadlineResult = dateResult(Date.parse('2026-10-15T18:00:00Z')) as never;
    const html = await wanted('fastest');
    expect(html).toContain('data-testid="latest-run-none-fastest"');
    expect(textOf(html)).toContain('No Fastest to 490 TE run yet on this account');
    expect(html).not.toContain('data-testid="latest-run-from-date"');
  });

  it('each with its own run shows its own, whichever is newer', async () => {
    const store = storeOfA();
    fastestRun(store);
    store.chainResultAt = Date.parse('2026-10-15T12:00:00Z');
    // By a date found later: still Fastest on the Fastest option, By a date on its own.
    store.deadlineResult = dateResult(Date.parse('2026-10-15T13:00:00Z')) as never;
    const f = textOf(await wanted('fastest'));
    expect(f).toContain('run on Fastest to 490 TE');
    expect(f).not.toContain('From your Highest TE by a date run');
    const d = textOf(await wanted('date'));
    expect(d).toContain('From your Highest TE by a date run');
    expect(d).not.toContain('run on Fastest to 490 TE');
  });

  it('a By a date run going now is not announced on the Fastest option', async () => {
    const store = storeOfA();
    store.deadlineRunning = true;
    const t = textOf(await wanted('fastest'));
    expect(t).toContain('No Fastest to 490 TE run yet on this account');
    expect(t).not.toContain('run has started');
  });
});
