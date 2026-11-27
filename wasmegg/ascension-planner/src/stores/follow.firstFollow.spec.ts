/**
 * THE FIRST ANSWER BECOMES THE FOLLOW (Jordan, 24 Oct 2026; lib/followPolicy.ts AUTO_FOLLOW_FIRST, stores/follow.ts
 * `autoFollow` and `autoReady`). The instant answer InstantRoute.vue hands over (`instantAutoFollowOf`) becomes the
 * followed route of a goal that follows nothing, saved online with ONE PUT; a second, better answer only asks
 * (BetterRoutePrompt.vue), with no PUT; a route read back from online is never replaced; a read that is still out or
 * failed on this load follows nothing. A fake chain-search store (same id) holds the collector URL; fetch is a fake.
 * Ids: placeholders only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { AUTO_FOLLOW_FIRST, followedLabel, instantAutoFollowOf } from '@/lib/followPolicy';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];
let answer: (url: string, method: string) => Promise<{ status: number; body: unknown } | 'offline'>;

const fakeSearch = (submitUrl: string) => defineStore('chainSearch', () => ({ submitUrl, availability: null }))();

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
  answer = async (_url, method) => (method === 'GET' ? { status: 200, body: { goals: {}, now: Date.now() } } : { status: 200, body: { ok: true, version: 1 } });
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    const a = await answer(url, method);
    if (a === 'offline') throw new TypeError('Failed to fetch');
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  });
  setActivePinia(createPinia());
});

const puts = () => calls.filter(c => c.method === 'PUT');
const now = () => Math.floor(Date.now() / 1000);

/** The instant answer for Fastest to 490 (as the box shows it), as InstantRoute.vue hands it over. */
function instantAnswer(chain: number[], end: number) {
  return instantAutoFollowOf({ route: { chain, end, endTE: chain[chain.length - 1] }, at: Date.now(), planStart: now(), deadline: null, inTime: true, followed: false, goneAt: 0 })!;
}

/** Load the account with a collector (or none); the store is made the way a screen makes it. */
function load(submitUrl = SUBMIT) {
  fakeSearch(submitUrl);
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  return useFollowStore();
}

