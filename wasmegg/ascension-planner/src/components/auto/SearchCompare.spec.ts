/** The comparison block (the user, 12 Oct 2026): three labelled answers, "not run yet", the best marked. */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import SearchCompare from './SearchCompare.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useStrongerStore } from '@/stores/stronger';

beforeEach(() => setActivePinia(createPinia()));
const T = 1_815_000_000;

describe('SearchCompare', () => {
  it('Fastest: instant answer and the stronger check, Exhaustive not run yet, the sooner one best', async () => {
    const s = useStrongerStore();
    s.instant.fastest = { chain: [200, 300, 490], end: T, endTE: 490, exact: true };
    s.lastSearch.smart = { chain: [201, 300, 490], end: T - 7200, endTE: 490, exact: true };
    const t = textOf(await renderHtml(SearchCompare, { goal: 'fastest' }));
    expect(t).toMatch(/^Compare the answers Instant answer .* 200 300 490 checked exactly on your account/);
    expect(t).toMatch(/Search Best .* 201 300 490 priced on your account/);
    expect(t).toMatch(/Custom not run yet$/);
  });
  it('By a date: TE and spare; a run still going says so', async () => {
    const s = useStrongerStore();
    s.instant.date = { chain: [161, 198, 248], end: T, endTE: 248, spare: 0.67 * 86400 };
    s.lastSearch.boxes = { chain: [161, 199, 248], end: T, endTE: 248, spare: 30 * 3600, running: true };
    const t = textOf(await renderHtml(SearchCompare, { goal: 'date' }));
    expect(t).toContain('Instant answer 248 TE 16.1 h spare 161 198 248 from the instant answer, not checked yet');
    expect(t).toContain('Search not run yet');
    expect(t).toContain('Custom Best 248 TE 30.0 h spare 161 199 248 so far, still running');
  });
});

describe('hidden for now (SHOW_COMPARE)', () => {
  it('is off, and both screens put the block behind it', async () => {
    const { SHOW_COMPARE } = await import('@/lib/features');
    expect(SHOW_COMPARE).toBe(false);
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue'])
      expect(fs.readFileSync(path.join(__dirname, f), 'utf8')).toMatch(/<SearchCompare v-if="SHOW_COMPARE/);
  });
});
