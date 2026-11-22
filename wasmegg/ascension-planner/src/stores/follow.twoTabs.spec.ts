/**
 * TWO TABS, ONE ACCOUNT (code review 22 Nov 2026, rel-state-3): each tab held its own copy of the followed routes and
 * wrote it whole, so a follow in one tab erased the other's. Every write now starts from what storage holds, a storage
 * event from another tab drops the held copy, and the automatic follow looks again right before following.
 * No collector (nothing online); placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { FOLLOW_PREFIX, readFollows, writeFollow } from '@/lib/follow';

const ID = 'EI1234567890123456';
const FASTEST = 'fastest-490';
const EGG = 'eggday-2027';
let mem: Map<string, string>;
let handlers: ((e: { key: string | null }) => void)[];

beforeEach(() => {
  mem = new Map<string, string>();
  handlers = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('window', {
    addEventListener: (t: string, h: (e: { key: string | null }) => void) => void (t === 'storage' && handlers.push(h)),
    removeEventListener: () => {},
  });
  setActivePinia(createPinia());
  defineStore('chainSearch', () => ({ submitUrl: '', availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
});
afterEach(() => vi.unstubAllGlobals());

async function tab() {
  const s = useFollowStore();
  await vi.waitFor(() => expect(s.partition).not.toBe(''));
  s.followed(FASTEST); // this tab has read (and holds) the routes
  return s;
}
/** The other tab's follow: written to the shared storage, no event here yet. */
const otherTab = (p: string) => writeFollow(p, EGG, { chain: [260, 490], from: 'typed', at: 1 }, readFollows(p));

describe('two tabs of one account', () => {
  it('a follow here keeps the other tab’s follow of another goal', async () => {
    const s = await tab();
    otherTab(s.partition);
    expect(await s.follow(FASTEST, [226, 300, 490], 'typed')).toBe(true);
    const kept = readFollows(s.partition);
    expect(kept[FASTEST]?.chain).toEqual([226, 300, 490]);
    expect(kept[EGG]?.chain).toEqual([260, 490]);
  });
  it('an un-follow here keeps it too', async () => {
    const s = await tab();
    await s.follow(FASTEST, [226, 300, 490], 'typed');
    otherTab(s.partition);
    await s.unfollow(FASTEST);
    expect(readFollows(s.partition)[EGG]?.chain).toEqual([260, 490]);
  });
  it('the other tab’s storage event: this tab shows its follow at once', async () => {
    const s = await tab();
    otherTab(s.partition);
    expect(s.followed(EGG)).toBeNull();
    for (const h of handlers) h({ key: FOLLOW_PREFIX + s.partition });
    expect(s.followed(EGG)?.chain).toEqual([260, 490]);
  });
});
