import { describe, expect, it } from 'vitest';
import {
  entryScriptIn,
  isNewerBuild,
  isNewerEntry,
  liveEntryFrom,
  releaseFrom,
  raiseLevel,
  missedEntries,
  earlierText,
  checkEveryMs,
  isDue,
  isMobileLike,
} from './useNewVersion';

const page = (hash: string, entry = 'index') =>
  `<html><head><script type="module" crossorigin src="/ascension-planner/assets/${entry}-${hash}.js"></script></head></html>`;

describe('new-version check', () => {
  it('finds the hashed entry script for the page asked about', () => {
    expect(entryScriptIn(page('BGv8tSVu'), 'index')).toBe('assets/index-BGv8tSVu.js');
    expect(entryScriptIn(page('Bxmyocsi', 'explorer'), 'explorer')).toBe('assets/explorer-Bxmyocsi.js');
    expect(entryScriptIn(page('Bxmyocsi', 'explorer'), 'index')).toBeNull();
  });

  it('says a new build is live only when the hash changed', () => {
    const loaded = '/ascension-planner/assets/index-BGv8tSVu.js';
    expect(isNewerBuild(page('BGv8tSVu'), loaded, 'index')).toBe(false);
    expect(isNewerBuild(page('Je39JZti'), loaded, 'index')).toBe(true);
  });

  it('stays quiet on the dev server and on a page it cannot read', () => {
    // Dev serves /src/main.ts, which has no hash to compare.
    expect(isNewerBuild(page('Je39JZti'), '/src/main.ts', 'index')).toBe(false);
    expect(isNewerBuild(page('Je39JZti'), null, 'index')).toBe(false);
    expect(isNewerBuild('<html>maintenance</html>', '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(
      false
    );
  });
});

describe('version.json', () => {
  const live = { index: 'assets/index-Je39JZti.js', explorer: 'assets/explorer-Bxmyocsi.js' };

  it('reads the entry for the page asked about', () => {
    expect(liveEntryFrom(live, 'index')).toBe('assets/index-Je39JZti.js');
    expect(liveEntryFrom(live, 'explorer')).toBe('assets/explorer-Bxmyocsi.js');
    expect(liveEntryFrom(live, 'other')).toBeNull();
    expect(liveEntryFrom('<html>not json</html>', 'index')).toBeNull();
    expect(liveEntryFrom(null, 'index')).toBeNull();
  });

  it("says a new build is live only when this page's entry changed", () => {
    expect(isNewerEntry(live, '/ascension-planner/assets/index-Je39JZti.js', 'index')).toBe(false);
    expect(isNewerEntry(live, '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(true);
    // Only the planner changed: an Explorer tab has nothing to reload for.
    expect(isNewerEntry(live, '/ascension-planner/assets/explorer-Bxmyocsi.js', 'explorer')).toBe(false);
  });

  it('stays quiet on the dev server', () => {
    expect(isNewerEntry(live, '/src/main.ts', 'index')).toBe(false);
    expect(isNewerEntry(live, null, 'index')).toBe(false);
  });
});

describe('how often it checks', () => {
  it('checks every minute on a desktop and every 5 on a phone', () => {
    expect(checkEveryMs(false)).toBe(60 * 1000);
    expect(checkEveryMs(true)).toBe(5 * 60 * 1000);
  });

  it('skips a timed check when another tab just looked', () => {
    const every = 60_000;
    expect(isDue(0, 1_000_000, every)).toBe(true); // never checked
    expect(isDue(1_000_000, 1_020_000, every)).toBe(false); // another tab, 20 s ago
    expect(isDue(1_000_000, 1_059_000, every)).toBe(true); // this tab's own timer, a second early
  });

  it('tells phones and tablets from desktops', () => {
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140' })).toBe(false);
    expect(
      isMobileLike({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      })
    ).toBe(false);
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' })).toBe(
      true
    );
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' })).toBe(true);
    // iPadOS asks for the desktop site and says it is a Mac; five touch points say otherwise.
    expect(
      isMobileLike({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(isMobileLike({ userAgent: 'x', userAgentData: { mobile: true } })).toBe(true);
  });

  it('treats data saver as mobile, whatever the device', () => {
    expect(isMobileLike({ userAgent: 'Windows', connection: { saveData: true } })).toBe(true);
  });
});

describe('how much an update matters', () => {
  const live = (since: string, note = '') => ({
    index: 'assets/index-a.js',
    release: { reloadIfBuiltBefore: since, note },
  });

  it('asks a tab built before the last reload-level change to reload', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'fixes'), '2026-09-25T10:00:00Z')).toEqual({
      level: 'essential',
      note: 'fixes',
    });
  });

  it('tells a tab built after it that the update is small', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'wording'), '2026-09-26T09:00:00Z')).toEqual({
      level: 'small',
      note: 'wording',
    });
  });

  it('still asks for a reload when the tab skipped the reload deploy and sees a later small one', () => {
    // Tab built 24 Sep; a reload-level change shipped 25 Sep; the newest build (26 Sep) is wording.
    // The marker still says 25 Sep, so the 24 Sep tab must reload.
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), '2026-09-24T12:00:00Z').level).toBe('essential');
  });

  it('treats a file from before the marker existed, or an unknown own build, as a reload', () => {
    expect(releaseFrom({ index: 'assets/index-a.js' }, '2026-09-26T00:00:00Z').level).toBe('essential');
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), '').level).toBe('essential');
    expect(releaseFrom(null, '2026-09-26T00:00:00Z').level).toBe('essential');
  });

  it('never drops from a reload back to a small note', () => {
    const reload = { level: 'essential' as const, note: 'fixes' };
    expect(raiseLevel(reload, { level: 'small', note: 'wording' }).level).toBe('essential');
    expect(raiseLevel({ level: 'small', note: '' }, reload).level).toBe('essential');
    expect(raiseLevel(null, { level: 'small', note: '' }).level).toBe('small');
  });

  it('is big when any missed update is marked big, else small', () => {
    const history = [
      { at: '2026-10-06T15:00:00Z', note: 'tweak' },
      { at: '2026-10-06T04:00:00Z', note: 'heat map', level: 'big' },
      { at: '2026-10-05T20:00:00Z', note: 'older tweak', level: 'small' },
    ];
    const v = { release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: 'tweak', history } };
    expect(releaseFrom(v, '2026-10-05T21:00:00Z')).toEqual({ level: 'big', note: 'heat map', earlier: ['tweak'] });
    expect(releaseFrom(v, '2026-10-06T10:00:00Z')).toEqual({ level: 'small', note: 'tweak' });
    expect(releaseFrom(v, '2026-10-06T16:00:00Z')).toEqual({ level: 'small', note: 'tweak' });
  });

  it('essential beats big: a tab older than reloadIfBuiltBefore is asked to reload', () => {
    const history = [{ at: '2026-10-06T04:00:00Z', note: 'heat map', level: 'big' }];
    const v = { release: { reloadIfBuiltBefore: '2026-10-06T00:00:00Z', note: 'heat map', history } };
    expect(releaseFrom(v, '2026-10-05T00:00:00Z').level).toBe('essential');
  });

  it('levels only go up: small < big < essential', () => {
    const small = { level: 'small' as const, note: 's' };
    const big = { level: 'big' as const, note: 'b' };
    const essential = { level: 'essential' as const, note: 'e' };
    expect(raiseLevel(big, small).level).toBe('big');
    expect(raiseLevel(small, big).level).toBe('big');
    expect(raiseLevel(essential, big).level).toBe('essential');
    expect(raiseLevel(big, essential).level).toBe('essential');
  });

  it('still finds the page entry beside the release block', () => {
    const v = { index: 'assets/index-Je39JZti.js', release: { reloadIfBuiltBefore: '2026-01-01T00:00:00Z', note: '' } };
    expect(isNewerEntry(v, '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(true);
  });
});

