/** The simpler page's words (9 Nov 2026, DRAFT for Jordan): pinned word for word, plain, short. */
import { describe, expect, it } from 'vitest';
import * as W from './layoutWords';
import { isWordingOnly } from './resultCodeHash';

describe('layout words', () => {
  it('the fold and its lines', () => {
    expect(W.MORE_TITLE).toBe('More');
    expect(W.moreLineWithChanges(W.MORE_LINE_AUTO, ['Prefer fewer: within 12 h'])).toBe(
      'Run a search (Fast, Exact or Custom), maxed gear, how it works · Prefer fewer: within 12 h'
    );
    expect(W.moreLineWithChanges(W.MORE_LINE_AUTO, [])).toBe(W.MORE_LINE_AUTO);
    expect(W.MORE_LINE_MYRUNS).toBe('Change route, gear, saved answer, try next, your runs');
  });
  it('what to do now', () => {
    expect(W.NOW_BEFORE_FOLLOW).toBe('Press Follow this route: My runs then shows what to buy and when.');
    expect(W.nowAfterFollow('shift to Humility on Nov 14 at 9:52 am')).toBe('Next: shift to Humility on Nov 14 at 9:52 am.');
    expect(W.nowSearchRunning('Fast', 33.6)).toBe('Fast search running: 34%');
    expect(W.NOW_SHOW_SEARCH).toBe('Show search ›');
  });
  it('the lines under the tabs, the explainer link and the pressed button', () => {
    expect(W.fastestLine(490)).toBe(
      'The soonest you can reach 490 TE from your save and Setup. It counts the weekly Research Sale and the Monday boost, not other events.'
    );
    expect(W.fastestLine(320)).toContain('reach 320 TE from');
    expect(W.BYDATE_LINE).toBe('The most TE you can reach by a date (Egg Day by default), from your save and Setup.');
    expect([W.FOLLOWING, W.HOW_IT_WORKS_LINK]).toEqual(['Following ✓', 'How it works ›']);
    expect(W.SEARCH_CARD_LINE).toBe('Checks the instant answer on your save.');
  });
  it('My runs and Setup', () => {
    expect(W.sharingSummaryWords({ help: 'no', longSearches: true, saveOnline: true })).toBe(
      'Help improve: no thanks · Long searches: on · Save online: on'
    );
    expect(W.sharingSummaryWords({ help: 'none', longSearches: false, saveOnline: false })).toBe(
      'Help improve: not answered · Long searches: off · Save online: off'
    );
    expect(W.sharingSummaryWords({ help: 'yes', longSearches: false, saveOnline: true, searchResults: true, instantWithRuns: false })).toBe(
      'Help improve: yes · Long searches: off · Save online: on · Search results: on · Instant answer with runs: off'
    );
    expect([W.SAVE_LINE_CLOSE, W.CHANGE_PLAYER]).toEqual(['Close player box', 'Change player']);
    expect(W.SHOW_EVERYTHING_LINE).toBe('Every More fold starts open, like the old page.');
  });
  it('plain: no simulator, collector, baseline; every "?" text is one or two sentences', () => {
    const all = (Object.values(W) as unknown[]).filter((v): v is string => typeof v === 'string');
    for (const t of all) expect(t).not.toMatch(/collector|baseline|checkpoint|full simulator/i);
    for (const t of [W.WORKERS_TIP]) {
      expect(t.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
      expect(t.length).toBeLessThan(200);
    }
    expect(W.SIMPLER_RELEASE_NOTE.length).toBeLessThanOrEqual(200);
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/layoutWords.ts')).toBe(true);
  });
});
