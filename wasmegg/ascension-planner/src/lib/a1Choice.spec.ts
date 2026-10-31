/**
 * MY RUNS' A1 CHOICE (spec-a1choice, lib/a1Choice.ts): the two candidates from a simulated leg, which side is followed
 * (the default the sooner, ties to continue, Your setup's explicit side, the player's pick), the kept pick per account
 * and ascension (try/catch storage), and the words. Placeholder data, fixed clock.
 */
import { describe, expect, it } from 'vitest';
import {
  A1_PICK_PREFIX,
  A1_SETUP,
  a1Candidates,
  a1ChoiceWords,
  a1Decision,
  a1FirstAsk,
  a1Inputs,
  a1PickKey,
  a1TrackerWords,
  readA1Pick,
  writeA1Pick,
} from './a1Choice';
import { CONTINUE_MAX_SECONDS } from '@/search/rules';

const T0 = Math.floor(Date.UTC(2026, 10, 1, 17, 0) / 1000);
const D = 86400;
const ZONE = 'America/Los_Angeles';
const LATER = { buildEnd: T0 + 7 * D, contEnd: T0 + 6 * D + 12 * 3600, buys: 3 };

function mem() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('the candidates', () => {
  it('both ends and a buy count above 0, or none', () => {
    expect(a1Candidates({ firstLegEnds: { buildup: 10, continue: 8 }, buildUpBuys: 2 })).toEqual({ buildEnd: 10, contEnd: 8, buys: 2 });
    expect(a1Candidates({ firstLegEnds: { buildup: 10, continue: 8 }, buildUpBuys: 0 })).toBeNull();
    expect(a1Candidates({ firstLegEnds: { buildup: 10, continue: 8 } })).toBeNull();
    expect(a1Candidates({ firstLegEnds: { continue: 8 }, buildUpBuys: 2 })).toBeNull();
    expect(a1Candidates({ firstLegEnds: { buildup: 10 }, buildUpBuys: 2 })).toBeNull();
    expect(a1Candidates(null)).toBeNull();
  });
});

describe('which side is followed', () => {
  it('(1) a buying build-up that ends later: the choice shows, the sooner (continue) by default', () => {
    expect(a1Decision({ cand: LATER, pick: null, setting: 'auto' })).toEqual({ show: true, side: 'continue', why: 'later', picked: false });
  });
  it('(2) a sooner build-up: no choice, the build-up as before, whatever the pick', () => {
    const sooner = { ...LATER, buildEnd: LATER.contEnd - 60 };
    for (const pick of [null, 'buildup', 'continue'] as const)
      expect(a1Decision({ cand: sooner, pick, setting: 'auto' })).toMatchObject({ show: false, side: 'buildup', why: 'sooner' });
  });
  it('(2) a tie: no choice, continue, unless the kept pick says Keep building', () => {
    const tie = { ...LATER, buildEnd: LATER.contEnd };
    expect(a1Decision({ cand: tie, pick: null, setting: 'auto' })).toEqual({ show: false, side: 'continue', why: 'tie', picked: false });
    expect(a1Decision({ cand: tie, pick: null, setting: 'buildup' })).toMatchObject({ show: false, side: 'continue' });
    expect(a1Decision({ cand: tie, pick: 'buildup', setting: 'auto' })).toEqual({ show: false, side: 'buildup', why: 'tie', picked: true });
  });
  it('(3) no candidates (the build-up buys nothing, or none simulated): no choice, the simulation as it was', () => {
    expect(a1Decision({ cand: null, pick: 'continue', setting: 'continue' })).toEqual({ show: false, side: 'buildup', why: 'none', picked: false });
  });
  it("(4) the player's pick decides", () => {
    expect(a1Decision({ cand: LATER, pick: 'buildup', setting: 'auto' })).toEqual({ show: true, side: 'buildup', why: 'later', picked: true });
    expect(a1Decision({ cand: LATER, pick: 'continue', setting: 'buildup' })).toEqual({ show: true, side: 'continue', why: 'later', picked: true });
  });
  it("(6) Your setup's explicit side is the default: 'buildup' keeps building, 'continue' finishes; 'auto' the sooner", () => {
    expect(a1Decision({ cand: LATER, pick: null, setting: 'buildup' })).toMatchObject({ show: true, side: 'buildup', picked: false });
    expect(a1Decision({ cand: LATER, pick: null, setting: 'continue' })).toMatchObject({ show: true, side: 'continue', picked: false });
    expect(a1Decision({ cand: LATER, pick: null, setting: 'auto' })).toMatchObject({ show: true, side: 'continue', picked: false });
  });
  it('the first ask, before anything is known: the pick, an explicit Finish without buying, else the build-up', () => {
    expect(a1FirstAsk(null, 'auto')).toBe('buildup');
    expect(a1FirstAsk(null, 'buildup')).toBe('buildup');
    expect(a1FirstAsk(null, 'continue')).toBe('continue');
    expect(a1FirstAsk('continue', 'auto')).toBe('continue');
    expect(a1FirstAsk('buildup', 'continue')).toBe('buildup');
  });
});

