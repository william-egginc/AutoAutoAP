/** Specs for the "a longer route might win" note: nothing when nothing qualifies, the instant answer's
 *  note with its buttons, and no note while a run is going. (The decision itself is in
 *  lib/longerRouteHint.spec.ts.) */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import LongerRouteHint from './LongerRouteHint.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { renderHtml, textOf } from '@/test/renderComponent';

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

const props = { running: false, mode: 'chain' as const, onAdd: () => 'ok' };
const SEVEN = [163, 195, 216, 248, 280, 318, 490];

function result(days = 30) {
  const store = useChainSearchStore();
  store.bestChain = [163, 197, 232, 262, 295, 490];
  store.bestDays = days;
}

describe('LongerRouteHint', () => {
  it('shows nothing when nothing qualifies', async () => {
    result();
    expect(await renderHtml(LongerRouteHint, props, {}, [pinia])).not.toContain('longer-route-hint');
    // A slower instant answer is not a note either.
    useInstantSummaryStore().fastest = { chain: SEVEN, seconds: 31 * 86400, exact: false };
    expect(await renderHtml(LongerRouteHint, props, {}, [pinia])).not.toContain('longer-route-hint');
  });

  it("shows the instant answer's route with both buttons", async () => {
    result();
    useInstantSummaryStore().fastest = { chain: SEVEN, seconds: 28.5 * 86400, exact: false };
    const html = await renderHtml(LongerRouteHint, props, {}, [pinia]);
    expect(textOf(html)).toBe(
      'The instant answer has a route with 7 ascensions that may finish about 1.5 days sooner (163 195 216 248 280 318 490). Add a chain with 7 ascensions Check exactly'
    );
  });

  it('says Start from on Smart search, and leaves the add button out where a screen cannot add', async () => {
    result();
    useInstantSummaryStore().fastest = { chain: SEVEN, seconds: 28.5 * 86400, exact: false };
    expect(textOf(await renderHtml(LongerRouteHint, { ...props, mode: 'start' }, {}, [pinia]))).toContain(
      'Start from 7 ascensions Check exactly'
    );
    const noAdd = textOf(await renderHtml(LongerRouteHint, { ...props, canAdd: false }, {}, [pinia]));
    expect(noAdd).not.toContain('Add a chain');
    expect(noAdd).toContain('Check exactly');
  });

  it('shows nothing while the search is still running', async () => {
    result();
    useInstantSummaryStore().fastest = { chain: SEVEN, seconds: 28.5 * 86400, exact: false };
    expect(await renderHtml(LongerRouteHint, { ...props, running: true }, {}, [pinia])).not.toContain(
      'longer-route-hint'
    );
  });
});
