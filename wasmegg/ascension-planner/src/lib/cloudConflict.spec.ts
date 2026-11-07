/**
 * The collector's two new answers to a follow or prefs PUT (red team C4, collector/follow.js and prefs.js on
 * spec-redteam-collector): 409 `{ latest: { value, version, updatedAt } }` when the stored `at` is newer than the one
 * sent, and 400 with the problem "at is more than 10 minutes ahead of the collector clock" when the `at` sent is.
 * putFollow and putPrefs say 'newer' with the stored value for the first (one call, never a write-back), and send
 * again ONCE stamped now for the second (`resentAt`); every other answer is as before. A fake collector (a fetch
 * mock) only. Ids: placeholders only.
 */
import { describe, expect, it } from 'vitest';
import { putFollow, type CloudValue, type FetchLike } from './followCloud';
import { putPrefs, type CloudSetup, type PrefsFetch } from './prefsCloud';

/** sha256("aaap-follow-v1:EI1234567890123456"). */
const KEY = 'c3de0b5e6758891f25111a1dfbd14deccbd3de200a9a93ba1ea30165f847711e';
const AT = Date.UTC(2026, 10, 6, 18);
const T = Math.floor(AT / 1000);
const FOLLOW = 'https://collector.example/follow';
const PREFS = 'https://collector.example/prefs';
const AHEAD = {
  error: 'rejected',
  problems: ["at is more than 10 minutes ahead of the collector clock: check this device's clock"],
};

type Reply = { status: number; body: unknown } | 'offline';
/** A fake collector answering each call in turn (the last answer repeats), counting the calls. */
function collector(...replies: Reply[]) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const f = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r === 'offline') throw new TypeError('Failed to fetch');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f: f as FetchLike & PrefsFetch, calls, sent: (i: number) => JSON.parse(calls[i].body!) };
}

const route = (at = AT): CloudValue => ({ chain: [222, 313, 490], planStart: T, source: 'fast', at });
const newerRoute = { chain: [230, 490], planStart: T, source: 'exact', at: AT + 60_000 };
const setupValue = (at = AT): CloudSetup => ({ at, targetTE: 350, timezone: 'America/Denver' });
const newerSetup = { at: AT + 60_000, targetTE: 300, timezone: 'Europe/London' };
const NOW = AT - 3_600_000;
const clock = () => NOW;

describe('putFollow', () => {
  it('409: the stored value is newer; says so with it, in one call', async () => {
    const c = collector({
      status: 409,
      body: { error: 'a newer value is stored', latest: { value: newerRoute, version: 7, updatedAt: AT + 61_000 } },
    });
    const r = await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock);
    expect(r).toEqual({ ok: false, why: 'newer', latest: { value: newerRoute, version: 7, updatedAt: AT + 61_000 } });
    expect(c.calls.length).toBe(1);
  });

  it('409 with a stored value that does not read: an error (tried again on the next load), still one call', async () => {
    const c = collector({ status: 409, body: { error: 'x', latest: { value: { chain: 'no' } } } });
    expect(await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock)).toEqual({ ok: false, why: 'error' });
    expect(c.calls.length).toBe(1);
  });

  it('400 ahead: sent again ONCE stamped now (the rest the same), and saved', async () => {
    const c = collector({ status: 400, body: AHEAD }, { status: 200, body: { ok: true, version: 3, updatedAt: AT } });
    const far = route(AT + 3_600_000);
    const r = await putFollow(FOLLOW, KEY, 'fastest-490', far, c.f, clock);
    expect(r).toEqual({ ok: true, version: 3, resentAt: NOW });
    expect(c.calls.length).toBe(2);
    expect(c.sent(0).value.at).toBe(AT + 3_600_000);
    expect(c.sent(1)).toEqual({ k: KEY, goal: 'race490', value: { ...far, at: NOW } });
  });

  it('400 ahead twice: no third call; says ahead (left pending, not refused for good)', async () => {
    const c = collector({ status: 400, body: AHEAD });
    expect(await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock)).toEqual({
      ok: false,
      why: 'ahead',
      resentAt: NOW,
    });
    expect(c.calls.length).toBe(2);
  });

  it('400 ahead, then 409 on the resend: the newer stored value, two calls', async () => {
    const c = collector(
      { status: 400, body: AHEAD },
      { status: 409, body: { latest: { value: newerRoute, version: 2, updatedAt: AT } } }
    );
    const r = await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock);
    expect(r).toMatchObject({ ok: false, why: 'newer', resentAt: NOW, latest: { value: newerRoute, version: 2 } });
    expect(c.calls.length).toBe(2);
  });

  it('400 ahead, then 429 or offline on the resend: that answer, two calls', async () => {
    let c = collector({ status: 400, body: AHEAD }, { status: 429, body: { retryAfter: 90 } });
    expect(await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock)).toEqual({
      ok: false,
      why: 'limit',
      retryAfter: 90,
      resentAt: NOW,
    });
    expect(c.calls.length).toBe(2);
    c = collector({ status: 400, body: AHEAD }, 'offline');
    expect(await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock)).toEqual({
      ok: false,
      why: 'offline',
      resentAt: NOW,
    });
    expect(c.calls.length).toBe(2);
  });

  it("today's answers are unchanged, each in one call: 200, 429, 400 (any other problem), 413, 503, 500, offline", async () => {
    const cases: [Reply, unknown][] = [
      [
        { status: 200, body: { ok: true, version: 2, updatedAt: AT } },
        { ok: true, version: 2 },
      ],
      [
        { status: 429, body: { error: 'x', retryAfter: 1200 } },
        { ok: false, why: 'limit', retryAfter: 1200 },
      ],
      [
        { status: 400, body: { error: 'rejected', problems: ['at most 8 goals'] } },
        { ok: false, why: 'rejected' },
      ],
      [
        { status: 413, body: { error: 'too big' } },
        { ok: false, why: 'big' },
      ],
      [
        { status: 503, body: { error: 'off' } },
        { ok: false, why: 'off' },
      ],
      [
        { status: 500, body: {} },
        { ok: false, why: 'error' },
      ],
      ['offline', { ok: false, why: 'offline' }],
    ];
    for (const [reply, want] of cases) {
      const c = collector(reply);
      expect(await putFollow(FOLLOW, KEY, 'fastest-490', route(), c.f, clock)).toEqual(want);
      expect(c.calls.length).toBe(1);
    }
  });

  it('the 8-goal cap (429) keeps its own handling: limit with its retryAfter, one call', async () => {
    const c = collector({
      status: 429,
      body: { error: 'too many', why: 'at most 8 goals for one key', retryAfter: 3600 },
    });
    expect(await putFollow(FOLLOW, KEY, 'date-1800000000', route(), c.f, clock)).toEqual({
      ok: false,
      why: 'limit',
      retryAfter: 3600,
    });
    expect(c.calls.length).toBe(1);
  });
});