describe('missed updates', () => {
  const history = [
    { at: '2026-10-06T15:00:00Z', note: 'newest' },
    { at: '2026-10-06T04:00:00Z', note: 'middle' },
    { at: '2026-10-05T20:00:00Z', note: 'oldest' },
  ];
  it('counts only entries after the tab build, newest first', () => {
    expect(missedEntries(history, '2026-10-05T21:00:00Z').map(h => h.note)).toEqual(['newest', 'middle']);
    expect(missedEntries(history, '2026-10-07T00:00:00Z')).toEqual([]);
    expect(missedEntries(history, '')).toEqual([]);
    expect(missedEntries('nope', '2026-10-05T00:00:00Z')).toEqual([]);
  });
  it('words the earlier count', () => {
    expect(earlierText(0)).toBe('');
    expect(earlierText(1)).toBe('and 1 earlier update');
    expect(earlierText(2)).toBe('and 2 earlier updates');
  });
  it('releaseFrom lists earlier notes only when more than one was missed', () => {
    const v = { release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: 'newest', history } };
    expect(releaseFrom(v, '2026-10-05T21:00:00Z')).toEqual({ level: 'small', note: 'newest', earlier: ['middle'] });
    expect(releaseFrom(v, '2026-10-06T10:00:00Z')).toEqual({ level: 'small', note: 'newest' });
    expect(releaseFrom(v, '2026-10-01T00:00:00Z').earlier).toEqual(['middle', 'oldest']);
  });
});
