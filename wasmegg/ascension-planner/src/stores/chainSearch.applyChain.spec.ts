// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { LegSummary } from '@/search/types';

// The instant answer's "Open this plan": a route that did not come from the store's last run is
// built from the plan start it was priced from, with its own legs' time off.
let mods: { chain: typeof import('./chainSearch'); planner: typeof import('./autoPlanner') };
beforeAll(async () => {
  mods = { chain: await import('./chainSearch'), planner: await import('./autoPlanner') };
}, 120_000);
function stores() {
  setActivePinia(createPinia());
  const planner = mods.planner.useAutoPlannerStore();
  planner.timezone = 'America/Denver';
  return { store: mods.chain.useChainSearchStore(), planner };
}

// Thursday 1 Oct 2026, 11:04 am MDT.
const START = Date.parse('2026-10-01T17:04:00Z') / 1000;

describe('applyChain with a start and legs of its own', () => {
  it('pins the planner to the given start and asks for the chain', async () => {
    const { store, planner } = stores();
    store.applyChain([166, 198, 248], true, { start: START });
    expect(`${planner.startDate} ${planner.startTime}`).toBe('2026-10-01 11:04');
    expect(planner.targetTE).toBe('166 198 248');
    expect(planner.timeOffCuts).toBeNull();
    expect(store.generateRequested).toBeGreaterThan(0);
  });

  it("works the route's time off in from the legs given", async () => {
    const { store, planner } = stores();
    const legs = [
      { endTE: 166, endTime: START + 86_400 * 10, timeOff: 'stopped' },
      { endTE: 198, endTime: START + 86_400 * 40, startTime: START + 86_400 * 14, timeOff: 'restarted' },
    ] as unknown as LegSummary[];
    store.applyChain([166, 198], false, { start: START, legs });
    expect(planner.targetTE).toBe('166 198');
    expect(planner.timeOffCuts).toMatchObject({
      targets: '166 198',
      ends: { 0: START + 86_400 * 10 },
      starts: { 1: START + 86_400 * 14 },
    });
  });
});
