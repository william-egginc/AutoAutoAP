/**
 * The calendar link kept encrypted so every browser shows it again (spec-callink-client, 18 Nov 2026; collector kind
 * `callink`, lib/calLinkCrypt.ts). A stand-in collector that keeps the record, two browsers (two storages), placeholder URLs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFeed as create, type CalendarFeedEnv } from './useCalendarFeed';
import type { SyncFetch } from '@/lib/syncedRecords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';
import * as blackBox from '@/search/blackBox';

const K = 'b'.repeat(64);
const ID = 'EI1234567890123456';
const ID2 = 'EI6543210987654321';
const SYNC = 'https://collector.example/sync';
const URL1 = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStU1.ics';
const URL2 = 'https://collector.example/cal/AbCdEfGhIjKlMnOpQrStU2.ics';
const ROUNDS = 1000;

function memStore() {
  const m = new Map<string, string>();
  return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}
interface Call { url: string; method?: string; body?: string }
/** One account's collector: mints links in turn, keeps the callink record, revoke-all removes links and the record. */
function collector(o: { putCallink?: number; getCallink?: 'offline' | 'garbage'; gate?: Promise<void> } = {}) {
  const calls: Call[] = [];
  let record: unknown = null;
  let minted = 0;
  const urls = [URL1, URL2];
  const f: SyncFetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
    const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: (n: string) => (n === 'x-sync-at' ? '1' : n === 'x-sync-updated' ? '1' : null) } });
    if (url.endsWith('/cal/new')) return res(200, { ok: true, url: urls[Math.min(minted++, 1)] });
    if (url.endsWith('/cal/revoke')) {
      record = null;
      return res(200, { ok: true, revoked: 1 });
    }
    if (url.includes('kind=callink')) {
      if (init?.method === 'PUT') {
        if (o.putCallink && o.putCallink >= 400) return res(o.putCallink, { error: 'x' });
        record = JSON.parse(init.body as string);
        return res(200, { ok: true, updatedAt: 1 });
      }
      if (o.gate) {
        // A slow read: the answer is what the collector held when the request arrived, delivered late.
        const snapshot = record;
        await o.gate;
        return snapshot ? res(200, snapshot) : res(404, { error: 'absent' });
      }
      if (o.getCallink === 'offline') throw new TypeError('offline');
      if (o.getCallink === 'garbage') return res(200, { v: 1, iv: 'AAAA', ct: 'BBBB' });
      return record ? res(200, record) : res(404, { error: 'absent' });
    }
    if (url.includes('/sync?')) return res(200, { updatedAt: 1, unchanged: false });
    return res(404);
  };
  return { f, calls, record: () => record, setRecord: (r: unknown) => void (record = r), callinkCalls: () => calls.filter(c => c.url.includes('kind=callink')) };
}
const env = (id: string | null = ID): CalendarFeedEnv => ({ account: 'acct1', target: () => ({ url: SYNC, k: K }), ...(id === null ? {} : { playerId: () => id, linkRounds: ROUNDS }) });
type Feed = ReturnType<typeof create>;
const feeds: Feed[] = [];
/** Every feed the specs make, so `settle` can wait for their checks (real time: the crypto and the stand-in collector are real async work). */
const createCalendarFeed = (o: Parameters<typeof create>[0]): Feed => {
  const c = create(o);
  feeds.push(c);
  return c;
};
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const until = async (ok: () => boolean, ms = 15_000) => {
  for (const t0 = Date.now(); !ok() && Date.now() - t0 < ms; ) await sleep(5);
};
/** Nothing is still being read back (a check starts synchronously when it starts, so this cannot pass early). */
const settle = async () => {
  await sleep(20);
  await until(() => feeds.every(c => c.savedState.value !== 'checking'));
  await sleep(20);
};
const waitFor = async (c: Feed, s: string) => until(() => c.savedState.value === s);

beforeEach(() => {
  CALENDAR_FEED.enabled = true;
  feeds.length = 0;
});
afterEach(() => {
  CALENDAR_FEED.enabled = false;
  vi.restoreAllMocks();
});

