/**
 * Your choices and Setup saved online, the pure half (lib/prefsCloud.ts, contract aaap-tools/notes/prefs-contract.md):
 * the key, the values both ways, the contract's checks, the calls with a fake fetch. Ids: placeholders only.
 */
import { describe, expect, it } from 'vitest';
import {
  PREFS_MAX_VALUE_BYTES,
  buildConsentValue,
  buildSetupValue,
  cleanNickname,
  consentFromCloud,
  getPrefs,
  prefsKey,
  prefsProblems,
  prefsSig,
  prefsUrlOf,
  putPrefs,
  readConsentValue,
  readSetupValue,
  scheduleFromCloud,
  scheduleToCloud,
  setupFromCloud,
  type PrefsFetch,
  type SetupNow,
} from './prefsCloud';

const ID = 'EI1234567890123456';
/** sha256("aaap-follow-v1:EI1234567890123456") (node crypto). */
const KEY = 'c3de0b5e6758891f25111a1dfbd14deccbd3de200a9a93ba1ea30165f847711e';
const AT = Date.UTC(2026, 9, 26, 18);
const URL_ = 'https://collector.example/prefs';
const ID_SHAPED = /EI\d{16}/i;

const setup = (o: Partial<SetupNow> = {}): SetupNow => ({
  scheduleEnabled: true,
  fromHour: 7,
  toHour: 23,
  days: [1, 2, 3, 4, 5],
  timeOff: [{ from: '2026-12-24', to: '2026-12-26' }],
  noPrestige: [{ from: '2026-11-03', to: '2026-11-03' }],
  finalTE: 350,
  timezone: 'America/Denver',
  ...o,
});

function fakeFetch(answer: { status: number; body?: unknown } | 'offline') {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const f: PrefsFetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (answer === 'offline') throw new TypeError('Failed to fetch');
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  return { f, calls };
}

describe('the key and the URL', () => {
  it('is the follow key: SHA-256 of "aaap-follow-v1:" + the ID in upper case', async () => {
    expect(await prefsKey(ID)).toBe(KEY);
    expect(await prefsKey(` ${ID.toLowerCase()} `)).toBe(KEY);
    expect(await prefsKey('')).toBe('');
  });

  it('/prefs on the collector of the submit URL', () => {
    expect(prefsUrlOf('https://collector.example/submit')).toBe(URL_);
    expect(prefsUrlOf('https://collector.example/')).toBe(URL_);
    expect(prefsUrlOf('')).toBe('');
  });
});

