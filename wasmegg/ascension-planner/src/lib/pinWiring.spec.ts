/**
 * Every cloud call of the browser goes out through the PIN session wrapper (lib/pinSession.ts): with the real default fetch (no stand-in
 * handed in), a request for an account that holds a session carries `x-aaap-session`, and one for another account does not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pinSessions, resetPinSessions } from './pinSession';
import { getFollowHistory, getFollows } from './followCloud';
import { getPrefs } from './prefsCloud';
import { forgetEverything, getSynced, listSynced } from './syncedRecords';
import { CALENDAR_FEED, mintCalendarLink, revokeCalendarLinks } from './calendarCloud';
import { onlineFetch, setSaveOnline } from './saveOnline';
import { browserFetch } from '@/stores/answers';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const SUBMIT = 'https://collector.example';
const SESSION = `v1.${Date.now() + 86_400_000 * 20}.1.${'c'.repeat(64)}`;
type Seen = { url: string; headers: Record<string, string> };
let seen: Seen[];
beforeEach(() => {
  seen = [];
  resetPinSessions();
  try {
    localStorage.clear();
  } catch {
    // none
  }
  vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push({ url, headers: { ...(init?.headers ?? {}) } });
    return { ok: true, status: 200, json: async () => ({ ok: true, url: 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics' }), headers: { get: () => null } };
  });
  CALENDAR_FEED.enabled = true;
  setSaveOnline(true);
  pinSessions().set(K, { session: SESSION, expires: Date.now() + 86_400_000 * 20 });
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
  vi.unstubAllGlobals();
});
const hdr = (i = 0) => seen[i]?.headers['x-aaap-session'];

describe('every default fetch carries the session of the account in the request', () => {
  const calls: Array<[string, (k: string) => Promise<unknown>]> = [
    ['GET /follow', k => getFollows(`${SUBMIT}/follow`, k)],
    ['GET /follow/history', k => getFollowHistory(`${SUBMIT}/follow`, k, 'fastest-490')],
    ['GET /prefs', k => getPrefs(`${SUBMIT}/prefs`, k)],
    ['GET /sync', k => listSynced(`${SUBMIT}/sync`, k)],
    ['GET /sync/get', k => getSynced(`${SUBMIT}/sync`, k, 'override', '0')],
    ['DELETE /forget', k => forgetEverything(SUBMIT, k)],
    ['POST /cal/new', k => mintCalendarLink(`${SUBMIT}/sync`, k)],
    ['POST /cal/revoke (all)', k => revokeCalendarLinks(`${SUBMIT}/sync`, k)],
    ['onlineFetch (the writes)', async k => onlineFetch<(u: string) => Promise<unknown>>()!(`${SUBMIT}/follow?k=${k}`)],
    ['the answers browser fetch', async k => browserFetch()!(`${SUBMIT}/answers?k=${k}`)],
  ];
  for (const [name, call] of calls) {
    it(`${name}: yes for the account with a session, no for another`, async () => {
      await call(K);
      expect(seen.length).toBeGreaterThan(0);
      expect(hdr(0), name).toBe(SESSION);
      seen = [];
      await call(K2);
      expect(seen.length).toBeGreaterThan(0);
      expect(hdr(0), name + ' other account').toBeUndefined();
    });
  }
  it('the session never appears in a URL', async () => {
    await listSynced(`${SUBMIT}/sync`, K);
    expect(seen.map(s => s.url).join('\n')).not.toContain(SESSION);
  });
});
