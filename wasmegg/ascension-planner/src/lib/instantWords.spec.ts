/**
 * The slim instant card's words (spec-slimcard; wireframes/instant-slim-v1, approved by Jordan 5 Nov 2026). DRAFT, for
 * Words: the one line under the title (in place of the estimate line, "These are instant answers…", "Each prestige
 * waits for your awake hours…" and "Your no-prestige days are kept…") and the First step line in the green box (with
 * the awake-hours clause that was the HOURS_NOTE paragraph under it). Wording only: never a result code input.
 */
import { describe, expect, it } from 'vitest';
import { FIRST_STEP_HOURS, FIRST_STEP_HOURS_NIGHT_BUY, firstStepLine, firstStepShort, instantHeaderLine, mergeFirstStepCaveats, noPrestigeDayCount } from './instantWords';
import { INSTANT_NIGHT_BUY_NOTE } from './nightBuyWords';
import { isWordingOnly } from './resultCodeHash';

describe('the line under the title (DRAFT)', () => {
  const LEAD = 'Worked out ahead of time, a few days either side of a search on your save.';
  it('as in the mock: awake hours and 9 no-prestige days', () => {
    expect(instantHeaderLine({ hours: '8 am to 11 pm', noPrestigeDays: 9 })).toBe(
      `${LEAD} Keeps your awake hours (8 am to 11 pm) and your 9 no-prestige days.`
    );
  });
  it('hours only, days only, one day, neither', () => {
    expect(instantHeaderLine({ hours: '8 am to 11 pm', noPrestigeDays: 0 })).toBe(`${LEAD} Keeps your awake hours (8 am to 11 pm).`);
    expect(instantHeaderLine({ hours: null, noPrestigeDays: 3 })).toBe(`${LEAD} Keeps your 3 no-prestige days.`);
    expect(instantHeaderLine({ hours: null, noPrestigeDays: 1 })).toBe(`${LEAD} Keeps your 1 no-prestige day.`);
    expect(instantHeaderLine({ hours: null, noPrestigeDays: 0 })).toBe(LEAD);
  });
  it('the days counted once each, across ranges that overlap, months and years; half-typed rows left out', () => {
    expect(
      noPrestigeDayCount([
        { from: '2026-11-26', to: '2026-11-28' },
        { from: '2026-12-24', to: '2026-12-26' },
        { from: '2027-01-01', to: '2027-01-03' },
      ])
    ).toBe(9);
    expect(noPrestigeDayCount([{ from: '2026-12-30', to: '2027-01-02' }, { from: '2027-01-01', to: '2027-01-01' }])).toBe(4);
    expect(noPrestigeDayCount([{ from: '2026-12-24', to: '' }, { from: '2026-12-26', to: '2026-12-24' }])).toBe(0);
    expect(noPrestigeDayCount(null)).toBe(0);
  });
});

