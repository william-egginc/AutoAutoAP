/** "Last time, this page stopped without finishing" (12 Oct 2026 fixes). */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import BlackBoxNotice from './BlackBoxNotice.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';

beforeEach(() => setActivePinia(createPinia()));
const crash = (over = {}) => ({
  last: { at: Date.UTC(2026, 9, 12, 18), phase: 'search', detail: 'stage 4', done: 338, total: 1265, hidden: true, pageClosed: true, ...over },
});

describe('BlackBoxNotice', () => {
  it('counts priced routes against the estimate as an upper bound, and keeps the space between sentences', async () => {
    const store = useChainSearchStore() as any;
    store.lastCrash = crash();
    const t = textOf(await renderHtml(BlackBoxNotice, {}));
    expect(t).toContain('338 priced (estimate up to ~1,265)');
    expect(t).toContain('which ends a run. If a run was going');
    expect(t).not.toMatch(/run\.If/);
  });
  it('says nothing when the saved run of that search has finished (its own box says it)', async () => {
    const store = useChainSearchStore() as any;
    store.lastCrash = crash();
    store.resumable = { complete: true, durations: [], bestChain: [], bestSeconds: 0, updatedAt: Date.now() };
    expect(textOf(await renderHtml(BlackBoxNotice, {}))).toBe('');
  });
});
