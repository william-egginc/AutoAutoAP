/**
 * My runs (#/myruns, 15 Oct 2026): three parts, each folded when empty; the board part is Compare's own
 * LeaderboardPanel in its my-runs mode; Compare no longer has a My plans tab; the tab sits between
 * Compare and Science.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import MyRunsView from './MyRunsView.vue';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { useChainSearchStore } from '@/stores/chainSearch';
import type { PendingSend } from '@/search/pendingSends';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

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
  // A build with a collector, as the live site (the board parts show); 'with no collector' below has none.
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** The opening tag of the part with this test id. */
function partTag(html: string, id: string): string {
  const at = html.indexOf(`data-testid="${id}"`);
  return html.slice(html.lastIndexOf('<details', at), html.indexOf('>', at) + 1);
}

describe('MyRunsView', () => {
  it("has the three parts in order, the board part from LeaderboardPanel without Compare's tabs", async () => {
    const html = await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [pinia]);
    const t = textOf(html);
    const board = html.indexOf('data-testid="my-runs-part-board"');
    const saved = html.indexOf('data-testid="my-runs-part-saved"');
    const unsent = html.indexOf('data-testid="my-runs-part-unsent"');
    expect(board).toBeGreaterThan(-1);
    expect(board).toBeLessThan(saved);
    expect(saved).toBeLessThan(unsent);
    expect(t).toContain('Your runs on the board');
    expect(t).toContain('Saved on this computer');
    expect(t).toContain('Not sent yet');
    // Compare's board in its my-runs mode: no view tabs, no target picker; it asks for the save first.
    expect(html).toContain('data-testid="my-runs-board"');
    expect(html).not.toContain('aria-label="Leaderboard views"');
    expect(t).toContain('Load your save to see your own runs here.');
    // The player ID is never printed.
    expect(html).not.toContain('EI1234567890123456');
  });

  it('folds a part that is empty, opens one with something in it, and keeps the board open while it loads', async () => {
    const empty = await renderHtml(MyRunsView, { playerId: 'P' }, {}, [pinia]);
    expect(partTag(empty, 'my-runs-part-board')).toContain(' open');
    expect(textOf(empty)).toContain('Your runs on the board · loading');
    expect(partTag(empty, 'my-runs-part-saved')).not.toContain(' open');
    expect(partTag(empty, 'my-runs-part-unsent')).not.toContain(' open');
    expect(textOf(empty)).toContain('Not sent yet · none yet');

    const store = useChainSearchStore();
    store.pendingSends = [
      {
        id: 'p1',
        kind: 'deadline',
        key: 'deadline:1',
        label: '320 TE by Jul 14, 2027 9:00 AM',
        createdAt: Date.now(),
        payload: {} as PendingSend['payload'],
      },
    ];
    const kept = await renderHtml(MyRunsView, { playerId: 'P' }, {}, [pinia]);
    expect(partTag(kept, 'my-runs-part-unsent')).toContain(' open');
    expect(textOf(kept)).toContain('Not sent yet (1)');
    // Every kind: a By a date result shows here (UnsentResults without a kind).
    expect(textOf(kept)).toContain("This result wasn't sent to the leaderboard: 320 TE by Jul 14, 2027 9:00 AM");
  });

  it('reuses Saved runs and Saved answers as lists only, and Unsent results for every kind', () => {
    const src = read('MyRunsView.vue');
    expect(src).toMatch(/<LeaderboardPanel\s+mode="myruns"/);
    expect(src).toMatch(/<SavedRuns[^>]*list-only/);
    expect(src).toMatch(/<SavedAnswers[\s\S]*?list-only[\s\S]*?\/>/);
    expect(src).toContain('<UnsentResults :player-id="playerId" />');
  });
});

