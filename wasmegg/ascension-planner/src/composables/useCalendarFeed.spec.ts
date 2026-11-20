/**
 * The calendar feed's controller (spec-calendar-ui, 14 Nov 2026), against a FAKE collector. Off by default; the link is
 * shown once and never kept; Reset and turning off revoke every link; the plan's events go up only when switched on, linked
 * and changed (sameCalendar), 10 s after the last change, once more on a 409.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFeed, CAL_DEBOUNCE_MS, CAL_MANUAL_PUSH_MIN_MS, type CalendarFeedEnv } from './useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';
import * as blackBox from '@/search/blackBox';

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

describe('Update cloud calendar: push the current plan now (Jordan, 15 Nov 2026)', () => {
  const linkedFeed = async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    return { c, col };
  };
  it('sends the plan at once, not 10 s from now, and says it was sent', async () => {
    const { c, col } = await linkedFeed();
    c.note(input(2));
    const before = col.puts().length;
    await c.pushNow();
    expect(col.puts()).toHaveLength(before + 1);
    expect(JSON.parse(col.puts()[before].body!).events.length).toBeGreaterThan(1);
    expect(c.pushed.value).toBe('sent');
  });
  it('writes nothing when the plan is what the calendar already has (the 60-writes-an-hour budget), and says so', async () => {
    const { c, col } = await linkedFeed();
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    const before = col.puts().length;
    vi.advanceTimersByTime(30_000);
    await c.pushNow();
    expect(col.puts()).toHaveLength(before);
    expect(c.pushed.value).toBe('same');
  });
  it('a second press within the cool-down does nothing, however it is asked', async () => {
    const { c, col } = await linkedFeed();
    c.note(input(2));
    await c.pushNow();
    const after = col.puts().length;
    c.note(input(3));
    await c.pushNow();
    expect(col.puts()).toHaveLength(after);
    expect(c.pushCoolingDown.value).toBe(true);
    await vi.advanceTimersByTimeAsync(CAL_MANUAL_PUSH_MIN_MS + 10);
    expect(c.pushCoolingDown.value).toBe(false);
    await c.pushNow();
    expect(col.puts()).toHaveLength(after + 1);
  });
  it('a failed send shows the existing upload error, never "sent"', async () => {
    const { st } = memStore();
    const col = collector({ putStatus: [200, 500] });
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    await c.pushNow();
    expect(c.error.value).toBe('upload');
    expect(c.pushed.value).toBe('');
  });
  it('nothing without a link or the switch, or with no plan yet', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    await c.pushNow();
    c.turnOn();
    await c.pushNow();
    expect(col.puts()).toHaveLength(0);
    expect(c.pushed.value).toBe('');
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
    await vi.advanceTimersByTimeAsync(0);
    col.calls.length = 0; // the bare marker sent right after the mint
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
    const col = collector({ putStatus: [200, 409, 200] });
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    col.calls.length = 0;
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

describe('a failed plan upload shows, and a new link sends the plan at once', () => {
  it('a 400 on the cal PUT: the card error line and a black-box note (no link in it)', async () => {
    const { st } = memStore();
    const col = collector({ putStatus: [200, 400] });
    const note = vi.spyOn(blackBox, 'note').mockImplementation(() => {});
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(c.error.value).toBe('upload');
    expect(note).toHaveBeenCalledTimes(1);
    expect(String(note.mock.calls[0][0])).toMatch(/calendar/i);
    expect(String(note.mock.calls[0][0])).not.toContain('AbCdEf');
    note.mockRestore();
  });
  it('the same plan is sent again after a failure (a reload, or My Runs opened again), not skipped as unchanged', async () => {
    const { st } = memStore();
    const col = collector({ putStatus: [200, 400, 200] });
    const note = vi.spyOn(blackBox, 'note').mockImplementation(() => {});
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    col.calls.length = 0; // the bare marker sent right after the mint
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(1);
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(2);
    expect(c.error.value).toBe('');
    note.mockRestore();
  });
  it('a later good upload clears the line', async () => {
    const { st } = memStore();
    const col = collector({ putStatus: [200, 400, 200] });
    const note = vi.spyOn(blackBox, 'note').mockImplementation(() => {});
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    c.note(input(3));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(c.error.value).toBe('');
    note.mockRestore();
  });
  it('getLink forgets the kept last list, and sends the plan right after minting (no 10 s wait)', async () => {
    const { st, m } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    col.calls.length = 0; // the bare marker sent right after the mint
    c.note(input(2));
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(1);
    expect(m.get('aap.calFeed.acct1.last')).toBeTruthy();
    // a second link, same plan: it must still go up now
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    expect(col.puts()).toHaveLength(2);
  });
  it('a failed mint sends nothing and keeps the last list', async () => {
    const { st, m } = memStore();
    const col = collector({ mint: 409 });
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    c.note(input(2));
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    expect(col.puts()).toHaveLength(0);
    expect(m.has('aap.calFeed.acct1.last')).toBe(false);
  });
});

describe('QA 14 Nov: the 3-link dead end, and the empty feed until My Runs is opened', () => {
  it('limit (409) with no link kept here: Reset link is offered, revokes every link ({ k, all: true }) after the confirm, then Get link works', async () => {
    const { st } = memStore();
    let mint = 409;
    const calls: Call[] = [];
    const f: SyncFetch = async (url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
      const ok = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => null } });
      if (url.endsWith('/cal/new')) return ok(mint, { ok: true, url: URL_OK });
      if (url.endsWith('/cal/revoke')) {
        mint = 200;
        return ok(200, { ok: true, revoked: 3 });
      }
      return ok(200, { updatedAt: 1, unchanged: false });
    };
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: f });
    c.turnOn();
    expect(c.canReset.value).toBe(false);
    await c.getLink();
    expect(c.error.value).toBe('limit');
    expect(c.linked.value).toBe(false);
    expect(c.canReset.value).toBe(true);
    c.askReset();
    expect(c.phase.value).toBe('confirm');
    await c.confirmReset();
    const rev = calls.find(x => x.url.endsWith('/cal/revoke'))!;
    expect(JSON.parse(rev.body!)).toEqual({ k: K, all: true });
    expect(c.error.value).toBe('');
    expect(c.canReset.value).toBe(false);
    await c.getLink();
    expect(c.link.value).toBe(URL_OK);
  });
  it('Reset link is not offered with no link and no limit error', () => {
    const { st } = memStore();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f });
    c.turnOn();
    expect(c.canReset.value).toBe(false);
  });
  it('Get link before My Runs gave any plan: the marker goes up at once, and the card asks for My Runs', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    expect(col.puts()).toHaveLength(1);
    const body = JSON.parse(col.puts()[0].body!);
    expect(body.events.map((e: { uid: string }) => e.uid)).toEqual(['asof']);
    expect(c.needsMyRuns.value).toBe(true);
    c.note(input(2));
    expect(c.needsMyRuns.value).toBe(false);
    await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
    expect(col.puts()).toHaveLength(2);
    expect(JSON.parse(col.puts()[1].body!).events.length).toBeGreaterThan(1);
  });
  it('a plan already known when the link is made is sent (not the bare marker), and the card does not ask', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    c.note(input(2));
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.needsMyRuns.value).toBe(false);
    expect(JSON.parse(col.puts()[0].body!).events.length).toBeGreaterThan(1);
  });
  describe('between opening My Runs and the first plan upload (QA 15 Nov 2026: 60-100 s under load, the feed held only the marker)', () => {
    it('"working" from My Runs being open with a link and no plan sent, until the first plan upload succeeds', async () => {
      const { st } = memStore();
      const col = collector();
      const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
      c.turnOn();
      await c.getLink();
      await vi.advanceTimersByTimeAsync(0);
      // The marker is up, My Runs is not open: the card asks for it, nothing is "working".
      expect(c.needsMyRuns.value).toBe(true);
      expect(c.onMyRuns.value).toBe(false);
      expect(c.working.value).toBe(false);
      // My Runs opens, its tracker not worked out yet: no plan to send, so working, and not asking any more.
      c.viewing();
      expect(c.onMyRuns.value).toBe(true);
      expect(c.working.value).toBe(true);
      // The plan comes in: it is sent 10 s later, and only then does "working" end.
      c.note(input(2));
      expect(c.working.value).toBe(true);
      await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
      expect(col.puts()).toHaveLength(2);
      expect(c.working.value).toBe(false);
    });
    it('a link made while My Runs is already open is "working" at once', async () => {
      const { st } = memStore();
      const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f });
      c.turnOn();
      c.viewing();
      expect(c.working.value).toBe(false);
      await c.getLink();
      expect(c.working.value).toBe(true);
    });
    it('after a page reload the same plan is already up (nothing to send): not "working" for good', async () => {
      const { st } = memStore();
      const col = collector();
      const a = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
      a.turnOn();
      await a.getLink();
      a.note(input(2));
      await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
      const sent = col.puts().length;
      // A new page load: same storage, nothing in memory.
      const b = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
      expect(b.linked.value).toBe(true);
      b.viewing();
      expect(b.working.value).toBe(true);
      b.note(input(2));
      await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
      expect(col.puts()).toHaveLength(sent);
      expect(b.working.value).toBe(false);
    });
    it('a failed plan upload ends "working": the upload error says it instead', async () => {
      const { st } = memStore();
      const col = collector({ putStatus: [200, 500] });
      const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
      c.turnOn();
      await c.getLink();
      c.viewing();
      c.note(input(2));
      await vi.advanceTimersByTimeAsync(CAL_DEBOUNCE_MS + 10);
      expect(c.error.value).toBe('upload');
      expect(c.working.value).toBe(false);
    });
    it('no link, or switched off: never working', async () => {
      const { st } = memStore();
      const c = createCalendarFeed({ storage: st, env: ENV, fetch: collector().f });
      c.viewing();
      expect(c.working.value).toBe(false);
      c.turnOn();
      expect(c.working.value).toBe(false);
    });
  });
  it('a failed mint puts nothing up and does not ask', async () => {
    const { st } = memStore();
    const col = collector({ mint: 503 });
    const c = createCalendarFeed({ storage: st, env: ENV, fetch: col.f });
    c.turnOn();
    await c.getLink();
    await vi.advanceTimersByTimeAsync(0);
    expect(col.puts()).toHaveLength(0);
    expect(c.needsMyRuns.value).toBe(false);
  });
});
