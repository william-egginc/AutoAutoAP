/**
 * U3.1 of the code review (22 Nov 2026, ui-panels-1 and rel-chainsearch-2-10): the result cards, Latest run, the RouteExtras
 * reach times and the running progress date a finish from the run's own start (`resultsPlanStart`), not the live start boxes.
 * Opening a saved run sets `planStartUsed` and must not rewrite the player's start boxes, so the cards read the store's rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChainSearchStore } from './chainSearch';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the store gives the results\' start', () => {
  it('resultsPlanStart is exported and prefers the run\'s own start to the live one', () => {
    setActivePinia(createPinia());
    const store = useChainSearchStore();
    expect(typeof store.resultsPlanStart).toBe('function');
    const live = store.planStart; // computed from the start boxes
    expect(store.resultsPlanStart()).toBe(live);
    store.planStartUsed = live - 3 * 86400;
    expect(store.resultsPlanStart()).toBe(live - 3 * 86400);
    expect(store.planStart).toBe(live);
  });
  it('the running progress dates its best from the run\'s start', () => {
    expect(read('chainSearch.ts')).toMatch(/at: \(planStartUsed\.value \|\| planStart\.value\) \+ bestDays\.value \* 86400/);
  });
});

describe('the cards date the finish from it', () => {
  const card = (f: string) => read(`../components/auto/${f}`);
  it('ChainSearchPanel, InsanePanel and LatestRunView use resultsPlanStart, never the live planStart', () => {
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue', 'LatestRunView.vue']) {
      const s = card(f);
      expect(s, f).toContain('store.resultsPlanStart()');
      expect(s, f).not.toMatch(/store\.planStart \+/);
    }
    expect(card('ChainSearchPanel.vue')).toContain(':reach-at="store.resultsPlanStart() + store.bestDays * 86400"');
    expect(card('InsanePanel.vue')).toContain(':reach-at="store.resultsPlanStart() + store.bestDays * 86400"');
  });
});
