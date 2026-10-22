/**
 * The instant answer waits for the save (stores/chainSearch.ts `startWait`, search/startProvenance.ts), walked
 * through the page's own load paths on the real stores with a synthetic save (no player data, fake IDs):
 *
 *   - a fresh load with a stored draft: the Manual planner's draft restored first (initPersistence ->
 *     importPlan -> hydrate), the stored save put back beside it, then the Auto Planner's set-up;
 *   - an account switch A -> B -> A (App.vue submitPlayerId: the quick 'default' load, then the set-up);
 *   - a reload with ?playerId= for an account whose stores are another's;
 *   - a stale tab: a newer save loaded underneath without a set-up.
 *
 * Allan's "36 h faster" (22 Oct 2026) was the instant answer worked out at the first step of the first walk.
 */
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { markRaw } from 'vue';
import { resolveColleggtibleContracts } from 'lib';
import { syntheticBackup, NOW } from '@/test/syntheticSave';
import { useInitialStateStore } from './initialState';
import { useUIStore } from './ui';
import { useChainSearchStore } from './chainSearch';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { loadAndSyncBackup } from '@/lib/modes';
import { saveHashOf } from '@/search/startProvenance';

const A = 'EI0000000000000000';
const B = 'EI1234567890123456';

/** The synthetic save for an account: B's has a day more delivered and a newer time, so its TE differs. */
function saveFor(id: string, at = NOW): ReturnType<typeof syntheticBackup> {
  const b = syntheticBackup();
  b.eiUserId = id;
  b.approxTime = at;
  b.settings = { lastBackupTime: at };
  if (id === B) b.virtue.eggsDelivered = b.virtue.eggsDelivered.map((x: number) => x * 3);
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** A Manual draft as `hydrate` gets it: an older TE, older eggs, no save time (exportPlanData writes 0). */
function draftFor(id: string) {
  const te = { curiosity: 30, integrity: 30, humility: 30, resilience: 30, kindness: 30 };
  return {
    playerId: id,
    lastBackupTime: 0,
    initialTeEarned: te,
    initialEggsDelivered: { curiosity: 1e16, integrity: 1e16, humility: 1e16, resilience: 1e16, kindness: 1e16 },
  };
}

function stores() {
  setActivePinia(createPinia());
  return { init: useInitialStateStore(), ui: useUIStore(), cs: useChainSearchStore() };
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);

describe('a fresh load with a stored draft (and a reload with ?playerId=)', () => {
  it('waits on the draft and the stored save beside it, and runs once the save is set up', async () => {
    const { init, ui, cs } = stores();
    // App.vue: the ID from the address (or the saved one) is on screen before anything loads.
    ui.screenPlayerId = A;
    expect(cs.startWait).toBe('no-save');
    // onMounted: initPersistence restores the draft, then the stored save is put back as rawBackup.
    init.hydrate(draftFor(A));
    expect(cs.startWait).toBe('no-save');
    init.rawBackup = saveFor(A);
    expect(cs.startWait).toBe('draft');
    const draftTE = cs.currentTE;
    // initAutoOnce -> prepareAutoPlanner: loading, then the save set up the Auto Planner's way.
    ui.loading = true;
    expect(cs.startWait).toBe('loading');
    await initPlanFuture(A, saveFor(A), 'fresh');
    ui.loading = false;
    expect(cs.startWait).toBe('');
    // The answer now starts from the save's TE, not the draft's.
    expect(cs.currentTE).toBe(190);
    expect(cs.currentTE).not.toBe(draftTE);
    expect(cs.startProvenanceNow()).toMatchObject({
      src: 'fresh',
      saveAt: NOW,
      saveHash: saveHashOf(saveFor(A)),
      plan: 'now',
    });
  }, 60_000);

  it('a draft says so in what is sent', () => {
    const { init, ui, cs } = stores();
    ui.screenPlayerId = A;
    init.hydrate(draftFor(A));
    init.rawBackup = saveFor(A);
    expect(cs.startProvenanceNow().src).toBe('draft');
  });

  it('a reload whose address names another account than the stores hold waits for that account', async () => {
    const { ui, cs } = stores();
    await initPlanFuture(B, saveFor(B), 'stored');
    ui.screenPlayerId = B;
    expect(cs.startWait).toBe('');
    ui.screenPlayerId = A;
    expect(cs.startWait).toBe('other-account');
  }, 60_000);
});

describe('an account switch A -> B -> A', () => {
  it('waits through each switch’s quick load and runs on each account’s own save once set up', async () => {
    const { init, ui, cs } = stores();
    ui.screenPlayerId = A;
    await initPlanFuture(A, saveFor(A), 'fresh');
    expect(cs.startWait).toBe('');
    const teA = cs.currentTE;

    for (const [id, save] of [
      [B, saveFor(B, NOW + 3600)],
      [A, saveFor(A)],
    ] as const) {
      // submitPlayerId: the ID changes on screen as soon as the save is in; the stores are still the last account's.
      ui.screenPlayerId = id;
      ui.loading = true;
      expect(cs.startWait).toBe('loading');
      ui.loading = false;
      expect(cs.startWait).toBe('other-account');
      // The account's draft lands, then the quick 'default' load (claimed TE only).
      init.hydrate(draftFor(id));
      init.rawBackup = save;
      expect(cs.startWait).toBe('draft');
      loadAndSyncBackup(id, save, 'default');
      expect(cs.startWait).toBe('switch');
      expect(cs.startProvenanceNow().src).toBe('switch');
      // initAutoOnce / setUpFromSaveInHand: the save already in hand, set up.
      await initPlanFuture(id, save, 'fresh');
      expect(cs.startWait).toBe('');
    }
    expect(cs.currentTE).toBe(teA);
  }, 120_000);
});

describe('a stale tab', () => {
  it('waits when a newer save is loaded underneath without a set-up, and runs once it is set up', async () => {
    const { init, ui, cs } = stores();
    ui.screenPlayerId = A;
    await initPlanFuture(A, saveFor(A, NOW - 5 * 86400), 'fresh');
    expect(cs.startWait).toBe('');
    // The header's reconcile refresh loads a save but leaves the planner as it was.
    loadAndSyncBackup(A, saveFor(A), 'reconcile');
    expect(cs.startWait).toBe('not-set-up');
    // Or the save kept in storage is put back over a tab set up days ago.
    await initPlanFuture(A, saveFor(A, NOW - 5 * 86400), 'stored');
    init.rawBackup = saveFor(A);
    expect(cs.startWait).toBe('not-set-up');
    // Load latest save: set up again.
    await initPlanFuture(A, saveFor(A), 'fresh');
    expect(cs.startWait).toBe('');
    expect(cs.startProvenanceNow().saveAt).toBe(NOW);
  }, 120_000);

  it('a save file the player loaded counts as set up, and says so', async () => {
    const { ui, cs } = stores();
    ui.screenPlayerId = A;
    await initPlanFuture(A, saveFor(A), 'file');
    expect(cs.startWait).toBe('');
    expect(cs.startProvenanceNow().src).toBe('file');
  }, 60_000);
});
