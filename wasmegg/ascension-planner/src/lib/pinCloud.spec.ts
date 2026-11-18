/**
 * The PIN calls (lib/pinCloud.ts; collector/pin.js). pk, the recovery code and sessions go in POST bodies and headers, never a URL.
 */
import { describe, expect, it } from 'vitest';
import { pinBaseOf, pinChange, pinRecover, pinRefresh, pinRemove, pinReset, pinResetCancel, pinSet, pinStatus, pinVerify } from './pinCloud';
import type { SyncFetch } from './syncedRecords';

const K = 'a'.repeat(64);
const PK = 'd'.repeat(64);
const SYNC = 'https://collector.example/sync';
const SESSION = `v1.1796716809751.1.${'c'.repeat(64)}`;
const REC = 'ABCD2345EFGH6723';
interface Call { url: string; method?: string; body?: string }
function fake(status: number, body: unknown = {}, calls: Call[] = []): SyncFetch {
  return async (url, init) => {
    calls.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
    return { ok: status < 300, status, json: async () => body, headers: { get: () => null } };
  };
}
const offline: SyncFetch = async () => {
  throw new TypeError('offline');
};
const GOOD = { session: SESSION, expires: 1796716809751 };

describe('the address', () => {
  it('is the collector\'s /pin from its /sync address', () => {
    expect(pinBaseOf(SYNC)).toBe('https://collector.example/pin');
    expect(pinBaseOf('https://collector.example/follow')).toBe('');
    expect(pinBaseOf(null)).toBe('');
  });
});

describe('status', () => {
  it('GET /pin/status?k=: pin or not, and a reset in progress', async () => {
    const calls: Call[] = [];
    expect(await pinStatus(SYNC, K, fake(200, { pin: false }, calls))).toEqual({ ok: true, pin: false });
    expect(calls[0]).toMatchObject({ url: `https://collector.example/pin/status?k=${K}`, method: 'GET' });
    expect(await pinStatus(SYNC, K, fake(200, { pin: true, resetAt: 1796716809751 }))).toEqual({ ok: true, pin: true, resetAt: 1796716809751 });
  });
  it('a collector with the PIN off (404 "not found") is "off", a network failure "offline"', async () => {
    expect(await pinStatus(SYNC, K, fake(404, { error: 'not found' }))).toEqual({ ok: false, why: 'off' });
    expect(await pinStatus(SYNC, K, fake(503, {}))).toEqual({ ok: false, why: 'off' });
    expect(await pinStatus(SYNC, K, offline)).toEqual({ ok: false, why: 'offline' });
  });
  it('no collector, no key or no fetch: off, nothing sent', async () => {
    const calls: Call[] = [];
    expect(await pinStatus('', K, fake(200, {}, calls))).toEqual({ ok: false, why: 'off' });
    expect(await pinStatus(SYNC, 'nope', fake(200, {}, calls))).toEqual({ ok: false, why: 'off' });
    expect(await pinStatus(SYNC, K, null)).toEqual({ ok: false, why: 'off' });
    expect(calls).toHaveLength(0);
  });
});

