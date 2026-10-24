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

  it('names the route the way the banner shows it', () => {
    expect(mods.sim.routeText([166, 189, 255])).toBe('166 → 189 → 255');
  });
});