describe('each side as the simulation is asked', () => {
  it("(4) Keep building: 'buildup' with continue left out (as before); Finish without buying: 'continue', pinned", () => {
    expect(a1Inputs('buildup')).toEqual({ firstAscension: 'buildup', continueMaxSeconds: 0 });
    expect(a1Inputs('continue')).toEqual({ firstAscension: 'continue', continuePinSeconds: CONTINUE_MAX_SECONDS });
  });
  it('(5) each side has its own setup key; the build-up one is the unfinished-build key as it was', () => {
    expect(A1_SETUP.buildup).toBe('buildup, build unfinished');
    expect(A1_SETUP.continue).not.toBe(A1_SETUP.buildup);
  });
});

describe('the kept pick', () => {
  it('(4) per account and ascension: reload keeps it; another ascension or account does not', () => {
    const st = mem();
    expect(readA1Pick('acctA', 226, st)).toBeNull();
    expect(writeA1Pick('acctA', 226, 'buildup', st)).toBe(true);
    expect(readA1Pick('acctA', 226, st)).toBe('buildup');
    expect(readA1Pick('acctA', 277, st)).toBeNull();
    expect(readA1Pick('acctB', 226, st)).toBeNull();
    expect([...st.m.keys()]).toEqual([`${A1_PICK_PREFIX}acctA.226`]);
    expect(a1PickKey('acctA', 226)).toBe('aap.a1choice.acctA.226');
    // Tiny: the side only.
    expect(st.m.get(a1PickKey('acctA', 226))).toBe('buildup');
  });
  it('storage that throws, is missing or holds junk: no pick, never a throw', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readA1Pick('a', 1, bad)).toBeNull();
    expect(writeA1Pick('a', 1, 'continue', bad)).toBe(false);
    expect(readA1Pick('a', 1, null)).toBeNull();
    expect(writeA1Pick('a', 1, 'continue', null)).toBe(false);
    const st = mem();
    st.m.set(a1PickKey('a', 1), 'fresh');
    expect(readA1Pick('a', 1, st)).toBeNull();
  });
});

describe('the words (DRAFT)', () => {
  it('N things and both ends, 12-hour clock with am/pm in the zone (the shared formatter: AM/PM as the browser writes it)', () => {
    const w = a1ChoiceWords(LATER, T0, ZONE);
    expect(w.keep).toMatch(/^Keep building \(buys 3 things, ends Nov 8 at 9:00 (am|AM)\)$/);
    expect(w.finish).toMatch(/^Finish without buying \(ends Nov 7 at 9:00 (pm|PM)\)$/);
  });
  it('one thing, singular', () => {
    expect(a1ChoiceWords({ ...LATER, buys: 1 }, T0, ZONE).keep).toMatch(/^Keep building \(buys 1 thing, ends /);
  });
  it('(7) the tracker: "You chose to finish without buying" when picked; the default says why', () => {
    expect(a1TrackerWords(true)).toMatch(/^You chose to finish without buying/);
    expect(a1TrackerWords(false)).not.toMatch(/You chose/);
    expect(a1TrackerWords(false)).toMatch(/sooner/);
  });
});
