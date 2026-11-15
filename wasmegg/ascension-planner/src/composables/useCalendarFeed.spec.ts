/**
 * The calendar feed's controller (spec-calendar-ui, 14 Nov 2026), against a FAKE collector. Off by default; the link is
 * shown once and never kept; Reset and turning off revoke every link; the plan's events go up only when switched on, linked
 * and changed (sameCalendar), 10 s after the last change, once more on a 409.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFeed, CAL_DEBOUNCE_MS, type CalendarFeedEnv } from './useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';

const K = 'b'.repeat(64);
const SYNC = 'https://collector.example/sync';
const URL_OK = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStUv.ics';

function memStore() {
  const m = new Map<string, string>();
  return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}
interface Call { url: string; method?: string; body?: string }
function collector(opts: { mint?: number; putStatus?: number[] } = {}) {
  const calls: Call[] = [];
  let putN = 0;
  const f: SyncFetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
    const ok = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => null } });
    if (url.endsWith('/cal/new')) return ok(opts.mint ?? 200, { ok: true, url: URL_OK });
    if (url.endsWith('/cal/revoke')) return ok(200, { ok: true, revoked: 1 });
    if (url.includes('/sync?')) {
      const s = opts.putStatus?.[putN++] ?? 200;
      return ok(s, s === 409 ? { latest: { kind: 'cal', slot: '0', at: 9_999_999_999_999, updatedAt: 1 } } : { updatedAt: 1, unchanged: false });
    }
    return ok(404);
  };
  return { f, calls, puts: () => calls.filter(c => c.method === 'PUT') };
}
const ENV: CalendarFeedEnv = { account: 'acct1', target: () => ({ url: SYNC, k: K }) };
const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, kind: 'research' as const, at: 1_800_000_000 + i * 3600, text: `buy Thing ${i}`, tickable: true, checkIn: i }));
const input = (n = 2) => ({ now: 1_799_990_000_000, ascensionStart: 1_799_000_000, lines: lines(n), ticks: new Set<string>(), zone: 'America/Los_Angeles', hours: null });

// The build flag is off in the repo (lib/calendarFeedFlag.spec.ts); these specs are of a build with it on.
beforeEach(() => {
  CALENDAR_FEED.enabled = true;
  vi.useFakeTimers();
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
  vi.useRealTimers();
});

describe('off by default; its own switch', () => {
  it('a new account: off, no link, nothing sent', () => {
    const { st } = memStore();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f });
    expect(c.enabled.value).toBe(false);
    expect(c.linked.value).toBe(false);
    expect(c.available.value).toBe(true);
  });
  it('the switch is remembered per account in this browser, and nothing but the flag is stored', () => {
    const { m, st } = memStore();
    const a = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f });
    a.turnOn();
    expect(createCalendarFeed({ storage: st, env: ENV, fetch: collector().f }).enabled.value).toBe(true);
    expect(createCalendarFeed({ storage: st, env: { ...ENV, account: 'other' }, fetch: collector().f }).enabled.value).toBe(false);
    for (const [k, v] of m) expect(`${k}=${v}`).not.toContain('collector.example');
  });
  it('no collector or Save online off: not available, and getLink says so', async () => {
    const { st } = memStore();
    const c = createCalendarFeed({ storage: st, env: { ...ENV, target: () => null }, fetch: collector().f });
    expect(c.available.value).toBe(false);
    c.turnOn();
    await c.getLink();
    expect(c.error.value).toBe('off');
  });
});

describe('Get link: shown once, never kept', () => {
  it('mints with k in the body, shows the link in memory only, remembers only that one exists', async () => {
    const { m, st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    expect(c.link.value).toBe(URL_OK);
    expect(c.linked.value).toBe(true);
    expect(JSON.parse(col.calls[0].body!)).toEqual({ k: K });
    for (const [k, v] of m) expect(`${k}=${v}`).not.toContain('AbCdEfGh');
    // A new page: linked is remembered, the link is not.
    const c2 = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    expect(c2.linked.value).toBe(true);
    expect(c2.link.value).toBeNull();
  });
  it('3 links already: the plain error, no link', async () => {
    const { st } = memStore();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector({ mint: 409 }).f });
    c.turnOn();
    await c.getLink();
    expect(c.error.value).toBe('limit');
    expect(c.link.value).toBeNull();
    expect(c.linked.value).toBe(false);
  });
  it('Copy puts the link on the clipboard, and says Copied', async () => {
    const { st } = memStore();
    const written: string[] = [];
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f, clipboard: { writeText: async t => void written.push(t) } });
    c.turnOn();
    await c.getLink();
    await c.copy();
    expect(written).toEqual([URL_OK]);
    expect(c.copied.value).toBe(true);
  });
});

describe('Reset and turning off revoke every link', () => {
  it('Reset asks first; Keep it does nothing; Reset revokes all and the old link is gone', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.askReset();
    expect(c.phase.value).toBe('confirm');
    c.keepIt();
    expect(c.phase.value).toBe('idle');
    expect(col.calls.filter(x => x.url.endsWith('/cal/revoke'))).toHaveLength(0);
    c.askReset();
    await c.confirmReset();
    const rev = col.calls.find(x => x.url.endsWith('/cal/revoke'))!;
    expect(JSON.parse(rev.body!)).toEqual({ k: K, all: true });
    expect(c.phase.value).toBe('reset-done');
    expect(c.linked.value).toBe(false);
    expect(c.link.value).toBeNull();
  });
  it('turning it off revokes, forgets the link and the last list', async () => {
    const { m, st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await c.turnOff();
    expect(col.calls.some(x => x.url.endsWith('/cal/revoke'))).toBe(true);
    expect(c.enabled.value).toBe(false);
    expect(c.linked.value).toBe(false);
    expect([...m.keys()].filter(k => k.includes('acct1'))).toEqual([]);
  });
});

describe('the plan goes up only when it changed', () => {
  it('not while off, nor on without a link', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.note(input());
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    c.turnOn();
    c.note(input());
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(0);
  });
  it('on and linked: one PUT 10 s after the last change (coalesced), kind cal slot 0; the same plan again sends nothing', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    c.note(input(3));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS - 100);
    expect(col.puts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(col.puts()).toHaveLength(1);
    expect(col.puts()[0].url).toContain('kind=cal');
    expect(col.puts()[0].url).toContain('slot=0');
    c.note(input(3));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(1);
    c.note(input(4));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(2);
  });
  it('a 409 is sent ONCE more with a fresh stamp', async () => {
    const { st } = memStore();
    const col = collector({ putStatus: [409, 200] });
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(2);
  });
  it('the body never holds a player ID', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    for (const p of col.puts()) expect(p.body).not.toMatch(/EI\d{16}/);
  });
});
