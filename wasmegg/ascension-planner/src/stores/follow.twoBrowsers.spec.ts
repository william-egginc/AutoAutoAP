/**
 * TWO BROWSERS, ONE ACCOUNT, THE NEWEST FOLLOW (ux34 item 4: Jordan's Chrome followed 197 218 247 285 313 while his
 * Safari followed 218 247 277 313 for the same account). The followed route is saved per account and goal on the
 * collector (/follow); newer wins by the client's `at` (when Follow was pressed). The collector keeps the LAST PUT as a
 * goal's value and never compares `at` (follow-contract.md), so the client must never let an older `at` stand online
 * while a browser holds a newer one, or the two browsers stay apart for good: the one with the newer follow keeps it
 * (it is newer than what is online) and never writes it up, the other keeps reading the older one.
 *
 * Each browser: its own localStorage and pinia, the same ID's save, one in-memory collector that, like the real one,
 * answers a GET with each goal's last PUT. Fixed clock; placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia, type Pinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { followKey, type CloudValue } from '@/lib/followCloud';

const ID = 'EI1234567890123456';
const SUBMIT = 'https://collector.example/submit';
const T0 = Date.UTC(2026, 9, 26, 15);
const T1 = T0 + 2 * 3600_000;
const ROUTE_A = [218, 247, 277, 313];
const ROUTE_B = [197, 218, 247, 285, 313];
const EGG = 'eggday-2027';

/** The collector's /follow: each goal's last PUT (no `at` comparison), and every request made. */
function collector() {
  const goals = new Map<string, { value: CloudValue; version: number; updatedAt: number }>();
  const calls: { method: string; goal?: string; at?: number }[] = [];
  const f = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'PUT') {
      const b = JSON.parse(init!.body!) as { goal: string; value: CloudValue };
      calls.push({ method, goal: b.goal, at: b.value.at });
      const version = (goals.get(b.goal)?.version ?? 0) + 1;
      goals.set(b.goal, { value: b.value, version, updatedAt: Date.now() });
      return ok({ ok: true, version });
    }
    calls.push({ method });
    return ok({ goals: Object.fromEntries(goals), now: Date.now() });
  };
  return { f, goals, calls, puts: () => calls.filter(c => c.method === 'PUT') };
}
type Collector = ReturnType<typeof collector>;

