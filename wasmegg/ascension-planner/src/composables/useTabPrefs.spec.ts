/** Which optional tabs show (Jordan, 21 Oct 2026): Leaderboard and Science off by default, per browser in
 *  localStorage `aap.tabs`, never with no collector, and a link opens one for that visit. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  TABS_KEY,
  allowForVisit,
  optionalTabOf,
  readTabPrefs,
  resetTabPrefsForTest,
  setTabPref,
  tabsShownWith,
  useTabPrefs,
  writeTabPrefs,
} from './useTabPrefs';

function memory(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  },
};

afterEach(() => resetTabPrefsForTest(null));

describe('readTabPrefs / writeTabPrefs', () => {
  it('is both off with nothing stored, junk stored, or storage that throws', () => {
    expect(TABS_KEY).toBe('aap.tabs');
    expect(readTabPrefs(memory())).toEqual({ leaderboard: false, science: false });
    expect(readTabPrefs(memory({ [TABS_KEY]: 'not json' }))).toEqual({ leaderboard: false, science: false });
    expect(readTabPrefs(memory({ [TABS_KEY]: 'null' }))).toEqual({ leaderboard: false, science: false });
    expect(readTabPrefs(memory({ [TABS_KEY]: '{"leaderboard":"yes"}' }))).toEqual({ leaderboard: false, science: false });
    expect(readTabPrefs(throwing)).toEqual({ leaderboard: false, science: false });
    expect(readTabPrefs(null)).toEqual({ leaderboard: false, science: false });
  });

  it('round-trips {leaderboard, science} as JSON, and a write that throws is swallowed', () => {
    const s = memory();
    writeTabPrefs({ leaderboard: true, science: false }, s);
    expect(s.m.get(TABS_KEY)).toBe('{"leaderboard":true,"science":false}');
    expect(readTabPrefs(s)).toEqual({ leaderboard: true, science: false });
    expect(() => writeTabPrefs({ leaderboard: true, science: true }, throwing)).not.toThrow();
  });
});

describe('which tabs show', () => {
  it('needs a collector, then the box or a link this visit', () => {
    const off = { leaderboard: false, science: false };
    const on = { leaderboard: true, science: true };
    expect(tabsShownWith(true, off, off)).toEqual(off);
    expect(tabsShownWith(true, on, off)).toEqual(on);
    expect(tabsShownWith(true, off, { leaderboard: true, science: false })).toEqual({ leaderboard: true, science: false });
    expect(tabsShownWith(false, on, on)).toEqual(off);
  });

  it('maps sections: compare is the Leaderboard, science is Science, the rest always show', () => {
    expect(optionalTabOf('compare')).toBe('leaderboard');
    expect(optionalTabOf('science')).toBe('science');
    for (const s of ['manual', 'auto', 'myruns']) expect(optionalTabOf(s)).toBeNull();
  });

  it('a link opens a hidden tab for the visit; turning its box off takes it away again', () => {
    resetTabPrefsForTest(null);
    const { shown, prefs } = useTabPrefs(() => true);
    expect(shown.value).toEqual({ leaderboard: false, science: false });
    allowForVisit('compare');
    allowForVisit('myruns');
    expect(shown.value).toEqual({ leaderboard: true, science: false });
    expect(prefs.value.leaderboard).toBe(false);
    setTabPref('leaderboard', true);
    setTabPref('leaderboard', false);
    expect(shown.value.leaderboard).toBe(false);
    setTabPref('science', true);
    expect(shown.value).toEqual({ leaderboard: false, science: true });
  });

  it('with no collector nothing turns them on', () => {
    resetTabPrefsForTest(memory({ [TABS_KEY]: '{"leaderboard":true,"science":true}' }));
    allowForVisit('compare');
    allowForVisit('science');
    expect(useTabPrefs(() => false).shown.value).toEqual({ leaderboard: false, science: false });
    expect(useTabPrefs(() => true).shown.value).toEqual({ leaderboard: true, science: true });
  });
});