describe('Next steps, folded under Your runs (17 Oct 2026; the six cards gone 24 Oct 2026)', () => {
  it('come after the three parts, folded; no cards, nothing waits for the board', async () => {
    const html = await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [pinia]);
    const steps = html.indexOf('data-testid="my-runs-steps"');
    expect(steps).toBeGreaterThan(html.indexOf('data-testid="my-runs-part-unsent"'));
    expect(html).not.toContain('data-testid="my-runs-cards"');
    expect(html).not.toContain('data-testid="my-runs-card-');
    const t = textOf(html);
    expect(t).toContain('Next steps · nothing to look at');
    expect(t).not.toContain('Next steps · checking');
    expect(t).not.toContain('Six cards');
    expect(t).toContain('Nothing to change: keep following your route.');
    expect(html).not.toContain('EI1234567890123456');
  });

  it("holds the board's rows (LeaderboardPanel's own, emitted beside the count)", () => {
    const src = read('MyRunsView.vue');
    expect(src).toContain('@rows="r => (boardRows = r)"');
    const panel = read('auto/LeaderboardPanel.vue');
    expect(panel).toContain('rows: [rows: BoardRow[] | null];');
    expect(panel).toMatch(
      /myRunsMode\.value && loadedOnce\.value \? myRunRows\.value : null\),\s*rows => emit\('rows', rows\)/
    );
  });

  it('a step opens its part here (unsent), Right now on its goal, a fresh save, or asks App for its screen, set up', async () => {
    let setup: Record<string, unknown> = {};
    const onOpen = vi.fn();
    const onFresh = vi.fn();
    const app = createSSRApp({ render: () => h(MyRunsView, { playerId: 'P', onOpen, onFresh }) });
    app.use(pinia);
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/MyRunsView.vue')) setup = this.$.setupState;
      },
    });
    await renderToString(app);
    const act = setup.act as (to: unknown) => void;
    const open = setup.open as { board: boolean; saved: boolean; unsent: boolean };
    expect(open.unsent).toBe(false);
    act({ to: 'unsent' });
    expect(open.unsent).toBe(true);
    act({ to: 'fresh' });
    expect(onFresh).toHaveBeenCalledTimes(1);
    act({ to: 'right-now', goalKey: 'fastest-490' });
    expect(onOpen).not.toHaveBeenCalled();
    act({ to: 'by-date', deadline: 1, eggDay: true, tab: 'nearby' });
    expect(onOpen).toHaveBeenLastCalledWith({ auto: 'by-date', tab: 'nearby', byDate: { eggDay: true } });
    act({ to: 'fastest', target: 490, tab: 'nearby', level: 'normal' });
    expect(onOpen).toHaveBeenLastCalledWith({
      auto: 'fastest',
      depth: 'smart',
      tab: 'nearby',
      target: 490,
      level: 'normal',
    });
  });

  it("App opens the screen set up: target, level, tab and By a date's deadline, never under a running search", () => {
    const app = read('../App.vue');
    const fn = app.slice(app.indexOf('function openFromMyRuns'), app.indexOf('const initialStateStore'));
    expect(fn).toContain('function openFromMyRuns(to: MyRunsOpen): void');
    expect(fn).toMatch(
      /if \(!searchActive\.value\) \{[\s\S]*chainSearchStore\.finalTE = to\.target[\s\S]*strongerStore\.level = to\.level[\s\S]*presetByDate\(to\.byDate\)[\s\S]*selectSearchTab\(/
    );
    expect(fn).toContain("plannerTab.value = 'automatic'");
  });
});

describe('Compare without My plans', () => {
  it('has no My plans tab or view', async () => {
    const html = await renderHtml(LeaderboardPanel, { playerId: 'P' }, {}, [pinia]);
    const t = textOf(html);
    expect(html).toContain('aria-label="Leaderboard views"');
    expect(t).toContain('All runs');
    expect(t).not.toContain('My plans');
    const src = read('auto/LeaderboardPanel.vue');
    expect(src).not.toContain("tab === 'mine'");
    expect(src).not.toContain("'My plans'");
    // Hide from the public stays reachable: the Who sees your runs box is in the my-runs mode.
    const myRuns = src.slice(src.indexOf('<div v-if="myRunsMode"'), src.indexOf('<div v-else class="space-y-4">'));
    expect(myRuns).toContain('Hide all my runs from the public');
    expect(myRuns).toContain('Hidden from the public ({{ myHidden.length }})');
  });
});

