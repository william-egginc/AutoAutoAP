/**
 * Your choices and Setup saved online, in the store (stores/prefs.ts, lib/prefsCloud.ts): read once as the account
 * loads, applied only when newer, written only on the player's own change (2 s after the last one, the kind that
 * changed, the contract's shape), quiet on every failure, one key per account. A fake chain-search store (same id)
 * holds the collector URL and Your setup; fetch is a fake; the clock is fake. Ids: placeholders only.
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

const fakeSearch = (submitUrl = SUBMIT, remembered: { at: number } | null = null) =>
  defineStore('chainSearch', () => ({
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

describe('loading an account', () => {
  it('GET /prefs?k=<key> once, applies newer consent and Setup, and writes nothing', async () => {
    answer = cloudPrefs({
      consent: entry({ at: AT - 60_000, answeredAt: AT - 90_000, study: 'yes', ticks: { leaderboard: true, sendCsv: false }, credit: 'name', nickname: 'Hen Solo' }),
      setup: entry(CLOUD_SETUP),
    });
    const { prefs, search, planner } = await loadAccount();
    expect(calls).toEqual([{ url: `${PREFS}?k=${KEY}`, method: 'GET', body: undefined }]);
    expect(prefs.cloudStatus).toBe('ok');
    // Setup, both ways of the mapping.
    expect([search.scheduleEnabled, search.availableFrom, search.availableTo, search.availableDays]).toEqual([true, 9, 17, [1, 2, 3, 4, 5]]);
    expect(search.timeOff).toEqual([{ from: '2026-12-24', to: '2026-12-26' }]);
    expect(search.noPrestige).toEqual([{ from: '2026-11-03', to: '2026-11-04' }]);
    expect(search.finalTE).toBe(300);
    expect(planner.timezone).toBe('Europe/London');
    // Consent: answered, the ticks remembered, sending nothing by itself, the credit.
    expect(studyStep.value).toBe('none');
    expect(studyState.rec.answer).toBe('yes');
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(consentRecord('leaderboard').remember).toBe(true);
    expect(consentGivenThisVisit('leaderboard')).toBe(false);
    expect(consentAgreed('sendCsv')).toBe(false);
    expect(useShareNameStore().nameFor(ID)).toBe('Hen Solo');
    expect(useShareNameStore().anonymousFor(ID)).toBe(false);
    // Kept with when, under the hash.
    const h = await hashID(ID);
    expect(JSON.parse(mem.get(localAtKey(h, 'setup'))!).at).toBe(AT - 60_000);
    expect(JSON.parse(mem.get(localAtKey(h, 'consent'))!).at).toBe(AT - 60_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(puts()).toEqual([]);
    expectNoId();
  });

  it('an older saved value is ignored (and not written back)', async () => {
    const h = await hashID(ID);
    mem.set(localAtKey(h, 'consent'), JSON.stringify({ at: AT - 1000, sig: 'x' }));
    answer = cloudPrefs({
      consent: entry({ at: AT - 60_000, study: 'yes', ticks: { leaderboard: true } }),
      setup: entry(CLOUD_SETUP),
    });
    const { search } = await loadAccount(ID, SUBMIT, { at: AT - 1000 });
    expect(search.finalTE).toBe(490);
    expect(search.scheduleEnabled).toBe(false);
    expect(studyStep.value).toBe('ask-box');
    expect(consentAgreed('leaderboard')).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(puts()).toEqual([]);
  });

  it('a consent saved as answered hides Help improve the planner in a new browser, setting nothing else', async () => {
    for (const study of ['no', 'later', 'yes'] as const) {
      disposeAll();
      setActivePinia(createPinia());
      mem.clear();
      resetConsents(st);
      resetStudy(st);
      calls = [];
      answer = cloudPrefs({ consent: entry({ at: AT - 5000, answeredAt: AT - 5000, study }) });
      await loadAccount();
      expect(studyStep.value).toBe('none');
      expect(consentAgreed('leaderboard')).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(puts()).toEqual([]);
    }
    // Nothing saved: asked.
    disposeAll();
    setActivePinia(createPinia());
    mem.clear();
    resetConsents(st);
    resetStudy(st);
    answer = cloudPrefs({});
    await loadAccount();
    expect(studyStep.value).toBe('ask-box');
  });

  it('the same save as this browser\'s last puts back what the page lost (the target isn\'t kept here)', async () => {
    const h = await hashID(ID);
    const sig = prefsSig(buildSetupValue({ scheduleEnabled: true, fromHour: 9, toHour: 17, days: [1, 2, 3, 4, 5], timeOff: CLOUD_SETUP.timeOff!, noPrestige: CLOUD_SETUP.noPrestigeDays!, finalTE: 300, timezone: 'Europe/London' }, AT));
    mem.set(localAtKey(h, 'setup'), JSON.stringify({ at: CLOUD_SETUP.at, sig }));
    answer = cloudPrefs({ setup: entry(CLOUD_SETUP) });
    const { search } = await loadAccount();
    expect(search.finalTE).toBe(300);
    await vi.advanceTimersByTimeAsync(5000);
    expect(puts()).toEqual([]);
  });
});

describe('writing', () => {
  it('a Setup change is PUT once, 2 s after the last edit, in the contract\'s shape', async () => {
    const { search, planner } = await loadAccount();
    calls = [];
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(1000);
    search.scheduleEnabled = true;
    search.availableFrom = 8;
    search.noPrestige = [{ from: '2026-11-10', to: '2026-11-10' }];
    planner.timezone = 'America/Chicago';
    const changedAt = Date.now();
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS - 1);
    expect(puts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(puts()).toHaveLength(1);
    expect(puts()[0].url).toBe(PREFS);
    expect(body()).toEqual({
      k: KEY,
      kind: 'setup',
      value: {
        at: changedAt,
        hours: { start: '08:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6], scheduleEnabled: true },
        timeOff: [],
        noPrestigeDays: [{ from: '2026-11-10', to: '2026-11-10' }],
        targetTE: 350,
        timezone: 'America/Chicago',
      },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(puts()).toHaveLength(1);
    expectNoId();
  });

  it('a consent change (Yes, then a tick) is PUT as the consent kind only', async () => {
    await loadAccount();
    calls = [];
    const t = Date.now();
    answerYes({ share: true, csv: false, diag: false, checks: true }, 'anon', '');
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(body()).toEqual({
      k: KEY,
      kind: 'consent',
      value: {
        at: t,
        answeredAt: t,
        study: 'yes',
        ticks: { leaderboard: true, sendCsv: false, diagnosticsDefault: false, keepSharingChecks: true },
        credit: 'anonymous',
      },
    });
    setStudyTick('csv', true);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(1).value.ticks.sendCsv).toBe(true);
    expectNoId();
  });

  it('nothing for an edit that comes back to the value last synced, nor for a setup set by code', async () => {
    const { search } = await loadAccount();
    calls = [];
    search.finalTE = 350;
    search.finalTE = 490;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    muted++;
    search.finalTE = 400;
    search.timeOff = [{ from: '2027-01-01', to: '2027-01-02' }];
    muted--;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    expect(puts()).toEqual([]);
  });

  it('never the "This computer" settings', async () => {
    const { search } = await loadAccount();
    (search as unknown as { workers: number }).workers = 2;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 2);
    expect(puts()).toEqual([]);
    search.finalTE = 333;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(Object.keys(body().value).sort()).toEqual(['at', 'hours', 'noPrestigeDays', 'targetTE', 'timeOff', 'timezone']);
  });
});

describe('quiet failures', () => {
  it('404: no cloud prefs here; local only, and no more calls on this page load', async () => {
    answer = () => ({ status: 404, body: { error: 'not found' } });
    const { prefs, search } = await loadAccount();
    expect(prefs.cloudStatus).toBe('none');
    search.finalTE = 350;
    answerYes({ share: true, csv: true, diag: false, checks: false }, 'anon', '');
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    // Another account on the same page: still nothing asked.
    await setConsentAccount(ID2);
    useInitialStateStore().rawBackup = { eiUserId: ID2 } as never;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([{ url: `${PREFS}?k=${KEY}`, method: 'GET', body: undefined }]);
  });

  it('429 pauses writes of that kind for retryAfter, then the next change goes', async () => {
    const { prefs, search } = await loadAccount();
    answer = (_u, method) => (method === 'PUT' ? { status: 429, body: { error: 'limit', retryAfter: 120 } } : { status: 200, body: { prefs: {} } });
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'failed', why: 'limit' });
    search.finalTE = 360;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(puts()).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'waiting', why: 'limit' });
    await vi.advanceTimersByTimeAsync(120_000);
    answer = () => ({ status: 200, body: { ok: true, version: 2, updatedAt: AT } });
    search.finalTE = 370;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(1).value.targetTE).toBe(370);
    expect(prefs.saves.setup).toEqual({ state: 'saved' });
  });

  it('offline: quiet, nothing thrown, nothing logged; the change is kept here as not yet saved', async () => {
    answer = () => 'offline';
    const { prefs, search } = await loadAccount();
    expect(prefs.cloudStatus).toBe('unreachable');
    search.finalTE = 350;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'failed', why: 'offline' });
    const kept = JSON.parse(mem.get(localAtKey(await hashID(ID), 'setup'))!);
    expect(kept.pending).toBe(true);
    // Only Pinia's own development notes (a store used outside a component), never ours.
    expect(logged.filter(l => !l.includes('[🍍]'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(puts()).toHaveLength(1);
  });
});

describe('two accounts', () => {
  it('each its own key and its own saved values; a change waiting for the first goes under its key', async () => {
    answer = url =>
      url.endsWith(KEY)
        ? { status: 200, body: { prefs: { setup: entry({ ...CLOUD_SETUP, targetTE: 300 }) } } }
        : url.endsWith(KEY2)
          ? { status: 200, body: { prefs: {} } }
          : { status: 200, body: { ok: true, version: 1, updatedAt: AT } };
    const { search, prefs } = await loadAccount();
    expect(search.finalTE).toBe(300);
    search.finalTE = 310;
    // Switched before the 2 s are up.
    await setConsentAccount(ID2);
    useInitialStateStore().rawBackup = { eiUserId: ID2 } as never;
    await vi.waitFor(() => expect(gets().map(c => c.url)).toEqual([`${PREFS}?k=${KEY}`, `${PREFS}?k=${KEY2}`]));
    expect(puts()).toHaveLength(1);
    expect(body(0)).toMatchObject({ k: KEY, kind: 'setup', value: { targetTE: 310 } });
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    search.finalTE = 420;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(1)).toMatchObject({ k: KEY2, kind: 'setup', value: { targetTE: 420 } });
    const h1 = await hashID(ID);
    const h2 = await hashID(ID2);
    expect(JSON.parse(mem.get(localAtKey(h1, 'setup'))!).sig).toContain('310');
    expect(JSON.parse(mem.get(localAtKey(h2, 'setup'))!).sig).toContain('420');
    expectNoId();
  });
});

describe('"Credit me as": one setting with Before you send (Jordan, 26 Oct 2026)', () => {
  const NAME = 'Williamthe5thc';

  it('"Credit me as" the account\'s own name in the Help box is saved online as that name (it was saved as no credit)', async () => {
    useEidsStore().eids.set(ID, { username: NAME });
    await loadAccount();
    calls = [];
    answerYes({ share: true, csv: true, diag: true, checks: true }, 'name', NAME);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(body().value).toMatchObject({ credit: 'name', nickname: NAME });
    // Then Submit anonymously under Run: saved too.
    useShareIdentity(() => ID).anonymous.value = true;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(2);
    expect(body(1).value.credit).toBe('anonymous');
    expect(body(1).value.nickname).toBeUndefined();
    expectNoId();
  });

  it('"Credit me as" picked under Run (the name following the header\'s) is saved online as that name', async () => {
    useEidsStore().eids.set(ID, { username: NAME });
    await loadAccount();
    calls = [];
    useShareIdentity(() => ID).anonymous.value = false;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(body().value).toMatchObject({ credit: 'name', nickname: NAME });
  });

  it('a saved credit "name" + nickname is the Help box\'s and Before you send\'s, and the send\'s', async () => {
    answer = cloudPrefs({ consent: entry({ at: AT - 60_000, answeredAt: AT - 60_000, study: 'yes', ticks: { leaderboard: true }, credit: 'name', nickname: NAME }) });
    await loadAccount();
    const who = useShareIdentity(() => ID);
    expect(who.anonymous.value).toBe(false);
    expect(who.nickname.value).toBe(NAME);
    expect(defaultCredit(ID)).toBe('name');
    expect(studyState.rec.credit).toBe('name');
  });

  it('a saved "anonymous" is both too, over this browser\'s older "Credit me as"', async () => {
    const h = await hashID(ID);
    mem.set(`aap-share-anon:${h}`, '0');
    mem.set(`aap-share-name:${h}`, NAME);
    answer = cloudPrefs({ consent: entry({ at: AT - 60_000, answeredAt: AT - 60_000, study: 'yes', ticks: { leaderboard: true }, credit: 'anonymous' }) });
    await loadAccount();
    expect(useShareIdentity(() => ID).anonymous.value).toBe(true);
    expect(defaultCredit(ID)).toBe('anon');
    expect(studyState.rec.credit).toBe('anon');
  });

  it('two accounts: one account\'s saved credit is never the other\'s', async () => {
    answer = url =>
      url.endsWith(KEY)
        ? { status: 200, body: { prefs: { consent: entry({ at: AT - 60_000, study: 'yes', ticks: { leaderboard: true }, credit: 'name', nickname: NAME }) } } }
        : { status: 200, body: { prefs: {} } };
    const { prefs } = await loadAccount();
    await setConsentAccount(ID2);
    useInitialStateStore().rawBackup = { eiUserId: ID2 } as never;
    await vi.waitFor(() => expect(gets()).toHaveLength(2));
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    expect(useShareIdentity(() => ID2).anonymous.value).toBe(true);
    expect(useShareNameStore().nameFor(ID2)).toBeUndefined();
    expect(useShareIdentity(() => ID).nickname.value).toBe(NAME);
  });
});

describe('Yes to all and a saved value read late (Jordan, 26 Oct 2026: newer wins)', () => {
  const OLD = { at: AT - 3_600_000, answeredAt: AT - 3_600_000, study: 'yes', ticks: { leaderboard: false, sendCsv: false, diagnosticsDefault: false, keepSharingChecks: false, shareBaseline: false }, credit: 'anonymous' };
  const ON = { leaderboard: true, sendCsv: true, diagnosticsDefault: true, keepSharingChecks: true, shareBaseline: true };

  /** Load the account with the GET held until `release` (the read still on its way when Yes to all is pressed). */
  async function loadHeld(cloud: unknown, keptAt: number | null) {
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body });
      if (method === 'GET') {
        await held;
        return { ok: true, status: 200, json: async () => ({ prefs: cloud ? { consent: entry(cloud) } : {}, now: AT }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, version: 2 }) };
    });
    if (keptAt !== null) mem.set(localAtKey(await hashID(ID), 'consent'), JSON.stringify({ at: keptAt, sig: 'older' }));
    fakeSearch();
    await setConsentAccount(ID);
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const prefs = usePrefsStore();
    made.push(prefs);
    await vi.waitFor(() => expect(gets()).toHaveLength(1));
    return { prefs, release };
  }

  it('pressed while the older saved value is read: the older value never undoes it, and Yes to all goes up', async () => {
    // This browser last synced before that saved value (another browser saved it since).
    const { prefs, release } = await loadHeld(OLD, AT - 7_200_000);
    vi.setSystemTime(AT + 1000);
    yesToAll('anon', '');
    release();
    await vi.waitFor(() => expect(prefs.ready.consent).toBe(true));
    for (const id of Object.keys(ON) as (keyof typeof ON)[]) expect(consentAgreed(id), id).toBe(true);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(body().value.ticks).toEqual(ON);
    expect(body().value.at).toBeGreaterThan(OLD.at);
    expectNoId();
  });

  it('the same with nothing saved online yet: it goes up', async () => {
    const { prefs, release } = await loadHeld(null, null);
    yesToAll('anon', '');
    release();
    await vi.waitFor(() => expect(prefs.ready.consent).toBe(true));
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(puts()).toHaveLength(1);
    expect(body().value.ticks).toEqual(ON);
  });

  it('pressed after the load: stamped now, so the next load of the older value changes nothing', async () => {
    answer = cloudPrefs({ consent: entry(OLD) });
    await loadAccount();
    vi.setSystemTime(AT + 1000);
    yesToAll('anon', '');
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(body().value.ticks).toEqual(ON);
    expect(body().value.at).toBe(AT + 1000);
    // A reload in which the collector still answers the old value (its write lost): this browser's newer choice stands.
    disposeAll();
    setActivePinia(createPinia());
    resetConsents(st);
    resetStudy(st);
    calls = [];
    answer = cloudPrefs({ consent: entry(OLD) });
    await loadAccount();
    for (const id of Object.keys(ON) as (keyof typeof ON)[]) expect(consentAgreed(id), id).toBe(true);
  });

  it('a second account is untouched by the first\'s Yes to all', async () => {
    answer = url => (url.includes('?k=') ? { status: 200, body: { prefs: {} } } : { status: 200, body: { ok: true, version: 1 } });
    const { prefs } = await loadAccount();
    yesToAll('anon', '');
    await setConsentAccount(ID2);
    useInitialStateStore().rawBackup = { eiUserId: ID2 } as never;
    await vi.waitFor(() => expect(gets()).toHaveLength(2));
    await vi.waitFor(() => expect(prefs.following).toBe(true));
    for (const id of ['leaderboard', 'diagnosticsDefault', 'keepSharingChecks', 'shareBaseline'] as const) expect(consentAgreed(id), id).toBe(false);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 2);
    expect(puts().every(c => JSON.parse(c.body!).k === KEY)).toBe(true);
  });
});
