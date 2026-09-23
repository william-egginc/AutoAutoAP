import { describe, expect, it } from 'vitest';
import { entryScriptIn, isNewerBuild } from './useNewVersion';

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
