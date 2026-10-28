/**
 * "Send my progress every N hours" (Stepping away?'s fourth tick and its interval) with the other Setup prefs online
 * (Jordan, 28 Oct 2026, ux35-d part 2). The contract's Setup value (prefs-contract.md v1) has no field for it, and the
 * collector DROPS unknown fields, so the sync is written but OFF behind `SYNC_PROGRESS_SENDS` (lib/prefsCloud.ts): off,
 * nothing of it goes on the wire or is read. Switched on here only, against a fake collector that keeps the proposed
 * `progressSends: { on, everyHours }` (a future collector), and against one that drops it (today's).
 *
 * Each browser: its own localStorage and pinia, the account's consents and the Stepping away? options reloaded from it
 * (both are module level, as on a real page load); one in-memory collector. Fixed clock; placeholder ID only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { usePrefsStore, PREFS_DEBOUNCE_MS } from '@/stores/prefs';
import {
  SYNC_PROGRESS_SENDS,
  buildSetupValue,
  prefsProblems,
  readSetupValue,
  setupFromCloud,
  type SetupNow,
} from '@/lib/prefsCloud';
import { consentAgreed, consentGivenThisVisit, consentRecord, resetConsents, setConsent, setConsentAccount } from '@/composables/useConsent';
import { resetStudy } from '@/composables/useStudy';
import { stepAwayOptions } from '@/composables/useStepAway';
import { readOptions } from '@/search/stepAway';

const ID = 'EI1234567890123456';
const SUBMIT = 'https://collector.example/submit';
const T0 = Date.UTC(2026, 9, 28, 17);
const ID_SHAPED = /EI\d{16}/i;
/** The Setup fields today's collector keeps (collector/prefs.js readSetup); the rest it drops. */
const TODAY_FIELDS = ['at', 'hours', 'timeOff', 'noPrestigeDays', 'targetTE', 'timezone'];

/** /prefs: each kind's last PUT. `keeps`: 'today' drops unknown Setup fields as the live one does; 'future' keeps all. */
function collector(keeps: 'today' | 'future') {
  const kinds = new Map<string, { value: Record<string, unknown>; version: number; updatedAt: number }>();
  const calls: { method: string; body?: string; url: string }[] = [];
  const f = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, body: init?.body, url });
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'PUT') {
      const b = JSON.parse(init!.body!) as { kind: string; value: Record<string, unknown> };
      const value =
        b.kind === 'setup' && keeps === 'today' ? Object.fromEntries(Object.entries(b.value).filter(([k]) => TODAY_FIELDS.includes(k))) : b.value;
      const version = (kinds.get(b.kind)?.version ?? 0) + 1;
      kinds.set(b.kind, { value, version, updatedAt: Date.now() });
      return ok({ ok: true, version, updatedAt: Date.now() });
    }
    return ok({ prefs: Object.fromEntries(kinds), now: Date.now() });
  };
  return { f, kinds, calls, puts: () => calls.filter(c => c.method === 'PUT') };
}
type Collector = ReturnType<typeof collector>;

const made: { $dispose(): void }[] = [];

/** One browser profile; `load` is a page load over its storage. */
function profile(c: Collector) {
  const mem = new Map<string, string>();
  const st = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  async function load() {
    for (const s of made.splice(0)) s.$dispose();
    vi.stubGlobal('localStorage', { ...st, key: () => null, length: 0 });
    vi.stubGlobal('fetch', c.f);
    resetConsents(st);
    resetStudy(st);
    stepAwayOptions.value = readOptions(st);
    setActivePinia(createPinia());
    const search = defineStore('chainSearch', () => ({
      submitUrl: SUBMIT,
      scheduleEnabled: ref(false),
      availableFrom: ref(7),
      availableTo: ref(23),
      availableDays: ref([0, 1, 2, 3, 4, 5, 6]),
      timeOff: ref<{ from: string; to: string }[]>([]),
      noPrestige: ref<{ from: string; to: string }[]>([]),
      finalTE: ref(490),
      setupLoaded: ref(true),
      isRunning: ref(false),
      setupRemembered: ref(null),
      setupMuted: () => false,
    }))();
    useAutoPlannerStore().timezone = 'America/Denver';
    await setConsentAccount(ID);
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const prefs = usePrefsStore();
    made.push(prefs);
    await vi.waitFor(() => expect(prefs.following || prefs.cloudStatus === 'none').toBe(true));
    return { prefs, search, mem };
  }
  return { load, mem };
}