describe.runIf(AUTO_FOLLOW_FIRST)('the first answer becomes the follow', () => {
  it('first instant answer: followed (auto, from the instant answer) and saved online with exactly one PUT', async () => {
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    const a = instantAnswer([222, 313, 490], now() + 3 * D);
    expect(await follows.autoFollow('fastest-490', a)).toBe(true);
    const f = follows.followed('fastest-490');
    expect(f).toMatchObject({ chain: [222, 313, 490], source: 'instant', from: 'answer', auto: true });
    expect(followedLabel(f)).toBe('from the instant answer');
    expect(puts()).toHaveLength(1);
    const body = JSON.parse(puts()[0].body!);
    expect(body.goal).toBe('race490');
    expect(body.value).toMatchObject({ chain: [222, 313, 490], source: 'instant', endTE: 490 });
    // The same answer again (another screen, a re-render): nothing more.
    expect(await follows.autoFollow('fastest-490', a)).toBe(false);
    await new Promise(r => setTimeout(r, 10));
    expect(puts()).toHaveLength(1);
  });

  it('two screens at once (the instant card and Right now): one follow, one PUT', async () => {
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    const a = instantAnswer([222, 490], now() + 3 * D);
    const done = await Promise.all([follows.autoFollow('fastest-490', a), follows.autoFollow('fastest-490', a)]);
    expect(done.filter(Boolean)).toHaveLength(1);
    expect(puts()).toHaveLength(1);
  });

  it('a second, better answer only asks (This is a better route…): nothing replaced, no PUT', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D));
    expect(puts()).toHaveLength(1);
    const better = instantAnswer([230, 490], now() + 2 * D);
    expect(await follows.autoFollow('fastest-490', { ...better, at: Date.now() + 1000 })).toBe(false);
    expect(follows.followed('fastest-490')?.chain).toEqual([222, 490]);
    const html = await renderHtml(
      BetterRoutePrompt,
      {
        goalKey: 'fastest-490',
        goal: 'fastest',
        deadline: null,
        candidate: { chain: better.chain, end: better.finish, endTE: 490, at: Date.now() + 1000, source: 'instant', planStart: now() },
        zone: 'America/Los_Angeles',
      },
      {},
      [pinia]
    );
    expect(textOf(html)).toMatch(/^This is a better route than the one you're following .*Follow it Keep mine$/);
    await new Promise(r => setTimeout(r, 10));
    expect(puts()).toHaveLength(1);
  });

  it('a route followed on another device (read on load) is kept: no automatic follow, no PUT', async () => {
    const at = Date.now() - 60_000;
    answer = async (_url, method) =>
      method === 'GET'
        ? { status: 200, body: { goals: { race490: { value: { chain: [205, 300, 490], planStart: now(), source: 'manual', at }, version: 2, updatedAt: at } }, now: Date.now() } }
        : { status: 200, body: { ok: true, version: 3 } };
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    expect(follows.followed('fastest-490')).toMatchObject({ chain: [205, 300, 490], cloud: true });
    expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 2 * D))).toBe(false);
    expect(follows.followed('fastest-490')?.chain).toEqual([205, 300, 490]);
    expect(followedLabel(follows.followed('fastest-490'))).toBe('your pick');
    expect(puts()).toEqual([]);
  });

  it('waits for the read: nothing is followed while it is out, then the answer is', async () => {
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    answer = async (_url, method) => {
      if (method === 'GET') await held;
      return method === 'GET' ? { status: 200, body: { goals: {}, now: Date.now() } } : { status: 200, body: { ok: true, version: 1 } };
    };
    const follows = load();
    await vi.waitFor(() => expect(follows.cloudStatus).toBe('loading'));
    expect(follows.autoReady).toBe(false);
    expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D))).toBe(false);
    expect(follows.followed('fastest-490')).toBeNull();
    release();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D))).toBe(true);
    expect(puts()).toHaveLength(1);
  });

  it('a failed read (offline, 429, 500): no automatic follow on this load, even after a later read answers', async () => {
    for (const fail of ['offline', { status: 429, body: { error: 'x', retryAfter: 60 } }, { status: 500, body: {} }] as const) {
      setActivePinia(createPinia());
      calls = [];
      let failing = true;
      answer = async (_url, method) => (method === 'GET' && failing ? fail : { status: 200, body: method === 'GET' ? { goals: {}, now: Date.now() } : { ok: true, version: 1 } });
      const follows = load();
      await vi.waitFor(() => expect(follows.cloudStatus).toBe('unreachable'));
      expect(follows.autoReady).toBe(false);
      expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D))).toBe(false);
      failing = false;
      await follows.loadCloud(true);
      expect(follows.cloudStatus).toBe('ok');
      expect(follows.autoReady).toBe(false);
      expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D))).toBe(false);
      expect(follows.followedGoals()).toEqual([]);
      expect(puts()).toEqual([]);
    }
  });

  it('no collector: ready once the account is hashed; followed in this browser, nothing fetched', async () => {
    const follows = load('');
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    expect(await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D))).toBe(true);
    expect(follows.followed('fastest-490')).toMatchObject({ auto: true, source: 'instant' });
    expect(calls).toEqual([]);
  });

  it('one time per goal: after "Use the planner\'s route" un-followed it, an answer never follows again', async () => {
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    await follows.autoFollow('fastest-490', instantAnswer([222, 490], now() + 3 * D));
    await follows.unfollow('fastest-490');
    expect(await follows.autoFollow('fastest-490', instantAnswer([230, 490], now() + 2 * D))).toBe(false);
    expect(follows.followed('fastest-490')).toBeNull();
    expect(puts()).toHaveLength(1);
    // Egg Day 2027 follows its first answer too; another date waits for a press.
    const d = now() + 30 * D;
    const date = instantAutoFollowOf({ route: { chain: [205, 238], end: d - D, endTE: 238 }, at: Date.now(), planStart: now(), deadline: d, inTime: true, followed: false, goneAt: 0 })!;
    expect(await follows.autoFollow(`date-${d}`, date)).toBe(false);
    expect(follows.followed(`date-${d}`)).toBeNull();
    expect(await follows.autoFollow('fastest-300', date)).toBe(false);
    expect(await follows.autoFollow('eggday-2027', date)).toBe(true);
    expect(follows.followed('eggday-2027')).toMatchObject({ chain: [205, 238], spareSeconds: D, auto: true });
    expect(puts()).toHaveLength(2);
    // A press still follows any goal.
    await follows.follow(`date-${d}`, [205, 238], 'answer');
    expect(followedLabel(follows.followed(`date-${d}`))).toBe('your pick');
  });

  it('a press is still "your pick"; Follow it on the prompt too', async () => {
    const follows = load();
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    await follows.follow('fastest-490', [222, 490], 'answer');
    expect(followedLabel(follows.followed('fastest-490'))).toBe('your pick');
    await follows.followBetter('fastest-490', { id: 'x', words: '', chain: [230, 490], end: now() + D, endTE: 490, source: 'instant', planStart: now() } as never, null);
    expect(followedLabel(follows.followed('fastest-490'))).toBe('your pick');
  });
});
