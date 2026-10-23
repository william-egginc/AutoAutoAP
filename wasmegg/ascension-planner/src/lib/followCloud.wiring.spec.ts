/**
 * The followed route saved online, wiring (23 Oct 2026): never an ID in the new files, a URL or a value; the calls take
 * only the key; one place writes (stores/follow.ts `saveOnline`, from a Follow press); the collector URL is the
 * chain-search store's submit URL (no other).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(src, p), 'utf8');
const NEW_FILES = ['lib/followCloud.ts', 'stores/follow.ts', 'components/BetterRoutePrompt.vue', 'components/myruns/FollowHistory.vue'];

function allSource(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) allSource(p, out);
    else if (/\.(ts|vue)$/.test(f) && !/\.spec\.ts$/.test(f)) out.push(p);
  }
  return out;
}

describe('the followed route saved online: wiring', () => {
  it('no player ID in the new files', () => {
    for (const f of NEW_FILES) expect(read(f), f).not.toMatch(/EI\d{16}/i);
  });

  it('the URLs hold only the key (and the goal), and a body with an ID is never sent', () => {
    const lib = read('lib/followCloud.ts');
    const urls = [...lib.matchAll(/await f\(([^,]+),/g)].map(m => m[1].trim());
    expect(urls).toEqual(['`${url}?k=${k}`', 'url', '`${url}/history?k=${k}&goal=${encodeURIComponent(goal)}`']);
    expect(lib).toContain('const body = JSON.stringify({ k, goal, value });');
    expect(lib).toMatch(/if \(hasPlayerId\(body\)\) return \{ ok: false, why: 'rejected' \};\s+try \{\s+const res = await f\(url, \{ method: 'PUT'/);
    expect(lib).toContain('if (hasPlayerId(text)) return null;');
  });

  it('the store hands the calls the key, never the ID; the ID goes only into the two hashes', () => {
    const store = read('stores/follow.ts');
    expect(store).toContain('getFollows(url, k)');
    expect(store).toContain('putFollow(url, cloudKey.value, goalKey, built.value)');
    expect(store).toContain('getFollowHistory(url, cloudKey.value, goalKey)');
    expect(store).toContain("const k = id ? await followKey(id).catch(() => '') : '';");
    // Every call that takes the ID: the two hashes only.
    const takes = [...store.matchAll(/(\w+)\(id\)/g)].map(m => m[1]).sort();
    expect([...new Set(takes)]).toEqual(['accountHash', 'followKey']);
  });

  it('only stores/follow.ts calls the collector, and only Follow (and Restore, a Follow) writes', () => {
    const callers = allSource(src).filter(p => /\b(putFollow|getFollows|getFollowHistory)\(/.test(readFileSync(p, 'utf8')));
    expect(callers.map(p => p.slice(src.length)).sort()).toEqual(['lib/followCloud.ts', 'stores/follow.ts']);
    const store = read('stores/follow.ts');
    // saveOnline is called from follow() alone; loadCloud never writes online.
    expect(store.match(/saveOnline\(/g)?.length).toBe(2); // its definition and the one call
    const load = store.slice(store.indexOf('function loadCloud('), store.indexOf('/** The route followed for a goal'));
    expect(load).not.toMatch(/putFollow|saveOnline/);
  });

  it('the collector URL is the chain-search store\'s submit URL', () => {
    expect(read('stores/follow.ts')).toContain('followUrlOf(searchStore()?.submitUrl)');
  });

  it('every Follow button passes the finish, except another player\'s board row (their account, not comparable)', () => {
    const tags = allSource(src).flatMap(p =>
      [...readFileSync(p, 'utf8').matchAll(/<FollowButton\b[^>]*>/g)].map(m => ({ file: p.slice(src.length), tag: m[0] }))
    );
    const without = tags.filter(t => !t.tag.includes(':finish=')).map(t => t.file).sort();
    expect(without).toEqual(['components/auto/LeaderboardPanel.vue', 'components/auto/LeaderboardPanel.vue', 'components/auto/LeaderboardPlanList.vue']);
    expect(tags.length).toBeGreaterThanOrEqual(9);
  });
});

