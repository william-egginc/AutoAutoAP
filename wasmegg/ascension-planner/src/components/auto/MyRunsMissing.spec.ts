/**
 * My runs' newest runs went missing (16 Oct 2026): "A run of yours isn't here?" (MyRunsMissing.vue), the
 * keys this browser remembers per account (lib/myKeys.ts), and how LeaderboardPanel feeds both and the
 * look-alike match (lib/myRuns.ts `isMyRun`). Rendered on the server; the panel by its source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyRunsMissing from './MyRunsMissing.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { GEAR_OCT10, KEY_NOW, KEY_OCT10, egg } from '@/test/myRunsMix';
import { MAX_KEYS, rememberKey, rememberedKeys } from '@/lib/myKeys';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

const rows = [
  egg(248, '2026-10-15T15:00:00Z', { id: 'aaaa1111bbbb' }),
  egg(248, '2026-10-11T12:00:00Z', { id: 'cccc2222dddd', nickname: 'AltName', acct: 'pc0000000001' }),
  egg(248, '2026-10-12T12:00:00Z', { id: 'eeee3333ffff', artifacts: GEAR_OCT10 }),
];
const props = {
  rows,
  lookAlike: { keys: new Set([KEY_NOW]), names: new Set<string>(), viewerTE: 190 },
  saveKey: KEY_NOW,
  hasCode: false,
};

describe('A run of yours isn’t here?', () => {
  it('folded until opened, nothing said until an id is typed', async () => {
    const html = await renderHtml(MyRunsMissing, props);
    expect(html).toContain('data-testid="my-runs-missing"');
    expect(textOf(html)).toContain('A run of yours isn’t here?');
    expect(html).not.toContain('data-testid="my-runs-missing-answer"');
  });

  it('a look-alike: listed, and this site holds no code for the account', async () => {
    const t = textOf(await renderHtml(MyRunsMissing, { ...props, initialId: 'AAAA1111' }));
    expect(t).toContain('aaaa1111 · 200 230 248');
    expect(t).toContain('It is listed, tagged “maybe you”');
    expect(t).toContain('has never sent a run for this account');
  });

  it("another browser's named run, and a run from earlier gear", async () => {
    expect(textOf(await renderHtml(MyRunsMissing, { ...props, initialId: 'cccc2222' }))).toContain(
      'as “AltName” from another browser or site'
    );
    expect(textOf(await renderHtml(MyRunsMissing, { ...props, initialId: 'eeee3333' }))).toContain(
      'Its gear differs from your save’s: it has T4E Necklace; your save has T4L Necklace.'
    );
  });

  it('an id no row has', async () => {
    expect(textOf(await renderHtml(MyRunsMissing, { ...props, initialId: '999999' }))).toContain(
      'No run on the public board has that id.'
    );
  });
});

describe('the keys this browser remembers for an account (lib/myKeys.ts)', () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, String(v)),
      removeItem: (k: string) => void backing.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('newest first, each once, per account, at most MAX_KEYS', () => {
    expect(rememberedKeys('hashA')).toEqual([]);
    rememberKey('hashA', KEY_OCT10, 1);
    rememberKey('hashA', KEY_NOW, 2);
    expect(rememberKey('hashA', KEY_OCT10, 3)).toEqual([KEY_OCT10, KEY_NOW]);
    expect(rememberedKeys('hashB')).toEqual([]);
    for (let i = 0; i < 20; i++) rememberKey('hashA', `k${i}`, 10 + i);
    expect(rememberedKeys('hashA')).toHaveLength(MAX_KEYS);
    expect(rememberedKeys('hashA')[0]).toBe('k19');
    // Nothing without an account; broken storage reads as nothing.
    expect(rememberKey('', KEY_NOW)).toEqual([]);
    localStorage.setItem('aap-my-keys:hashC', '{oops');
    expect(rememberedKeys('hashC')).toEqual([]);
  });
});

describe('LeaderboardPanel feeds the match', () => {
  const src = read('LeaderboardPanel.vue');

  it('matches on every key of the account and its names, with no look-alikes without a save', () => {
    expect(src).toContain('return mergedRows.value.filter(r => isMyRun(r, l.keys, l.viewerTE, l.names));');
    expect(src).toMatch(/keys: myKey\.value \? myKeys\.value : new Set<string>\(\)/);
    expect(src).toMatch(/for \(const r of mineRows\.value \?\? \[\]\) keys\.add\(accountKeyOf\(r\)\)/);
    expect(src).toMatch(
      /nameKeys\(\[accountName\.value, sharedName\.get\(\), \.\.\.\(mineRows\.value \?\? \[\]\)\.map\(r => r\.nickname\)\]\)/
    );
  });

  it("remembers a save's key only under its own account, never the one left over from the last", () => {
    expect(src).toMatch(/raw\.eiUserId\.toLowerCase\(\) === \(props\.playerId \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
    expect(src).toContain('own ? rememberKey(p, key as string) : rememberedKeys(p)');
  });

  it('counts runs as the list does (a result sent twice once), and shows "isn’t here?" under the list', () => {
    expect(src).toContain('myRunsMode.value && loadedOnce.value ? myRunsCount(myRunRows.value) : null');
    const myRuns = src.slice(src.indexOf('<div v-if="myRunsMode"'), src.indexOf('<div v-else class="space-y-4">'));
    expect(myRuns.indexOf('<MyRunsMissing')).toBeGreaterThan(myRuns.indexOf('<MyRunsList'));
    expect(src).toContain('hasCode.value = !!token;');
  });
});