describe('saving a new link', () => {
  it('encrypts it and PUTs { v, iv, ct }: no link, no ID, no key anywhere in the call', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    c.turnOn();
    await settle();
    await c.getLink();
    await waitFor(c, 'loaded');
    const puts = col.callinkCalls().filter(x => x.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain('kind=callink');
    expect(puts[0].url).toContain('slot=0');
    const text = puts[0].url + (puts[0].body ?? '');
    for (const bit of [URL1, 'AbCdEfGh', '/cal/', ID, 'EI12345']) expect(text).not.toContain(bit);
    expect(Object.keys(JSON.parse(puts[0].body!)).sort()).toEqual(['ct', 'iv', 'v']);
    expect(c.link.value).toBe(URL1);
    expect(c.savedState.value).toBe('loaded');
    // linkFromSave: the link is kept online (read back, or just saved), so the card drops its "shown only once" warning
    expect(c.linkFromSave.value).toBe(true);
  });
  it('a failed save leaves today\'s behaviour: the link is shown once, savedState stays none', async () => {
    const { st } = memStore();
    const col = collector({ putCallink: 500 });
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    c.turnOn();
    await settle();
    await c.getLink();
    await settle();
    expect(c.link.value).toBe(URL1);
    expect(c.linked.value).toBe(true);
    expect(c.savedState.value).toBe('none');
    expect(c.linkFromSave.value).toBe(false);
  });
  it('the key is worked out once per browser, not per call', async () => {
    const { st } = memStore();
    const col = collector();
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    c.turnOn();
    await settle();
    await c.getLink();
    await waitFor(c, 'loaded');
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('without a player ID in the env nothing about the saved copy is called (today\'s behaviour)', async () => {
    const { st } = memStore();
    const col = collector();
    const c = createCalendarFeed({ storage: st, env: env(null), fetch: col.f });
    c.turnOn();
    await settle();
    await c.getLink();
    await settle();
    expect(col.callinkCalls()).toHaveLength(0);
    expect(c.savedState.value).toBe('none');
  });
});

describe('another browser', () => {
  async function firstBrowser(col: ReturnType<typeof collector>) {
    const a = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    a.turnOn();
    await settle();
    await a.getLink();
    await waitFor(a, 'loaded');
    return a;
  }
  it('turning the switch on checks, then shows the saved link: loaded, linkFromSave, linked, marker kept', async () => {
    const col = collector();
    await firstBrowser(col);
    const { m, st } = memStore();
    const b = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    expect(b.savedState.value).toBe('none');
    expect(b.linked.value).toBe(false);
    b.turnOn();
    expect(b.savedState.value).toBe('checking');
    await waitFor(b, 'loaded');
    expect(b.savedState.value).toBe('loaded');
    expect(b.link.value).toBe(URL1);
    expect(b.linkFromSave.value).toBe(true);
    expect(b.linked.value).toBe(true);
    expect(m.get('aap.calFeed.acct1.linked')).toBe('1');
    // the link itself is never kept in this browser's storage
    for (const [k, v] of m) expect(`${k}=${v}`).not.toContain('AbCdEf');
  });
  it('a page load with the switch already on checks at once', async () => {
    const col = collector();
    await firstBrowser(col);
    const { st } = memStore();
    st.setItem('aap.calFeed.acct1', '1');
    const b = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await waitFor(b, 'loaded');
    expect(b.link.value).toBe(URL1);
    expect(col.callinkCalls().filter(x => x.method !== 'PUT')).toHaveLength(2);
  });
  it('the switch off: no check, no call', async () => {
    const col = collector();
    await firstBrowser(col);
    const before = col.calls.length;
    createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    await settle();
    expect(col.calls.length).toBe(before);
  });
  it('another ID cannot read it: unreadable, linked, no link', async () => {
    const col = collector();
    await firstBrowser(col);
    const b = createCalendarFeed({ storage: memStore().st, env: env(ID2), fetch: col.f });
    b.turnOn();
    await waitFor(b, 'unreadable');
    expect(b.savedState.value).toBe('unreadable');
    expect(b.linked.value).toBe(true);
    expect(b.link.value).toBeNull();
    expect(b.linkFromSave.value).toBe(false);
  });
  it('a bad record is unreadable too', async () => {
    const col = collector({ getCallink: 'garbage' });
    const b = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    b.turnOn();
    await waitFor(b, 'unreadable');
    expect(b.savedState.value).toBe('unreadable');
    expect(b.link.value).toBeNull();
  });
  it('no saved copy: none, not linked (an older link made before this shipped shows as today)', async () => {
    const col = collector();
    const { st } = memStore();
    const b = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    b.turnOn();
    await settle();
    expect(b.savedState.value).toBe('none');
    expect(b.linked.value).toBe(false);
    st.setItem('aap.calFeed.acct1.linked', '1');
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await settle();
    expect(c.savedState.value).toBe('none');
    expect(c.linked.value).toBe(true);
    expect(c.canReset.value).toBe(true);
  });
  it('offline on the check: none, nothing shown as an error, asked once (no loop)', async () => {
    const col = collector({ getCallink: 'offline' });
    const b = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    b.turnOn();
    await settle();
    await sleep(150);
    expect(b.savedState.value).toBe('none');
    expect(b.error.value).toBe('');
    expect(col.callinkCalls()).toHaveLength(1);
  });
  it('nothing logged holds the link or the ID', async () => {
    const note = vi.spyOn(blackBox, 'note').mockImplementation(() => {});
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const col = collector({ putCallink: 500 });
    const a = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    a.turnOn();
    await settle();
    await a.getLink();
    await settle();
    const b = createCalendarFeed({ storage: memStore().st, env: env(ID2), fetch: collector({ getCallink: 'garbage' }).f });
    b.turnOn();
    await settle();
    const logged = JSON.stringify([...note.mock.calls, ...log.mock.calls]);
    for (const bit of ['AbCdEf', ID, ID2, '/cal/']) expect(logged).not.toContain(bit);
  });
});

describe('reset, turning off and replacing', () => {
  async function linked() {
    const col = collector();
    const { st } = memStore();
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    c.turnOn();
    await settle();
    await c.getLink();
    await waitFor(c, 'loaded');
    return { col, c, st };
  }
  it('Reset link deletes the saved copy and clears the states before reset-done', async () => {
    const { col, c } = await linked();
    c.askReset();
    await c.confirmReset();
    expect(col.calls.some(x => x.url.endsWith('/cal/revoke'))).toBe(true);
    expect(col.record()).toBeNull();
    expect(c.savedState.value).toBe('none');
    expect(c.linkFromSave.value).toBe(false);
    expect(c.linked.value).toBe(false);
    expect(c.link.value).toBeNull();
    expect(c.phase.value).toBe('reset-done');
  });
  it('a reset that fails keeps everything as it was', async () => {
    const col = collector();
    let down = false;
    const f: SyncFetch = async (url, init) => (down && url.endsWith('/cal/revoke') ? { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } } : col.f(url, init));
    const c = createCalendarFeed({ storage: memStore().st, env: env(), fetch: f });
    c.turnOn();
    await settle();
    await c.getLink();
    await waitFor(c, 'loaded');
    down = true;
    c.askReset();
    await c.confirmReset();
    expect(col.record()).not.toBeNull();
    expect(c.savedState.value).toBe('loaded');
    expect(c.linked.value).toBe(true);
    expect(c.link.value).toBe(URL1);
    expect(c.phase.value).toBe('idle');
  });
  it('turning the switch off revokes and forgets the saved copy too', async () => {
    const { col, c } = await linked();
    await c.turnOff();
    expect(col.record()).toBeNull();
    expect(c.savedState.value).toBe('none');
    expect(c.link.value).toBeNull();
  });
  it('replaceLink (from unreadable): revokes every link, then mints and saves a new one: loaded, not from the save', async () => {
    const col = collector();
    const first = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    first.turnOn();
    await settle();
    await first.getLink();
    await waitFor(first, 'loaded');
    const b = createCalendarFeed({ storage: memStore().st, env: env(ID2), fetch: col.f });
    b.turnOn();
    await waitFor(b, 'unreadable');
    col.calls.length = 0;
    await b.replaceLink();
    await waitFor(b, 'loaded');
    const order = col.calls.map(x => (x.url.endsWith('/cal/revoke') ? 'revoke' : x.url.endsWith('/cal/new') ? 'new' : x.method === 'PUT' && x.url.includes('kind=callink') ? 'save' : ''));
    expect(order.filter(Boolean)).toEqual(['revoke', 'new', 'save']);
    expect(b.link.value).toBe(URL2);
    expect(b.linkFromSave.value).toBe(true);
    expect(b.savedState.value).toBe('loaded');
    // and now the new link opens in a browser of the ID that made it (ID2)
    const again = createCalendarFeed({ storage: memStore().st, env: env(ID2), fetch: col.f });
    again.turnOn();
    await waitFor(again, 'loaded');
    expect(again.link.value).toBe(URL2);
  });
  it('replaceLink stops at the revoke when it fails: no new link, the states as they were', async () => {
    const col = collector();
    const failing: SyncFetch = async (url, init) => (url.endsWith('/cal/revoke') ? { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } } : col.f(url, init));
    const b = createCalendarFeed({ storage: memStore().st, env: env(ID2), fetch: failing });
    b.turnOn();
    await settle();
    col.setRecord({ v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(40) });
    await b.replaceLink();
    expect(col.calls.some(x => x.url.endsWith('/cal/new'))).toBe(false);
    expect(b.error.value).not.toBe('');
  });
});

