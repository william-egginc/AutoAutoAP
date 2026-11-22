/**
 * Review 15 Nov 2026, C2: the shared day-wide write budget (cloud-puts-day, sync-puts-day) must be spent only after the
 * per-key hourly check passes. Before, one key that had used up its hour kept spending the whole collector's day on
 * writes that were refused anyway. D1 is Node's in-memory SQLite with the real migrations; no secret, so the stored key is the code.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { handleFollow } from './follow.js';
import { handlePrefs } from './prefs.js';
import { handleAnswers } from './answers.js';
import { handleSync } from './sync.js';
import { makeD1 } from './d1shim.js';
import { handlePin } from './pin.js';

const K = 'a'.repeat(64);
const T0 = Date.UTC(2026, 10, 15, 18, 0, 0);
let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});
const db = () => env.WATCH._db;
const used = day => db().prepare('SELECT n FROM follow_rate WHERE key = ?').get(day)?.n ?? 0;
/** The key's hour is already used up: the next write must be refused. */
const exhaust = budgetKey => db().prepare('INSERT INTO follow_rate (key, since, n) VALUES (?, ?, ?)').run(budgetKey, T0 - 1000, 10_000);

const FOLLOW = { chain: [196, 312], planStart: 1792800000, source: 'exact', at: T0 - 1000 };
const gz = new Uint8Array(gzipSync(Buffer.from('{"a":1}')));
const TICKS = '{"ticked":["a"]}';
const ROUTES = [
  {
    name: 'follow',
    day: 'cloud-puts-day',
    budgetKey: K,
    put: () => handleFollow(new Request('https://c.example/follow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, goal: 'race490', value: FOLLOW }) }), env, T0),
  },
  {
    name: 'prefs',
    day: 'cloud-puts-day',
    budgetKey: `prefs|${K}`,
    put: () => handlePrefs(new Request('https://c.example/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, kind: 'setup', value: { at: T0 - 1000, targetTE: 100 } }) }), env, T0),
  },
  {
    name: 'answers',
    day: 'cloud-puts-day',
    budgetKey: `answers|${K}`,
    put: () => handleAnswers(new Request(`https://c.example/answers?k=${K}&e=e1&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(gz.length) }, body: gz }), env, T0),
  },
  {
    name: 'sync',
    day: 'sync-puts-day',
    budgetKey: `sync|${K}`,
    put: () => handleSync(new Request(`https://c.example/sync?k=${K}&kind=ticks&slot=1793000000&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(TICKS.length) }, body: TICKS }), env, T0),
  },
];

describe.each(ROUTES)('$name: a write the key\'s hour refuses does not spend the collector\'s day', ({ day, budgetKey, put }) => {
  it('refused (429) and the day count stays 0', async () => {
    exhaust(budgetKey);
    const r = await put();
    expect(r.status).toBe(429);
    expect(used(day)).toBe(0);
  });
  it('an allowed write still spends one', async () => {
    const r = await put();
    expect(r.status).toBe(200);
    expect(used(day)).toBe(1);
  });
  it('a refusal by the day budget is still a 429 (the day cap still holds)', async () => {
    db().prepare('INSERT INTO follow_rate (key, since, n) VALUES (?, ?, ?)').run(day, T0 - 1000, 1e9);
    const r = await put();
    expect(r.status).toBe(429);
  });
});

describe('review 22 Nov, C1.2: the PIN reset budget is spent in order', () => {
  const SALT = 'f'.repeat(64);
  const pinEnv = () => ({ WATCH: makeD1(), ACCOUNT_KEY_SALT: SALT, PIN_ENABLED: '1' });
  const call = (e, route, body, ip) =>
    handlePin(new Request(`https://c.example/pin/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), e, T0);
  const spent = e => e.WATCH._db.prepare("SELECT n FROM follow_rate WHERE key = 'pinreset-day'").get()?.n ?? 0;

  it('3 good resets and 50 refused ones from one address leave the collector-wide count at 3, and a fresh address still gets in', async () => {
    const e = pinEnv();
    const ks = ['1', '2', '3', '4', '5'].map(c => c.repeat(64));
    for (const k of ks) await call(e, 'set', { k, pk: '1'.repeat(64) }, '203.0.113.1');
    for (const k of ks.slice(0, 3)) expect((await call(e, 'reset', { k }, '198.51.100.9')).status).toBe(200);
    for (let i = 0; i < 50; i++) expect((await call(e, 'reset', { k: ks[3] }, '198.51.100.9')).status).toBe(429);
    expect(spent(e)).toBe(3);
    expect((await call(e, 'reset', { k: ks[3] }, '198.51.100.77')).status).toBe(200);
  });
});
