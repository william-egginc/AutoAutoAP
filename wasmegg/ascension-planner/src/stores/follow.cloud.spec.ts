/**
 * The followed route saved online, in the store (stores/follow.ts, lib/followCloud.ts): read once when an account is
 * loaded, newer wins both ways, written ONLY on a Follow press (or Restore), un-follow kept here, quiet failures, the
 * hour's limit in words, Earlier versions. A fake chain-search store (same id) holds the collector URL; fetch is a fake.
 * Ids: placeholders only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX, readFollows } from '@/lib/follow';
import { hasPlayerId } from '@/lib/followCloud';
import { SIM_VERSION } from '@/search/simVersion';

const ID = 'EI0000000000000000';
/** sha256("aaap-follow-v1:EI0000000000000000") (node crypto). */
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const SUBMIT = 'https://collector.example/submit';
const FOLLOW = 'https://collector.example/follow';
const AT = Date.UTC(2026, 9, 23, 18);
const T = Math.floor(AT / 1000);

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];
let answer: (url: string, method: string, body?: string) => { status: number; body: unknown } | 'offline';

const fakeSearch = (submitUrl: string) =>
  defineStore('chainSearch', () => ({ submitUrl, availability: { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' } }))();

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

/** Load the account (the save's ID) with a collector, and wait for the read. */
async function loadAccount(submitUrl = SUBMIT) {
  fakeSearch(submitUrl);
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.cloudKey).toBe(submitUrl ? KEY : KEY));
  if (submitUrl) await vi.waitFor(() => expect(['ok', 'unreachable']).toContain(follows.cloudStatus));
  return follows;
}
const cloudGoals = (goals: Record<string, unknown>) => () => ({ status: 200, body: { goals, now: AT } });
const puts = () => calls.filter(c => c.method === 'PUT');

describe('loading an account', () => {
  it('reads GET /follow?k=<key> once, writes nothing, and follows a saved route this browser didn\'t have', async () => {
    answer = cloudGoals({ race490: { value: { chain: [222, 313, 490], planStart: T, source: 'exact', at: AT, finish: T + 86400 * 9 }, version: 4, updatedAt: AT } });
    const follows = await loadAccount();
    expect(calls).toEqual([{ url: `${FOLLOW}?k=${KEY}`, method: 'GET', body: undefined }]);
    expect(follows.followed('fastest-490')).toMatchObject({ chain: [222, 313, 490], source: 'exact', cloud: true, at: AT });
    // Kept in this browser's own store for the account (aap-follow:<hash>), so Right now follows it.
    expect(readFollows(await hashID(ID))['fastest-490'].chain).toEqual([222, 313, 490]);
    expect(follows.cloudStatus).toBe('ok');
  });

  it('newer wins: the saved route replaces an older one here', async () => {
    mem.set(`${FOLLOW_PREFIX}${await hashID(ID)}`, JSON.stringify({ 'fastest-490': { chain: [200, 490], from: 'typed', at: AT - 60_000 } }));
    answer = cloudGoals({ race490: { value: { chain: [222, 490], planStart: T, source: 'fast', at: AT }, version: 1, updatedAt: AT } });
    const follows = await loadAccount();
    expect(follows.followed('fastest-490')?.chain).toEqual([222, 490]);
    expect(puts()).toEqual([]);
  });

  it('newer wins the other way: a newer route here stays, and is NOT written back', async () => {
    mem.set(`${FOLLOW_PREFIX}${await hashID(ID)}`, JSON.stringify({ 'fastest-490': { chain: [200, 490], from: 'typed', at: AT + 60_000 } }));
    answer = cloudGoals({ race490: { value: { chain: [222, 490], planStart: T, source: 'fast', at: AT }, version: 1, updatedAt: AT } });
    const follows = await loadAccount();
    expect(follows.followed('fastest-490')?.chain).toEqual([200, 490]);
    expect(puts()).toEqual([]);
  });

  it('a failure (offline, 429, 500) is quiet: nothing changes, Setup says it couldn\'t reach it', async () => {
    for (const a of ['offline', { status: 429, body: { error: 'x', retryAfter: 60 } }, { status: 500, body: {} }] as const) {
      setActivePinia(createPinia());
      calls = [];
      answer = () => a;
      const follows = await loadAccount();
      expect(follows.cloudStatus).toBe('unreachable');
      expect(follows.followedGoals()).toEqual([]);
      expect(puts()).toEqual([]);
    }
  });

  it('exactly one GET per account load, however often the store is touched or read again', async () => {
    const follows = await loadAccount();
    for (let i = 0; i < 5; i++) {
      useFollowStore();
      follows.followedGoals();
      void follows.loadCloud();
    }
    await follows.loadCloud();
    // The same account set again (a tab opened, the save reloaded): still the one read.
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    await new Promise(r => setTimeout(r, 20));
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(1);
    // Another account reads its own; forcing reads again.
    useInitialStateStore().rawBackup = { eiUserId: 'EI1234567890123456' } as never;
    await vi.waitFor(() => expect(calls.filter(c => c.method === 'GET')).toHaveLength(2));
    await follows.loadCloud(true);
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(3);
  });

  it('two reads at once share one request', async () => {
    fakeSearch(SUBMIT);
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.cloudKey).toBe(KEY));
    await Promise.all([follows.loadCloud(), follows.loadCloud(), follows.loadCloud()]);
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(1);
  });

  it('without a collector nothing is fetched', async () => {
    fakeSearch('');
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.partition).not.toBe(''));
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect(calls).toEqual([]);
    expect(follows.online).toBe(false);
  });
});