describe('the Setup value', () => {
  it('has the contract shape, days inside hours and scheduleEnabled beside it', () => {
    expect(buildSetupValue(setup(), AT)).toEqual({
      at: AT,
      hours: { start: '07:00', end: '23:00', days: [1, 2, 3, 4, 5] },
      scheduleEnabled: true,
      timeOff: [{ from: '2026-12-24', to: '2026-12-26' }],
      noPrestigeDays: [{ from: '2026-11-03', to: '2026-11-03' }],
      targetTE: 350,
      timezone: 'America/Denver',
    });
    expect(prefsProblems('setup', buildSetupValue(setup(), AT))).toEqual([]);
  });

  it('awake hours off: hours null and scheduleEnabled false; hour 24 is "00:00"', () => {
    expect(scheduleToCloud(setup({ scheduleEnabled: false }))).toEqual({ hours: null, scheduleEnabled: false });
    expect(scheduleToCloud(setup({ fromHour: 18, toHour: 24, days: [6, 0, 0, 9] }))).toEqual({
      hours: { start: '18:00', end: '00:00', days: [0, 6] },
      scheduleEnabled: true,
    });
  });

  it('maps back: hours, days, on and off; a collector that dropped scheduleEnabled still reads on and off', () => {
    expect(scheduleFromCloud({ hours: { start: '09:30', end: '17:00', days: [0, 6] }, scheduleEnabled: true })).toEqual({
      scheduleEnabled: true,
      fromHour: 9,
      toHour: 17,
      days: [0, 6],
    });
    expect(scheduleFromCloud({ hours: null })).toEqual({ scheduleEnabled: false });
    expect(scheduleFromCloud({ hours: { start: '07:00', end: '23:00' } })).toEqual({ scheduleEnabled: true, fromHour: 7, toHour: 23 });
    expect(scheduleFromCloud({})).toEqual({});
  });

  it('round trip: what is built reads back to the same setup', () => {
    for (const s of [setup(), setup({ scheduleEnabled: false, timeOff: [], noPrestige: [] }), setup({ finalTE: 490, timezone: 'Europe/London' })]) {
      const v = readSetupValue(JSON.parse(JSON.stringify(buildSetupValue(s, AT))))!;
      const back = setupFromCloud(v);
      expect(back.timeOff).toEqual(s.timeOff);
      expect(back.noPrestige).toEqual(s.noPrestige);
      expect(back.finalTE).toBe(s.finalTE);
      expect(back.timezone).toBe(s.timezone);
      expect(back.scheduleEnabled).toBe(s.scheduleEnabled);
      if (s.scheduleEnabled) expect([back.fromHour, back.toHour, back.days]).toEqual([s.fromHour, s.toHour, s.days]);
    }
  });

  it('leaves out what is out of bounds: a half-typed row, a 17th stretch, a target over 490, a bad zone', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ from: `2027-01-${String(i + 1).padStart(2, '0')}`, to: `2027-01-${String(i + 1).padStart(2, '0')}` }));
    const v = buildSetupValue(setup({ timeOff: [{ from: '2026-12-24', to: '' }, ...many], finalTE: 600, timezone: 'Not a zone!' }), AT)!;
    expect(v.timeOff).toHaveLength(16);
    expect(v.timeOff![0]).toEqual({ from: '2027-01-01', to: '2027-01-01' });
    expect(v.targetTE).toBeNull();
    expect(v).not.toHaveProperty('timezone');
  });

  it('never holds the "This computer" settings', () => {
    const s = { ...setup(), workers: 8, memoryCap: 4096, holdShifts: true, firstAscension: 'fresh' } as SetupNow;
    expect(Object.keys(buildSetupValue(s, AT)!).sort()).toEqual(['at', 'hours', 'noPrestigeDays', 'scheduleEnabled', 'targetTE', 'timeOff', 'timezone']);
  });

  it('refuses an ID-shaped string and a bad `at`', () => {
    expect(buildSetupValue(setup({ timeOff: [{ from: ID, to: '2026-12-24' }] }), AT)).toBeNull();
    expect(buildSetupValue(setup(), 0)).toBeNull();
    expect(readSetupValue({ at: AT, timezone: ID })).toBeNull();
  });
});

describe('the Consent value', () => {
  const c = { study: 'yes' as const, answeredAt: AT - 1000, ticks: { leaderboard: true, sendCsv: false }, credit: 'name' as const, nickname: 'Hen Solo' };

  it('has the contract shape', () => {
    expect(buildConsentValue(c, AT)).toEqual({
      at: AT,
      answeredAt: AT - 1000,
      study: 'yes',
      ticks: { leaderboard: true, sendCsv: false },
      credit: 'name',
      nickname: 'Hen Solo',
    });
    expect(prefsProblems('consent', buildConsentValue(c, AT))).toEqual([]);
  });

  it('a name only when credited by name; control characters dropped, 40 characters at most', () => {
    expect(buildConsentValue({ ...c, credit: 'anonymous' }, AT)).not.toHaveProperty('nickname');
    expect(cleanNickname('a\u0000b\u0007c')).toBe('abc');
    expect(Array.from(buildConsentValue({ ...c, nickname: 'x'.repeat(60) }, AT)!.nickname!)).toHaveLength(40);
  });

  it('refuses a name that is an ID', () => {
    expect(buildConsentValue({ ...c, nickname: `me ${ID}` }, AT)).toBeNull();
    expect(readConsentValue({ at: AT, credit: 'name', nickname: ID })).toBeNull();
  });

  it('reads "later" as answered, like no', () => {
    expect(consentFromCloud({ at: AT, study: 'later' })).toMatchObject({ study: 'no', answeredAt: AT });
    expect(consentFromCloud({ at: AT, study: 'yes', answeredAt: AT - 5, ticks: { leaderboard: true, unknownTick: true } })).toEqual({
      study: 'yes',
      answeredAt: AT - 5,
      ticks: { leaderboard: true },
      credit: null,
      nickname: '',
    });
  });

  it('the signature leaves `at` aside', () => {
    expect(prefsSig(buildConsentValue(c, AT))).toBe(prefsSig(buildConsentValue(c, AT + 99)));
  });
});

