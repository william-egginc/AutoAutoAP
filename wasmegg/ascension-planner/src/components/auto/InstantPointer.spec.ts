/**
 * The pointer at the top of the instant area (InstantPointer.vue, 23 Oct 2026): "Fast found 313 TE on your account.
 * See it ↓" from a finished By a date result (and the Fastest one's date), rendered on its own; InstantRoute.vue shows
 * it whenever such a result exists, with or without an instant answer (InstantLayout.spec.ts pins where).
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantPointer from './InstantPointer.vue';
import { pointerOf } from '@/lib/searchPointer';
import { liveSearchResult } from '@/lib/searchPlan';

const DEADLINE = Date.UTC(2027, 6, 14, 16) / 1000;
const NOW = Date.UTC(2026, 9, 23, 18) / 1000;
const dateRun = (o: { running?: boolean; te?: number; deadline?: number } = {}) =>
  liveSearchResult({
    goal: 'date',
    deadline: DEADLINE,
    target: 490,
    currentTE: 191.4,
    ownerOk: () => true,
    fastest: { running: false, bestDays: Infinity, bestChain: [], bestLegs: null, planStart: 0, custom: false, effort: null, at: 0, owner: '' },
    date: {
      running: o.running ?? false,
      result: {
        deadline: o.deadline ?? DEADLINE,
        te: o.te ?? 191,
        simple: true,
        level: 'fast',
        at: NOW * 1000,
        planStart: NOW,
        routes: [{ chain: [197, 228, 257, 285, 313], reachAt: DEADLINE - 86400, legs: [] }],
      },
      owner: '',
    },
  });

describe('the pointer at the top of the instant area', () => {
  it('a finished By a date Fast run: "Fast found 313 TE on your account. See it ↓"', async () => {
    const p = pointerOf('date', dateRun(), String);
    expect(p).not.toBeNull();
    const html = await renderHtml(InstantPointer, { pointer: p! });
    expect(textOf(html)).toBe('Fast found 313 TE on your account. See it ↓');
    expect(html).toContain('data-testid="instant-pointer-link"');
  });
  it('none while it runs, or for another date or another TE', () => {
    expect(dateRun({ running: true })).toBeNull();
    expect(dateRun({ deadline: DEADLINE + 3600 })).toBeNull();
    expect(dateRun({ te: 190 })).toBeNull();
  });
});
