/**
 * My runs on a cold page load (fix 20). The first account shown after a load said "No save loaded" over the
 * draft's egg and TE: App.onMounted restores the Manual planner's draft into the initial-state store
 * (initPersistence -> importPlan -> hydrate: `lastBackupTime` 0, the TE and egg of whenever that plan was made)
 * and puts the last fetched save beside it (`rawBackup`); nothing loaded the save itself. Here the store goes
 * through the same three states, on ONE pinia and ONE `useNowPage`, so what is checked is that the page reacts:
 *
 *   empty            "No save loaded", no card
 *   draft + save     the strip reads the save's own time; the card, eggs and tiles wait (never the draft's 159 TE)
 *   save loaded      the strip, the card's egg (and its picture), the TE and the tiles' save time, all from the save
 *
 * The synthetic save (player id EI0000000000000000, never printed) is on Curiosity at 190 TE.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { redactBackupForStorage } from '@/lib/artifacts/utils';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { CurrentFarmState } from '@/types';

const H = 3600;

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
  // useMinuteClock's onMounted outside a component: Vue warns, the clock still reads Date.now.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** The save, taken two hours ago. */
function save(): ReturnType<typeof syntheticBackup> {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - 2 * H;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** App.onMounted's restore: the Manual draft (as exportPlanData writes it), then the stored save. */
function restoreDraft(backup: ReturnType<typeof syntheticBackup>): void {
  const initial = useInitialStateStore();
  initial.hydrate({
    lastBackupTime: 0,
    nickname: 'Redacted',
    currentFarmState: { eggType: 51, cash: 0, numSilos: 1, commonResearches: {}, habs: [], vehicles: [], population: 0, deliveredEggs: 0, lastStepTime: 0, cashEarned: 0, cashSpent: 0 } as CurrentFarmState,
    initialTeEarned: { curiosity: 32, integrity: 32, humility: 32, resilience: 32, kindness: 31 }, // 159
    rawBackup: redactBackupForStorage(backup),
  });
  initial.rawBackup = backup; // App: loadMetadata(pHash, 'rawBackup')
}

/** What prepareAutoPlanner's initPlanFuture does to the stores (the save loaded). */
function loadSave(backup: ReturnType<typeof syntheticBackup>): void {
  loadAndSyncBackup('EI0000000000000000', backup, 'plan_next');
  rollUpPendingTE();
}

describe('My runs on a cold load', () => {
  it('the strip, the card and the tiles follow the save as it arrives (one page, no re-mount)', async () => {
    const backup = save();
    const eggDayAt = eggDaySeconds(nextEggDayYear());
    const saveAt = backup.settings.lastBackupTime as number;
    // An Egg Day run of this save on the board (the tile's answer).
    const row: BoardRow = {
      id: 'aaaaaaaa',
      chain: [200, 230],
      finalTE: 230,
      durationDays: 10,
      deadline: eggDayAt,
      deadlineAscendAt: eggDayAt - 5 * H,
      startUtc: new Date((saveAt + H) * 1000).toISOString(),
      backupAgeHours: 1,
      backupTE: 190,
      receivedAt: new Date().toISOString(),
      level: 'exhaustive',
      yours: true,
    };
    const { useNowPage } = await import('@/composables/useNowPage');
    const scope = effectScope();
    const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([row]), boardRows: ref<BoardRow[] | null>([]) }))!;

    // 1. Empty.
    expect(page.strip.value).toBeNull();
    expect(page.hasSave.value).toBe(false);

    // 2. The draft and the stored save: the strip reads the save; nothing else shows the draft's state.
    restoreDraft(backup);
    expect(page.strip.value?.text).toMatch(/^Your save is from .+ \(2 hours ago\)\.$/);
    expect(page.saveWaiting.value).toBe(true);
    expect(page.hasSave.value).toBe(false);
    expect(page.currentEgg.value).toBeNull(); // never the draft's Integrity
    expect(page.teSoFar.value).toBe(0); // never the draft's 159

    // 3. The save loaded: everything reacts.
    loadSave(backup);
    expect(page.hasSave.value).toBe(true);
    expect(page.saveWaiting.value).toBe(false);
    expect(page.saveSeconds.value).toBe(saveAt);
    expect(page.strip.value?.tone).toBe('ok');
    expect(page.currentEgg.value).toBe('curiosity');
    expect(Math.floor(page.teSoFar.value)).toBe(190);
    const tile = page.eggDayTile.value;
    expect(tile.answer?.source).toBe('board');
    expect(Math.abs((tile.answer?.saveSeconds ?? 0) - saveAt)).toBeLessThan(60);
    expect(tile.olderSave).toBe(false);
    scope.stop();
  });

  it('renders "No save loaded", then the save’s age with the page waiting, then the card with the save’s egg', async () => {
    const { default: MyRunsView } = await import('../MyRunsView.vue');
    const pinia = getActivePinia()!;
    const render = async () => {
      const html = await renderHtml(MyRunsView, { playerId: 'EI0000000000000000' }, {}, [pinia]);
      expect(html).not.toMatch(/EI\d{16}/);
      return { html, t: textOf(html) };
    };

    let r = await render();
    expect(r.t).toContain('No save loaded');
    expect(r.html).not.toContain('data-testid="now-card"');

    const backup = save();
    restoreDraft(backup);
    r = await render();
    expect(r.t).not.toContain('No save loaded');
    expect(r.t).toMatch(/Your save is from .+ \(2 hours ago\)\./);
    expect(r.html).toContain('data-testid="now-save-waiting"');
    expect(r.html).not.toContain('data-testid="now-card"');
    expect(r.t).not.toContain('159 TE so far');

    loadSave(backup);
    r = await render();
    expect(r.t).toMatch(/Your save is from .+ \(2 hours ago\)\./);
    expect(r.html).not.toContain('data-testid="now-save-waiting"');
    expect(r.html).toContain('data-testid="now-card"');
    expect(r.t).toContain('Curiosity');
    expect(r.t).toContain('190 TE so far');
    expect(r.html).toContain('/64/egginc/egg_curiosity.png');
    expect(r.html).toContain('data-testid="now-tiles"');
  });
});

describe('the cold load, in the source', () => {
  it('App loads the save on My runs once the draft is restored, once per account, never under a search', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8');
    expect(app).toContain('const storesFromSave = computed(() => initialStateStore.hasData && initialStateStore.lastBackupTime > 0);');
    expect(app).toContain('watch([plannerTab, playerId, loading, storesSetUpFromSave], loadSaveForMyRuns);');
    expect(app).toMatch(/myRunsReady = true;\s+loadSaveForMyRuns\(\);\s+\}\);/);
    expect(app).toContain('if (myRunsLoadFor === playerId.value || searchActive.value || uiStore.runSaveLoaded) return;');
  });

  it('the board’s look-alike TE and My runs’ summary read the save’s own TE, never the stores’', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const board = fs.readFileSync(path.resolve(__dirname, '../auto/LeaderboardPanel.vue'), 'utf8');
    expect(board).toContain('const myTE = computed(() => saveTEOf(initialState.rawBackup));');
    const view = fs.readFileSync(path.resolve(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(view).toContain('teNow: saveTEOf(initialState.rawBackup),');
  });
});
