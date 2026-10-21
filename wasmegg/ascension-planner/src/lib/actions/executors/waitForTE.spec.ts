/**
 * Wait for TE on a farm that cannot reach the target (QA, 21 Oct 2026): Plan Future on an advanced
 * save starts a fresh farm (a few hundred chickens, ~230 eggs/s shipping) on an egg already past
 * TE #35, so +1 TE needs 1e16-1e17 eggs. The price is finite (no Infinity/NaN) but runs to billions
 * of days, and the summary printed it raw with End Date 'N/A'. The panel must refuse such a wait.
 */
import '../../../../scripts/node-shims';

import { describe, expect, it } from 'vitest';
import { getActivePinia } from 'pinia';
import { syntheticInputs } from '@/test/syntheticSave';
import { renderHtml, textOf } from '@/test/renderComponent';
import { nextTEWait, tippyStub } from '@/test/teWait';
import { MAX_TE_WAIT_SECONDS, isTEWaitReachable } from '@/lib/truthEggs';
import { formatAbsoluteTime } from '@/lib/format';
import WaitForTEActions from '@/components/actions/WaitForTEActions.vue';

describe('isTEWaitReachable', () => {
  it('accepts a finite wait up to a year and refuses longer, Infinity and NaN', () => {
    expect(isTEWaitReachable(0)).toBe(true);
    expect(isTEWaitReachable(30 * 86400)).toBe(true);
    expect(isTEWaitReachable(MAX_TE_WAIT_SECONDS)).toBe(true);
    expect(isTEWaitReachable(MAX_TE_WAIT_SECONDS + 1)).toBe(false);
    expect(isTEWaitReachable(1.5e15)).toBe(false);
    expect(isTEWaitReachable(Infinity)).toBe(false);
    expect(isTEWaitReachable(NaN)).toBe(false);
  });
});

describe('Wait for TE on a fresh farm past TE #38 (Plan Future)', () => {
  it('prices +1 TE at billions of days, and the panel refuses it with a plain notice', async () => {
    await syntheticInputs();
    const wait = nextTEWait();
    expect(wait.currentTE).toBe(38);
    expect(isFinite(wait.seconds)).toBe(true);
    expect(wait.seconds / 86400).toBeGreaterThan(1e9); // the bug: ~117 billion days
    expect(isTEWaitReachable(wait.seconds)).toBe(false);

    const html = await renderHtml(WaitForTEActions, {}, {}, [getActivePinia()!, tippyStub]);
    const text = textOf(html);
    expect(text).toContain('TE #39 is not reachable');
    expect(text).toContain('Completion Time: Not reachable');
    expect(text).not.toContain('Invalid Date');
    // The Wait for TE button is disabled.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>)[\s\S])*Wait for TE/);
  });

  it('formatAbsoluteTime never prints Invalid Date for a finite but out-of-range time', () => {
    expect(formatAbsoluteTime(1.5e15, Date.UTC(2026, 9, 21))).toBe('∞');
  });
});