const setupPuts = (c: Collector) => c.puts().filter(p => JSON.parse(p.body!).kind === 'setup');
const lastSetup = (c: Collector) => JSON.parse(setupPuts(c).at(-1)!.body!).value as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const s of made.splice(0)) s.$dispose();
  SYNC_PROGRESS_SENDS.enabled = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SETUP: SetupNow = {
  scheduleEnabled: false,
  fromHour: 7,
  toHour: 23,
  days: [0, 1, 2, 3, 4, 5, 6],
  timeOff: [],
  noPrestige: [],
  finalTE: 490,
  timezone: 'America/Denver',
  progressSends: { on: true, everyMin: 180 },
};

describe('the flag', () => {
  it('stays off: the contract has no field for it', () => {
    expect(SYNC_PROGRESS_SENDS.enabled).toBe(false);
  });

  it('off: never built, never read', () => {
    expect(buildSetupValue(SETUP, T0)).not.toHaveProperty('progressSends');
    expect(readSetupValue({ at: T0, progressSends: { on: true, everyHours: 3 } })).toEqual({ at: T0 });
  });

  it('on: the proposed shape, both ways; out-of-bounds parts left out', () => {
    SYNC_PROGRESS_SENDS.enabled = true;
    expect(buildSetupValue(SETUP, T0)?.progressSends).toEqual({ on: true, everyHours: 3 });
    expect(buildSetupValue({ ...SETUP, progressSends: { on: false, everyMin: 45 } }, T0)).not.toHaveProperty('progressSends');
    const back = readSetupValue({ at: T0, progressSends: { on: true, everyHours: 6 } })!;
    expect(back.progressSends).toEqual({ on: true, everyHours: 6 });
    expect(setupFromCloud(back).progressSends).toEqual({ on: true, everyMin: 360 });
    for (const bad of [{ on: 'yes', everyHours: 2 }, { on: true, everyHours: 7 }, { on: true, everyHours: 1.5 }, { on: true }, 'x'])
      expect(readSetupValue({ at: T0, progressSends: bad }), JSON.stringify(bad)).toEqual({ at: T0 });
    expect(prefsProblems('setup', { at: T0, progressSends: { on: true, everyHours: 3 } })).toEqual([]);
    expect(prefsProblems('setup', { at: T0, progressSends: { on: true, everyHours: 0 } })).toEqual(['progressSends']);
  });
});

describe('flag off (as shipped)', () => {
  it('ticking Send my progress or changing its hours sends nothing, and a Setup PUT carries no such field', async () => {
    const c = collector('future');
    const a = profile(c);
    const { search } = await a.load();
    setConsent('autoSend', true);
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 240 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 3);
    expect(setupPuts(c)).toEqual([]);
    search.finalTE = 400;
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(setupPuts(c)).toHaveLength(1);
    expect(lastSetup(c)).not.toHaveProperty('progressSends');
  });

  it('a saved value that has it changes nothing here', async () => {
    const c = collector('future');
    c.kinds.set('setup', { value: { at: T0 - 60_000, progressSends: { on: true, everyHours: 5 } }, version: 1, updatedAt: T0 });
    await profile(c).load();
    expect(consentAgreed('autoSend')).toBe(false);
    expect(stepAwayOptions.value.autoSendEveryMin).toBe(60);
  });
});