describe('the contract checks', () => {
  it('names the field out of bounds', () => {
    expect(prefsProblems('setup', { at: AT, targetTE: 0 })).toEqual(['targetTE']);
    expect(prefsProblems('setup', { at: AT, noPrestigeDays: [{ from: 'x<y', to: 'z' }] })).toEqual(['noPrestigeDays']);
    expect(prefsProblems('setup', { at: AT, hours: { start: '7:00', end: '23:00' } })).toEqual(['hours']);
    expect(prefsProblems('setup', { at: AT, hours: { start: '07:00', end: '23:00', days: [7] } })).toEqual(['hours.days']);
    expect(prefsProblems('consent', { at: AT, ticks: { Bad: true } })).toEqual(['ticks']);
    expect(prefsProblems('consent', { at: 5 })).toEqual(['at']);
  });

  it('refuses an ID-shaped string anywhere, and a value over 4 KB', () => {
    expect(prefsProblems('consent', { at: AT, nickname: `x ${ID}` })).toContain('id');
    expect(prefsProblems('setup', { at: AT, junk: 'y'.repeat(PREFS_MAX_VALUE_BYTES) })).toContain('size');
  });
});

describe('the calls', () => {
  it('GET /prefs?k=<key>: both kinds read, a bad one dropped', async () => {
    const { f, calls } = fakeFetch({
      status: 200,
      body: {
        prefs: {
          consent: { value: { at: AT, study: 'no' }, version: 2, updatedAt: AT },
          setup: { value: { nope: true }, version: 1, updatedAt: AT },
        },
        now: AT,
      },
    });
    const r = await getPrefs(URL_, KEY, f);
    expect(calls).toEqual([{ url: `${URL_}?k=${KEY}`, method: 'GET', body: undefined }]);
    expect(r).toEqual({ ok: true, consent: { value: { at: AT, study: 'no' }, version: 2, updatedAt: AT } });
  });

  it('404 is "missing" (an older collector), offline is quiet', async () => {
    expect(await getPrefs(URL_, KEY, fakeFetch({ status: 404 }).f)).toEqual({ ok: false, why: 'missing' });
    expect(await getPrefs(URL_, KEY, fakeFetch('offline').f)).toEqual({ ok: false, why: 'offline' });
    expect(await getPrefs(URL_, 'not-a-key', fakeFetch({ status: 200 }).f)).toEqual({ ok: false, why: 'off' });
  });

  it('PUT /prefs {k, kind, value}; 429 hands back retryAfter; 413 is big', async () => {
    const value = buildSetupValue(setup(), AT)!;
    const ok = fakeFetch({ status: 200, body: { ok: true, version: 3, updatedAt: AT } });
    expect(await putPrefs(URL_, KEY, 'setup', value, ok.f)).toEqual({ ok: true, version: 3, unchanged: false });
    expect(ok.calls[0].url).toBe(URL_);
    expect(ok.calls[0].method).toBe('PUT');
    expect(JSON.parse(ok.calls[0].body!)).toEqual({ k: KEY, kind: 'setup', value });
    expect(await putPrefs(URL_, KEY, 'setup', value, fakeFetch({ status: 429, body: { error: 'x', retryAfter: 120 } }).f)).toEqual({
      ok: false,
      why: 'limit',
      retryAfter: 120,
    });
    expect(await putPrefs(URL_, KEY, 'setup', value, fakeFetch({ status: 413, body: {} }).f)).toEqual({ ok: false, why: 'big' });
  });

  it('never sends a value with an ID in it, nor one out of bounds', async () => {
    const { f, calls } = fakeFetch({ status: 200, body: {} });
    expect(await putPrefs(URL_, KEY, 'consent', { at: AT, credit: 'name', nickname: ID }, f)).toEqual({ ok: false, why: 'rejected' });
    expect(await putPrefs(URL_, KEY, 'setup', { at: AT, targetTE: 999 }, f)).toEqual({ ok: false, why: 'rejected' });
    expect(calls).toEqual([]);
  });

  it('no URL ever holds an ID', async () => {
    const { f, calls } = fakeFetch({ status: 200, body: { prefs: {} } });
    await getPrefs(URL_, KEY, f);
    await putPrefs(URL_, KEY, 'setup', buildSetupValue(setup(), AT)!, f);
    for (const c of calls) {
      expect(c.url).not.toMatch(ID_SHAPED);
      expect(c.body ?? '').not.toMatch(ID_SHAPED);
    }
  });
});
