/** The account's one "Credit me as" name (stores/shareName.ts): kept under its hash, not its ID. */
import '../../scripts/node-shims';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useShareNameStore } from './shareName';
import { hashID } from '@/lib/storage/db';
import { readFileSync } from 'node:fs';

// A stand-in for a player ID.
const ID = 'test-player-id';
const flush = () => new Promise(r => setTimeout(r, 20));

describe('useShareNameStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('none until one is typed; typed, it is kept under the hash of the ID, never the ID', async () => {
    const s = useShareNameStore();
    expect(s.nameFor(ID)).toBeUndefined();
    s.setName(ID, 'Fliris');
    expect(s.nameFor(` ${ID} `)).toBe('Fliris');
    await flush();
    const keys = Object.keys(localStorage);
    expect(keys).toEqual([`aap-share-name:${await hashID(ID)}`]);
    expect(keys.join()).not.toContain(ID);
    expect(localStorage.getItem(keys[0])).toBe('Fliris');
  });

  it('comes back on the next visit; a cleared box forgets it', async () => {
    useShareNameStore().setName(ID, 'Fliris');
    await flush();
    setActivePinia(createPinia());
    const s = useShareNameStore();
    await s.load(ID);
    expect(s.nameFor(ID)).toBe('Fliris');
    s.setName(ID, '');
    await flush();
    expect(s.nameFor(ID)).toBe('');
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('a pasted 500-character name is kept at 40, in memory and in this browser (QA, 22 Oct 2026)', async () => {
    const s = useShareNameStore();
    s.setName(ID, 'x'.repeat(500));
    expect(s.nameFor(ID)).toBe('x'.repeat(40));
    await flush();
    expect(localStorage.getItem(`aap-share-name:${await hashID(ID)}`)).toBe('x'.repeat(40));
    // An older, longer kept name is cut as it loads.
    localStorage.setItem(`aap-share-name:${await hashID(ID)}`, 'y'.repeat(60));
    setActivePinia(createPinia());
    const t = useShareNameStore();
    await t.load(ID);
    expect(t.nameFor(ID)).toBe('y'.repeat(40));
  });

  describe('another tab (storage events, prelive 22 Oct 2026)', () => {
    it('takes a name or an anonymous choice changed there, capped at 40, writing nothing back', async () => {
      const s = useShareNameStore();
      await s.load(ID);
      const h = await hashID(ID);
      const before = Object.keys(localStorage).length;
      s.storageEvent(`aap-share-name:${h}`, 'Fliris');
      expect(s.nameFor(ID)).toBe('Fliris');
      s.storageEvent(`aap-share-name:${h}`, 'x'.repeat(500));
      expect(s.nameFor(ID)).toBe('x'.repeat(40));
      s.storageEvent(`aap-share-name:${h}`, null); // cleared there
      expect(s.nameFor(ID)).toBe('');
      s.storageEvent(`aap-share-anon:${h}`, '0');
      expect(s.anonymousFor(ID)).toBe(false);
      s.storageEvent(`aap-share-anon:${h}`, '1');
      expect(s.anonymousFor(ID)).toBe(true);
      s.storageEvent(`aap-share-anon:${h}`, 'junk');
      expect(s.anonymousFor(ID)).toBe(true);
      await flush();
      expect(Object.keys(localStorage).length).toBe(before); // no echo
    });

    it('an unchanged value changes nothing; other keys and accounts not read here are ignored', async () => {
      const s = useShareNameStore();
      s.setName(ID, 'Same');
      await flush();
      const was = s.names;
      s.storageEvent(`aap-share-name:${await hashID(ID)}`, 'Same');
      expect(s.names).toBe(was);
      s.storageEvent(`aap-share-name:${await hashID('someone-else')}`, 'Other');
      s.storageEvent('aap.study', 'x');
      s.storageEvent(null, null);
      expect(s.nameFor(ID)).toBe('Same');
      expect(s.nameFor('someone-else')).toBeUndefined();
    });

    it('listens for storage events', () => {
      expect(readFileSync(new URL('./shareName.ts', import.meta.url), 'utf8')).toMatch(
        /window\.addEventListener\('storage'/
      );
    });
  });

  it('a name typed before the kept one loads wins', async () => {
    useShareNameStore().setName(ID, 'Old');
    await flush();
    setActivePinia(createPinia());
    const s = useShareNameStore();
    const loading = s.load(ID);
    s.setName(ID, 'New');
    await loading;
    expect(s.nameFor(ID)).toBe('New');
  });

  it('anonymous or "Credit me as": undefined until picked, then kept under the hash, never the ID', async () => {
    const s = useShareNameStore();
    expect(s.anonymousFor(ID)).toBeUndefined();
    s.setAnonymous(ID, false);
    expect(s.anonymousFor(` ${ID} `)).toBe(false);
    await flush();
    // (The test before may still be writing its name: only the choice's keys here.)
    const keys = Object.keys(localStorage).filter(k => k.startsWith('aap-share-anon:'));
    expect(keys).toEqual([`aap-share-anon:${await hashID(ID)}`]);
    expect(keys.join()).not.toContain(ID);
    expect(localStorage.getItem(keys[0])).toBe('0');
    // The next visit has it back.
    setActivePinia(createPinia());
    const next = useShareNameStore();
    await next.load(ID);
    expect(next.anonymousFor(ID)).toBe(false);
    next.setAnonymous(ID, true);
    await flush();
    expect(localStorage.getItem(keys[0])).toBe('1');
  });

  it('one choice per account: another account starts anonymous-undecided', async () => {
    const s = useShareNameStore();
    s.setAnonymous(ID, false);
    await flush();
    await s.load('another-test-id');
    expect(s.anonymousFor('another-test-id')).toBeUndefined();
  });

  it('storage that throws: the choice holds for this visit', async () => {
    const s = useShareNameStore();
    const orig = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('blocked');
    };
    try {
      s.setAnonymous(ID, false);
      await flush();
      expect(s.anonymousFor(ID)).toBe(false);
    } finally {
      localStorage.setItem = orig;
    }
  });
});
