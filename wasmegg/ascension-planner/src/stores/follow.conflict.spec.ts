/**
 * The followed route against the collector's 409 and "ahead" 400 (red team C4, 6 Nov 2026; collector/follow.js on
 * spec-redteam-collector), in the store (stores/follow.ts): a 409 means the collector holds a newer route for the goal
 * (by `at`) and sends it as `latest`: it is followed here through the same merge as a read (`mergeCloud`), kept in
 * this browser, nothing written back, nothing said. A 400 for an `at` over 10 minutes ahead of the collector's clock is
 * sent again ONCE stamped now; failing again it stays pending, never a loop. 200, 429 and 5xx as before. A fake
 * chain-search store holds the collector URL; fetch is a fake collector. Ids: placeholders only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX, readFollows } from '@/lib/follow';
import { LIMIT_WORDS } from '@/lib/followCloud';

const ID = 'EI0000000000000000';
/** sha256("aaap-follow-v1:EI0000000000000000") (node crypto). */
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const SUBMIT = 'https://collector.example/submit';
const AT = Date.UTC(2026, 10, 6, 18);
const T = Math.floor(AT / 1000);
const AHEAD = {
  error: 'rejected',
  problems: ["at is more than 10 minutes ahead of the collector clock: check this device's clock"],
};

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];
let answer: (url: string, method: string, body?: string) => { status: number; body: unknown } | 'offline';

const fakeSearch = (submitUrl: string) =>
  defineStore('chainSearch', () => ({
    submitUrl,
    availability: { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' },
  }))();

beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  calls = [];
  answer = () => ({ status: 200, body: { goals: {}, now: AT } });
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    const a = answer(url, method, init?.body);
    if (a === 'offline') throw new TypeError('Failed to fetch');
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  });
  setActivePinia(createPinia());
});

async function loadAccount() {
  fakeSearch(SUBMIT);
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.cloudKey).toBe(KEY));
  await vi.waitFor(() => expect(['ok', 'unreachable']).toContain(follows.cloudStatus));
  return follows;
}
const reload = async () => {
  setActivePinia(createPinia());
  calls = [];
  return loadAccount();
};
const puts = () => calls.filter(c => c.method === 'PUT');
const sent = (i: number) => JSON.parse(puts()[i].body!);
const kept = async () => readFollows(await hashID(ID))['fastest-490'];
const settle = () => new Promise(r => setTimeout(r, 30));
/** A follow kept in this browser that never got online (as a press offline leaves it). */
const keepPending = async (at: number) =>
  mem.set(
    `${FOLLOW_PREFIX}${await hashID(ID)}`,
    JSON.stringify({
      'fastest-490': { chain: [222, 490], from: 'answer', at, source: 'instant', planStart: T, sync: 'pending' },
    })
  );
const empty = { status: 200, body: { goals: {}, now: AT } };
/** The collector's 409 for a PUT: the stored route, its `at` a minute after the one sent. */
const newerThan = (body: string | undefined) => {
  const at = JSON.parse(body!).value.at + 60_000;
  return {
    status: 409,
    body: {
      error: 'a newer value is stored (its at is higher); use it',
      latest: {
        value: { chain: [230, 313, 490], planStart: T, source: 'exact', at, finish: T + 86400 * 9 },
        version: 6,
        updatedAt: AT,
      },
    },
  };
};

describe('409: a newer route is saved online', () => {
  it('a Follow press answered 409 follows the saved route: kept here, no write-back, no error, one PUT', async () => {
    const follows = await loadAccount();
    let stored: unknown = null;
    answer = (_u, m, b) => {
      if (m !== 'PUT') return { status: 200, body: { goals: stored ? { race490: stored } : {}, now: AT } };
      const r = newerThan(b);
      stored = r.body.latest;
      return r;
    };
    const v0 = follows.version;
    expect(await follows.follow('fastest-490', [222, 490], 'answer')).toBe(true);
    expect(puts().length).toBe(1);
    expect(follows.followed('fastest-490')).toMatchObject({
      chain: [230, 313, 490],
      source: 'exact',
      cloud: true,
      finish: T + 86400 * 9,
    });
    expect(follows.version).toBeGreaterThan(v0 + 1);
    // Kept in this browser as a read would keep it.
    expect(await kept()).toMatchObject({ chain: [230, 313, 490], cloud: true });
    expect((await kept()).sync).toBeUndefined();
    // Nothing said, nothing "not saved".
    expect(follows.saveState('fastest-490')).toEqual({ state: 'saved', words: '' });
    expect(follows.notSaved('fastest-490')).toBe(false);
    await settle();
    expect(puts().length).toBe(1);
    // The next load reads the same route back and writes nothing.
    const again = await reload();
    await settle();
    expect(puts()).toEqual([]);
    expect(again.followed('fastest-490')?.chain).toEqual([230, 313, 490]);
  });

  it("a pending follow retried on the load (syncPending) answered 409: the newer one is followed, this browser's dropped, one PUT", async () => {
    await keepPending(AT);
    answer = (_u, m, b) => (m === 'PUT' ? newerThan(b) : empty);
    const follows = await loadAccount();
    await vi.waitFor(() => expect(puts().length).toBe(1));
    await vi.waitFor(async () => expect((await kept()).chain).toEqual([230, 313, 490]));
    expect(await kept()).toMatchObject({ cloud: true, at: AT + 60_000 });
    expect((await kept()).sync).toBeUndefined();
    expect(follows.followed('fastest-490')?.chain).toEqual([230, 313, 490]);
    expect(follows.notSaved('fastest-490')).toBe(false);
    // A retry is quiet either way.
    expect(follows.saveState('fastest-490')?.words ?? '').toBe('');
    await follows.loadCloud(true);
    await settle();
    expect(puts().length).toBe(1);
  });
});

