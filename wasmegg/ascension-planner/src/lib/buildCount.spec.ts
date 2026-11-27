/**
 * "Which build is in use" (lib/buildCount.ts): only the build id is sent, at most once a day per browser (once per
 * page load with storage blocked), only after the page has been visible a few seconds, never offline, never with
 * Global Privacy Control or Do Not Track on. The collector side is collector/buildcount.spec.js.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILD_COUNT_KEY,
  BUILD_ID,
  VISIBLE_MS,
  asksNotToTrack,
  buildIdFrom,
  countUrlFrom,
  sendBuild,
  sentOn,
  stamped,
  startBuildCount,
  type BuildCountDeps,
  type CountNavigator,
} from './buildCount';

const B = 'index-BGv8tSVu';
const URL_V = 'https://collector.example/v';
const T0 = Date.UTC(2026, 9, 24, 15, 0, 0);
const DAY = 86_400_000;

/** A page: a document whose visibility the spec sets, a window for `online`, storage, a clock and the sends. */
function page(
  opts: {
    nav?: CountNavigator;
    win?: { doNotTrack?: string | null };
    storage?: 'ok' | 'blocked';
    store?: Map<string, string>;
  } = {}
) {
  const docListeners = new Map<string, Set<() => void>>();
  const winListeners = new Map<string, Set<() => void>>();
  const on = (m: Map<string, Set<() => void>>) => (t: string, f: () => void) => {
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(f);
  };
  const off = (m: Map<string, Set<() => void>>) => (t: string, f: () => void) => m.get(t)?.delete(f);
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: on(docListeners),
    removeEventListener: off(docListeners),
  };
  const events = { addEventListener: on(winListeners), removeEventListener: off(winListeners) };
  const store = opts.store ?? new Map<string, string>();
  const sends: { url: string; build: string }[] = [];
  const nav: CountNavigator = { onLine: true, ...opts.nav };
  let now = T0;
  const deps: Partial<BuildCountDeps> = {
    url: URL_V,
    nav,
    win: opts.win ?? {},
    doc: doc as unknown as BuildCountDeps['doc'],
    events: events as unknown as BuildCountDeps['events'],
    storage: () => {
      if (opts.storage === 'blocked') throw new DOMException('blocked', 'SecurityError');
      return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    },
    now: () => now,
    send: (url, build) => void sends.push({ url, build }),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: t => clearTimeout(t as ReturnType<typeof setTimeout>),
    loadMemory: new Set(),
  };
  return {
    deps,
    nav,
    store,
    sends,
    /** A new page load in the same browser: same storage, fresh memory. */
    reload: () => (deps.loadMemory = new Set()),
    setNow: (ms: number) => (now = ms),
    setVisible: (v: boolean) => {
      doc.visibilityState = v ? 'visible' : 'hidden';
      for (const f of docListeners.get('visibilitychange') ?? []) f();
    },
    goOnline: () => {
      nav.onLine = true;
      for (const f of winListeners.get('online') ?? []) f();
    },
    listeners: () => [...docListeners.values(), ...winListeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the build id', () => {
  it('is the hashed entry name, without its folder or .js', () => {
    expect(buildIdFrom('/assets/index-BGv8tSVu.js', 'index')).toBe(B);
    expect(buildIdFrom('./assets/index-BGv8tSVu.js', 'index')).toBe(B);
    expect(buildIdFrom('https://egg.example/beta/assets/explorer-Dk_3-a9Q.js', 'explorer')).toBe('explorer-Dk_3-a9Q');
    expect(BUILD_ID.test(B)).toBe(true);
  });

  it('is nothing on the dev server, for another entry, or for a name the collector would refuse', () => {
    expect(buildIdFrom('/src/main.ts', 'index')).toBeNull();
    expect(buildIdFrom(null, 'index')).toBeNull();
    expect(buildIdFrom('/assets/explorer-Dk_3-a9Q.js', 'index')).toBeNull();
    expect(buildIdFrom('/assets/index-abc.js', 'index')).toBeNull();
    expect(buildIdFrom('/assets/index-abcdefghijklmnopq.js', 'index')).toBeNull();
  });

  it('matches the collector check exactly', () => {
    const worker = readFileSync(new URL('../../collector/buildcount.js', import.meta.url), 'utf8');
    expect(worker).toContain(`export const BUILD_ID = ${BUILD_ID.toString()};`);
  });

  it('goes to <collector>/v, and nowhere without a collector', () => {
    expect(countUrlFrom('https://collector.example/submit')).toBe(URL_V);
    expect(countUrlFrom('https://collector.example/')).toBe(URL_V);
    expect(countUrlFrom('')).toBeNull();
    expect(countUrlFrom(undefined)).toBeNull();
    expect(countUrlFrom('javascript:alert(1)')).toBeNull();
  });
});