describe('putPrefs', () => {
  it('409: the stored value is newer; says so with it (read as its kind), in one call', async () => {
    const c = collector({ status: 409, body: { latest: { value: newerSetup, version: 4, updatedAt: AT } } });
    const r = await putPrefs(PREFS, KEY, 'setup', setupValue(), c.f, clock);
    expect(r).toEqual({ ok: false, why: 'newer', latest: { value: newerSetup, version: 4, updatedAt: AT } });
    expect(c.calls.length).toBe(1);
    const consent = { at: AT + 5, study: 'yes', ticks: { leaderboard: true }, credit: 'anonymous' };
    const c2 = collector({ status: 409, body: { latest: { value: consent, version: 1, updatedAt: AT } } });
    expect(await putPrefs(PREFS, KEY, 'consent', { at: AT, study: 'no' }, c2.f, clock)).toMatchObject({
      ok: false,
      why: 'newer',
      latest: { value: { at: AT + 5, study: 'yes' } },
    });
    expect(c2.calls.length).toBe(1);
  });

  it('400 ahead: sent again ONCE stamped now, and saved', async () => {
    const c = collector({ status: 400, body: AHEAD }, { status: 200, body: { ok: true, version: 5 } });
    const r = await putPrefs(PREFS, KEY, 'setup', setupValue(AT + 3_600_000), c.f, clock);
    expect(r).toEqual({ ok: true, version: 5, unchanged: false, resentAt: NOW });
    expect(c.calls.length).toBe(2);
    expect(c.sent(1)).toEqual({ k: KEY, kind: 'setup', value: setupValue(NOW) });
  });

  it('400 ahead twice: no third call; says ahead', async () => {
    const c = collector({ status: 400, body: AHEAD });
    expect(await putPrefs(PREFS, KEY, 'setup', setupValue(), c.f, clock)).toEqual({
      ok: false,
      why: 'ahead',
      resentAt: NOW,
    });
    expect(c.calls.length).toBe(2);
  });

  it("today's answers are unchanged, each in one call: 200, 429, 400, 404, 413, 503, 500, offline", async () => {
    const cases: [Reply, unknown][] = [
      [
        { status: 200, body: { ok: true, version: 2, unchanged: true } },
        { ok: true, version: 2, unchanged: true },
      ],
      [
        { status: 429, body: { error: 'x', retryAfter: 120 } },
        { ok: false, why: 'limit', retryAfter: 120 },
      ],
      [
        { status: 400, body: { error: 'rejected', problems: ['kind must be consent or setup'] } },
        { ok: false, why: 'rejected' },
      ],
      [
        { status: 404, body: {} },
        { ok: false, why: 'missing' },
      ],
      [
        { status: 413, body: {} },
        { ok: false, why: 'big' },
      ],
      [
        { status: 503, body: {} },
        { ok: false, why: 'off' },
      ],
      [
        { status: 500, body: {} },
        { ok: false, why: 'error' },
      ],
      ['offline', { ok: false, why: 'offline' }],
    ];
    for (const [reply, want] of cases) {
      const c = collector(reply);
      expect(await putPrefs(PREFS, KEY, 'setup', setupValue(), c.f, clock)).toEqual(want);
      expect(c.calls.length).toBe(1);
    }
  });
});
