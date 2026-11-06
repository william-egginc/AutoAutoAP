/**
 * Red team 6 Nov 2026 (notes/redteam-code-2026-11-06.md), collector side. Failing-first specs for:
 *   C4  follow and prefs: an older `at` never replaces a newer stored one (409 with the stored value),
 *       and an `at` more than 10 minutes ahead of the collector's clock is refused (400).
 *   C13 two writers racing for the same version number: the loser retries once instead of a 500.
 * D1 is Node's in-memory SQLite behind D1's shape, with the real migration files applied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleFollow } from './follow.js';
import { handlePrefs } from './prefs.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const T0 = Date.UTC(2026, 10, 6, 18, 0, 0);
const GOAL = 'bydate:1815580800';
const followValue = (at, extra = {}) => ({ chain: [196, 312], planStart: 1792800000, source: 'exact', at, ...extra });
const setupValue = (at, extra = {}) => ({ at, targetTE: 100, ...extra });
const consentValue = (at, extra = {}) => ({ at, study: 'no', ...extra });

let env;
let fail;
beforeEach(() => {
  fail = { n: 0 };
  env = { WATCH: makeD1(fail) };
});

const json = body => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const putFollow = (value, now = T0, k = K) => handleFollow(new Request('https://c.example/follow', json({ k, goal: GOAL, value })), env, now);
const putPrefs = (kind, value, now = T0, k = K) => handlePrefs(new Request('https://c.example/prefs', json({ k, kind, value })), env, now);
const getFollow = () => handleFollow(new Request(`https://c.example/follow?k=${K}`), env, T0);
const getPrefs = () => handlePrefs(new Request(`https://c.example/prefs?k=${K}`), env, T0);
const rows = table => env.WATCH._db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

describe('C4: an older value never replaces a newer one', () => {
  it('follow: at T0+1000 then at T0 is 409, carries the stored value, and stores nothing', async () => {
    expect((await putFollow(followValue(T0 + 1000, { chain: [100, 200] }), T0 + 1000)).status).toBe(200);
    const res = await putFollow(followValue(T0, { chain: [300, 400] }), T0 + 2000);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/newer/);
    expect(body.latest.value.chain).toEqual([100, 200]);
    expect(body.latest.version).toBe(1);
    expect(rows('follows')).toBe(1);
    expect((await (await getFollow()).json()).goals[GOAL].value.chain).toEqual([100, 200]);
  });

  it('follow: an equal `at` with a different value is still accepted (a tie is not stale)', async () => {
    await putFollow(followValue(T0, { chain: [100, 200] }));
    expect((await putFollow(followValue(T0, { chain: [100, 250] }), T0 + 5)).status).toBe(200);
  });

  it('follow: a newer `at` replaces it as before, and a restore with a fresh `at` works', async () => {
    await putFollow(followValue(T0, { chain: [100, 200] }));
    expect((await putFollow(followValue(T0 + 5000, { chain: [100, 300] }), T0 + 5000)).status).toBe(200);
    expect((await putFollow(followValue(T0 + 9000, { chain: [100, 200] }), T0 + 9000)).status).toBe(200);
  });

  it.each([
    ['consent', consentValue],
    ['setup', setupValue],
  ])('prefs %s: at T0+1000 then at T0 is 409 with the stored value, and nothing is stored', async (kind, make) => {
    expect((await putPrefs(kind, make(T0 + 1000), T0 + 1000)).status).toBe(200);
    const res = await putPrefs(kind, make(T0, kind === 'consent' ? { study: 'yes' } : { targetTE: 200 }), T0 + 2000);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.latest.value.at).toBe(T0 + 1000);
    expect(rows('prefs')).toBe(1);
    expect((await (await getPrefs()).json()).prefs[kind].value.at).toBe(T0 + 1000);
  });

  it('prefs: consent and setup are compared each against its own kind', async () => {
    await putPrefs('consent', consentValue(T0 + 9000), T0 + 9000);
    expect((await putPrefs('setup', setupValue(T0), T0 + 10)).status).toBe(200);
  });
});

describe('C4: an `at` far ahead of the collector clock is refused', () => {
  const YEAR = 365 * 86_400_000;
  it('follow: one year ahead is 400 and names at', async () => {
    const res = await putFollow(followValue(T0 + YEAR));
    expect(res.status).toBe(400);
    expect((await res.json()).problems.join(' ')).toMatch(/at /);
    expect(rows('follows')).toBe(0);
  });
  it.each(['consent', 'setup'])('prefs %s: one year ahead is 400 and nothing is stored (no pinned forged value)', async kind => {
    const res = await putPrefs(kind, kind === 'consent' ? consentValue(T0 + YEAR, { study: 'yes' }) : setupValue(T0 + YEAR));
    expect(res.status).toBe(400);
    expect((await res.json()).problems.join(' ')).toMatch(/at /);
    expect(rows('prefs')).toBe(0);
  });
  it('9 minutes ahead is fine (clocks differ); 11 minutes ahead is not', async () => {
    expect((await putFollow(followValue(T0 + 9 * 60_000))).status).toBe(200);
    expect((await putFollow(followValue(T0 + 11 * 60_000, { chain: [1, 2] }))).status).toBe(400);
  });
});

describe('C13: two writers for one version number', () => {
  it('follow: a lost race on the version insert is retried once, not a 500', async () => {
    fail.n = 1;
    const res = await putFollow(followValue(T0));
    expect(res.status).toBe(200);
    expect(rows('follows')).toBe(1);
  });
  it('prefs: a lost race on the version insert is retried once, not a 500', async () => {
    fail.n = 1;
    const res = await putPrefs('setup', setupValue(T0));
    expect(res.status).toBe(200);
    expect(rows('prefs')).toBe(1);
  });
  it('follow: a second failure answers 503 (try again), still not a thrown 500', async () => {
    fail.n = 2;
    const res = await putFollow(followValue(T0));
    expect(res.status).toBe(503);
    expect(rows('follows')).toBe(0);
  });
  it('prefs: a second failure answers 503 (try again)', async () => {
    fail.n = 2;
    expect((await putPrefs('consent', consentValue(T0))).status).toBe(503);
  });
});