describe("400: this device's `at` is over 10 minutes ahead of the collector's clock", () => {
  it('sent again ONCE stamped now, saved: the follow here takes that `at`, the next load writes nothing', async () => {
    const fast = Date.now() + 3_600_000;
    await keepPending(fast);
    answer = (_u, m) =>
      m !== 'PUT'
        ? empty
        : puts().length === 1
          ? { status: 400, body: AHEAD }
          : { status: 200, body: { ok: true, version: 1 } };
    const before = Date.now();
    const follows = await loadAccount();
    await vi.waitFor(async () => expect((await kept()).sync).toBe('synced'));
    expect(puts().length).toBe(2);
    expect(sent(0).value.at).toBe(fast);
    const resent = sent(1).value.at;
    expect(resent).toBeGreaterThanOrEqual(before);
    expect(resent).toBeLessThanOrEqual(Date.now());
    expect(sent(1).value).toEqual({ ...sent(0).value, at: resent });
    expect((await kept()).at).toBe(resent);
    expect(follows.notSaved('fastest-490')).toBe(false);
    const saved = sent(1).value;
    answer = () => ({
      status: 200,
      body: { goals: { race490: { value: saved, version: 1, updatedAt: AT } }, now: AT },
    });
    await reload();
    await settle();
    expect(puts()).toEqual([]);
  });

  it('refused again: left pending (not refused for good), two PUTs, no loop on another read', async () => {
    await keepPending(Date.now() + 3_600_000);
    answer = (_u, m) => (m === 'PUT' ? { status: 400, body: AHEAD } : empty);
    const follows = await loadAccount();
    await vi.waitFor(() => expect(puts().length).toBe(2));
    await settle();
    expect((await kept()).sync).toBe('pending');
    expect(follows.notSaved('fastest-490')).toBe(true);
    await follows.loadCloud(true);
    await settle();
    expect(puts().length).toBe(2);
  });

  it('a Follow press refused as ahead twice: two PUTs, still followed here, pending', async () => {
    const follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? { status: 400, body: AHEAD } : empty);
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect(puts().length).toBe(2);
    expect(follows.followed('fastest-490')?.chain).toEqual([222, 490]);
    expect((await kept()).sync).toBe('pending');
    expect(follows.saveState('fastest-490')).toMatchObject({ state: 'failed', why: 'ahead' });
    await settle();
    expect(puts().length).toBe(2);
  });

  it('ahead, then 409 on the resend: the newer saved route is followed, two PUTs', async () => {
    await keepPending(Date.now() + 3_600_000);
    answer = (_u, m, b) => (m !== 'PUT' ? empty : puts().length === 1 ? { status: 400, body: AHEAD } : newerThan(b));
    const follows = await loadAccount();
    await vi.waitFor(async () => expect((await kept()).chain).toEqual([230, 313, 490]));
    expect(puts().length).toBe(2);
    expect((await kept()).cloud).toBe(true);
    expect(follows.notSaved('fastest-490')).toBe(false);
    await settle();
    expect(puts().length).toBe(2);
  });
});

describe("today's answers are unchanged", () => {
  it('200 saved, 429 pending with the limit words, 500 pending: one PUT each', async () => {
    const follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? { status: 200, body: { ok: true, version: 1 } } : empty);
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect(puts().length).toBe(1);
    expect((await kept()).sync).toBe('synced');
    expect(follows.saveState('fastest-490')).toEqual({ state: 'saved', words: '' });

    answer = (_u, m) => (m === 'PUT' ? { status: 429, body: { error: 'too many', retryAfter: 3600 } } : empty);
    await follows.follow('fastest-490', [230, 490], 'answer');
    expect(puts().length).toBe(2);
    expect((await kept()).sync).toBe('pending');
    expect(follows.saveState('fastest-490')).toEqual({ state: 'failed', why: 'limit', words: LIMIT_WORDS });

    answer = (_u, m) => (m === 'PUT' ? { status: 500, body: {} } : empty);
    await follows.follow('fastest-490', [240, 490], 'answer');
    expect(puts().length).toBe(3);
    expect((await kept()).sync).toBe('pending');
    expect(follows.saveState('fastest-490')).toMatchObject({ state: 'failed', why: 'error' });
    expect(follows.followed('fastest-490')?.chain).toEqual([240, 490]);
  });
});
