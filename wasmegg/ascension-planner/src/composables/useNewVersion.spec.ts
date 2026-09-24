import { describe, expect, it } from 'vitest';
import { entryScriptIn, isNewerBuild, checkEveryMs, isMobileLike } from './useNewVersion';

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

describe('how often it checks', () => {
  it('checks every 5 minutes on a desktop and every 30 on a phone', () => {
    expect(checkEveryMs(false)).toBe(5 * 60 * 1000);
    expect(checkEveryMs(true)).toBe(30 * 60 * 1000);
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

