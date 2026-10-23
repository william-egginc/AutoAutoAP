/**
 * The followed route saved online (lib/followCloud.ts, contract aaap-tools/notes/follow-contract.md v1): the key, the
 * goals both ways, the value (bounds, 4 KB, never an ID), the three calls with fetch fakes (200, 400, 413, 429, 503,
 * offline), and newer-wins both ways. Ids: placeholders only.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCloudValue,
  cloudGoalOf,
  followKey,
  followUrlOf,
  followedFromCloud,
  getFollowHistory,
  getFollows,
  goalKeyOfCloud,
  hasPlayerId,
  hoursOf,
  mergeCloud,
  putFollow,
  readCloudValue,
  sameHours,
  saveFailWords,
  setWithOtherWords,
  sourceOfFrom,
  sourceOfLevel,
  type CloudValue,
  type FetchLike,
} from './followCloud';
import { eggDaySeconds } from './eggDay';
import type { Followed } from './follow';

const ID = 'EI0000000000000000';
/** sha256("aap-follow-v1:EI0000000000000000"), worked out with node's crypto. */
const KEY = 'c5313ce4197e2fb5c0d4a1fa53cc64742397882977f50d6ddd27f1e230e49cb3';
const URL_ = 'https://collector.example/follow';
const AT = Date.UTC(2026, 9, 23, 18) as number;
const T = Math.floor(AT / 1000);

