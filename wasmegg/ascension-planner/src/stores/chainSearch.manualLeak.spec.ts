/**
 * A Manual plan opened from the library or a file must not become the Auto Planner's start (spec-manualleak,
 * 28 Oct 2026; search/saveStart.ts). Walked through the real load paths on the real stores with a synthetic
 * save (no player data, fake IDs) and a fixed clock:
 *
 *   - the save set up the Auto Planner's way (initPlanFuture), at 190 TE;
 *   - a library-style plan opened (initLoadPlan -> importPlan -> hydrate): a start 1 TE higher, more eggs
 *     delivered, a farm whose last step is a day older and a redacted save with no time, as the library
 *     keeps them (Jordan's "to 218": 197 against his save's 196, and a "24h 8m" save age from its farm);
 *   - the same through a plan file (PlanFinalSummary's Import: importPlan alone);
 *   - Manual -> Auto -> Manual -> Auto, and a newer save loaded afterwards.
 */
import '../../scripts/node-shims';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { markRaw } from 'vue';
import { resolveColleggtibleContracts } from 'lib';
import { syntheticBackup, NOW } from '@/test/syntheticSave';
import { useInitialStateStore } from './initialState';
import { useUIStore } from './ui';
import { useChainSearchStore } from './chainSearch';
import { useActionsStore } from './actions';
import { exportPlanData } from './actions/io';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { initLoadPlan } from '@/lib/modes/loadPlan';
import { needsSaveSetUp, PLAN_NOT_SAVE } from '@/search/saveStart';
import { saveState } from '@/lib/saveFreshness';

const A = 'EI0000000000000000';
const DAY = 86400;

