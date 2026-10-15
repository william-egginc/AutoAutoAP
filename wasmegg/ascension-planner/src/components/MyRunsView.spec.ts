/**
 * My runs (#/myruns, 15 Oct 2026): three parts, each folded when empty; the board part is Compare's own
 * LeaderboardPanel in its my-runs mode; Compare no longer has a My plans tab; the tab sits between
 * Compare and Science.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import MyRunsView from './MyRunsView.vue';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
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
  pinia = createPinia();
  setActivePinia(pinia);
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

  it('sits after Compare and before Science, with a collector only, and opens MyRunsView', () => {
    const tabs = app.slice(app.indexOf('const topTabs = computed'), app.indexOf('/** "Fastest to 490 TE"'));
    const ids = [...tabs.matchAll(/id: '(\w+)' as const/g)].map(m => m[1]);
    expect(ids).toEqual(['manual', 'auto', 'compare', 'myruns', 'science']);
    expect(tabs.indexOf("id: 'myruns'")).toBeGreaterThan(tabs.indexOf('chainSearchStore.submitUrl'));
    expect(app).toContain('<div v-else-if="plannerTab === \'myruns\'"');
    expect(app).toContain('<MyRunsView :player-id="playerId" @use="useLeaderboardChain" @open="openFromMyRuns" />');
    // An address for it with no collector opens the Manual Planner, like Compare and Science.
    expect(app).toMatch(/!chainSearchStore\.submitUrl &&[\s\S]{0,120}plannerTab\.value === 'myruns'/);
  });

  it('five tabs wrap as two full rows below lg (planners, then Compare, My runs, Science)', () => {
    const tabs = read('SiteTabs.vue');
    expect(tabs).toContain('grid grid-cols-6 w-full lg:flex');
    expect(tabs).toContain("i < 2 ? 'col-span-3' : 'col-span-2'");
  });

  it("is also the Auto Planner's fourth sub-tab, opening the same page (#/myruns)", () => {
    const nav = app.slice(app.indexOf('v-for="v in autoTabs"'), app.indexOf("v-else-if=\"plannerTab === 'science'\""));
    expect(nav).toContain('data-testid="auto-tab-myruns"');
    expect(nav).toContain("@click=\"selectSection('myruns')\"");
    expect(nav).toContain('{{ NAMES.myRuns }}');
    // Only with a collector, like the top tab; four tabs make two rows of two on a phone.
    expect(nav).toMatch(/v-if="chainSearchStore\.submitUrl"[\s\S]{0,40}type="button"/);
    expect(app).toContain(":class=\"chainSearchStore.submitUrl ? 'grid-cols-2' : 'grid-cols-3'\"");
  });
});