describe('the My runs tab', () => {
  const app = read('../App.vue');

  it('sits after Leaderboard and before Science (collector or not), shown once there is something on it (24 Oct 2026), and opens MyRunsView', () => {
    const tabs = app.slice(app.indexOf('const topTabs = computed'), app.indexOf('/** "Fastest to 490 TE"'));
    const ids = [...tabs.matchAll(/id: '(\w+)' as const/g)].map(m => m[1]);
    expect(ids).toEqual(['manual', 'auto', 'compare', 'myruns', 'science']);
    // Leaderboard and Science each behind their own switch; My runs behind what the account has (lib/myRunsShown.ts),
    // never behind the collector.
    expect(tabs).not.toContain('submitUrl');
    const my = tabs.slice(tabs.indexOf("id: 'compare'"), tabs.indexOf("id: 'science'"));
    expect(my.slice(my.indexOf(': []),'), my.indexOf("id: 'myruns'"))).toMatch(/\.\.\.\(myRunsTabShown\.value\s*\?\s*\[/);
    expect(app).toContain('<div v-else-if="plannerTab === \'myruns\'"');
    expect(app).toMatch(
      /<MyRunsView\s+:player-id="playerId"\s+:loading="loading"\s+@use="useLeaderboardChain"\s+@open="openFromMyRuns"\s+@fresh="loadFreshSave"\s+@recalc="recalcFromMyRuns"\s+\/>/
    );
    // No address for it is turned away any more: only a hidden Leaderboard or Science falls back.
    expect(app).not.toMatch(/!chainSearchStore\.submitUrl &&[\s\S]{0,120}plannerTab\.value === 'myruns'/);
  });

  it('the tabs wrap as two full rows below lg (planners, then My runs with Leaderboard and Science when shown)', () => {
    const tabs = read('SiteTabs.vue');
    expect(tabs).toContain('grid grid-cols-6 w-full lg:flex');
    expect(tabs).toContain("i < 2 ? 'col-span-3' : (SECOND_ROW[tabs.length - 2] ?? 'col-span-2')");
    expect(tabs).toContain("{ 1: 'col-span-6', 2: 'col-span-3', 3: 'col-span-2' }");
  });

  it('is a top tab only, not an Auto Planner sub-tab (Jordan, 26 Oct 2026: the sub-tabs jumped when it appeared)', () => {
    const nav = app.slice(app.indexOf('v-for="v in autoTabs"'), app.indexOf("v-else-if=\"plannerTab === 'science'\""));
    expect(nav).not.toContain('data-testid="auto-tab-myruns"');
    expect(nav).not.toContain("@click=\"selectSection('myruns')\"");
    expect(app).toContain('class="grid grid-cols-3 w-full sm:flex');
  });
});

describe('My runs › Your runs: the latest run inside it (17 Oct 2026; was its own part)', () => {
  it('opens Your runs on the latest run, before the board part, with the Showing switch', async () => {
    const html = await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [pinia]);
    const section = html.indexOf('data-testid="my-runs-your-runs"');
    const showing = html.indexOf('data-testid="my-runs-showing"');
    const latest = html.indexOf('data-testid="my-runs-part-latest"');
    const board = html.indexOf('data-testid="my-runs-part-board"');
    expect(section).toBeGreaterThan(-1);
    expect(showing).toBeGreaterThan(section);
    expect(latest).toBeGreaterThan(showing);
    expect(latest).toBeLessThan(board);
    const t = textOf(html);
    expect(t).toMatch(/Latest Fastest to 490 TE run|Latest .* run/);
    expect(t).toContain('All my runs');
    expect(html).toContain('data-testid="latest-run-empty"');
    expect(t).toContain('The filters change this list only, not Right now above.');
    expect(html).not.toContain('EI1234567890123456');
  });

  it("shows a run of this account's, and nothing of another account's", async () => {
    const { accountHash } = await import('@/lib/accountHash');
    const store = useChainSearchStore();
    store.chainResultOwner = await accountHash('EI1234567890123456');
    store.pricedCount = 2;
    const mine = await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [pinia]);
    expect(mine).toContain('data-testid="latest-run-from"');
    expect(read('auto/LatestRunView.vue')).toMatch(/\(\) => shown\.value !== 'none',\s*has => emit\('has', has\),\s*\{ immediate: true \}/);
    const theirs = await renderHtml(MyRunsView, { playerId: 'EI0000000000000000' }, {}, [pinia]);
    expect(theirs).not.toContain('data-testid="latest-run-from"');
    expect(theirs).not.toContain('EI0000000000000000');
  });

  it("the Leaderboard's Your latest run tab is one line to My runs", async () => {
    const { useUIStore } = await import('@/stores/ui');
    useUIStore().compareView = 'latest';
    const html = await renderHtml(LeaderboardPanel, { playerId: 'P' }, {}, [pinia]);
    expect(html).toContain('data-testid="latest-moved"');
    expect(textOf(html)).toContain('Your latest run is now in My runs ›');
    expect(html).toContain('href="#/myruns"');
    expect(html).not.toContain('data-testid="latest-run"');
  });
});

describe('with no collector (VITE_SUBMIT_URL unset, 21 Oct 2026)', () => {
  const NO_BOARD = 'This build of the site has no leaderboard, so your runs stay on this computer and nothing is sent anywhere.';

  it('keeps the page and the saved runs, with one line where the board and Not sent yet were', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    const html = await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [pinia]);
    const t = textOf(html);
    expect(html).toContain('data-testid="my-runs"');
    expect(html).toContain('data-testid="my-runs-part-saved"');
    expect(html).toContain('data-testid="my-runs-part-latest"');
    expect(t).toContain(NO_BOARD);
    expect(html).not.toContain('data-testid="my-runs-part-board"');
    expect(html).not.toContain('data-testid="my-runs-board"');
    expect(html).not.toContain('data-testid="my-runs-part-unsent"');
    expect(t).not.toContain('The filters change this list only');
    expect(t).not.toContain('the ones on the board');
    // Nothing waits for a board that will never load.
    expect(t).not.toContain('· loading');
    expect(t).not.toContain('Checking your runs on the board');
    expect(t).not.toContain('Next steps · checking');
    // The six cards are gone (24 Oct 2026); Next steps stay, with nothing to wait for.
    expect(t).not.toContain('Six cards');
    expect(t).toContain('Next steps · nothing to look at');
    expect(html).not.toContain('EI1234567890123456');
  });

  it('sends nothing and fetches nothing while it renders', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this spec')));
    vi.stubGlobal('fetch', fetchSpy);
    await renderHtml(MyRunsView, { playerId: 'P' }, {}, [pinia]);
    expect(fetchSpy).not.toHaveBeenCalled();
    const src = read('MyRunsView.vue');
    expect(src).toContain('const hasBoard = !!store.submitUrl;');
    expect(src).toMatch(/<details\s+v-if="hasBoard"\s+:open="open\.board"/);
    expect(src).toMatch(/<details\s+v-if="hasBoard"\s+:open="open\.unsent"/);
    expect(src).toContain('const boardRows = ref<BoardRow[] | null>(hasBoard ? null : []);');
  });
});