function saveAt(at: number, eggsTimes = 1) {
  const b = syntheticBackup();
  b.eiUserId = A;
  b.approxTime = at;
  b.settings = { lastBackupTime: at };
  b.virtue.eggsDelivered = b.virtue.eggsDelivered.map((x: number) => x * eggsTimes);
  for (const f of b.farms ?? []) if (f.lastStepTime) f.lastStepTime = at - 1800;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** The plan as the library keeps it: exported from the set-up stores (redacted save, no time, placeholder
 *  id), then moved to a later start: one TE more on Curiosity, more eggs, and its farm a day older. */
function libraryPlan() {
  const a = useActionsStore();
  const plan = JSON.parse(JSON.stringify(exportPlanData(a.actions, a.initialSnapshot)));
  const init = plan.initialState;
  init.initialTeEarned = { ...init.initialTeEarned, curiosity: init.initialTeEarned.curiosity + 1 };
  init.initialEggsDelivered = { ...init.initialEggsDelivered, curiosity: init.initialEggsDelivered.curiosity * 1.5 };
  init.currentFarmState = { ...(init.currentFarmState ?? {}), lastStepTime: NOW - 1800 - DAY };
  return plan;
}

function stores() {
  setActivePinia(createPinia());
  const ui = useUIStore();
  ui.screenPlayerId = A;
  return { init: useInitialStateStore(), ui, cs: useChainSearchStore(), a: useActionsStore() };
}

/** What the Auto Planner prices from, read the way the searches and the instant answer read it. */
function priced() {
  const cs = useChainSearchStore();
  const i = cs.collectInputs();
  return {
    te: i.currentTE,
    eggs: { ...i.baseState.eggsDelivered },
    farmAt: i.currentFarmState?.lastStepTime ?? null,
    planStart: i.planStart,
    saveAge: cs.saveAgeNote?.text ?? null,
  };
}

beforeAll(async () => {
  await import('./chainSearch');
  vi.useFakeTimers({ toFake: ['Date'] });
}, 60_000);
beforeEach(() => vi.setSystemTime((NOW + 3 * 3600) * 1000));
afterAll(() => vi.useRealTimers());

describe('a Manual plan opened after the save was set up', () => {
  it('(1) the Auto Planner and the instant answer still price from the save (library)', async () => {
    const { init, cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    expect(cs.startWait).toBe('');
    const save = priced();
    expect(save.te).toBe(190);

    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: libraryPlan() } as never);
    // The stores hold the plan (that is the Manual Planner's start)...
    expect(init.setupSource).toBe('draft');
    expect(init.currentFarmState?.lastStepTime).toBe(NOW - 1800 - DAY);
    // ...but every Auto Planner input is still the save's.
    expect(priced()).toEqual(save);
    // The instant answer does not run from the plan: it waits, and the Auto Planner sets the save up again.
    expect(cs.startWait).not.toBe('');
    expect(needsSaveSetUp(cs.startWait, init.setupSource)).toBe(true);
    // No search starts from it either.
    expect(cs.saveNotReady).toBe(PLAN_NOT_SAVE);
  }, 120_000);

  it('(1) the same through a plan file', async () => {
    const { a, cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    const save = priced();
    await a.importPlan(JSON.stringify(libraryPlan()));
    expect(priced()).toEqual(save);
    expect(cs.saveNotReady).toBe(PLAN_NOT_SAVE);
  }, 120_000);

  it('(2) the save-age line reads the save’s farm, not the plan’s', async () => {
    const { cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    const before = cs.saveAgeNote;
    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: libraryPlan() } as never);
    expect(cs.saveAgeNote).toEqual(before);
  }, 120_000);

  it('(2) the save-age banner reads the save’s times, not the plan’s (spec-saveage, the R6 snapshot rule)', async () => {
    const { init, cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    const before = cs.saveClock;
    expect(before).toMatchObject({ backupSeconds: NOW, farmStepSeconds: NOW - 1800, hasVirtueFarm: true });
    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: libraryPlan() } as never);
    expect(init.setupSource).toBe('draft');
    // The plan's farm is a day older and its redacted save has no time: neither reaches the banner.
    expect(cs.saveClock).toEqual(before);
    const state = saveState({ ...cs.saveClock!, nowSeconds: Math.floor(Date.now() / 1000), zone: 'UTC' })!;
    expect(state.saveAgeSeconds).toBe(3 * 3600);
    expect(state.siloUsedSeconds).toBe(3 * 3600 + 1800);
  }, 120_000);

  it('(3) the Manual Planner still opens the plan from its own start', async () => {
    const { init, a } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    const plan = libraryPlan();
    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: plan } as never);
    expect(init.initialTeEarned).toEqual(plan.initialState.initialTeEarned);
    expect(init.initialEggsDelivered.curiosity).toBe(plan.initialState.initialEggsDelivered.curiosity);
    expect(init.currentFarmState?.lastStepTime).toBe(NOW - 1800 - DAY);
    expect(a.initialSnapshot?.teEarned.curiosity).toBe(plan.initialState.initialTeEarned.curiosity);
  }, 120_000);

  it('Manual -> Auto -> Manual -> Auto keeps each right, and a newer save loads afterwards', async () => {
    const { init, cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    const save = priced();
    for (let round = 0; round < 2; round++) {
      const plan = libraryPlan();
      await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: plan } as never);
      // Manual: the plan's start.
      expect(init.initialTeEarned.curiosity).toBe(plan.initialState.initialTeEarned.curiosity);
      // Auto, before the save is set up again: the save's inputs.
      expect(priced()).toEqual(save);
      // Auto, the save set up again (App.vue setUpForInstantAnswer -> prepareAutoPlanner): the save, runnable.
      await initPlanFuture(A, saveAt(NOW), 'fresh');
      expect(cs.startWait).toBe('');
      expect(cs.saveNotReady).toBe('');
      expect(priced()).toEqual(save);
    }
    // A newer save, with more delivered: priced from it, and a plan opened after it does not reach it either.
    vi.setSystemTime((NOW + DAY + 3 * 3600) * 1000);
    await initPlanFuture(A, saveAt(NOW + DAY, 3), 'fresh');
    const newer = priced();
    expect(newer.te).toBeGreaterThan(save.te);
    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: libraryPlan() } as never);
    expect(priced()).toEqual(newer);
  }, 240_000);

  it('another account on screen never gets this account’s save', async () => {
    const { ui, cs } = stores();
    await initPlanFuture(A, saveAt(NOW), 'fresh');
    await initLoadPlan({ id: 'p1', name: 'to 218', timestamp: 1, data: libraryPlan() } as never);
    ui.screenPlayerId = 'EI1234567890123456';
    // The plan's own numbers, as before this fix: the guard loads that account's save.
    expect(priced().te).toBe(191);
    expect(cs.startWait).toBe('no-save');
  }, 120_000);
});

describe('needsSaveSetUp', () => {
  it('sets the save up again on a plan, a draft, a switch, another account or a save underneath', () => {
    for (const w of ['draft', 'switch', 'not-set-up', 'other-account'] as const)
      expect(needsSaveSetUp(w, 'fresh')).toBe(true);
    expect(needsSaveSetUp('no-save', 'draft')).toBe(true);
    expect(needsSaveSetUp('no-save', '')).toBe(false);
    expect(needsSaveSetUp('loading', 'draft')).toBe(false);
    expect(needsSaveSetUp('', 'fresh')).toBe(false);
  });
});
