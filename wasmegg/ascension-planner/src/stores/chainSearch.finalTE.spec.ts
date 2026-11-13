/**
 * The target's own guard, in the store (spec-targette, 13 Nov 2026, game expert via the orchestrator): `commitFinalTE`
 * refuses a target above 490, or at or below the player's TE, or not a whole number, and keeps the last good value; the
 * target box (TargetTeBox.vue) commits through it. Words Joo-style (his Chain Finder: "Pick a target TE above N, up to 490.").
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { isNearTarget, NEAR_TARGET_TE, TARGET_TE_MAX, targetTeRange, useChainSearchStore } from './chainSearch';
import { useInitialStateStore } from './initialState';
import { TARGET_TE_WORDS } from '@/lib/targetTeWords';

beforeEach(() => setActivePinia(createPinia()));
/** A save at this TE (all of it on one virtue). */
function atTE(te: number) {
  const iss = useInitialStateStore();
  iss.initialTeEarned = { ...iss.initialTeEarned, curiosity: te } as typeof iss.initialTeEarned;
  return useChainSearchStore();
}

describe('targetTeRange', () => {
  it('your TE + 1 (a part TE counts as the TE below) up to 490; no save: from 1', () => {
    expect(TARGET_TE_MAX).toBe(490);
    expect(targetTeRange(197)).toEqual({ min: 198, max: 490 });
    expect(targetTeRange(197.9)).toEqual({ min: 198, max: 490 });
    expect(targetTeRange(0)).toEqual({ min: 1, max: 490 });
    expect(targetTeRange(Number.NaN)).toEqual({ min: 1, max: 490 });
  });
});

describe('commitFinalTE', () => {
  it('takes a whole number from your TE + 1 to 490', () => {
    const store = atTE(197);
    expect(store.currentTE).toBe(197);
    expect(store.commitFinalTE(300)).toBe('');
    expect(store.finalTE).toBe(300);
    expect(store.commitFinalTE(198)).toBe('');
    expect(store.finalTE).toBe(198);
    expect(store.commitFinalTE(490)).toBe('');
    expect(store.finalTE).toBe(490);
  });
  it('refuses above 490, at or below your TE, and not whole numbers, keeping the last good value', () => {
    const store = atTE(197);
    store.commitFinalTE(300);
    for (const bad of [491, 600, 2000, 197, 100, 0, -5, 250.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(store.commitFinalTE(bad), String(bad)).toBe(TARGET_TE_WORDS.invalid({ min: 198, max: 490 }, 300));
      expect(store.finalTE, String(bad)).toBe(300);
    }
  });
  it("the words are Joo's, plus the value kept", () => {
    expect(atTE(197).commitFinalTE(600)).toBe('Pick a target TE above 197, up to 490. Kept 490.');
  });
  it('at 490 or past it nothing fits', () => {
    const store = atTE(490);
    expect(store.commitFinalTE(490)).toBe('Your TE is already 490, so there is no higher target. Kept 490.');
    expect(store.finalTE).toBe(490);
  });
  it('never while a search runs', () => {
    const store = atTE(197);
    store.isRunning = true;
    expect(store.commitFinalTE(300)).toBe(TARGET_TE_WORDS.running);
    expect(store.finalTE).toBe(490);
  });
});

/**
 * The near-target note on Every number of ascensions (game expert, 13 Nov 2026): within about 25 TE of the player's TE,
 * rows with 3 or more tiny ascensions can be priced 8-23% too fast (they never win). Within 25 means target - TE <= 25.
 */
describe('isNearTarget', () => {
  it('within 25 TE of your TE (a part TE counts as the TE below)', () => {
    expect(NEAR_TARGET_TE).toBe(25);
    expect(isNearTarget(205, 200)).toBe(true);
    expect(isNearTarget(225, 200)).toBe(true);
    expect(isNearTarget(225, 200.9)).toBe(true);
    expect(isNearTarget(201, 200)).toBe(true);
  });
  it('not at +26, not 490 from a normal TE, not at or past the target, not with no save', () => {
    expect(isNearTarget(226, 200)).toBe(false);
    expect(isNearTarget(490, 200)).toBe(false);
    expect(isNearTarget(200, 200)).toBe(false);
    expect(isNearTarget(490, 495)).toBe(false);
    expect(isNearTarget(20, 0)).toBe(false);
    expect(isNearTarget(20, Number.NaN)).toBe(false);
  });
  it('By a date (always 490) only from TE 465 up, by the same rule', () => {
    expect(isNearTarget(490, 464)).toBe(false);
    expect(isNearTarget(490, 465)).toBe(true);
  });
});
