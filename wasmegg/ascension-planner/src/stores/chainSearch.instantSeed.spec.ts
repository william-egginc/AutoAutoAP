// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Precompute: Smart search starts from the instant answer's fastest route inside the Limits box,
// unless a starting chain was typed; Classic's Target TE comes after it.
let mods: { chain: typeof import('./chainSearch'); planner: typeof import('./autoPlanner') };
beforeAll(async () => {
  mods = { chain: await import('./chainSearch'), planner: await import('./autoPlanner') };
}, 120_000);
function stores() {
  setActivePinia(createPinia());
  return { store: mods.chain.useChainSearchStore(), planner: mods.planner.useAutoPlannerStore() };
}

describe('the starting chain from the instant answer', () => {
  it('the fastest instant route inside the limits, ahead of Classic’s Target TE', () => {
    const { store, planner } = stores();
    planner.targetTE = '200 300';
    store.minPrestiges = 5;
    store.maxPrestiges = 8;
    // Fastest first: a 9-ascension route (outside the limits), then 8, then 6.
    store.instantRoutes = [
      [150, 170, 190, 220, 250, 290, 330, 400, 490],
      [160, 190, 220, 250, 290, 330, 400, 490],
      [180, 220, 260, 300, 380, 490],
    ];
    expect(store.instantSeed).toBe('160 190 220 250 290 330 400');
    expect(store.seedChain.slice(-1)[0]).toBe(490);
  });

  it('a typed starting chain still wins, and without instant routes Target TE is used', () => {
    const { store, planner } = stores();
    planner.targetTE = '200 300';
    store.instantRoutes = [[160, 190, 220, 250, 290, 490]];
    store.seedOverride = '210 310';
    expect(store.seedChain.slice(0, 2)).toEqual([210, 310]);
    store.seedOverride = '';
    store.instantRoutes = null;
    expect(store.instantSeed).toBe('');
  });

  it('ignores routes to another target', () => {
    const { store } = stores();
    store.finalTE = 400;
    store.instantRoutes = [[160, 190, 220, 250, 290, 490]];
    expect(store.instantSeed).toBe('');
  });
});
