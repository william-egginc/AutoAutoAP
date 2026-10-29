/**
 * The saved answer under Right now shows only the goal picked on Right now's switch (24 Oct 2026, Jordan: the Fastest to
 * 490 and Egg Day cards side by side repeated the switch). Picking another pill switches the card. Through MyRunsView
 * with the synthetic save (id EI0000000000000000, never printed) and an instant answer kept for each goal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import type { BoardRow } from '@/lib/leaderboardRank';

const H = 3600;
const D = 86400;

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

async function setup(otherDate = false) {
  const { syntheticInputs } = await import('@/test/syntheticSave');
  await syntheticInputs();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  const { instantSnapKey, writeSnapshot } = await import('@/search/instantSnapshot');
  const { useChainSearchStore } = await import('@/stores/chainSearch');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  writeSnapshot(instantSnapKey(instantKeyFromStores(null, 490)), {
    at: Date.now() - 120_000,
    header: {},
    result: { best: { chain: [230, 490], end: now + 300 * D, legs: [] }, byAscensions: [null, { chain: [230, 490], end: now + 300 * D, legs: [] }] },
    exact: {},
    answerStart: now - H,
  } as never);
  writeSnapshot(instantSnapKey(instantKeyFromStores(eggDayAt, store.finalTE)), {
    at: Date.now() - 60_000,
    header: {},
    result: { best: null, byAscensions: [], byDate: { chain: [220, 271], end: eggDayAt - 2 * D, legs: [{ to: 271, endTE: 271, start: now, end: eggDayAt - 2 * D }] } },
    exact: {},
    answerStart: now - H,
  } as never);
  const other = eggDayAt - 30 * D;
  if (otherDate)
    writeSnapshot(instantSnapKey(instantKeyFromStores(other, store.finalTE)), {
      at: Date.now() - 30_000,
      header: {},
      result: { best: null, byAscensions: [], byDate: { chain: [215, 250], end: other - 2 * D, legs: [{ to: 250, endTE: 250, start: now, end: other - 2 * D }] } },
      exact: {},
      answerStart: now - H,
      meta: { account: (await import('@/search/runSaves')).accountOf((await import('@/stores/initialState')).useInitialStateStore().rawBackup), goal: `date ${other}`, backupTime: now - H },
    } as never);
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  return { page, scope, eggDayAt, other };
}

async function view() {
  const { default: MyRunsView } = await import('../MyRunsView.vue');
  const html = await renderHtml(MyRunsView, { playerId: 'EI0000000000000000' }, {}, [getActivePinia()!]);
  const tiles = html.slice(html.indexOf('data-testid="now-tiles"'), html.indexOf('data-testid="my-runs-your-runs"'));
  return { html, tiles: textOf(tiles), tilesHtml: tiles };
}

describe('My runs: the saved answer follows the goal picked on Right now', () => {
  it('one card at a time: the pill picked, and switching the pill switches the card', async () => {
    const { page, scope } = await setup();
    const year = nextEggDayYear();
    page.selectGoal(`eggday-${year}`);
    let v = await view();
    expect(v.tilesHtml).toContain('data-testid="now-tile-date"');
    expect(v.tilesHtml).not.toContain('data-testid="now-tile-fastest"');
    expect(v.tiles).toContain(`Egg Day ${year} · saved answer`);
    expect(v.tiles).toContain('271 TE');
    expect(v.tiles).not.toContain('Fastest to 490 TE · saved answer');
    expect(v.html).not.toMatch(/EI\d{16}/);

    page.selectGoal('fastest-490');
    v = await view();
    expect(v.tilesHtml).toContain('data-testid="now-tile-fastest"');
    expect(v.tilesHtml).not.toContain('data-testid="now-tile-date"');
    expect(v.tiles).toContain('Fastest to 490 TE · saved answer');
    expect(v.tiles).not.toContain(`Egg Day ${year} · saved answer`);
    expect(page.shownTile.value).toMatchObject({ goal: 'fastest', key: 'fastest-490', target: 490 });
    scope.stop();
  }, 60_000);

  it("another date picked: that date's card, opening its own screen", async () => {
    const { page, scope, other } = await setup(true);
    page.selectGoal(`date-${other}`);
    expect(page.shownTile.value).toMatchObject({ goal: 'date', key: `date-${other}`, open: { auto: 'by-date', byDate: { deadline: other } } });
    expect(page.shownTile.value.tile.answer?.endTE).toBe(250);
    const v = await view();
    expect(v.tilesHtml).toContain('data-testid="now-tile-date"');
    expect(v.tiles).toContain('250 TE');
    expect(v.tiles).toMatch(/By .+ · saved answer/);
    expect(v.tiles).not.toMatch(/Egg Day \d{4} · saved answer/);
    scope.stop();
  }, 60_000);
});
