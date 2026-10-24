/**
 * The phone page (watch.html#<id>.<secret>): it opens the sealed heartbeat with the fragment's
 * secret, calls a wrong or missing secret an incomplete link, and reads only while on screen.
 * A bare stand-in for the DOM: the page only sets text, classes, `hidden` and a width.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newWatchId, newWatchSecret, sealHeartbeat, type WatchHeartbeat } from '@/search/watchLink';

const ID = newWatchId();
const SECRET = newWatchSecret();
const T0 = Date.UTC(2026, 9, 10, 12);

type El = {
  textContent: string;
  className: string;
  hidden: boolean;
  style: Record<string, string>;
  addEventListener: () => void;
};
let els: Record<string, El>;
let docListeners: Record<string, () => void>;
let winListeners: Record<string, () => void>;
let visibility: 'visible' | 'hidden';
let fetches: string[];
let reply: () => Promise<Response>;

const hb: WatchHeartbeat = {
  status: 'running',
  mode: 'fastest',
  done: 100,
  total: 400,
  timeLeftSec: 3600,
  bestSoFar: { te: 247, route: [150, 247], finish: 1783944000 },
  startedAt: T0 - 3600_000,
  updatedAt: T0,
  workers: 8,
};

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r));
};

async function startAt(hash: string): Promise<void> {
  vi.stubGlobal('location', { hash, search: '?collector=https://c.example' });
  const m = await import('./phone');
  m.startPhone();
  await settle();
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  els = {};
  docListeners = {};
  winListeners = {};
  visibility = 'visible';
  fetches = [];
  const sealed = await sealHeartbeat(SECRET, hb);
  reply = async () => new Response(JSON.stringify({ ...sealed, status: 'running', updated: T0, now: T0 }));
  vi.stubGlobal('document', {
    title: '',
    get visibilityState() {
      return visibility;
    },
    getElementById: (id: string) =>
      (els[id] ??= {
        textContent: '',
        className: '',
        hidden: false,
        style: {},
        addEventListener: () => undefined,
      }) as unknown as HTMLElement,
    addEventListener: (t: string, f: () => void) => (docListeners[t] = f),
  });
  vi.stubGlobal('window', { addEventListener: (t: string, f: () => void) => (winListeners[t] = f) });
  vi.stubGlobal('fetch', (url: string) => {
    fetches.push(url);
    return reply();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the phone page', () => {
  it('opens the run with the secret, asking the collector by id only', async () => {
    await startAt(`#${ID}.${SECRET}`);
    expect(fetches).toEqual([`https://c.example/watch?id=${ID}`]);
    expect(fetches[0]).not.toContain(SECRET);
    expect(els['p-title'].textContent).toBe('Running');
    expect(els['p-best'].textContent).toBe('247 TE, finishes Jul 13');
  });

  it('a wrong secret is an incomplete link', async () => {
    // A well-formed secret that is certainly not SECRET (a random one could, in theory, be it), and a wait
    // for the answer: opening the heartbeat is real async crypto, which a few event-loop turns do not always
    // cover on a busy machine (it failed once in a full run, and passed alone).
    const wrong = SECRET.slice(0, -1) + (SECRET.endsWith('A') ? 'B' : 'A');
    await startAt(`#${ID}.${wrong}`);
    for (let i = 0; i < 800 && els['p-title']?.textContent !== 'This link is incomplete'; i++) {
      await new Promise(r => setTimeout(r, 10));
    }
    expect(els['p-title'].textContent).toBe('This link is incomplete');
  });

  it('a missing secret is an incomplete link, and asks nothing', async () => {
    await startAt(`#${ID}`);
    expect(els['p-title'].textContent).toBe('This link is incomplete');
    expect(fetches).toEqual([]);
  });

  it('reads every minute while on screen, nothing while hidden, and at once on coming back', async () => {
    await startAt(`#${ID}.${SECRET}`);
    expect(fetches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetches).toHaveLength(2);
    visibility = 'hidden';
    docListeners.visibilitychange();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settle();
    expect(fetches).toHaveLength(2);
    visibility = 'visible';
    docListeners.visibilitychange();
    await settle();
    expect(fetches).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetches).toHaveLength(4);
  });

  it('the plain status wins over the sealed one (a page that closed sends only that)', async () => {
    const sealed = await sealHeartbeat(SECRET, hb);
    reply = async () => new Response(JSON.stringify({ ...sealed, status: 'stopped', updated: T0, now: T0 }));
    await startAt(`#${ID}.${SECRET}`);
    expect(els['p-title'].textContent).toBe('Stopped');
  });
});
