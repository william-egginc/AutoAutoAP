// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

let mods: {
  sim: typeof import('./simulateRoute');
  chain: typeof import('@/stores/chainSearch');
  planner: typeof import('@/stores/autoPlanner');
  ui: typeof import('@/stores/ui');
};
beforeAll(async () => {
  mods = {
    sim: await import('./simulateRoute'),
    chain: await import('@/stores/chainSearch'),
    planner: await import('@/stores/autoPlanner'),
    ui: await import('@/stores/ui'),
  };
}, 120_000);

// Thursday 1 Oct 2026, 11:04 am MDT.
const START = Date.parse('2026-10-01T17:04:00Z') / 1000;

describe('Simulate this plan (simulateRoute)', () => {
  it('applies the route to Classic from its start, asks for the plan to be built, and opens Classic', () => {
    setActivePinia(createPinia());
    const planner = mods.planner.useAutoPlannerStore();
    planner.timezone = 'America/Denver';
    const store = mods.chain.useChainSearchStore();
    const ui = mods.ui.useUIStore();
    const opened = ui.openPlannerRequested;
    const asked = store.generateRequested;
    mods.sim.simulateRoute([166, 189, 196, 198, 222, 255], 'by-date', { start: START });
    expect(planner.targetTE).toBe('166 189 196 198 222 255');
    expect(`${planner.startDate} ${planner.startTime}`).toBe('2026-10-01 11:04');
    expect(store.generateWhenPlannerOpens).toBe(true);
    expect(store.generateRequested).toBeGreaterThan(asked);
    expect(ui.openPlannerRequested).toBe(opened + 1);
    expect(ui.planFromInstant).toEqual({ chain: [166, 189, 196, 198, 222, 255], back: 'by-date' });
  });

  it("the instant answer's route: its start, setting and A1 build go on, and a build-up A1 says Single run differs", () => {
    const { instantSimulate, INSTANT_BUILDUP_NOTE } = mods.sim;
    const legs = (label: string) => ({ legs: [{ label }, { label: '2-sale' }] });
    expect(instantSimulate(legs('3-sale-tier13'), { start: START, firstAscension: 'fresh' })).toEqual({
      opts: { start: START, firstAscension: 'fresh', firstKey: '3-sale-tier13' },
      note: '',
    });
    expect(instantSimulate(legs('continue'), { firstAscension: 'continue' }).opts).toEqual({
      firstAscension: 'continue',
      firstKey: 'continue',
    });
    expect(instantSimulate(legs('buildup'), { start: START, firstAscension: 'auto' })).toEqual({
      opts: { start: START, firstAscension: 'auto', firstKey: 'buildup' },
      note: INSTANT_BUILDUP_NOTE,
    });
    // A saved answer put back (no setting kept), a label that isn't a build, no route: nothing invented.
    expect(instantSimulate(legs('?'), { start: 0, firstAscension: null })).toEqual({ opts: {}, note: '' });
    expect(instantSimulate(null, { start: START })).toEqual({ opts: { start: START }, note: '' });
  });

  it("Classic's A1 follows the instant answer's, not Your setup changed since", () => {
    setActivePinia(createPinia());
    const store = mods.chain.useChainSearchStore();
    store.setFirstAscension('continue');
    // Priced under Prestige now: its build, though Your setup says Continue now.
    const fresh = mods.sim.instantSimulate({ legs: [{ label: '3-sale-tier13' }] }, { start: START, firstAscension: 'fresh' });
    mods.sim.simulateRoute([218, 247, 277, 313], 'by-date', fresh.opts);
    expect(store.classicFirstPick()).toEqual({ 0: '3-sale-tier13' });
    // Priced under Fastest with a build-up A1: no pick (Classic's own fastest), not Your setup's Continue.
    const up = mods.sim.instantSimulate({ legs: [{ label: 'buildup' }] }, { start: START, firstAscension: 'auto' });
    mods.sim.simulateRoute([218, 247, 277, 313], 'by-date', up.opts);
    expect(store.classicFirstPick()).toEqual({});
  });

  it('names the route the way the banner shows it', () => {
    expect(mods.sim.routeText([166, 189, 255])).toBe('166 → 189 → 255');
  });
});
