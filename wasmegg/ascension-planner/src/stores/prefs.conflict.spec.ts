/**
 * Your choices and Setup against the collector's 409 and "ahead" 400 (red team C4, 6 Nov 2026; collector/prefs.js on
 * spec-redteam-collector), in the store (stores/prefs.ts): a 409 means the collector holds a newer value of the kind
 * (by `at`) and sends it as `latest`: it is put in place the way a load puts a newer saved value in place (applied,
 * kept as the value last synced, its `at` kept here), nothing written back, nothing said. A 400 for an `at` over 10
 * minutes ahead of the collector's clock is sent again ONCE stamped now; failing again it stays pending, never a
 * loop. 200, 429 and the rest as before. The harness is prefs.cloud.spec.ts's; fetch is a fake collector; the clock
 * is fake. Ids: placeholders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useShareNameStore } from '@/stores/shareName';
import { usePrefsStore, PREFS_DEBOUNCE_MS } from '@/stores/prefs';
import { hashID } from '@/lib/storage/db';
import { localAtKey, prefsSig, buildSetupValue, type CloudSetup } from '@/lib/prefsCloud';
import { consentAgreed, consentGivenThisVisit, consentRecord, resetConsents, setConsentAccount } from '@/composables/useConsent';
import { answerYes, defaultCredit, resetStudy, setStudyTick, studyState, studyStep, yesToAll } from '@/composables/useStudy';
import { useShareIdentity } from '@/composables/useShareResult';
import { useEidsStore } from 'lib';

const ID = 'EI0000000000000000';
/** sha256("aaap-follow-v1:EI0000000000000000") (node crypto). */
const KEY = '3726b0602ac082295aa779d59a2d977c10f29a2aa3f7673705e02dc1889dab55';
const ID2 = 'EI1234567890123456';
/** sha256("aaap-follow-v1:EI1234567890123456"). */
const KEY2 = 'c3de0b5e6758891f25111a1dfbd14deccbd3de200a9a93ba1ea30165f847711e';
const SUBMIT = 'https://collector.example/submit';
const PREFS = 'https://collector.example/prefs';
const AT = Date.UTC(2026, 9, 26, 18);
const ID_SHAPED = /EI\d{16}/i;

let mem: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];
let answer: (url: string, method: string, body?: string) => { status: number; body: unknown } | 'offline';
let muted = 0;
const logged: string[] = [];
/** The stores made by a test: disposed after it (the consents are module-level, so a store left from another test
 *  would follow them too). */
const made: { $dispose(): void }[] = [];
const disposeAll = () => {
  for (const s of made.splice(0)) s.$dispose();
};

const st = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

let extraSearch: Record<string, unknown> = {};
const fakeSearch = (submitUrl = SUBMIT, remembered: { at: number } | null = null) =>
  defineStore('chainSearch', () => ({
    ...extraSearch,
    submitUrl,
    scheduleEnabled: ref(false),
    availableFrom: ref(7),
    availableTo: ref(23),
    availableDays: ref([0, 1, 2, 3, 4, 5, 6]),
    timeOff: ref<{ from: string; to: string }[]>([]),
    noPrestige: ref<{ from: string; to: string }[]>([]),
    finalTE: ref(490),
    setupLoaded: ref(true),
    isRunning: ref(false),
    setupRemembered: ref(remembered),
    workers: ref(8),
    setupMuted: () => muted > 0,
  }))();

const cloudPrefs = (prefs: Record<string, unknown>) => () => ({ status: 200, body: { prefs, now: AT } });
const entry = (value: unknown) => ({ value, version: 1, updatedAt: AT });
const puts = () => calls.filter(c => c.method === 'PUT');
const gets = () => calls.filter(c => c.method === 'GET');
const body = (i = 0) => JSON.parse(puts()[i].body!);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(AT);
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { ...st, key: () => null, length: 0 });
  calls = [];
  muted = 0;
  logged.length = 0;
  answer = cloudPrefs({});
  extraSearch = {};
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    const a = answer(url, method, init?.body);
    if (a === 'offline') throw new TypeError('Failed to fetch');
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  });
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
  setActivePinia(createPinia());
  resetConsents(st);
  resetStudy(st);
});

