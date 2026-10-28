/**
 * Stepping away? starts closed and opens by itself when a long run starts (Jordan, 28 Oct 2026, ux35-d part 1):
 * composables/useStepAwayNudge.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConsents, setConsent } from './useConsent';
import {
  dismissStepAwayNudge,
  isLongRun,
  LONG_RUN_SECONDS,
  nudgeStepAway,
  readStepAwaySetUp,
  SET_UP_KEY,
  stepAwayNudge,
  stepAwaySetUp,
} from './useStepAwayNudge';

let mem: Map<string, string>;
const memStore = () => ({
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', memStore());
  resetConsents(memStore());
  stepAwayNudge.value = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('a long run', () => {
  it('is one whose estimate is over an hour', () => {
    expect(LONG_RUN_SECONDS).toBe(3600);
    expect(isLongRun(3600)).toBe(false);
    expect(isLongRun(3601)).toBe(true);
    expect(isLongRun(7 * 3600)).toBe(true);
    for (const v of [0, 1800, null, undefined, NaN, Infinity, -5]) expect(isLongRun(v as number), String(v)).toBe(false);
  });
});

describe('nudgeStepAway (Run pressed)', () => {
  it('a long run opens the box of its own kind only', () => {
    expect(nudgeStepAway('smart', 2 * 3600)).toBe(true);
    expect(stepAwayNudge.value).toBe('smart');
  });
  it('a short run, or one with no estimate, leaves it closed', () => {
    expect(nudgeStepAway('smart', 1800)).toBe(false);
    expect(nudgeStepAway('deadline', null)).toBe(false);
    expect(stepAwayNudge.value).toBe(null);
  });
  it('closed by the player during the run: not opened again for that run', () => {
    nudgeStepAway('sweep', 5 * 3600);
    dismissStepAwayNudge('sweep');
    expect(stepAwayNudge.value).toBe(null);
    // Another kind's close doesn't touch this one.
    nudgeStepAway('deadline', 5 * 3600);
    dismissStepAwayNudge('smart');
    expect(stepAwayNudge.value).toBe('deadline');
  });
  it('already set up (any of its ticks on): not opened, and remembered in this browser', () => {
    setConsent('autoSend', true);
    expect(stepAwaySetUp()).toBe(true);
    expect(readStepAwaySetUp()).toBe(true);
    expect(mem.get(SET_UP_KEY)).toBe('1');
    expect(nudgeStepAway('smart', 9 * 3600)).toBe(false);
    // Turned off again later: still set up in this browser, so it is never pushed open again.
    setConsent('autoSend', false);
    expect(stepAwaySetUp()).toBe(true);
    expect(nudgeStepAway('smart', 9 * 3600)).toBe(false);
    expect(stepAwayNudge.value).toBe(null);
  });
  it('each of the four ticks counts as set up', () => {
    for (const id of ['carryOn', 'watchTab', 'watchPhone', 'autoSend'] as const) {
      mem.clear();
      resetConsents(memStore());
      expect(stepAwaySetUp(), id).toBe(false);
      setConsent(id, true);
      expect(stepAwaySetUp(), id).toBe(true);
    }
  });
  it('the set-up mark read from this browser alone', () => {
    mem.set(SET_UP_KEY, '1');
    expect(nudgeStepAway('smart', 9 * 3600)).toBe(false);
  });
  it('blocked site data: still opens for a long run, and never throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readStepAwaySetUp()).toBe(false);
    expect(nudgeStepAway('smart', 9 * 3600)).toBe(true);
  });
});
