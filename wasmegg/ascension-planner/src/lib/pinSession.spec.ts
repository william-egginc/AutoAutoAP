/**
 * The PIN session held by this browser (lib/pinSession.ts): the `x-aaap-session` header goes on every cloud request of the account
 * that has one (the key `k` is in the URL or the JSON body), never to another account, never in a URL, and a 401 means "locked".
 */
import { describe, expect, it } from 'vitest';
import { createPinSessions } from './pinSession';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const NOW = Date.UTC(2026, 10, 18, 17, 0, 0);
const DAY = 86_400_000;
const SESSION = `v1.${NOW + 30 * DAY}.1.${'c'.repeat(64)}`;
const OPEN = { session: SESSION, expires: NOW + 30 * DAY };

function memStore() {
  const m = new Map<string, string>();
  return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}
type Seen = { url: string; headers: Record<string, string> };
function stub(status = 200) {
  const seen: Seen[] = [];
  const f = async (url: string, init?: { headers?: Record<string, string>; body?: unknown; method?: string }) => {
    seen.push({ url, headers: { ...(init?.headers ?? {}) } });
    return { ok: status < 300, status, json: async () => ({}) };
  };
  return { f, seen };
}
const make = (now = NOW) => {
  const s = memStore();
  const p = createPinSessions({ storage: s.st, now: () => now });
  return { ...s, p };
};