afterEach(() => {
  disposeAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Load the account as the page does (Your setup's store, the consents, then the save's ID), and wait for the read. */
async function loadAccount(id = ID, submitUrl = SUBMIT, remembered: { at: number } | null = null) {
  const search = fakeSearch(submitUrl, remembered);
  const planner = useAutoPlannerStore();
  planner.timezone = 'America/Denver';
  await setConsentAccount(id);
  useInitialStateStore().rawBackup = { eiUserId: id } as never;
  const prefs = usePrefsStore();
  made.push(prefs);
  await vi.waitFor(() => expect(prefs.following || prefs.cloudStatus === 'none').toBe(true));
  return { prefs, search, planner };
}

/** No ID anywhere it could leak: URLs, bodies, the console, storage. */
function expectNoId() {
  for (const c of calls) {
    expect(c.url).not.toMatch(ID_SHAPED);
    expect(c.body ?? '').not.toMatch(ID_SHAPED);
  }
  expect(logged.join('\n')).not.toMatch(ID_SHAPED);
  for (const [k, v] of mem) {
    expect(k).not.toMatch(ID_SHAPED);
    expect(v).not.toMatch(ID_SHAPED);
  }
}

const CLOUD_SETUP: CloudSetup = {
  at: AT - 60_000,
  hours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], scheduleEnabled: true },
  timeOff: [{ from: '2026-12-24', to: '2026-12-26' }],
  noPrestigeDays: [{ from: '2026-11-03', to: '2026-11-04' }],
  targetTE: 300,
  timezone: 'Europe/London',
};

const AHEAD = { error: 'rejected', problems: ["at is more than 10 minutes ahead of the collector clock: check this device's clock"] };
/** The collector's 409 with a stored value. */
const conflict = (value: unknown) => ({ status: 409, body: { error: 'a newer value is stored (its at is higher); use it', latest: { value, version: 9, updatedAt: AT } } });
const keptAt = async (kind: 'consent' | 'setup') => JSON.parse(mem.get(localAtKey(await hashID(ID), kind)) ?? 'null');

describe('409: a newer value is saved online', () => {
  it('a Setup change answered 409 takes the saved Setup: applied, kept with its at, no write-back, no error, one PUT', async () => {
    const { prefs, search, planner } = await loadAccount();
    calls = [];
    const newer = { ...CLOUD_SETUP, at: AT + 60_000 };
    answer = (_u, m) => (m === 'PUT' ? conflict(newer) : cloudPrefs({})());
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(body().value.targetTE).toBe(350);
    // The saved Setup, as a load applies it.
    expect([search.scheduleEnabled, search.availableFrom, search.availableTo, search.availableDays]).toEqual([true, 9, 17, [1, 2, 3, 4, 5]]);
    expect(search.timeOff).toEqual([{ from: '2026-12-24', to: '2026-12-26' }]);
    expect(search.noPrestige).toEqual([{ from: '2026-11-03', to: '2026-11-04' }]);
    expect(search.finalTE).toBe(300);
    expect(planner.timezone).toBe('Europe/London');
    const kept = await keptAt('setup');
    expect(kept.at).toBe(AT + 60_000);
    expect(kept.pending).toBeUndefined();
    expect(kept.sig).toBe(prefsSig(buildSetupValue({ scheduleEnabled: true, fromHour: 9, toHour: 17, days: [1, 2, 3, 4, 5], timeOff: [{ from: '2026-12-24', to: '2026-12-26' }], noPrestige: [{ from: '2026-11-03', to: '2026-11-04' }], finalTE: 300, timezone: 'Europe/London' }, 0)));
    expect(prefs.saves.setup).toEqual({ state: 'saved' });
    // Putting it in place is not a change: nothing goes back up.
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(puts()).toHaveLength(1);
    expectNoId();
  });

  it('a consent change answered 409 takes the saved consent, one PUT', async () => {
    await loadAccount();
    calls = [];
    const newer = { at: AT + 60_000, answeredAt: AT + 60_000, study: 'yes', ticks: { leaderboard: false, sendCsv: true }, credit: 'name', nickname: 'Hen Solo' };
    answer = (_u, m) => (m === 'PUT' ? conflict(newer) : cloudPrefs({})());
    answerYes({ share: true, csv: false, diag: false, checks: true }, 'anon', '');
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentAgreed('sendCsv')).toBe(true);
    expect(useShareNameStore().anonymousFor(ID)).toBe(false);
    expect(useShareNameStore().nameFor(ID)).toBe('Hen Solo');
    const kept = await keptAt('consent');
    expect(kept.at).toBe(AT + 60_000);
    expect(kept.pending).toBeUndefined();
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(puts()).toHaveLength(1);
    expectNoId();
  });

  it('a newer change made here while the PUT was out wins: the saved value is not applied, the change goes up', async () => {
    const { prefs, search } = await loadAccount();
    calls = [];
    answer = (_u, m, b) => {
      if (m !== 'PUT') return cloudPrefs({})();
      if (puts().length > 1) return { status: 200, body: { ok: true, version: 10 } };
      // The player changes the target again while the first PUT is out.
      search.finalTE = 360;
      vi.setSystemTime(Date.now() + 10);
      return conflict({ ...CLOUD_SETUP, at: JSON.parse(b!).value.at + 1 });
    };
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(search.finalTE).toBe(360);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(1).value.targetTE).toBe(360);
    expect(search.finalTE).toBe(360);
    expect(prefs.saves.setup).toEqual({ state: 'saved' });
  });
});