describe('First step (DRAFT)', () => {
  const at = { reached: 'Dec 22, 2026 at 8:11 PM', prestigeDate: 'Dec 22, 2026 at 9:00 PM', prestigeTime: '9:00 PM' };
  it('as in the mock: continue the current ascension, then prestige at the time, with the hours clause', () => {
    expect(firstStepLine({ kind: 'continue', stopTE: 218, ...at, sameDay: true, hours: true })).toBe(
      'First step: continue your current ascension to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM. With awake hours, prestige at the time shown: a few minutes late can cost days.'
    );
  });
  it('a prestige on another day names the date; no hours clause without hours', () => {
    expect(firstStepLine({ kind: 'continue', stopTE: 218, ...at, prestigeDate: 'Dec 23, 2026 at 8:00 AM', sameDay: false, hours: false })).toBe(
      'First step: continue your current ascension to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige Dec 23, 2026 at 8:00 AM.'
    );
  });
  it('a build-up continued (Single run can’t: its banner says so), a fresh start now or held', () => {
    expect(firstStepLine({ kind: 'buildup', stopTE: 218, ...at, sameDay: true, hours: false })).toBe(
      'First step: continue your build-up to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM.'
    );
    expect(firstStepLine({ kind: 'fresh', stopTE: 218, ...at, sameDay: true, hours: false })).toBe(
      'First step: prestige now and reach 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM.'
    );
    expect(firstStepLine({ kind: 'fresh', start: 'Dec 21, 2026 at 8:00 AM', stopTE: 218, ...at, sameDay: true, hours: true })).toBe(
      'First step: prestige Dec 21, 2026 at 8:00 AM and reach 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM. ' + FIRST_STEP_HOURS
    );
  });
  it('one ascension: no prestige after it, so no hours clause either', () => {
    expect(firstStepLine({ kind: 'continue', stopTE: 291, reached: 'Jul 13, 2027 at 5:14 PM', prestigeDate: null, prestigeTime: null, sameDay: false, hours: true })).toBe(
      'First step: continue your current ascension to 291 TE (Jul 13, 2027 at 5:14 PM).'
    );
  });
  it('wording only: out of the result code hash', () => {
    expect(isWordingOnly('src/lib/instantWords.ts')).toBe(true);
  });
});

describe('First step: the hours clause and the night-buy note as ONE line (spec-uxpass item 9, 8 Nov 2026)', () => {
  const STEP = 'continue your build-up to 218 TE (Dec 22, 2026 at 8:11 PM), then prestige at 9:00 PM.';
  it('both would show: the step without its hours clause, the note is the merged line (both meanings kept)', () => {
    const r = mergeFirstStepCaveats(`${STEP} ${FIRST_STEP_HOURS}`, true);
    expect(r).toEqual({ step: STEP, note: FIRST_STEP_HOURS_NIGHT_BUY });
    expect(FIRST_STEP_HOURS_NIGHT_BUY).toMatch(/prestige at the time shown/i);
    expect(FIRST_STEP_HOURS_NIGHT_BUY).toBe("With awake hours, prestige at the time shown (a few minutes late can cost days). Quick estimate: it may buy research at night; after you press Follow, My runs shows exact times.");
  });
  it('only one would show: that one, unchanged', () => {
    expect(mergeFirstStepCaveats(`${STEP} ${FIRST_STEP_HOURS}`, false)).toEqual({ step: `${STEP} ${FIRST_STEP_HOURS}`, note: null });
    expect(mergeFirstStepCaveats(STEP, true)).toEqual({ step: STEP, note: INSTANT_NIGHT_BUY_NOTE });
    expect(mergeFirstStepCaveats(STEP, false)).toEqual({ step: STEP, note: null });
  });
});

describe('The short First step (Jordan, 12 Nov 2026, pm)', () => {
  const at = { reached: 'Nov 20 at 8:11 PM', prestigeDate: 'Nov 21 at 9:00 AM', prestigeTime: '9:00 AM' };
  it('one sentence, "sharp" with awake hours; the full sentence for the "?"', () => {
    const r = firstStepShort({ kind: 'buildup', stopTE: 203, ...at, sameDay: false, hours: true });
    expect(r.short).toBe('First step: continue your build-up to 203 TE, then prestige Nov 21 at 9:00 AM sharp.');
    expect(r.full).toBe(firstStepLine({ kind: 'buildup', stopTE: 203, ...at, sameDay: false, hours: true }));
    expect(r.full).toContain('a few minutes late can cost days');
  });
  it('no "sharp" without awake hours; the same day gives only the time', () => {
    expect(firstStepShort({ kind: 'continue', stopTE: 218, ...at, sameDay: true, hours: false }).short).toBe(
      'First step: continue your current ascension to 218 TE, then prestige at 9:00 AM.'
    );
  });
  it('a build-up that could not be worked out: nothing to shorten', () => {
    const r = firstStepShort({ kind: 'fresh', stopTE: 203, ...at, sameDay: false, hours: true, buildUpMissing: true });
    expect(r.short).toBe(r.full);
  });
});
