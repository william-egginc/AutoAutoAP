/**
 * Review 15 Nov 2026, C3: a thrown D1, KV or R2 error used to leave the Worker as a Cloudflare 1101 page, which has no CORS
 * headers (the browser reports a network error, not a status). Now every route answers a JSON 500 with CORS. Never 503: clients
 * read 503 as "off" (bigCsvUpload stops retrying, calendarCloud says "turn on Save online", syncedRecords gives up).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

const K = 'a'.repeat(64);
const SECRET_WORDS = 'SQLITE_BUSY secret-detail';
const boom = () => {
  throw new Error(SECRET_WORDS);
};
/** A D1 whose every call throws, as when D1 is down or overloaded. */
const brokenD1 = { prepare: boom, batch: boom };
const brokenKV = { get: boom, getWithMetadata: boom, put: boom, delete: boom, list: boom };
let logged;
beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => logged.push(a.map(String).join(' ')));
});
afterEach(() => vi.restoreAllMocks());

const call = (path, init, env = { WATCH: brokenD1, SUBMISSIONS: brokenKV, CSV_UPLOAD_KEY: 'x' }) => worker.fetch(new Request('https://c.example' + path, init), env, { waitUntil() {} });

describe.each([
  ['GET /follow (D1)', `/follow?k=${K}`, undefined],
  ['PUT /prefs (D1)', '/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, kind: 'setup', value: { at: Date.now() - 1000, targetTE: 100 } }) }],
  ['GET /sync (D1)', `/sync?k=${K}`, undefined],
  ['GET /leaderboard (KV)', '/leaderboard', undefined],
  ['GET /all (KV)', '/all', undefined],
  ['POST /cal/new (D1)', '/cal/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K }) }],
])('a thrown storage error: %s', (_n, path, init) => {
  it('is a JSON 500 with CORS, not 503 and not an exception', async () => {
    const r = await call(path, init);
    expect(r.status).toBe(500);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('content-type')).toMatch(/json/);
    const body = await r.json();
    expect(typeof body.error).toBe('string');
  });
  it('tells the sender nothing about the error', async () => {
    const text = await (await call(path, init)).text();
    expect(text).not.toContain('SQLITE');
    expect(text).not.toContain('secret-detail');
  });
  it('logs the route, never the query (the query can hold an account code)', async () => {
    await call(path, init);
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line).not.toContain(K);
  });
});

describe('the catch-all changes nothing else', () => {
  it('OPTIONS still answers the preflight', async () => {
    const r = await call('/follow', { method: 'OPTIONS' });
    expect(r.status).toBeLessThan(300);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('a refusal a route returns on purpose keeps its own status', async () => {
    const r = await call('/definitely-not-a-route', undefined, { WATCH: brokenD1, SUBMISSIONS: brokenKV });
    expect(r.status).toBe(404);
  });
});