describe('flag on, two browsers, a collector that keeps the field', () => {
  beforeEach(() => {
    SYNC_PROGRESS_SENDS.enabled = true;
  });

  it('A ticks it and picks 3 hours: one PUT; B, a fresh browser, loads both, remembered and sending nothing by itself', async () => {
    const c = collector('future');
    const A = profile(c);
    const B = profile(c);
    await A.load();
    const changedAt = Date.now();
    setConsent('autoSend', true);
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 180 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS - 1);
    expect(setupPuts(c)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    // One write for the two edits, stamped with the time of the change.
    expect(setupPuts(c)).toHaveLength(1);
    expect(lastSetup(c).progressSends).toEqual({ on: true, everyHours: 3 });
    expect(lastSetup(c).at).toBe(changedAt);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(setupPuts(c)).toHaveLength(1);

    vi.setSystemTime(T0 + 3600_000);
    await B.load();
    expect(consentAgreed('autoSend')).toBe(true);
    expect(consentRecord('autoSend').remember).toBe(true);
    expect(consentGivenThisVisit('autoSend')).toBe(false);
    expect(stepAwayOptions.value.autoSendEveryMin).toBe(180);
    // Applying writes nothing back.
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(setupPuts(c)).toHaveLength(1);
    for (const p of c.calls) expect(`${p.url}${p.body ?? ''}`).not.toMatch(ID_SHAPED);
  });

  it('newer wins: B turns it off later; A, reloaded, takes the off; an older saved value never undoes a newer one here', async () => {
    const c = collector('future');
    const A = profile(c);
    const B = profile(c);
    await A.load();
    setConsent('autoSend', true);
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 120 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    vi.setSystemTime(T0 + 3600_000);
    await B.load();
    expect(consentAgreed('autoSend')).toBe(true);
    setConsent('autoSend', false);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(setupPuts(c)).toHaveLength(2);
    expect(lastSetup(c).progressSends).toEqual({ on: false, everyHours: 2 });

    vi.setSystemTime(T0 + 2 * 3600_000);
    await A.load();
    expect(consentAgreed('autoSend')).toBe(false);
    expect(stepAwayOptions.value.autoSendEveryMin).toBe(120);

    // An older value put online behind B's back (another old tab): B's newer one stands.
    c.kinds.set('setup', { value: { at: T0 - 86_400_000, progressSends: { on: true, everyHours: 6 } }, version: 9, updatedAt: T0 });
    vi.setSystemTime(T0 + 3 * 3600_000);
    await B.load();
    expect(consentAgreed('autoSend')).toBe(false);
    expect(stepAwayOptions.value.autoSendEveryMin).toBe(120);
  });

  it("today's collector drops the field: B gets nothing back (why the flag stays off)", async () => {
    const c = collector('today');
    const A = profile(c);
    const B = profile(c);
    await A.load();
    setConsent('autoSend', true);
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 300 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(setupPuts(c)).toHaveLength(1);
    expect(c.kinds.get('setup')!.value).not.toHaveProperty('progressSends');
    vi.setSystemTime(T0 + 3600_000);
    await B.load();
    expect(consentAgreed('autoSend')).toBe(false);
    expect(stepAwayOptions.value.autoSendEveryMin).toBe(60);
  });

  it('a 429 pauses the next Setup write for its retryAfter (the 30 an hour budget)', async () => {
    const c = collector('future');
    const f = c.f;
    let limited = true;
    const { prefs } = await profile(c).load();
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) =>
      init?.method === 'PUT' && limited
        ? (c.calls.push({ method: 'PUT', body: init.body, url }), { ok: false, status: 429, json: async () => ({ error: 'limit', retryAfter: 600 }) })
        : f(url, init)
    );
    setConsent('autoSend', true);
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(setupPuts(c)).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'failed', why: 'limit' });
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 240 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS * 5);
    expect(setupPuts(c)).toHaveLength(1);
    expect(prefs.saves.setup).toEqual({ state: 'waiting', why: 'limit' });
    limited = false;
    await vi.advanceTimersByTimeAsync(600_000);
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendEveryMin: 360 };
    await vi.advanceTimersByTimeAsync(PREFS_DEBOUNCE_MS);
    expect(setupPuts(c)).toHaveLength(2);
    expect(lastSetup(c).progressSends).toEqual({ on: true, everyHours: 6 });
  });
});
