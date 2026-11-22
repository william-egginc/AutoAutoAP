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
import { roomForNewKey } from './watch.js';
import { handleCal } from './cal.js';

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

describe('review 22 Nov, C2.1: a write the budgets refuse runs no full-table scan', () => {
  it('sync: a new record refused by the key\'s hour (or the day) reads no unkeyed rows of `synced`', async () => {
    const sqls = [];
    const real = env.WATCH.prepare.bind(env.WATCH);
    env.WATCH.prepare = sql => (sqls.push(sql), real(sql));
    const put = () =>
      handleSync(new Request(`https://c.example/sync?k=${K}&kind=ticks&slot=1793000000&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(TICKS.length) }, body: TICKS }), env, T0);
    exhaust(`sync|${K}`);
    expect((await put()).status).toBe(429);
    expect(sqls.filter(q => /FROM synced\s*$/.test(q))).toEqual([]);
    // And the collector's day budget used up: the same.
    db().prepare('DELETE FROM follow_rate').run();
    exhaust('sync-puts-day');
    expect((await put()).status).toBe(429);
    expect(sqls.filter(q => /FROM synced\s*$/.test(q))).toEqual([]);
  });
});

describe('review 22 Nov, C2.3: one address cannot start more than 10 new accounts a day in a table', () => {
  const keyN = n => n.toString(16).padStart(2, '0').repeat(32);
  const withIp = (ip, init = {}) => ({ ...init, headers: { ...(init.headers || {}), 'cf-connecting-ip': ip } });
  const json = { 'content-type': 'application/json' };
  const BUILD = {
    follow: (k, ip) => handleFollow(new Request('https://c.example/follow', withIp(ip, { method: 'PUT', headers: json, body: JSON.stringify({ k, goal: 'race490', value: FOLLOW }) })), env, T0),
    prefs: (k, ip) => handlePrefs(new Request('https://c.example/prefs', withIp(ip, { method: 'PUT', headers: json, body: JSON.stringify({ k, kind: 'setup', value: { at: T0 - 1000, targetTE: 100 } }) })), env, T0),
    sync: (k, ip) =>
      handleSync(new Request(`https://c.example/sync?k=${k}&kind=ticks&slot=1793000000&at=${T0 - 1000}`, withIp(ip, { method: 'PUT', headers: { 'content-length': String(TICKS.length) }, body: TICKS })), env, T0),
    answers: (k, ip) =>
      handleAnswers(new Request(`https://c.example/answers?k=${k}&e=e1&at=${T0 - 1000}`, withIp(ip, { method: 'PUT', headers: { 'content-length': String(gz.length) }, body: gz })), env, T0),
  };
  const GLOBAL = { follow: 'cloud-new-keys-day', prefs: 'cloud-new-keys-day', sync: 'sync-new-keys-day', answers: 'answers-new-day' };
  for (const name of Object.keys(BUILD)) {
    it(`${name}: the 11th new account from one address is refused without spending the collector-wide count, a fresh address still gets in`, async () => {
      for (let i = 1; i <= 10; i++) expect((await BUILD[name](keyN(i), '203.0.113.1')).status).toBe(200);
      const before = used(GLOBAL[name]);
      const refused = await BUILD[name](keyN(11), '203.0.113.1');
      expect(refused.status).toBe(429);
      expect((await refused.json()).retryAfter).toBeGreaterThan(0);
      expect(used(GLOBAL[name])).toBe(before);
      expect((await BUILD[name](keyN(11), '198.51.100.7')).status).toBe(200);
    });
  }
  it('an IPv6 address is one address per /64', async () => {
    for (let i = 1; i <= 10; i++) expect((await BUILD.follow(keyN(i), `2001:db8:1:2:${i}::1`)).status).toBe(200);
    expect((await BUILD.follow(keyN(11), '2001:db8:1:2:ffff::9')).status).toBe(429);
    expect((await BUILD.follow(keyN(11), '2001:db8:1:3::9')).status).toBe(200);
  });
});

describe('review 22 Nov, C2.1: the synced table total is read once a minute, not on every new record', () => {
  it('two new records inside a minute run SUM(bytes) once; after the minute it is read again', async () => {
    const sqls = [];
    const real = env.WATCH.prepare.bind(env.WATCH);
    env.WATCH.prepare = sql => (sqls.push(sql), real(sql));
    const put = (k, now) =>
      handleSync(new Request(`https://c.example/sync?k=${k}&kind=ticks&slot=1793000000&at=${now - 1000}`, { method: 'PUT', headers: { 'content-length': String(TICKS.length) }, body: TICKS }), env, now);
    expect((await put('1'.repeat(64), T0)).status).toBe(200);
    expect((await put('2'.repeat(64), T0 + 5000)).status).toBe(200);
    expect(sqls.filter(q => /SUM\(bytes\)/.test(q))).toHaveLength(1);
    expect((await put('3'.repeat(64), T0 + 61_000)).status).toBe(200);
    expect(sqls.filter(q => /SUM\(bytes\)/.test(q))).toHaveLength(2);
  });
});

describe('review 22 Nov, C2.1: watch and calendar refuse before they count a whole table', () => {
  const spy = () => {
    const sqls = [];
    const real = env.WATCH.prepare.bind(env.WATCH);
    env.WATCH.prepare = sql => (sqls.push(sql), real(sql));
    return sqls;
  };
  it('watch: a new key past the day budget runs no COUNT of the watch table', async () => {
    const sqls = spy();
    exhaust('watch-new-day');
    expect(await roomForNewKey(env, 'k'.repeat(10), T0)).toBe(false);
    expect(sqls.filter(q => /COUNT\(\*\) AS n FROM watch\s*$/.test(q))).toEqual([]);
    db().prepare('DELETE FROM follow_rate').run();
    expect(await roomForNewKey(env, 'k'.repeat(10), T0)).toBe(true);
    expect(sqls.filter(q => /COUNT\(\*\) AS n FROM watch\s*$/.test(q))).toHaveLength(1);
  });
  it('calendar: /cal/new refused by the account\'s day budget runs no COUNT of cal_feeds', async () => {
    const sqls = spy();
    exhaust(`calnew|${K}`);
    const res = await handleCal(new Request('https://c.example/cal/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K }) }), env, T0);
    expect(res.status).toBe(429);
    expect(sqls.filter(q => /COUNT\(\*\) AS n FROM cal_feeds\s*$/.test(q))).toEqual([]);
  });
});
