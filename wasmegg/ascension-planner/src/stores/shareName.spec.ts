/** The account's one "Credit me as" name (stores/shareName.ts): kept under its hash, not its ID. */
import '../../scripts/node-shims';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useShareNameStore } from './shareName';
import { hashID } from '@/lib/storage/db';

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
});