function fake(status: number, body: unknown, calls: { url: string; init?: Parameters<FetchLike>[1] }[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}
const offline: FetchLike = async () => {
  throw new TypeError('Failed to fetch');
};

const followed = (o: Partial<Followed> = {}): Followed => ({
  chain: [197, 222, 247, 490],
  from: 'answer',
  at: AT,
  source: 'instant',
  planStart: T,
  finish: T + 9 * 86400,
  endTE: 490,
  hours: { start: '07:00', end: '01:00', timezone: 'America/Denver' },
  saveTime: T - 3600,
  simVersion: '2026-10-21-egg-beta2',
  build: '2026-10-22T20:10:00.000Z',
  ...o,
});

describe('the key', () => {
  it('is SHA-256 of "aap-follow-v1:" + the ID in UPPER case, lowercase hex (known vector)', async () => {
    expect(await followKey(ID)).toBe(KEY);
    expect(await followKey(ID.toLowerCase())).toBe(KEY);
    expect(await followKey(`  ${ID.toLowerCase()} `)).toBe(KEY);
    expect(await followKey('')).toBe('');
    expect(KEY).toMatch(/^[0-9a-f]{64}$/);
  });
  it('never holds the ID', async () => {
    expect(hasPlayerId(await followKey(ID))).toBe(false);
  });
});

describe('the URL', () => {
  it('is the collector submit URL with /follow in place of /submit, nothing without one', () => {
    expect(followUrlOf('https://x.workers.dev/submit')).toBe('https://x.workers.dev/follow');
    expect(followUrlOf('https://x.workers.dev/submit/')).toBe('https://x.workers.dev/follow');
    expect(followUrlOf('')).toBe('');
    expect(followUrlOf(undefined)).toBe('');
  });
});

describe('goals', () => {
  it('maps this app\'s goal keys to the collector\'s and back', () => {
    expect(cloudGoalOf('fastest-490')).toBe('race490');
    expect(cloudGoalOf('fastest-313')).toBe('target:313');
    expect(cloudGoalOf('eggday-2027')).toBe('eggday2027');
    expect(cloudGoalOf('eggday-2028')).toBe(`bydate:${eggDaySeconds(2028)}`);
    expect(cloudGoalOf('date-1800000000')).toBe('bydate:1800000000');
    expect(cloudGoalOf('fastest-0')).toBe(null);
    expect(cloudGoalOf('nonsense')).toBe(null);
    expect(goalKeyOfCloud('race490')).toBe('fastest-490');
    expect(goalKeyOfCloud('target:313')).toBe('fastest-313');
    expect(goalKeyOfCloud('eggday2027')).toBe('eggday-2027');
    expect(goalKeyOfCloud('bydate:1800000000')).toBe('date-1800000000');
    expect(goalKeyOfCloud(`bydate:${eggDaySeconds(2028)}`)).toBe('eggday-2028');
    expect(goalKeyOfCloud('weird')).toBe(null);
  });
});

describe('the value', () => {
  it('has the route, plan start, source, when, and the summary', () => {
    const b = buildCloudValue(followed())!;
    expect(b.trimmed).toBe(false);
    expect(b.value).toEqual({
      chain: [197, 222, 247, 490],
      planStart: T,
      source: 'instant',
      at: AT,
      finish: T + 9 * 86400,
      endTE: 490,
      hours: { start: '07:00', end: '01:00', timezone: 'America/Denver' },
      saveTime: T - 3600,
      simVersion: '2026-10-21-egg-beta2',
      build: '2026-10-22T20:10:00.000Z',
    });
    expect(JSON.stringify(b.value).length).toBeLessThan(4096);
  });
  it('never sends a label (free text) or anything with an ID', () => {
    const b = buildCloudValue(followed({ label: "Bob's Egg Day run" }))!;
    expect(JSON.stringify(b.value)).not.toContain('Bob');
    expect(buildCloudValue(followed({ simVersion: ID }))?.value.simVersion).toBeUndefined();
    expect(hasPlayerId(JSON.stringify(buildCloudValue(followed({ build: ID }))))).toBe(false);
  });
  it('refuses a route the collector can\'t keep, and leaves out a field out of bounds', () => {
    expect(buildCloudValue(followed({ chain: Array.from({ length: 17 }, (_, i) => i + 1) }))).toBe(null);
    expect(buildCloudValue(followed({ chain: [200, 199] }))).toBe(null);
    expect(buildCloudValue(followed({ chain: [200.5] }))).toBe(null);
    const v = buildCloudValue(followed({ finish: 5, endTE: 900, hours: { start: '7', end: '1' }, planStart: 3 }))!.value;
    expect(v.finish).toBeUndefined();
    expect(v.endTE).toBeUndefined();
    expect(v.hours).toBeUndefined();
    expect(v.planStart).toBe(T); // from when Follow was pressed
    expect(buildCloudValue(followed({ hours: null }))!.value.hours).toBe(null);
  });
  it('names the source from where the button was (instant answer, by hand) or the search level', () => {
    expect(sourceOfFrom('answer')).toBe('instant');
    expect(sourceOfFrom('count')).toBe('instant');
    expect(sourceOfFrom('typed')).toBe('manual');
    expect(sourceOfFrom('board')).toBe('manual');
    expect(sourceOfLevel('Fast')).toBe('fast');
    expect(sourceOfLevel('Exact')).toBe('exact');
    expect(sourceOfLevel('Custom')).toBe('custom');
    expect(buildCloudValue(followed({ source: undefined, from: 'typed' }))!.value.source).toBe('manual');
  });
  it('keeps the hours window as HH:MM (any time: null; the days and time off are not kept)', () => {
    expect(hoursOf({ fromHour: 7, toHour: 1, timezone: 'America/Denver' })).toEqual({ start: '07:00', end: '01:00', timezone: 'America/Denver' });
    expect(hoursOf({ fromHour: 5, toHour: 5 })).toBe(null);
    expect(hoursOf(null)).toBe(null);
    expect(sameHours(null, null)).toBe(true);
    expect(sameHours({ start: '07:00', end: '01:00' }, null)).toBe(false);
  });
  it('reads back what the collector keeps', () => {
    const v = readCloudValue({ chain: [222, 490], planStart: T, source: 'fast', at: AT, finish: T + 100 })!;
    expect(v.source).toBe('fast');
    expect(readCloudValue({ chain: [], planStart: T, at: AT })).toBe(null);
    const f = followedFromCloud(v);
    expect(f).toMatchObject({ chain: [222, 490], from: 'saved', at: AT, source: 'fast', finish: T + 100, cloud: true });
  });
});

describe('newer wins (by the client\'s at)', () => {
  const cloudV = (at: number, chain = [222, 490]): CloudValue => ({ chain, planStart: T, source: 'fast', at });
  it('takes a saved route this browser doesn\'t have (another device\'s)', () => {
    const r = mergeCloud({}, { 'fastest-490': cloudV(AT) });
    expect(r.taken).toEqual(['fastest-490']);
    expect(r.map['fastest-490'].chain).toEqual([222, 490]);
  });
  it('takes the saved route when it is newer than this browser\'s', () => {
    const r = mergeCloud({ 'fastest-490': followed({ at: AT - 1000 }) }, { 'fastest-490': cloudV(AT) });
    expect(r.taken).toEqual(['fastest-490']);
  });
  it('keeps this browser\'s when it is newer (and nothing is written back)', () => {
    const local = { 'fastest-490': followed({ at: AT + 1000 }) };
    const r = mergeCloud(local, { 'fastest-490': cloudV(AT) });
    expect(r.taken).toEqual([]);
    expect(r.map['fastest-490']).toBe(local['fastest-490']);
  });
  it('doesn\'t bring back a route un-followed here after it was saved', () => {
    expect(mergeCloud({}, { 'fastest-490': cloudV(AT) }, { 'fastest-490': AT + 5 }).taken).toEqual([]);
    expect(mergeCloud({}, { 'fastest-490': cloudV(AT) }, { 'fastest-490': AT - 5 }).taken).toEqual(['fastest-490']);
  });
});

describe('the calls', () => {
  it('GET /follow?k= reads every goal, by this app\'s key (the URL holds only the key)', async () => {
    const calls: { url: string }[] = [];
    const r = await getFollows(
      URL_,
      KEY,
      fake(200, { goals: { race490: { value: { chain: [222, 490], planStart: T, source: 'exact', at: AT }, version: 3, updatedAt: AT } }, now: AT }, calls)
    );
    expect(calls[0].url).toBe(`${URL_}?k=${KEY}`);
    expect(hasPlayerId(calls[0].url)).toBe(false);
    expect(r.ok && r.goals['fastest-490'].version).toBe(3);
  });
  it('GET: an unknown key is no goals; a failure says why', async () => {
    expect(await getFollows(URL_, KEY, fake(200, { goals: {} }))).toEqual({ ok: true, goals: {} });
    expect(await getFollows(URL_, KEY, fake(429, { error: 'x', retryAfter: 60 }))).toEqual({ ok: false, why: 'limit' });
    expect(await getFollows(URL_, KEY, fake(500, {}))).toEqual({ ok: false, why: 'error' });
    expect(await getFollows(URL_, KEY, offline)).toEqual({ ok: false, why: 'offline' });
    expect(await getFollows('', KEY, fake(200, {}))).toEqual({ ok: false, why: 'off' });
    expect(await getFollows(URL_, 'not-a-key', fake(200, {}))).toEqual({ ok: false, why: 'off' });
  });
  it('PUT /follow sends {k, goal, value} as JSON, never an ID', async () => {
    const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
    const v = buildCloudValue(followed())!.value;
    const r = await putFollow(URL_, KEY, 'eggday-2027', v, fake(200, { ok: true, version: 2, updatedAt: AT }, calls));
    expect(r).toEqual({ ok: true, version: 2 });
    expect(calls[0].init?.method).toBe('PUT');
    expect(calls[0].init?.headers?.['content-type']).toBe('application/json');
    const body = JSON.parse(calls[0].init!.body!);
    expect(body).toEqual({ k: KEY, goal: 'eggday2027', value: v });
    expect(hasPlayerId(calls[0].init!.body!)).toBe(false);
  });
  it('PUT refuses to send an ID, and says why for 429, 413, 400, 503 and offline', async () => {
    const calls: { url: string }[] = [];
    const bad = { ...buildCloudValue(followed())!.value, simVersion: ID } as CloudValue;
    expect(await putFollow(URL_, KEY, 'fastest-490', bad, fake(200, {}, calls))).toEqual({ ok: false, why: 'rejected' });
    expect(calls.length).toBe(0);
    const v = buildCloudValue(followed())!.value;
    expect(await putFollow(URL_, KEY, 'fastest-490', v, fake(429, { error: 'x', retryAfter: 1200 }))).toEqual({ ok: false, why: 'limit', retryAfter: 1200 });
    expect(await putFollow(URL_, KEY, 'fastest-490', v, fake(413, { error: 'too big' }))).toMatchObject({ ok: false, why: 'big' });
    expect(await putFollow(URL_, KEY, 'fastest-490', v, fake(400, { error: 'rejected', problems: [] }))).toMatchObject({ ok: false, why: 'rejected' });
    expect(await putFollow(URL_, KEY, 'fastest-490', v, fake(503, { error: 'off' }))).toMatchObject({ ok: false, why: 'off' });
    expect(await putFollow(URL_, KEY, 'fastest-490', v, offline)).toEqual({ ok: false, why: 'offline' });
    expect(await putFollow(URL_, KEY, 'nonsense', v, fake(200, {}))).toEqual({ ok: false, why: 'rejected' });
  });
  it('GET /follow/history lists at most 5, newest first', async () => {
    const calls: { url: string }[] = [];
    const versions = [1, 2, 3, 4, 5, 6].map(n => ({ version: n, updatedAt: AT + n, value: { chain: [200 + n, 490], planStart: T, source: 'fast', at: AT + n } }));
    const r = await getFollowHistory(URL_, KEY, 'date-1800000000', fake(200, { versions, now: AT }, calls));
    expect(calls[0].url).toBe(`${URL_}/history?k=${KEY}&goal=bydate%3A1800000000`);
    expect(r.ok && r.versions.map(v => v.version)).toEqual([6, 5, 4, 3, 2]);
    expect(await getFollowHistory(URL_, KEY, 'fastest-490', offline)).toEqual({ ok: false, why: 'offline' });
  });
});

describe('words', () => {
  it('in the player\'s words', () => {
    expect(saveFailWords('limit')).toBe('Too many changes this hour. Try again later.');
    expect(setWithOtherWords({ hours: true, sim: false })).toBe('This route was set with a different hours window.');
    expect(setWithOtherWords({ hours: false, sim: true })).toBe('This route was set with a different simulator version.');
    expect(setWithOtherWords({ hours: true, sim: true })).toBe('This route was set with a different hours window and simulator version.');
    expect(setWithOtherWords({ hours: false, sim: false })).toBe('');
  });
});