describe('set, verify, change, recover: the pk travels in a POST body', () => {
  it('set: { k, pk } -> the session, the recovery code (shown once) and how many links ended', async () => {
    const calls: Call[] = [];
    const r = await pinSet(SYNC, K, PK, fake(200, { ok: true, ...GOOD, recovery: REC, revokedLinks: 2 }, calls));
    expect(r).toEqual({ ok: true, ...GOOD, recovery: REC, revokedLinks: 2 });
    expect(calls[0].url).toBe('https://collector.example/pin/set');
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body!)).toEqual({ k: K, pk: PK });
    expect(calls[0].url).not.toContain(PK);
  });
  it('set when a PIN exists is "exists" (409)', async () => {
    expect(await pinSet(SYNC, K, PK, fake(409, { error: 'a PIN is already set' }))).toEqual({ ok: false, why: 'exists' });
  });
  it('a pk that is not 64 hex is refused here, nothing sent', async () => {
    const calls: Call[] = [];
    for (const bad of ['', 'x', 'D'.repeat(64), 'd'.repeat(63)]) expect(await pinSet(SYNC, K, bad, fake(200, {}, calls))).toEqual({ ok: false, why: 'rejected' });
    expect(calls).toHaveLength(0);
  });
  it('verify: 200 gives the session; 401 is "wrong"; 404 with pin:false is "nopin"', async () => {
    expect(await pinVerify(SYNC, K, PK, fake(200, GOOD))).toEqual({ ok: true, ...GOOD });
    expect(await pinVerify(SYNC, K, PK, fake(401, { error: 'wrong PIN', pin: true }))).toEqual({ ok: false, why: 'wrong' });
    expect(await pinVerify(SYNC, K, PK, fake(404, { error: 'no PIN is set', pin: false }))).toEqual({ ok: false, why: 'nopin' });
  });
  it('verify: 429 is "limit" with the seconds to wait', async () => {
    expect(await pinVerify(SYNC, K, PK, fake(429, { error: 'too many tries', retryAfter: 3600 }))).toEqual({ ok: false, why: 'limit', retryAfter: 3600 });
    expect(await pinVerify(SYNC, K, PK, fake(429, { error: 'x' }))).toEqual({ ok: false, why: 'limit' });
  });
  it('a 200 whose session is malformed is an error, not a session', async () => {
    expect(await pinVerify(SYNC, K, PK, fake(200, { session: 'junk', expires: 1 }))).toEqual({ ok: false, why: 'error' });
    expect(await pinVerify(SYNC, K, PK, fake(200, {}))).toEqual({ ok: false, why: 'error' });
  });
  it('change: { k, pk } with the session header added by the wrapper; gives a new session', async () => {
    const calls: Call[] = [];
    expect(await pinChange(SYNC, K, PK, fake(200, { ok: true, ...GOOD }, calls))).toEqual({ ok: true, ...GOOD });
    expect(JSON.parse(calls[0].body!)).toEqual({ k: K, pk: PK });
    expect(calls[0].url).toBe('https://collector.example/pin/change');
  });
  it('change with a refused session is "session" (401)', async () => {
    expect(await pinChange(SYNC, K, PK, fake(401, { error: 'pin required', pin: true }))).toEqual({ ok: false, why: 'session' });
  });
  it('recover: { k, recovery, pk }, the code tidied (case, spaces, dashes); a new session and a NEW recovery code', async () => {
    const calls: Call[] = [];
    const r = await pinRecover(SYNC, K, 'abcd-2345 efgh-6723', PK, fake(200, { ok: true, ...GOOD, recovery: 'ZZZZ2222YYYY3333' }, calls));
    expect(r).toEqual({ ok: true, ...GOOD, recovery: 'ZZZZ2222YYYY3333' });
    expect(JSON.parse(calls[0].body!)).toEqual({ k: K, recovery: REC, pk: PK });
    expect(calls[0].url).not.toContain(REC);
  });
  it('recover: a wrong code is "wrong"; a code that is not 16 base32 characters is refused here', async () => {
    expect(await pinRecover(SYNC, K, REC, PK, fake(401, { error: 'wrong recovery code', pin: true }))).toEqual({ ok: false, why: 'wrong' });
    const calls: Call[] = [];
    for (const bad of ['', 'short', 'ABCD2345EFGH672', 'ABCD2345EFGH6721']) expect(await pinRecover(SYNC, K, bad, PK, fake(200, {}, calls))).toEqual({ ok: false, why: 'rejected' });
    expect(calls).toHaveLength(0);
  });
});

describe('refresh, remove, reset', () => {
  it('refresh gives a new session; remove, reset and cancel send { k }', async () => {
    const calls: Call[] = [];
    expect(await pinRefresh(SYNC, K, fake(200, GOOD, calls))).toEqual({ ok: true, ...GOOD });
    expect(await pinRemove(SYNC, K, fake(200, { ok: true }, calls))).toEqual({ ok: true });
    expect(await pinReset(SYNC, K, fake(200, { ok: true, resetAt: 1796716809751 }, calls))).toEqual({ ok: true, resetAt: 1796716809751 });
    expect(await pinResetCancel(SYNC, K, fake(200, { ok: true }, calls))).toEqual({ ok: true });
    expect(calls.map(c => c.url.replace('https://collector.example/pin', ''))).toEqual(['/refresh', '/remove', '/reset', '/reset/cancel']);
    for (const c of calls) expect(JSON.parse(c.body!)).toEqual({ k: K });
  });
  it('a 429 on reset is "limit" (3 a day an address); a refused session on cancel is "session"; offline is offline', async () => {
    expect(await pinReset(SYNC, K, fake(429, { retryAfter: 600 }))).toEqual({ ok: false, why: 'limit', retryAfter: 600 });
    expect(await pinResetCancel(SYNC, K, fake(401, { error: 'pin required', pin: true }))).toEqual({ ok: false, why: 'session' });
    expect(await pinRemove(SYNC, K, offline)).toEqual({ ok: false, why: 'offline' });
  });
  it('a 409 on reset (the 7 days after a cancel) is "cooldown" with the seconds left; a reset with no PIN is "nopin"', async () => {
    expect(await pinReset(SYNC, K, fake(409, { error: 'x', retryAfter: 604800 }))).toEqual({ ok: false, why: 'cooldown', retryAfter: 604800 });
    expect(await pinReset(SYNC, K, fake(404, { error: 'no PIN is set', pin: false }))).toEqual({ ok: false, why: 'nopin' });
  });
});