describe('a Follow press', () => {
  it('is the only write: one PUT /follow {k, goal, value} with the route and its summary, never the ID', async () => {
    const follows = await loadAccount();
    expect(puts()).toEqual([]);
    useInitialStateStore().lastBackupTime = T - 3600;
    await follows.follow('eggday-2027', [200, 260, 300], 'count', "Bob's run", { finish: T + 5 * 86400, endTE: 300, spareSeconds: 7200, planStart: T });
    expect(puts().length).toBe(1);
    const p = puts()[0];
    expect(p.url).toBe(FOLLOW);
    const body = JSON.parse(p.body!);
    expect(body.k).toBe(KEY);
    expect(body.goal).toBe('eggday2027');
    expect(body.value).toMatchObject({
      chain: [200, 260, 300],
      planStart: T,
      source: 'instant',
      finish: T + 5 * 86400,
      endTE: 300,
      spareSeconds: 7200,
      hours: { start: '07:00', end: '01:00', timezone: 'America/Denver' },
      saveTime: T - 3600,
      simVersion: SIM_VERSION,
    });
    expect(typeof body.value.at).toBe('number');
    expect(p.body).not.toContain('Bob');
    for (const c of calls) {
      expect(hasPlayerId(c.url)).toBe(false);
      expect(hasPlayerId(c.body ?? '')).toBe(false);
    }
    expect(follows.saveState('eggday-2027')?.state).toBe('saved');
  });

  it('un-following writes nothing online, and the older saved route doesn\'t come back on the next load', async () => {
    let follows = await loadAccount();
    await follows.follow('fastest-490', [222, 490], 'answer');
    const saved = JSON.parse(puts()[0].body!).value;
    await follows.unfollow('fastest-490');
    expect(puts().length).toBe(1);
    // The next visit: the collector still has it.
    setActivePinia(createPinia());
    calls = [];
    answer = cloudGoals({ race490: { value: saved, version: 1, updatedAt: AT } });
    follows = await loadAccount();
    expect(follows.followed('fastest-490')).toBeNull();
  });

  it('the hour\'s limit (429), too big (413) and offline are said plainly; the route stays followed here', async () => {
    const follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? { status: 429, body: { error: 'x', retryAfter: 900 } } : { status: 200, body: { goals: {} } });
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect(follows.saveState('fastest-490')).toMatchObject({ state: 'failed', why: 'limit', words: 'Too many changes this hour. Try again later.' });
    expect(follows.followed('fastest-490')?.chain).toEqual([222, 490]);
    answer = (_u, m) => (m === 'PUT' ? { status: 413, body: { error: 'too big' } } : { status: 200, body: { goals: {} } });
    await follows.follow('fastest-490', [200, 490], 'answer');
    expect(follows.saveState('fastest-490')?.why).toBe('big');
    answer = () => 'offline';
    await follows.follow('fastest-490', [210, 490], 'answer');
    expect(follows.saveState('fastest-490')?.words).toBe("Couldn't save the route online right now; it is still followed in this browser.");
    expect(follows.followed('fastest-490')?.chain).toEqual([210, 490]);
  });
});

describe('Earlier versions and Restore', () => {
  const versions = [3, 2, 1].map(n => ({ version: n, updatedAt: AT + n, value: { chain: [200 + n, 490], planStart: T, source: 'fast', at: AT - n * 1000 } }));

  it('lists the last versions (GET /follow/history) and Restore follows one as a new save', async () => {
    const follows = await loadAccount();
    answer = (url, m) =>
      m === 'PUT' ? { status: 200, body: { ok: true, version: 4 } } : url.includes('/history') ? { status: 200, body: { versions } } : { status: 200, body: { goals: {} } };
    const list = await follows.earlierVersions('fastest-490');
    expect(calls.at(-1)!.url).toBe(`${FOLLOW}/history?k=${KEY}&goal=race490`);
    expect(list!.map(v => v.version)).toEqual([3, 2, 1]);
    const before = Date.now();
    const r = await follows.restore('fastest-490', list![2].value);
    expect(r.state).toBe('saved');
    const body = JSON.parse(puts().at(-1)!.body!);
    expect(body.value.chain).toEqual([201, 490]);
    expect(body.value.source).toBe('fast');
    expect(body.value.at).toBeGreaterThanOrEqual(before); // a fresh `at`: the newest
    expect(follows.followed('fastest-490')?.chain).toEqual([201, 490]);
  });

  it('Restore at the hour\'s limit says so', async () => {
    const follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? { status: 429, body: { error: 'x', retryAfter: 900 } } : { status: 200, body: { goals: {} } });
    const r = await follows.restore('fastest-490', versions[0].value as never);
    expect(r.words).toBe('Too many changes this hour. Try again later.');
  });

  it('history that can\'t be read is null (the list says it couldn\'t reach it)', async () => {
    const follows = await loadAccount();
    answer = () => 'offline';
    expect(await follows.earlierVersions('fastest-490')).toBeNull();
  });
});

