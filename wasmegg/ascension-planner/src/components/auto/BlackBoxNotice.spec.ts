/** "Last time, this page stopped without finishing" (12 Oct 2026 fixes). */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import BlackBoxNotice from './BlackBoxNotice.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { dateStyle } from '@/lib/displayTime';

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
  it('says where to send the file (review W4, 15 Nov 2026)', async () => {
    const store = useChainSearchStore() as any;
    store.lastCrash = crash();
    const t = textOf(await renderHtml(BlackBoxNotice, {}));
    expect(t).toContain('To have it looked at, download the black box and send the file to Williamthe5thc on Discord.');
    expect(t).not.toMatch(/EI\d{16}/);
  });
  it('says nothing when the saved run of that search has finished (its own box says it)', async () => {
    const store = useChainSearchStore() as any;
    store.lastCrash = crash();
    store.resumable = { complete: true, durations: [], bestChain: [], bestSeconds: 0, updatedAt: Date.now() };
    expect(textOf(await renderHtml(BlackBoxNotice, {}))).toBe('');
  });
  it('the crash time goes through the shared formatter, in the plan\'s zone, ISO when the player chose it (rel-ui-6, 22 Nov 2026)', async () => {
    const store = useChainSearchStore() as any;
    store.lastCrash = crash();
    useAutoPlannerStore().timezone = 'America/Los_Angeles';
    try {
      dateStyle.value = 'local';
      const local = textOf(await renderHtml(BlackBoxNotice, {}));
      expect(local).toMatch(/at Oct 12, 2026, 11:00 AM/); // 18:00 UTC in Los Angeles, no seconds
      expect(local).not.toMatch(/11:00:00/);
      dateStyle.value = 'iso';
      const iso = textOf(await renderHtml(BlackBoxNotice, {}));
      expect(iso).toMatch(/at 2026-10-12 11:00/);
    } finally {
      dateStyle.value = 'local';
    }
  });
});
