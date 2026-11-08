/**
 * Salted account codes (acct.js, notes/p2-salt-plan-2026-11-08.md; red team P2). The client's code `k` (SHA-256 of the player ID,
 * unsalted, so reversible by anyone who sees it) is stored as 's1:' + HMAC(ACCOUNT_KEY_SALT, 'acct-key-v1:' + k) in follows, prefs,
 * answers and synced (and in the budget rows). The client changes nothing. Rows written before are moved on first touch and by the
 * hourly sweep. Off (nothing changes) while the secret is not set.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { accountKey, rekeyLegacy, saltedKeyOf } from './acct.js';
import { handleFollow } from './follow.js';
import { handlePrefs } from './prefs.js';
import { handleAnswers } from './answers.js';
import { handleForget, handleSync } from './sync.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 10, 8, 18, 0, 0);
const SALT = 'f'.repeat(64);
let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});
const db = () => env.WATCH._db;
const keys = table => db().prepare(`SELECT DISTINCT key FROM ${table}`).all().map(r => r.key);
const allKeys = () => ['follows', 'prefs', 'answers', 'synced', 'follow_rate'].flatMap(keys);

const FOLLOW = { chain: [196, 312], planStart: 1792800000, source: 'exact', at: T0 - 1000 };
const putFollow = (k = K, now = T0) =>
  handleFollow(new Request('https://c.example/follow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, goal: 'race490', value: FOLLOW }) }), env, now);
const getFollow = (k = K) => handleFollow(new Request(`https://c.example/follow?k=${k}`), env, T0);
const putPrefs = (k = K) =>
  handlePrefs(new Request('https://c.example/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, kind: 'setup', value: { at: T0 - 1000, targetTE: 100 } }) }), env, T0);
const getPrefs = (k = K) => handlePrefs(new Request(`https://c.example/prefs?k=${k}`), env, T0);
const gz = new Uint8Array(gzipSync(Buffer.from('{"a":1}')));
const putAnswer = (k = K) =>
  handleAnswers(new Request(`https://c.example/answers?k=${k}&e=e1&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(gz.length) }, body: gz }), env, T0);
const listAnswers = (k = K) => handleAnswers(new Request(`https://c.example/answers?k=${k}`), env, T0);
const TICKS = '{"ticked":["a"]}';
const putSync = (k = K) =>
  handleSync(new Request(`https://c.example/sync?k=${k}&kind=ticks&slot=1793000000&at=${T0 - 1000}`, { method: 'PUT', headers: { 'content-length': String(TICKS.length) }, body: TICKS }), env, T0);
const listSync = (k = K) => handleSync(new Request(`https://c.example/sync?k=${k}`), env, T0);

describe('accountKey', () => {
  it('is the client code itself while the secret is not set (nothing changes today)', async () => {
    expect(await accountKey(env, K)).toBe(K);
  });
  it("with the secret: 's1:' + 64 hex, the same each time, different for another code or another secret", async () => {
    env.ACCOUNT_KEY_SALT = SALT;
    const a = await accountKey(env, K);
    expect(a).toMatch(/^s1:[0-9a-f]{64}$/);
    expect(await accountKey(env, K)).toBe(a);
    expect(await accountKey(env, K2)).not.toBe(a);
    env.ACCOUNT_KEY_SALT = '0'.repeat(64);
    expect(await accountKey(env, K)).not.toBe(a);
  });
  it('the stored key is not derivable from the client code without the secret, and is not a valid client code', async () => {
    env.ACCOUNT_KEY_SALT = SALT;
    const a = await accountKey(env, K);
    expect(a).not.toContain(K);
    expect(/^[0-9a-f]{64}$/.test(a)).toBe(false);
  });
});

describe('with the secret set, nothing raw is stored and everything still works', () => {
  beforeEach(() => {
    env.ACCOUNT_KEY_SALT = SALT;
  });
  it('follow: PUT then GET, rows and budget keys under the salted key only', async () => {
    expect((await putFollow()).status).toBe(200);
    const got = await (await getFollow()).json();
    expect(got.goals.race490.value.chain).toEqual([196, 312]);
    for (const k of allKeys()) expect(k).not.toContain(K);
    expect(keys('follows')[0]).toMatch(/^s1:/);
    expect((await (await getFollow(K2)).json()).goals).toEqual({});
  });
  it('prefs, answers and sync: the same', async () => {
    expect((await putPrefs()).status).toBe(200);
    expect((await putAnswer()).status).toBe(200);
    expect((await putSync()).status).toBe(200);
    expect((await (await getPrefs()).json()).prefs.setup.value.targetTE).toBe(100);
    expect((await (await listAnswers()).json()).entries).toHaveLength(1);
    expect((await (await listSync()).json()).records).toHaveLength(1);
    for (const k of allKeys()) expect(k).not.toContain(K);
  });
  it("two accounts stay apart, and one's stored key does not open another's rows", async () => {
    await putFollow(K);
    await putFollow(K2);
    expect(keys('follows')).toHaveLength(2);
    const stored = keys('follows')[0];
    expect((await getFollow(stored.slice(3))).status).toBe(200);
    expect((await (await getFollow(stored.slice(3))).json()).goals).toEqual({});
  });
  it('forget removes the salted rows', async () => {
    await putFollow();
    await putPrefs();
    await putSync();
    const res = await handleForget(new Request(`https://c.example/forget?k=${K}&all=1`, { method: 'DELETE' }), env, T0);
    expect((await res.json()).deleted).toMatchObject({ follows: 1, prefs: 1, synced: 1 });
    for (const t of ['follows', 'prefs', 'answers', 'synced']) expect(keys(t)).toEqual([]);
  });
});

describe('rows written before (raw code) are found and moved on first touch', () => {
  const seed = (k = K) => {
    db().prepare("INSERT INTO follows (key, goal, version, value, updated) VALUES (?, 'race490', 1, ?, ?)").run(k, JSON.stringify(FOLLOW), T0);
    db().prepare("INSERT INTO prefs (key, kind, version, value, updated) VALUES (?, 'setup', 1, ?, ?)").run(k, JSON.stringify({ at: T0 - 1000, targetTE: 77 }), T0);
    db().prepare("INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, 'e1', ?, ?, 10, 'AAAA')").run(k, T0, T0);
    db().prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'ticks', '1793000000', ?, ?, 5, 'json', '{\"ticked\":[]}')").run(k, T0, T0);
  };
  beforeEach(() => {
    seed();
    env.ACCOUNT_KEY_SALT = SALT;
  });
  it('a GET sees the old rows and leaves them under the salted key', async () => {
    expect((await (await getFollow()).json()).goals.race490.value.chain).toEqual([196, 312]);
    expect(allKeys().filter(k => k === K)).toEqual([]);
    expect((await (await getPrefs()).json()).prefs.setup.value.targetTE).toBe(77);
    expect((await (await listAnswers()).json()).entries).toHaveLength(1);
    expect((await (await listSync()).json()).records).toHaveLength(1);
  });
  it('a PUT moves them first, so a version number continues and nothing forks', async () => {
    await handleFollow(
      new Request('https://c.example/follow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, goal: 'race490', value: { ...FOLLOW, chain: [100, 200], at: T0 - 500 } }) }),
      env,
      T0
    );
    const rows = db().prepare('SELECT key, version FROM follows ORDER BY version').all();
    expect(rows.map(r => r.version)).toEqual([1, 2]);
    expect(new Set(rows.map(r => r.key)).size).toBe(1);
    expect(rows[0].key).toMatch(/^s1:/);
  });
  it('when both a raw row and a salted row exist for the same record, the salted one stays and the raw one goes', async () => {
    const sk = await saltedKeyOf(SALT, K);
    db().prepare("INSERT INTO follows (key, goal, version, value, updated) VALUES (?, 'race490', 1, ?, ?)").run(sk, JSON.stringify({ ...FOLLOW, chain: [1, 2] }), T0);
    const got = await (await getFollow()).json();
    expect(got.goals.race490.value.chain).toEqual([1, 2]);
    expect(allKeys().filter(k => k === K)).toEqual([]);
  });
  it('ACCOUNT_KEY_LEGACY=0 turns the old-row lookup off (after the sweep): old rows are then not found', async () => {
    env.ACCOUNT_KEY_LEGACY = '0';
    expect((await (await getFollow()).json()).goals).toEqual({});
    expect(keys('follows')).toEqual([K]);
  });
  it('the sweep moves every raw key, in pieces, and leaves salted ones alone', async () => {
    seed(K2);
    await putFollow('c'.repeat(64));
    expect(await rekeyLegacy(env, T0, 1)).toBe(1);
    expect(await rekeyLegacy(env, T0, 50)).toBe(1);
    expect(await rekeyLegacy(env, T0, 50)).toBe(0);
    for (const t of ['follows', 'prefs', 'answers', 'synced']) for (const k of keys(t)) expect(k).toMatch(/^s1:/);
    expect(keys('follows')).toHaveLength(3);
  });
  it('the sweep does nothing without the secret', async () => {
    delete env.ACCOUNT_KEY_SALT;
    expect(await rekeyLegacy(env, T0, 50)).toBe(0);
    expect(keys('follows')).toEqual([K]);
  });
});

describe('fail closed if the secret goes missing after salting began', () => {
  it('follow, prefs, answers and sync answer 503 instead of forking the data under raw codes', async () => {
    env.ACCOUNT_KEY_SALT = SALT;
    await putFollow();
    delete env.ACCOUNT_KEY_SALT;
    expect((await putFollow()).status).toBe(503);
    expect((await getFollow()).status).toBe(503);
    expect((await putPrefs()).status).toBe(503);
    expect((await putAnswer()).status).toBe(503);
    expect((await listSync()).status).toBe(503);
    expect(keys('follows').every(k => k.startsWith('s1:'))).toBe(true);
  });
  it('with no salted rows and no secret it simply runs unsalted', async () => {
    expect((await putFollow()).status).toBe(200);
    expect(keys('follows')).toEqual([K]);
  });
});