describe("a Follow press that didn't get online (23 Oct 2026)", () => {
  const reload = async () => {
    setActivePinia(createPinia());
    calls = [];
    return loadAccount();
  };
  const kept = async () => readFollows(await hashID(ID))['fastest-490'];
  const okPut = (goals: Record<string, unknown> = {}) => (_u: string, m: string) =>
    m === 'PUT' ? { status: 200, body: { ok: true, version: 1 } } : { status: 200, body: { goals, now: AT } };

  it('offline, then the next load saves it ONCE (after its read); the load after that writes nothing', async () => {
    let follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? 'offline' : { status: 200, body: { goals: {} } });
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect((await kept()).sync).toBe('pending');
    answer = okPut();
    follows = await reload();
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(calls.map(c => c.method)).toEqual(['GET', 'PUT']);
    expect(JSON.parse(puts()[0].body!).value).toMatchObject({ chain: [222, 490], source: 'instant' });
    expect(JSON.parse(puts()[0].body!).value.sync).toBeUndefined();
    await vi.waitFor(async () => expect((await kept()).sync).toBe('synced'));
    // Quiet: nothing said under Right now for the retry's own failure or success words.
    expect(follows.saveState('fastest-490')?.words ?? '').toBe('');
    await reload();
    await new Promise(r => setTimeout(r, 20));
    expect(puts()).toEqual([]);
  });

  it('a retry that fails again (429, 500) waits for the next load: one PUT per load, never a loop', async () => {
    let follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? { status: 500, body: {} } : { status: 200, body: { goals: {} } });
    await follows.follow('fastest-490', [222, 490], 'answer');
    answer = (_u, m) => (m === 'PUT' ? { status: 429, body: { retryAfter: 60 } } : { status: 200, body: { goals: {} } });
    follows = await reload();
    await vi.waitFor(() => expect(puts().length).toBe(1));
    await follows.loadCloud(true);
    await new Promise(r => setTimeout(r, 20));
    expect(puts().length).toBe(1);
    expect((await kept()).sync).toBe('pending');
    answer = okPut();
    await reload();
    await vi.waitFor(async () => expect((await kept()).sync).toBe('synced'));
    expect(puts().length).toBe(1);
  });

  it('something newer saved online: no PUT, the newer one is followed', async () => {
    const follows = await loadAccount();
    answer = (_u, m) => (m === 'PUT' ? 'offline' : { status: 200, body: { goals: {} } });
    await follows.follow('fastest-490', [222, 490], 'answer');
    const at = (await kept()).at;
    answer = okPut({ race490: { value: { chain: [230, 490], planStart: T, source: 'fast', at: at + 1000 }, version: 2, updatedAt: AT } });
    const again = await reload();
    await new Promise(r => setTimeout(r, 20));
    expect(puts()).toEqual([]);
    expect(again.followed('fastest-490')?.chain).toEqual([230, 490]);
  });

  it('refused (400, 413): marked unsyncable and never tried again', async () => {
    for (const status of [400, 413]) {
      mem.clear();
      setActivePinia(createPinia());
      calls = [];
      const follows = await loadAccount();
      answer = (_u, m) => (m === 'PUT' ? { status, body: { error: 'x' } } : { status: 200, body: { goals: {} } });
      await follows.follow('fastest-490', [222, 490], 'answer');
      expect((await kept()).sync).toBe('unsyncable');
      answer = okPut();
      await reload();
      await new Promise(r => setTimeout(r, 20));
      expect(puts()).toEqual([]);
    }
  });

  it('a follow kept before the flag: saved once when NOTHING is saved online for its goal', async () => {
    mem.set(`${FOLLOW_PREFIX}${await hashID(ID)}`, JSON.stringify({ 'fastest-490': { chain: [200, 490], from: 'typed', at: AT + 60_000 } }));
    answer = okPut();
    await loadAccount();
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(JSON.parse(puts()[0].body!).value).toMatchObject({ chain: [200, 490], at: AT + 60_000 });
  });
});
