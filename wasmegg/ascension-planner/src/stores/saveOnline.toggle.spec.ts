/**
 * "Save online" turned off and on again during the page (Reliability's review of spec-syncclient-a, 7 Nov 2026;
 * lib/saveOnline.ts): turning it on reads as a page load does (the stores' one-read-a-minute cache must not stand in
 * for it), a change made while it was off is not undone by an older value saved online, and nothing goes out after
 * it is off (an answer's PUT after its list read, a follow's or a Setup's "ahead" resend). One fake collector logs
 * every call; placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useFollowStore } from '@/stores/follow';
import { usePrefsStore, PREFS_DEBOUNCE_MS } from '@/stores/prefs';
import { setAnswersFetch, useAnswersStore } from '@/stores/answers';
import { resetConsents, setConsentAccount } from '@/composables/useConsent';
import { resetStudy } from '@/composables/useStudy';
import { resetSaveOnline, setSaveOnline } from '@/lib/saveOnline';
import { buildSetupValue } from '@/lib/prefsCloud';
import type { AnswersFetch } from '@/lib/answersCloud';

const ID = 'EI0000000000000000';
/** sha256("aaap-follow-v1:EI0000000000000000") (stores/follow.cloud.spec.ts). */
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const SUBMIT = 'https://collector.example/submit';
const T0 = Date.UTC(2026, 10, 7, 17);

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];
/** What the fake collector answers: the saved Setup (GET /prefs), and hooks run on a call before it answers. */
let server: {
  setup: unknown | null;
  onCall?: (url: string, method: string) => void;
  followPut?: () => { status: number; body: unknown };
  prefsPut?: () => { status: number; body: unknown };
};

const AHEAD = { status: 400, body: { error: 'rejected', problems: ['at is over 10 minutes ahead of the collector clock'] } };

