/**
 * THE CLOUD ANSWER ON A SECOND BROWSER'S FIRST LOAD (ux34 item 3). Browser 1 keeps its instant answer and saves it
 * online (/answers, under the account's follow key). Browser 2 is a fresh profile (empty localStorage, a fresh pinia)
 * that loads the same ID: on that FIRST load, with no reload, the read asked while its follow key is still being worked
 * out from the save's ID must serve browser 1's answer (InstantRoute.vue `showStale` asks `fallbackFor` when nothing
 * is kept here: InstantRoute.cloud.spec.ts). The browser that wrote it may need a refresh to see a newer one: accepted.
 *
 * Both browsers go through the real stores (follow key from the ID, the answers client) against one in-memory
 * collector (/follow and /answers). Fixed clock; placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { setAnswersFetch, useAnswersStore } from '@/stores/answers';
import { followKey } from '@/lib/followCloud';
import type { AnswerOffer, AnswersFetch } from '@/lib/answersCloud';

const ID = 'EI1234567890123456';
const SUBMIT = 'https://collector.example/submit';
const NOW = Date.UTC(2026, 9, 28, 18);
const SAVE = Math.floor(NOW / 1000) - 3600;
const GOAL = 'target 490';

/** One collector both browsers talk to: /follow (nothing saved) and /answers as the contract keeps them. */
function collector() {
  const answers = new Map<string, { at: number; bytes: Uint8Array; updatedAt: number }>();
  const calls: string[] = [];
  const res = (status: number, body: unknown, bytes?: Uint8Array) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => (bytes ? bytes.slice().buffer : new ArrayBuffer(0)) as ArrayBuffer,
  });
  const f: AnswersFetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(url);
    calls.push(`${method} ${u.pathname}`);
    if (u.pathname === '/follow') return res(200, { goals: {}, now: Date.now() });
    if (method === 'GET' && u.pathname === '/answers')
      return res(200, {
        entries: [...answers.entries()].map(([e, v]) => ({ e, at: v.at, bytes: v.bytes.length, updatedAt: v.updatedAt })),
      });
    if (method === 'GET' && u.pathname === '/answers/get') {
      const v = answers.get(u.searchParams.get('e') ?? '');
      return v ? res(200, null, v.bytes) : res(404, {});
    }
    if (method === 'PUT' && u.pathname === '/answers') {
      answers.set(u.searchParams.get('e')!, { at: Number(u.searchParams.get('at')), bytes: init!.body as Uint8Array, updatedAt: Date.now() });
      return res(200, { ok: true });
    }
    return res(404, {});
  };
  return { f, calls, answers };
}

/** A fresh browser profile: its own localStorage and pinia, the collector known, the save of `ID` loaded. */
function browser(c: ReturnType<typeof collector>) {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('fetch', c.f);
  setAnswersFetch(c.f);
  setActivePinia(createPinia());
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null, isRunning: false, deadlineRunning: false, resultSending: false }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  return { mem, follows: useFollowStore(), answers: useAnswersStore() };
}

const offer = (at: number): AnswerOffer => ({
  goal: GOAL,
  backupTime: SAVE,
  snapKey: 'aap-instant-answer:browser1|0',
  tables: 'rules=x|table-v2.bin=a',
  at,
  snap: { v: 1, at, result: { tag: 'browser 1', chain: [218, 247, 277, 313, 490] }, header: { from: 100, to: 489 } },
  pricing: null,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  setAnswersFetch(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a second browser shows the cloud answer on its first load', () => {
  it("browser 1 writes; browser 2 (empty storage, same ID) asks before its key is worked out and is served browser 1's answer, no reload", async () => {
    const c = collector();
    const key = await followKey(ID);

    // Browser 1: its key worked out from the save, its fresh answer offered and written.
    const one = browser(c);
    await vi.waitFor(() => expect(one.follows.cloudKey).toBe(key));
    one.answers.offer(offer(NOW - 60_000));
    expect(await one.answers.client.flush()).toBe('sent');
    expect(c.answers.size).toBe(1);
    expect([...c.answers.keys()][0]).toMatch(/^a1\.t490\./);

    // Browser 2: a fresh profile; the card asks while the key is still unknown (the first thing on load).
    c.calls.length = 0;
    vi.setSystemTime(NOW + 5 * 60_000);
    const two = browser(c);
    expect(two.mem.size).toBe(0);
    expect(two.follows.cloudKey).toBe('');
    const got = await two.answers.fallbackFor({ goal: GOAL, e: null, backupTime: SAVE });
    expect(two.follows.cloudKey).toBe(key);
    expect((got?.snap as { result: { tag: string } }).result.tag).toBe('browser 1');
    expect(got?.at).toBe(NOW - 60_000);
    // One list read and one body read on this load: served the first time, nothing asked twice.
    expect(c.calls.filter(x => x.includes('/answers'))).toEqual(['GET /answers', 'GET /answers/get']);
    expect(two.answers.read().map(a => a.at)).toEqual([NOW - 60_000]);
    // A second ask on the same load (another run of the same goal) is served from what was read.
    await two.answers.fallbackFor({ goal: GOAL, e: null, backupTime: SAVE });
    expect(c.calls.filter(x => x.includes('/answers'))).toHaveLength(2);
  });

  it("browser 2's own Setup and save differ from browser 1's (its entry key isn't there): the goal's answer still serves", async () => {
    const c = collector();
    const one = browser(c);
    await vi.waitFor(() => expect(one.follows.cloudKey).not.toBe(''));
    one.answers.offer(offer(NOW - 60_000));
    expect(await one.answers.client.flush()).toBe('sent');

    const two = browser(c);
    const got = await two.answers.fallbackFor({ goal: GOAL, e: 'a1.t490.1792000000.deadbeef.cafebabe', backupTime: SAVE + 7200 });
    expect((got?.snap as { result: { tag: string } }).result.tag).toBe('browser 1');
  });
});
