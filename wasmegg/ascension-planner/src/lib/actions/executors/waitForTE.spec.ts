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
import {
  MAX_TE_WAIT_SECONDS,
  TE_BREAKPOINTS,
  clampTECount,
  isTEWaitReachable,
  maxTEToGain,
  teGainedOf,
} from '@/lib/truthEggs';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { waitForTEExecutor } from './waitForTE';
import { formatAbsoluteTime } from '@/lib/format';
import WaitForTEActions from '@/components/actions/WaitForTEActions.vue';
import BulkWaitForTEActions from '@/components/actions/BulkWaitForTEActions.vue';

// `\sdisabled[\s>=]`: the attribute, not Tailwind's `disabled:opacity-20` class.
const DISABLED_WAIT_BUTTON = /<button[^>]*\sdisabled[\s>=][^>]*>(?:(?!<\/button>)[\s\S])*Wait for TE/;

describe('the TE count a player types (Jordan, 21 Oct 2026: "3.48e45" was accepted)', () => {
  it('max is 98 minus the egg\'s current TE, pending included', () => {
    expect(maxTEToGain(0)).toBe(98);
    expect(maxTEToGain(35)).toBe(63); // e.g. 2 claimed + 33 pending
    expect(maxTEToGain(98)).toBe(0);
    expect(maxTEToGain(120)).toBe(0);
  });

  it('lands every input on a whole number from 1 to the max', () => {
    const max = maxTEToGain(35);
    expect(clampTECount(0, max)).toBe(1);
    expect(clampTECount(-4, max)).toBe(1);
    expect(clampTECount(1.5, max)).toBe(1);
    expect(clampTECount(1e5, max)).toBe(63);
    expect(clampTECount('3.48e45', max)).toBe(63);
    expect(clampTECount(3.48e45, max)).toBe(63);
    expect(clampTECount('', max)).toBe(1);
    expect(clampTECount(NaN, max)).toBe(1);
    expect(clampTECount(64, max)).toBe(63);
    expect(clampTECount(63, max)).toBe(63);
    expect(clampTECount('7', max)).toBe(7);
  });

  it('gives 0 when the egg is already at 98 (nothing to gain), and Bulk may go down to 0', () => {
    expect(clampTECount(5, maxTEToGain(98))).toBe(0);
    expect(clampTECount('', 40, 0)).toBe(0);
    expect(clampTECount('3.48e45', 40, 0)).toBe(40);
  });

  it('bounds a saved action\'s gain by its target, so +3.48e45 cannot reach the summaries', () => {
    const saved = { targetTE: 98, startTE: 35, teGained: 3.48e45, egg: 'curiosity' as const, eggsToLay: 0, timeSeconds: 1e16, startEggsDelivered: 0 };
    expect(teGainedOf(saved)).toBe(63);
    expect(teGainedOf({ ...saved, teGained: 2, targetTE: 37 })).toBe(2);
    expect(waitForTEExecutor.getEffectDescription(saved)).toBe('+63 TE (from #35) — not reachable');
  });
});

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
    expect(html).toMatch(DISABLED_WAIT_BUTTON);
  });

  it('enables the button for a TE that is close, and disables it with a reason at 98 (pending included)', async () => {
    await syntheticInputs();
    const te = useTruthEggsStore();
    const plugins = [getActivePinia()!, tippyStub];

    te.setEggsDelivered('curiosity', TE_BREAKPOINTS[38] - 1000); // 1000 eggs short of TE #39
    const near = await renderHtml(WaitForTEActions, {}, {}, plugins);
    expect(textOf(near)).toContain('TE to Gain: +1 TE');
    expect(textOf(near)).not.toContain('not reachable');
    expect(near).not.toMatch(DISABLED_WAIT_BUTTON);

    te.setEggsDelivered('curiosity', TE_BREAKPOINTS[97]); // 38 claimed + 60 pending = 98
    const maxed = await renderHtml(WaitForTEActions, {}, {}, plugins);
    expect(textOf(maxed)).toContain('You have reached the maximum TE (98) for Curiosity!');
    expect(maxed).toMatch(DISABLED_WAIT_BUTTON);
  });

  it('formatAbsoluteTime never prints Invalid Date for a finite but out-of-range time', () => {
    expect(formatAbsoluteTime(1.5e15, Date.UTC(2026, 9, 21))).toBe('∞');
  });
});

describe('Bulk Wait for TE on the same fresh farm', () => {
  it('disables Apply at its default 15 and says why, naming the eggs', async () => {
    await syntheticInputs();
    const html = await renderHtml(BulkWaitForTEActions, {}, {}, [getActivePinia()!, tippyStub]);
    const text = textOf(html);
    expect(text).toContain(
      "Can't apply: at least one egg's wait would take over a year at this farm's current delivery rate (Curiosity"
    );
    expect(text).toContain('Lower the number or build up the farm first.');
    expect(text).not.toContain('Invalid Date');
    // `disabled` may be the tag's last attribute (no scoped style, so no data-v after it since 26 Oct 2026).
    expect(html).toMatch(/<button[^>]*\sdisabled(?=[\s>=])[^>]*>\s*Apply Bulk TE Plan/);
  });
});