describe('a slow check never overwrites what happened meanwhile', () => {
  it('a link made while the check is out stays: the late "no saved copy" answer does not downgrade it', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const col = collector({ gate });
    const { st } = memStore();
    st.setItem('aap.calFeed.acct1', '1');
    const a = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    expect(a.savedState.value).toBe('checking');
    await a.getLink();
    await until(() => col.record() !== null);
    await until(() => a.savedState.value === 'loaded');
    release();
    await sleep(60);
    expect(a.savedState.value).toBe('loaded');
    expect(a.link.value).toBe(URL1);
    expect(a.linkFromSave.value).toBe(true);
    expect(a.linked.value).toBe(true);
  });
  it('a reset made while the check is out stays reset: a late answer that held a record does not bring the link back', async () => {
    const seed = collector();
    const first = createCalendarFeed({ storage: memStore().st, env: env(), fetch: seed.f });
    first.turnOn();
    await settle();
    await first.getLink();
    await waitFor(first, 'loaded');
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const slow = collector({ gate });
    slow.setRecord(seed.record());
    const { st } = memStore();
    st.setItem('aap.calFeed.acct1', '1');
    const b = createCalendarFeed({ storage: st, env: env(), fetch: slow.f });
    expect(b.savedState.value).toBe('checking');
    b.askReset();
    await b.confirmReset();
    release();
    await sleep(80);
    expect(b.savedState.value).toBe('none');
    expect(b.link.value).toBeNull();
    expect(b.linked.value).toBe(false);
    expect(b.linkFromSave.value).toBe(false);
  });
});