/** One browser profile: its own storage, kept between its loads (a reload is a fresh pinia over the same storage). */
function profile(c: Collector) {
  const mem = new Map<string, string>();
  let pinia: Pinia | null = null;
  const use = () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: () => null,
      length: 0,
    });
    vi.stubGlobal('fetch', c.f);
    if (pinia) setActivePinia(pinia);
  };
  /** Load the page: the save of ID with the collector; resolves once the saved routes are read (and any write-up). */
  async function load() {
    use();
    pinia = createPinia();
    setActivePinia(pinia);
    defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: { days: [], fromHour: 7, toHour: 1, timezone: 'America/Denver' } }))();
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    const key = await followKey(ID);
    // The key is worked out from the ID (crypto.subtle): flushed, not waited for (vi.waitFor would move the clock).
    for (let i = 0; i < 200 && follows.cloudKey !== key; i++) await new Promise(r => setImmediate(r));
    expect(follows.cloudKey).toBe(key);
    await follows.loadCloud();
    return follows;
  }
  /** The page as it is (no reload): the same pinia and storage. */
  function page() {
    use();
    return useFollowStore();
  }
  return { mem, load, page };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the followed route across two browsers of one account', () => {
  it('browser 1 follows A at t1; browser 2, which followed B at t0, loads: it shows A, and writes nothing', async () => {
    const c = collector();
    const one = profile(c);
    const two = profile(c);
    // t0: browser 2 follows B (saved online).
    let f2 = await two.load();
    await f2.follow(EGG, ROUTE_B, 'answer');
    expect(c.goals.get('eggday2027')?.value.chain).toEqual(ROUTE_B);
    // t1: browser 1 loads (takes B), then follows A.
    vi.setSystemTime(T1);
    const f1 = await one.load();
    expect(f1.followed(EGG)?.chain).toEqual(ROUTE_B);
    await f1.follow(EGG, ROUTE_A, 'typed');
    expect(c.goals.get('eggday2027')?.value).toMatchObject({ chain: ROUTE_A, at: T1 });
    // Browser 2 loads again: A.
    vi.setSystemTime(T1 + 60_000);
    const before = c.puts().length;
    f2 = await two.load();
    expect(f2.followed(EGG)).toMatchObject({ chain: ROUTE_A, at: T1, cloud: true });
    expect(c.puts().length).toBe(before);
  });

  it('a fresh profile (nothing kept) shows the newest saved route on its first load', async () => {
    const c = collector();
    const one = profile(c);
    const f1 = await one.load();
    await f1.follow(EGG, ROUTE_A, 'typed');
    vi.setSystemTime(T1);
    const fresh = profile(c);
    const f3 = await fresh.load();
    expect(f3.followed(EGG)?.chain).toEqual(ROUTE_A);
    expect(c.puts()).toHaveLength(1);
  });

  it('local newer than what is online: the local follow stays AND is written up, so the other browser follows it too', async () => {
    const c = collector();
    const one = profile(c);
    const two = profile(c);
    // Browser 1 follows A at t1 and it is saved; then something writes the older B (t0) over it online (another
    // browser's stale save: the collector keeps the last PUT, whatever its `at`).
    vi.setSystemTime(T1);
    const f1 = await one.load();
    await f1.follow(EGG, ROUTE_A, 'typed');
    c.goals.set('eggday2027', { value: { chain: ROUTE_B, planStart: Math.floor(T0 / 1000), source: 'instant', at: T0 }, version: 9, updatedAt: T1 });
    // Browser 1 loads: A stays (newer), and goes back up with its own `at`.
    vi.setSystemTime(T1 + 60_000);
    const again = await one.load();
    expect(again.followed(EGG)?.chain).toEqual(ROUTE_A);
    expect(c.puts().at(-1)).toEqual({ method: 'PUT', goal: 'eggday2027', at: T1 });
    expect(c.goals.get('eggday2027')?.value).toMatchObject({ chain: ROUTE_A, at: T1 });
    expect(again.notSaved(EGG)).toBe(false);
    // Browser 2 (fresh) loads: A.
    const f2 = await two.load();
    expect(f2.followed(EGG)?.chain).toEqual(ROUTE_A);
    // Once per load: another load with A online writes nothing more.
    const n = c.puts().length;
    await one.load();
    expect(c.puts().length).toBe(n);
  });

  it('a pre-flag follow (no save mark) newer than an older route online is written up as well', async () => {
    const c = collector();
    const one = profile(c);
    const f1 = await one.load();
    // Kept the way the build before the save mark kept it: no `sync`.
    vi.setSystemTime(T1);
    await f1.follow(EGG, ROUTE_A, 'typed');
    const key = [...one.mem.keys()].find(k => k.startsWith('aap-follow:') && !k.includes('gone'))!;
    const kept = JSON.parse(one.mem.get(key)!);
    delete kept[EGG].sync;
    one.mem.set(key, JSON.stringify(kept));
    c.goals.set('eggday2027', { value: { chain: ROUTE_B, planStart: Math.floor(T0 / 1000), source: 'instant', at: T0 }, version: 9, updatedAt: T1 });
    const again = await one.load();
    expect(again.followed(EGG)?.chain).toEqual(ROUTE_A);
    expect(c.goals.get('eggday2027')?.value).toMatchObject({ chain: ROUTE_A, at: T1 });
  });

  it('a stale page\'s "Save it online" never writes its older follow over a newer one online: it follows the newer one', async () => {
    const c = collector();
    const one = profile(c);
    const two = profile(c);
    // Browser 2 (open all along) followed B at t0 while offline: not saved, "Save it online" shown.
    const f2 = await two.load();
    const realF = c.f;
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await f2.follow(EGG, ROUTE_B, 'answer');
    vi.stubGlobal('fetch', realF);
    expect(f2.notSaved(EGG)).toBe(true);
    // Browser 1 follows A at t1 (saved).
    vi.setSystemTime(T1);
    const f1 = await one.load();
    await f1.follow(EGG, ROUTE_A, 'typed');
    const n = c.puts().length;
    // Back on browser 2's page (no reload): "Save it online".
    vi.setSystemTime(T1 + 60_000);
    const page2 = two.page();
    await page2.saveNow(EGG);
    expect(c.puts().length).toBe(n);
    expect(c.goals.get('eggday2027')?.value).toMatchObject({ chain: ROUTE_A, at: T1 });
    expect(page2.followed(EGG)?.chain).toEqual(ROUTE_A);
    expect(page2.notSaved(EGG)).toBe(false);
  });

  it('every Follow press writes a fresh `at`, also when the same route is followed again', async () => {
    const c = collector();
    const f1 = await profile(c).load();
    await f1.follow(EGG, ROUTE_A, 'typed');
    vi.setSystemTime(T1);
    await f1.follow(EGG, ROUTE_A, 'typed');
    expect(c.puts().map(p => p.at)).toEqual([T0, T1]);
  });
});
