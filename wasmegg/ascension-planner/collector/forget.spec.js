/**
 * "Delete everything saved online for this account" (sync.js handleForget, DELETE /forget?k=&all=1): the saved routes, Setup and
 * consent, instant answers and synced records under one account key, in one call. Jordan 7 Nov 2026.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleForget } from './sync.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 10, 7, 23, 0, 0);
let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
  const db = env.WATCH._db;
  for (const k of [K, K2]) {
    db.prepare("INSERT INTO follows (key, goal, version, value, updated) VALUES (?, 'race490', 1, '{}', ?)").run(k, T0);
    db.prepare("INSERT INTO follows (key, goal, version, value, updated) VALUES (?, 'race490', 2, '{}', ?)").run(k, T0);
    db.prepare("INSERT INTO prefs (key, kind, version, value, updated) VALUES (?, 'setup', 1, '{}', ?)").run(k, T0);
    db.prepare("INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, 'e1', ?, ?, 10, 'AAAA')").run(k, T0, T0);
    db.prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'override', '0', ?, ?, 5, 'json', '{}')").run(k, T0, T0);
    db.prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'ticks', '1793000000', ?, ?, 5, 'json', '{}')").run(k, T0, T0);
  }
  db.prepare("INSERT INTO follow_rate (key, since, n) VALUES (?, ?, 5)").run(`sync|${K}`, T0);
});
const forget = (qs = `k=${K}&all=1`, o = {}) => handleForget(new Request(`https://c.example/forget?${qs}`, { method: o.method ?? 'DELETE' }), env, o.now ?? T0);
const n = (table, k) => env.WATCH._db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE key = ?`).get(k).n;

describe('DELETE /forget', () => {
  it('removes every saved route, Setup and consent, answer and synced record of the key, and says how many', async () => {
    const res = await forget();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: { follows: 2, prefs: 1, answers: 1, synced: 2 } });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    for (const t of ['follows', 'prefs', 'answers', 'synced']) expect(n(t, K)).toBe(0);
  });
  it('leaves every other key alone, and the budget rows (so forgetting is not a way to reset a limit)', async () => {
    await forget();
    for (const t of ['follows', 'prefs', 'answers', 'synced']) expect(n(t, K2)).toBeGreaterThan(0);
    expect(n('follow_rate', `sync|${K}`)).toBe(1);
  });
  it('an account with nothing saved is ok (nothing deleted)', async () => {
    const res = await forget(`k=${'c'.repeat(64)}&all=1`);
    expect((await res.json()).deleted).toEqual({ follows: 0, prefs: 0, answers: 0, synced: 0 });
  });
  it('needs all=1: a call without it is 400 and deletes nothing', async () => {
    expect((await forget(`k=${K}`)).status).toBe(400);
    expect(n('follows', K)).toBe(2);
  });
  it('a bad key is 400, a player id in the query is 400, GET and POST are 405', async () => {
    expect((await forget('k=abc&all=1')).status).toBe(400);
    expect((await forget(`k=${K}&all=1&x=EI1234567890123456`)).status).toBe(400);
    expect((await forget(`k=${K}&all=1`, { method: 'GET' })).status).toBe(405);
    expect((await forget(`k=${K}&all=1`, { method: 'POST' })).status).toBe(405);
  });
  it('10 a hour a key, then 429 with the wait; the edge limiter answers 429; no D1 is 503', async () => {
    for (let i = 0; i < 10; i++) expect((await forget(undefined, { now: T0 + i * 1000 })).status).toBe(200);
    const over = await forget(undefined, { now: T0 + 20_000 });
    expect(over.status).toBe(429);
    expect((await over.json()).retryAfter).toBeGreaterThan(0);
    env.FOLLOW_LIMIT = { limit: async () => ({ success: false }) };
    expect((await forget(`k=${K2}&all=1`)).status).toBe(429);
    delete env.WATCH;
    expect((await forget()).status).toBe(503);
  });
});