describe('the saved link removed in another browser (QA 18 Nov: Reset or switch off in A, then reload B)', () => {
  const setup = async () => {
    const col = collector();
    const a = createCalendarFeed({ storage: memStore().st, env: env(), fetch: col.f });
    a.turnOn();
    await settle();
    await a.getLink();
    await waitFor(a, 'loaded');
    const { m, st } = memStore();
    const b = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    b.turnOn();
    await waitFor(b, 'loaded');
    return { col, a, b, m, st };
  };
  it('after A resets, B reloads with no marker: "Get link", not "can\'t be shown again"', async () => {
    const { col, a, st } = await setup();
    await a.askReset();
    await a.confirmReset();
    expect(col.record()).toBeNull();
    const b2 = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await settle();
    expect(b2.savedState.value).toBe('none');
    expect(b2.linked.value).toBe(false);
    expect(b2.canReset.value).toBe(false);
    expect(st.getItem('aap.calFeed.acct1.linked')).toBeNull();
  });
  it('the same when A turned the switch off', async () => {
    const { col, a, st } = await setup();
    await a.turnOff();
    const b2 = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await settle();
    expect(b2.linked.value).toBe(false);
  });
  it('a live check in B (page open) sees it too when the switch is turned on again', async () => {
    const { col, a, b } = await setup();
    await a.turnOff();
    await b.turnOff();
    b.turnOn();
    await settle();
    expect(b.linked.value).toBe(false);
    expect(col.record()).toBeNull();
  });
  it('an older link made here before the save existed keeps its marker (no copy was ever seen here)', async () => {
    const col = collector();
    const { st } = memStore();
    st.setItem('aap.calFeed.acct1', '1');
    st.setItem('aap.calFeed.acct1.linked', '1');
    const c = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await settle();
    expect(c.linked.value).toBe(true);
    expect(c.savedState.value).toBe('none');
  });
  it('offline, a 5xx or an old collector\'s 400 on the check never clears the marker', async () => {
    for (const mode of ['offline'] as const) {
      const { col, st } = await setup();
      const bad = collector({ getCallink: mode });
      void col;
      const c = createCalendarFeed({ storage: st, env: env(), fetch: bad.f });
      await settle();
      expect(c.linked.value).toBe(true);
    }
  });
  it('a link made in this browser whose save failed keeps its marker on the next load', async () => {
    const col = collector({ putCallink: 500 });
    const { st } = memStore();
    const a = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    a.turnOn();
    await settle();
    await a.getLink();
    await settle();
    const a2 = createCalendarFeed({ storage: st, env: env(), fetch: col.f });
    await settle();
    expect(a2.linked.value).toBe(true);
  });
});
