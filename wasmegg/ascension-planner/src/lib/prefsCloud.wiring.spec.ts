/**
 * Your choices and Setup saved online, wiring (26 Oct 2026): never an ID in the new files, a URL or a value; the calls
 * take only the key; one place reads and writes (stores/prefs.ts); the collector URL is the chain-search store's submit
 * URL (no other); the page makes the store.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(src, p), 'utf8');
const NEW_FILES = ['lib/prefsCloud.ts', 'stores/prefs.ts'];

function allSource(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) allSource(p, out);
    else if (/\.(ts|vue)$/.test(f) && !/\.spec\.ts$/.test(f)) out.push(p);
  }
  return out;
}

describe('your choices and Setup saved online: wiring', () => {
  it('no player ID in the new files, and no logging', () => {
    for (const f of NEW_FILES) {
      expect(read(f), f).not.toMatch(/EI\d{16}/i);
      expect(read(f), f).not.toMatch(/console\./);
    }
  });

  it('the URLs hold only the key, and a body with an ID is never sent', () => {
    const lib = read('lib/prefsCloud.ts');
    const urls = [...lib.matchAll(/await f\(([^,]+),/g)].map(m => m[1].trim());
    expect(urls).toEqual(['`${url}?k=${k}`', 'url']);
    expect(lib).toContain('const body = JSON.stringify({ k, kind, value });');
    expect(lib).toMatch(/if \(hasPlayerId\(body\)\) return \{ ok: false, why: 'rejected' \};/);
  });

  it('the store hands the calls the key, never the ID; the ID goes only into the hashes and the name store', () => {
    const store = read('stores/prefs.ts');
    expect(store).toContain('getPrefs(url, k)');
    expect(store).toContain('putPrefs(p.url, p.key, kind, p.value)');
    const takes = [...store.matchAll(/(\w+)\(id\)/g)].map(m => m[1]);
    // `knownName`: the "Credit me as" name for the credit (the name store, else the header's name; useStudy.ts).
    expect([...new Set(takes)].sort()).toEqual(['accountHash', 'anonymousFor', 'knownName', 'load', 'nameFor', 'prefsKey']);
    // Nothing of the ID is returned from the store.
    const ret = store.slice(store.lastIndexOf('return {'));
    expect(ret).not.toMatch(/readyId|idOf/);
  });

  it('only stores/prefs.ts calls the collector for prefs; the load never writes', () => {
    const callers = allSource(src).filter(p => /\b(putPrefs|getPrefs)\(/.test(readFileSync(p, 'utf8')));
    expect(callers.map(p => p.slice(src.length)).sort()).toEqual(['lib/prefsCloud.ts', 'stores/prefs.ts']);
    const store = read('stores/prefs.ts');
    expect(store.match(/putPrefs\(/g)?.length).toBe(1);
    const loading = store.slice(store.indexOf('// ------------------------------------------------------------------------------ loading'), store.indexOf('// ------------------------------------------------------------------------------ writing'));
    expect(loading).not.toMatch(/putPrefs|changed\(/);
  });

  it('the collector URL is the chain-search store\'s submit URL, and the page makes the store', () => {
    expect(read('stores/prefs.ts')).toContain('prefsUrlOf(searchStore()?.submitUrl)');
    expect(read('App.vue')).toMatch(/\nusePrefsStore\(\);\n/);
  });
});
