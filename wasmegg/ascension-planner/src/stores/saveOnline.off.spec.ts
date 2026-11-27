/**
 * "Save online" OFF (Jordan, 7 Nov 2026; lib/saveOnline.ts): the followed routes (stores/follow.ts), Setup and sharing
 * choices (stores/prefs.ts) and the instant answers saved online (stores/answers.ts) read NOTHING and write NOTHING:
 * not on load, not on a Follow press, not on a Setup change, not on an answer offered, not for a change still waiting
 * when the switch goes off. Turning it on again reads as a load does. Each browser here has its own storage and pinia;
 * one fake collector logs every call. Placeholder ID only.
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
import type { AnswersFetch } from '@/lib/answersCloud';

const ID = 'EI0000000000000000';
/** sha256("aaap-follow-v1:EI0000000000000000") (stores/follow.cloud.spec.ts). */
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const SUBMIT = 'https://collector.example/submit';
const T0 = Date.UTC(2026, 10, 7, 17);

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];

function fakeFetch(url: string, init?: { method?: string; body?: string }) {
  const method = init?.method ?? 'GET';
  calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
  const body = /\/follow/.test(url)
    ? { goals: {}, now: T0 }
    : /\/prefs/.test(url)
      ? method === 'PUT'
        ? { ok: true, version: 1, updatedAt: T0 }
        : { prefs: {}, now: T0 }
      : { entries: [] };
  return Promise.resolve({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
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

beforeEach(() => {
  mem = new Map();
  calls = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  setAnswersFetch(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSaveOnline();
});

describe('Save online off', () => {
  it('a load reads nothing: no GET of /follow, /prefs or /answers', async () => {
    const { follows, answers } = await page(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await answers.fallbackFor({ goal: 'target 490' })).toBeNull();
    expect(await answers.newestAny()).toBeNull();
    expect(follows.online).toBe(false);
    expect(calls).toEqual([]);
  });

  it('a Follow press, a Setup change and an answer offered send nothing; the route is still followed here', async () => {
    const { search, follows, answers } = await page(false);
    expect(await follows.follow('fastest-490', [200, 300, 490], 'typed')).toBe(true);
    expect(follows.followed('fastest-490')?.chain).toEqual([200, 300, 490]);
    search.finalTE = 400;
    answers.offer({ goal: 'target 490', backupTime: Math.floor(T0 / 1000), snapKey: 's', tables: null, at: T0, snap: {}, pricing: null });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual([]);
    // Right now's "Save it online" is not offered: the route note says Save online is off instead (useNowPage).
    expect(follows.notSaved('fastest-490')).toBe(false);
    expect(follows.offByChoice).toBe(true);
  });

  it('turned off with a Setup change still waiting: the waiting change is not sent', async () => {
    const { search, prefs } = await page(true);
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    calls = [];
    search.finalTE = 400;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS / 2);
    setSaveOnline(false);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
  });

  it('turned on again: the account is read as on a load', async () => {
    await page(false);
    expect(calls).toEqual([]);
    setSaveOnline(true);
    await vi.waitFor(() => expect(calls.map(c => c.url)).toEqual(expect.arrayContaining([`https://collector.example/follow?k=${KEY}`, `https://collector.example/prefs?k=${KEY}`])));
  });
});

describe('Save online on (the default): as before', () => {
  it('a load reads /follow and /prefs once each', async () => {
    const { follows } = await page(true);
    await vi.waitFor(() => expect(follows.cloudStatus).toBe('ok'));
    expect(calls.filter(c => c.url.includes('/follow'))).toHaveLength(1);
    expect(calls.filter(c => c.url.includes('/prefs'))).toHaveLength(1);
    expect(follows.offByChoice).toBe(false);
  });
});
