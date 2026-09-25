import { describe, expect, it } from 'vitest';
import { entryScriptIn, isNewerBuild, isNewerEntry, liveEntryFrom, releaseFrom, raiseLevel, checkEveryMs, isDue, isMobileLike } from './useNewVersion';

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
    expect(isNewerBuild('<html>maintenance</html>', '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(false);
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

  it('says a new build is live only when this page\'s entry changed', () => {
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
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' })).toBe(true);
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' })).toBe(true);
    // iPadOS asks for the desktop site and says it is a Mac; five touch points say otherwise.
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isMobileLike({ userAgent: 'x', userAgentData: { mobile: true } })).toBe(true);
  });

  it('treats data saver as mobile, whatever the device', () => {
    expect(isMobileLike({ userAgent: 'Windows', connection: { saveData: true } })).toBe(true);
  });
});

describe('how much an update matters', () => {
  const live = (since: string, note = '') => ({ index: 'assets/index-a.js', release: { reloadIfBuiltBefore: since, note } });

  it('asks a tab built before the last reload-level change to reload', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'fixes'), '2026-09-25T10:00:00Z')).toEqual({ level: 'reload', note: 'fixes' });
  });

  it('tells a tab built after it that the update is minor', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'wording'), '2026-09-26T09:00:00Z')).toEqual({ level: 'minor', note: 'wording' });
  });

  it('still asks for a reload when the tab skipped the reload deploy and sees a later minor one', () => {
    // Tab built 24 Sep; a reload-level change shipped 25 Sep; the newest build (26 Sep) is wording.
    // The marker still says 25 Sep, so the 24 Sep tab must reload.
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), '2026-09-24T12:00:00Z').level).toBe('reload');
  });

  it('treats a file from before the marker existed, or an unknown own build, as a reload', () => {
    expect(releaseFrom({ index: 'assets/index-a.js' }, '2026-09-26T00:00:00Z').level).toBe('reload');
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), '').level).toBe('reload');
    expect(releaseFrom(null, '2026-09-26T00:00:00Z').level).toBe('reload');
  });

  it('never drops from a reload back to a minor note', () => {
    const reload = { level: 'reload' as const, note: 'fixes' };
    expect(raiseLevel(reload, { level: 'minor', note: 'wording' }).level).toBe('reload');
    expect(raiseLevel({ level: 'minor', note: '' }, reload).level).toBe('reload');
    expect(raiseLevel(null, { level: 'minor', note: '' }).level).toBe('minor');
  });

  it('still finds the page entry beside the release block', () => {
    const v = { index: 'assets/index-Je39JZti.js', release: { reloadIfBuiltBefore: '2026-01-01T00:00:00Z', note: '' } };
    expect(isNewerEntry(v, '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(true);
  });
});