describe("400: this device's `at` is over 10 minutes ahead of the collector's clock", () => {
  it('sent again ONCE stamped now, saved: kept here with that at', async () => {
    const { prefs, search } = await loadAccount();
    calls = [];
    answer = (_u, m) => (m !== 'PUT' ? cloudPrefs({})() : puts().length === 1 ? { status: 400, body: AHEAD } : { status: 200, body: { ok: true, version: 2 } });
    // Changed while this device's clock was an hour fast; corrected before the save goes.
    vi.setSystemTime(AT + 3_600_000);
    search.finalTE = 350;
    vi.setSystemTime(AT);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(0).value.at).toBe(AT + 3_600_000);
    expect(body(1).value).toEqual({ ...body(0).value, at: AT + PREFS_DEBOUNCE_MS });
    const kept = await keptAt('setup');
    expect(kept.at).toBe(AT + PREFS_DEBOUNCE_MS);
    expect(kept.pending).toBeUndefined();
    expect(prefs.saves.setup).toEqual({ state: 'saved' });
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(puts()).toHaveLength(2);
  });

  it('refused again: left pending, two PUTs, never a loop', async () => {
    const { prefs, search } = await loadAccount();
    calls = [];
    answer = (_u, m) => (m === 'PUT' ? { status: 400, body: AHEAD } : cloudPrefs({})());
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(prefs.saves.setup).toEqual({ state: 'failed', why: 'ahead' });
    expect((await keptAt('setup')).pending).toBe(true);
    expect(search.finalTE).toBe(350);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(puts()).toHaveLength(2);
  });

  it('ahead, then 409 on the resend: the saved value is taken, two PUTs', async () => {
    const { search } = await loadAccount();
    calls = [];
    answer = (_u, m) => (m !== 'PUT' ? cloudPrefs({})() : puts().length === 1 ? { status: 400, body: AHEAD } : conflict({ ...CLOUD_SETUP, at: AT + 3_600_000 }));
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(search.finalTE).toBe(300);
    expect((await keptAt('setup')).at).toBe(AT + 3_600_000);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(puts()).toHaveLength(2);
  });
});

describe("today's answers are unchanged", () => {
  it('200 saved (one PUT), 500 failed and pending (one PUT)', async () => {
    const { prefs, search } = await loadAccount();
    calls = [];
    answer = (_u, m) => (m === 'PUT' ? { status: 200, body: { ok: true, version: 2 } } : cloudPrefs({})());
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'saved' });
    expect((await keptAt('setup')).pending).toBeUndefined();
    answer = (_u, m) => (m === 'PUT' ? { status: 500, body: {} } : cloudPrefs({})());
    search.finalTE = 360;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(prefs.saves.setup).toEqual({ state: 'failed', why: 'error' });
    expect((await keptAt('setup')).pending).toBe(true);
    expect(search.finalTE).toBe(360);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(puts()).toHaveLength(2);
  });
});