function fakeFetch(url: string, init?: { method?: string; body?: unknown }) {
  const method = init?.method ?? 'GET';
  calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
  server.onCall?.(url, method);
  let status = 200;
  let body: unknown;
  if (/\/follow/.test(url)) {
    if (method === 'PUT' && server.followPut) ({ status, body } = server.followPut());
    else body = method === 'PUT' ? { ok: true, version: 1, updatedAt: Date.now() } : { goals: {}, now: Date.now() };
  } else if (/\/prefs/.test(url)) {
    if (method === 'PUT' && server.prefsPut) ({ status, body } = server.prefsPut());
    else
      body =
        method === 'PUT'
          ? { ok: true, version: 1, updatedAt: Date.now() }
          : { prefs: server.setup ? { setup: { value: server.setup, version: 1, updatedAt: Date.now() } } : {}, now: Date.now() };
  } else body = method === 'PUT' ? { ok: true } : { entries: [] };
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

async function page(on: boolean) {
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  vi.stubGlobal('localStorage', { ...st, key: () => null, length: 0 });
  vi.stubGlobal('fetch', fakeFetch);
  setAnswersFetch(fakeFetch as unknown as AnswersFetch);
  resetConsents(st);
  resetStudy(st);
  resetSaveOnline();
  setSaveOnline(on);
  setActivePinia(createPinia());
  const search = defineStore('chainSearch', () => ({
    submitUrl: SUBMIT,
    availability: { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' },
    scheduleEnabled: ref(false),
    availableFrom: ref(7),
    availableTo: ref(23),
    availableDays: ref([0, 1, 2, 3, 4, 5, 6]),
    timeOff: ref<{ from: string; to: string }[]>([]),
    noPrestige: ref<{ from: string; to: string }[]>([]),
    finalTE: ref(490),
    setupLoaded: ref(true),
    isRunning: ref(false),
    deadlineRunning: ref(false),
    resultSending: ref(false),
    setupRemembered: ref(null),
    setupMuted: () => false,
  }))();
  useAutoPlannerStore().timezone = 'America/Denver';
  await setConsentAccount(ID);
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  const prefs = usePrefsStore();
  const answers = useAnswersStore();
  await vi.waitFor(() => expect(follows.cloudKey).toBe(KEY));
  await vi.waitFor(() => expect(prefs.cloudKey).toBe(KEY));
  return { search, follows, prefs, answers };
}

const gets = (path: string) => calls.filter(c => c.method === 'GET' && c.url.includes(path));
const puts = (path: string) => calls.filter(c => c.method === 'PUT' && c.url.includes(path));

beforeEach(() => {
  mem = new Map();
  calls = [];
  server = { setup: null };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const c of calls) {
    expect(c.url).not.toMatch(/EI\d{16}/i);
    if (c.body) expect(c.body).not.toMatch(/EI\d{16}/i);
  }
  setAnswersFetch(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('turned on again within the minute', () => {
  it('the followed routes are read again, and a route followed while it was off is saved online', async () => {
    const { follows } = await page(true);
    await vi.waitFor(() => expect(follows.cloudStatus).toBe('ok'));
    expect(gets('/follow')).toHaveLength(1);
    setSaveOnline(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await follows.follow('fastest-490', [200, 300, 490], 'typed')).toBe(true);
    expect(puts('/follow')).toEqual([]);
    setSaveOnline(true);
    await vi.waitFor(() => expect(gets('/follow')).toHaveLength(2));
    await vi.waitFor(() => expect(puts('/follow')).toHaveLength(1));
  });

  it('the Setup and choices are read again (not the read from before it went off)', async () => {
    const { prefs } = await page(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    expect(gets('/prefs')).toHaveLength(1);
    setSaveOnline(false);
    await vi.advanceTimersByTimeAsync(5_000);
    setSaveOnline(true);
    await vi.waitFor(() => expect(gets('/prefs')).toHaveLength(2));
  });

  it('a route followed while off and tried by a read in flight when it went off is still sent when it comes back on', async () => {
    // The read in flight as the switch goes off: its "save once per load" must not use up the route's one try.
    const { follows } = await page(false);
    expect(await follows.follow('fastest-490', [200, 300, 490], 'typed')).toBe(true);
    server.onCall = (url, method) => {
      if (method === 'GET' && url.includes('/follow')) {
        server.onCall = undefined;
        setSaveOnline(false);
      }
    };
    setSaveOnline(true);
    await vi.advanceTimersByTimeAsync(5_000);
    // The store has taken the switch-off in (its account watch hashes first: real time, not the fake clock).
    await vi.waitFor(() => expect(follows.autoReady).toBe(true));
    expect(puts('/follow')).toEqual([]);
    vi.setSystemTime(T0 + 120_000);
    setSaveOnline(true);
    await vi.waitFor(() => expect(puts('/follow')).toHaveLength(1));
  });
});

describe('a Setup change made while off', () => {
  it('is not undone by an older Setup saved online when it is turned on again', async () => {
    const { search, prefs } = await page(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    // A change that went up while on: this browser now keeps an `at` for the Setup.
    search.finalTE = 480;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS + 10);
    expect(puts('/prefs')).toHaveLength(1);
    setSaveOnline(false);
    // Another device saves a Setup (target 450) at +30 min; this one, still off, changes its target at +60 min.
    const other = buildSetupValue(
      { scheduleEnabled: false, fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6], timeOff: [], noPrestige: [], finalTE: 450, timezone: 'America/Denver' },
      T0 + 30 * 60_000
    );
    server.setup = other;
    vi.setSystemTime(T0 + 60 * 60_000);
    search.finalTE = 400;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 2);
    vi.setSystemTime(T0 + 61 * 60_000);
    setSaveOnline(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    expect(search.finalTE).toBe(400);
  });

  // DESIGN (left to UI / Jordan): a change made while off, or one still waiting when it went off, is kept here as
  // pending but is not sent when Save online comes back on (as a failed save, it waits for the next change). Flip to
  // `it` once the turn-on load sends a pending change that is newer than the saved one.
  it.fails('goes online when it is turned on again', async () => {
    const { search, prefs } = await page(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    setSaveOnline(false);
    search.finalTE = 400;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 2);
    vi.setSystemTime(T0 + 5 * 60_000);
    setSaveOnline(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 2);
    expect(puts('/prefs')).toHaveLength(1);
  });
});

describe('nothing goes out once it is off', () => {
  it('an answer whose list read is in flight when it goes off is not PUT', async () => {
    const { answers } = await page(true);
    server.onCall = (url, method) => {
      if (method === 'GET' && url.includes('/answers')) setSaveOnline(false);
    };
    answers.offer({ goal: 'target 490', backupTime: Math.floor(T0 / 1000), snapKey: 's', tables: null, at: T0, snap: {}, pricing: null });
    // The debounce's end (answersCloud flush): the list is read first, then the PUT.
    await answers.client.flush();
    expect(gets('/answers')).toHaveLength(1);
    expect(puts('/answers')).toEqual([]);
  });

  it('a follow refused as "ahead" is not sent again after it went off', async () => {
    const { follows } = await page(true);
    await vi.waitFor(() => expect(follows.cloudStatus).toBe('ok'));
    server.followPut = () => {
      setSaveOnline(false);
      return AHEAD;
    };
    await follows.follow('fastest-490', [200, 300, 490], 'typed');
    expect(puts('/follow')).toHaveLength(1);
  });

  it('a Setup change refused as "ahead" is not sent again after it went off', async () => {
    const { search, prefs } = await page(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    server.prefsPut = () => {
      setSaveOnline(false);
      return AHEAD;
    };
    search.finalTE = 400;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    expect(puts('/prefs')).toHaveLength(1);
  });
});