describe('the header', () => {
  it('goes on a request whose URL carries the key of an account with a session', async () => {
    const { p } = make();
    p.set(K, OPEN);
    const { f, seen } = stub();
    await p.wrap(f)(`https://c.example/follow?k=${K}`, { method: 'GET' });
    await p.wrap(f)(`https://c.example/sync?k=${K}&kind=cal&slot=0&at=5`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(seen[0].headers['x-aaap-session']).toBe(SESSION);
    expect(seen[1].headers['x-aaap-session']).toBe(SESSION);
    expect(seen[1].headers['content-type']).toBe('application/json');
  });
  it('goes on a POST whose JSON body carries the key (calendar mint and revoke, forget by key in the body)', async () => {
    const { p } = make();
    p.set(K, OPEN);
    const { f, seen } = stub();
    await p.wrap(f)('https://c.example/cal/new', { method: 'POST', body: JSON.stringify({ k: K }) });
    await p.wrap(f)('https://c.example/cal/revoke', { method: 'POST', body: JSON.stringify({ k: K, all: true }) });
    expect(seen.map(s => s.headers['x-aaap-session'])).toEqual([SESSION, SESSION]);
  });
  it('never goes to another account, to a request with no key, or into a URL', async () => {
    const { p } = make();
    p.set(K, OPEN);
    const { f, seen } = stub();
    await p.wrap(f)(`https://c.example/follow?k=${K2}`);
    await p.wrap(f)('https://c.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics');
    await p.wrap(f)('https://c.example/cal/revoke', { method: 'POST', body: JSON.stringify({ token: 'AbCdEfGhIjKlMnOpQrStUv' }) });
    await p.wrap(f)(`https://c.example/follow?k=${K}`);
    expect(seen.map(s => 'x-aaap-session' in s.headers)).toEqual([false, false, false, true]);
    expect(seen.map(s => s.url).join()).not.toContain(SESSION);
  });
  it('is not sent to the PIN calls that carry the pk (verify, set, recover): they need no session', async () => {
    const { p } = make();
    p.set(K, OPEN);
    const { f, seen } = stub();
    for (const r of ['verify', 'set', 'recover']) await p.wrap(f)(`https://c.example/pin/${r}`, { method: 'POST', body: JSON.stringify({ k: K, pk: 'd'.repeat(64) }) });
    expect(seen.some(s => 'x-aaap-session' in s.headers)).toBe(false);
  });
  it('is sent to the PIN calls that need a session (refresh, change, remove, reset/cancel)', async () => {
    const { p } = make();
    p.set(K, OPEN);
    const { f, seen } = stub();
    for (const r of ['refresh', 'change', 'remove', 'reset/cancel']) await p.wrap(f)(`https://c.example/pin/${r}`, { method: 'POST', body: JSON.stringify({ k: K }) });
    expect(seen.every(s => s.headers['x-aaap-session'] === SESSION)).toBe(true);
  });
  it('an expired session is not sent, and is forgotten', async () => {
    const { p, m } = make(NOW + 31 * DAY);
    p.set(K, OPEN);
    const { f, seen } = stub();
    await p.wrap(f)(`https://c.example/follow?k=${K}`);
    expect('x-aaap-session' in seen[0].headers).toBe(false);
    expect(p.get(K)).toBeNull();
    expect([...m.values()].join()).not.toContain(SESSION);
  });
  it('a wrapped fetch that is null stays null', () => {
    expect(make().p.wrap(null)).toBeNull();
  });
});

describe('locked', () => {
  it('a 401 marks the account locked and drops a session it had (it was refused: expired or the PIN changed)', async () => {
    const { p } = make();
    p.set(K, OPEN);
    expect(p.locked(K)).toBe(false);
    await p.wrap(stub(401).f)(`https://c.example/follow?k=${K}`);
    expect(p.locked(K)).toBe(true);
    expect(p.get(K)).toBeNull();
  });
  it('a 401 with no session at all marks it locked too; another account is untouched', async () => {
    const { p } = make();
    await p.wrap(stub(401).f)(`https://c.example/sync?k=${K}`);
    expect(p.locked(K)).toBe(true);
    expect(p.locked(K2)).toBe(false);
  });
  it('a good answer after a session is set clears locked; setting a session clears it', async () => {
    const { p } = make();
    await p.wrap(stub(401).f)(`https://c.example/sync?k=${K}`);
    p.set(K, OPEN);
    expect(p.locked(K)).toBe(false);
  });
  it('other failures (429, 500, 503, a network error) do not lock and do not drop the session', async () => {
    const { p } = make();
    p.set(K, OPEN);
    for (const s of [429, 500, 503, 400]) await p.wrap(stub(s).f)(`https://c.example/sync?k=${K}`);
    await p.wrap(async () => Promise.reject(new TypeError('offline')))(`https://c.example/sync?k=${K}`).catch(() => undefined);
    expect(p.locked(K)).toBe(false);
    expect(p.get(K)).not.toBeNull();
  });
  it('a 401 from a PIN call that carries the pk (wrong PIN) is the caller\'s answer, not "locked by an expired session"', async () => {
    const { p } = make();
    p.set(K, OPEN);
    await p.wrap(stub(401).f)('https://c.example/pin/verify', { method: 'POST', body: JSON.stringify({ k: K, pk: 'd'.repeat(64) }) });
    expect(p.get(K)).not.toBeNull();
  });
});

describe('keeping it', () => {
  it('a new page load reads it back from storage; nothing else about the PIN is kept', () => {
    const a = make();
    a.p.set(K, OPEN);
    const b = createPinSessions({ storage: a.st, now: () => NOW });
    expect(b.get(K)).toEqual(OPEN);
    const stored = [...a.m.entries()].map(([k, v]) => `${k}=${v}`).join('\n');
    expect(stored).not.toContain('pk');
    expect(stored).not.toMatch(/recovery/i);
  });
  it('clear forgets it everywhere', () => {
    const a = make();
    a.p.set(K, OPEN);
    a.p.clear(K);
    expect(a.p.get(K)).toBeNull();
    expect(a.m.size).toBe(0);
  });
  it('storage that throws is fine: the session lives for this visit only', () => {
    const p = createPinSessions({ storage: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } }, now: () => NOW });
    p.set(K, OPEN);
    expect(p.get(K)).toEqual(OPEN);
  });
  it('refuses a malformed session', () => {
    const { p } = make();
    p.set(K, { session: 'nonsense', expires: NOW + DAY });
    expect(p.get(K)).toBeNull();
  });
});
