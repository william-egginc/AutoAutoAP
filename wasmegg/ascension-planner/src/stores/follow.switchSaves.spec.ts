/**
 * A player switch clears the follow save state (code review 22 Nov 2026, rel-state-5): B never shows A's "couldn't
 * save" words, and a PUT for A still out when B loads writes nothing into B's state. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';

const A = 'EI1234567890123456';
const B = 'EI9876543210987654';
const GOAL = 'fastest-490';
let mem: Map<string, string>;
let put: (() => void) | null;
let putAnswer: 'offline' | 'hold';

beforeEach(() => {
  mem = new Map<string, string>();
  put = null;
  putAnswer = 'offline';
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('fetch', async (_url: string, init?: { method?: string }) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if ((init?.method ?? 'GET') === 'GET') return ok({ goals: {}, now: Date.now() });
    if (putAnswer === 'offline') throw new TypeError('Failed to fetch');
    await new Promise<void>(r => (put = r));
    throw new TypeError('Failed to fetch');
  });
  setActivePinia(createPinia());
  defineStore('chainSearch', () => ({ submitUrl: 'https://collector.example/submit', availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: A } as never;
});
afterEach(() => vi.unstubAllGlobals());

async function ready() {
  const s = useFollowStore();
  await vi.waitFor(() => expect(s.cloudKey).toMatch(/^[0-9a-f]{64}$/));
  return s;
}
async function switchTo(id: string, s: ReturnType<typeof useFollowStore>) {
  const was = s.partition;
  useInitialStateStore().rawBackup = { eiUserId: id } as never;
  await vi.waitFor(() => expect(s.partition).not.toBe(was));
}

describe('a player switch and the follow save state', () => {
  it('A’s failed save is not B’s', async () => {
    const s = await ready();
    await s.follow(GOAL, [226, 300, 490], 'typed');
    expect(s.saveState(GOAL)?.state).toBe('failed');
    await switchTo(B, s);
    expect(s.saveState(GOAL)).toBeNull();
  });
  it('a PUT for A still out when B loads writes nothing into B’s state', async () => {
    putAnswer = 'hold';
    const s = await ready();
    const going = s.follow(GOAL, [226, 300, 490], 'typed');
    await vi.waitFor(() => expect(put).not.toBeNull());
    await switchTo(B, s);
    put!();
    await going;
    expect(s.saveState(GOAL)).toBeNull();
  });
});