describe('what is sent', () => {
  it('only the build id, as the body of one POST with no referrer, no cookies, keepalive; a failure is silent', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      sendBuild(URL_V, B);
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(URL_V);
      expect(init).toEqual({
        method: 'POST',
        body: B,
        keepalive: true,
        mode: 'no-cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      fetchMock.mockImplementation(() => {
        throw new Error('no fetch');
      });
      expect(() => sendBuild(URL_V, B)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the stored stamp holds only builds and days, today only', () => {
    const old = JSON.stringify({
      'index-OLDbuild1': '2026-10-20',
      'explorer-Dk_3-a9Q': '2026-10-24',
      junk: '2026-10-24',
    });
    expect(JSON.parse(stamped(old, B, '2026-10-24'))).toEqual({ 'explorer-Dk_3-a9Q': '2026-10-24', [B]: '2026-10-24' });
    expect(sentOn(stamped(null, B, '2026-10-24'), B, '2026-10-24')).toBe(true);
    expect(sentOn('not json', B, '2026-10-24')).toBe(false);
    expect(sentOn('[1]', B, '2026-10-24')).toBe(false);
  });

  it('the page code sends nothing but the build: no player ID, account, save or path reaches sendBuild', () => {
    const src = readFileSync(new URL('./buildCount.ts', import.meta.url), 'utf8');
    expect(src.match(/d\.send\(/g)).toHaveLength(1);
    expect(src).toContain('d.send(url, build!);');
    expect(src).not.toMatch(/playerId|eiUserId|location\.|backup|acct/i);
    expect(src).not.toMatch(/EI\d{16}/);
  });

  it('useNewVersion starts it with the loaded entry only', () => {
    const src = readFileSync(new URL('../composables/useNewVersion.ts', import.meta.url), 'utf8');
    expect(src).toContain('stopCount = startBuildCount(buildIdFrom(loadedSrc, entry));');
    expect(src).toContain('stopCount?.();');
  });
});

describe('when it is sent', () => {
  it(`after ${VISIBLE_MS / 1000} seconds visible, once`, () => {
    const p = page();
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    expect(p.sends).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(p.sends).toEqual([{ url: URL_V, build: B }]);
    vi.advanceTimersByTime(10 * VISIBLE_MS);
    p.setVisible(false);
    p.setVisible(true);
    vi.advanceTimersByTime(10 * VISIBLE_MS);
    expect(p.sends).toHaveLength(1);
    expect(p.listeners()).toBe(0);
  });

  it('once a day per browser: later loads that day send nothing, the next UTC day sends again', () => {
    const p = page();
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    for (let i = 0; i < 3; i++) {
      p.reload();
      p.setNow(T0 + i * 3_600_000);
      startBuildCount(B, p.deps);
      vi.advanceTimersByTime(VISIBLE_MS);
    }
    expect(p.sends).toHaveLength(1);
    expect(JSON.parse(p.store.get(BUILD_COUNT_KEY)!)).toEqual({ [B]: '2026-10-24' });
    p.reload();
    p.setNow(T0 + DAY);
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    expect(p.sends).toHaveLength(2);
    expect(JSON.parse(p.store.get(BUILD_COUNT_KEY)!)).toEqual({ [B]: '2026-10-25' });
  });

  it('a new build the same day is its own count', () => {
    const p = page();
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    p.reload();
    startBuildCount('index-NEWbuild2', p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    expect(p.sends.map(s => s.build)).toEqual([B, 'index-NEWbuild2']);
  });

  it('not while hidden: the few seconds start over each time the page is shown', () => {
    const p = page();
    p.setVisible(false);
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(60_000);
    expect(p.sends).toEqual([]);
    p.setVisible(true);
    vi.advanceTimersByTime(VISIBLE_MS - 1000);
    p.setVisible(false);
    vi.advanceTimersByTime(60_000);
    p.setVisible(true);
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    expect(p.sends).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(p.sends).toHaveLength(1);
  });

  it('never while offline: it waits for the browser to be online, then for a few seconds visible', () => {
    const p = page({ nav: { onLine: false } });
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(60_000);
    expect(p.sends).toEqual([]);
    expect(p.store.has(BUILD_COUNT_KEY)).toBe(false);
    p.goOnline();
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    expect(p.sends).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(p.sends).toHaveLength(1);
  });

  it('with storage blocked: at most once per page load', () => {
    const p = page({ storage: 'blocked' });
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    // A second start on the same load (the banner mounted again) sends nothing more.
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    expect(p.sends).toHaveLength(1);
    // A new load cannot know: it sends once again.
    p.reload();
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS);
    expect(p.sends).toHaveLength(2);
  });

  it('a stop before the few seconds are up sends nothing and leaves no listener', () => {
    const p = page();
    const stop = startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(p.sends).toEqual([]);
    expect(p.listeners()).toBe(0);
  });
});

describe('the off switches: Global Privacy Control, Do Not Track, automation, no build, no collector', () => {
  const cases: [string, Parameters<typeof page>[0]][] = [
    ['Global Privacy Control', { nav: { globalPrivacyControl: true } }],
    ['Do Not Track', { nav: { doNotTrack: '1' } }],
    ['Do Not Track (older Firefox)', { nav: { doNotTrack: 'yes' } }],
    ['Do Not Track (old Edge)', { nav: { msDoNotTrack: '1' } }],
    ['Do Not Track on window (old Safari)', { win: { doNotTrack: '1' } }],
    ['an automated browser', { nav: { webdriver: true } }],
  ];
  for (const [name, opts] of cases)
    it(`${name}: nothing is sent or stored, no listener is left`, () => {
      const p = page(opts);
      startBuildCount(B, p.deps);
      vi.advanceTimersByTime(60_000);
      expect(p.sends).toEqual([]);
      expect(p.store.size).toBe(0);
      expect(p.listeners()).toBe(0);
    });

  it('GPC switched on while the page waits: still nothing', () => {
    const p = page();
    startBuildCount(B, p.deps);
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    p.nav.globalPrivacyControl = true;
    vi.advanceTimersByTime(1);
    expect(p.sends).toEqual([]);
  });

  it('DNT off ("0", unset) and GPC false do not stop it', () => {
    expect(asksNotToTrack({ doNotTrack: '0', globalPrivacyControl: false })).toBe(false);
    expect(asksNotToTrack({ doNotTrack: null })).toBe(false);
    expect(asksNotToTrack(undefined)).toBe(false);
  });

  it('no build id (the dev server), a bad one, or no collector: nothing', () => {
    for (const [build, url] of [
      [null, URL_V],
      ['assets/index-BGv8tSVu.js', URL_V],
      [B, null],
    ] as const) {
      const p = page();
      startBuildCount(build, { ...p.deps, url });
      vi.advanceTimersByTime(60_000);
      expect(p.sends).toEqual([]);
    }
  });

  it('the specs run with no collector, so the default sends nowhere', () => {
    expect(countUrlFrom(import.meta.env.VITE_SUBMIT_URL as string | undefined)).toBeNull();
  });
});
