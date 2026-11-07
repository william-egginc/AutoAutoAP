/**
 * The long-run alert's page side (lib/runBeacon.ts; design: aaap-tools/notes/long-run-alert-design-2026-11-07.md, the
 * SIMPLE version: start and stop only). The wire is the collector's `POST /runs` (collector/runs.js on spec-runs):
 *   { t: 'start', run, kind, estHours, build, startedAt }   and   { t: 'stop', run, reason }
 * run: 22 base64url characters; kind: fast | exact | custom | bydate | other; estHours: 0.25 to 2000; build: 1 to 40 of
 * [A-Za-z0-9:._-]; startedAt: ms. reason: done | cancelled | closed | failed. Text body of at most 512 bytes. A body
 * holding EI + 16 digits is refused. Never a player ID, its hash or the follow key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BEACON_MIN_SECONDS,
  RUN_BEACON_DEFAULT,
  RUN_BEACON_KEY,
  armLongRun,
  beaconEnabled,
  beaconKindOf,
  makeRunCode,
  resetRunBeacon,
  runBeaconPageClosing,
  runBeaconRunEnded,
  runBeaconRunStarted,
  runBeaconSwitch,
  runsUrlOf,
} from './runBeacon';

const SUBMIT = 'https://collector.example.workers.dev/submit';
const RUNS = 'https://collector.example.workers.dev/runs';
/** The collector's own checks (collector/runs.js), copied: what the page sends must pass them. */
const RUN_RE = /^[A-Za-z0-9_-]{22}$/;
const BUILD_RE = /^[A-Za-z0-9:._-]{1,40}$/;
const PLAYER_ID = /EI\d{16}/i;
const NOW = 1_794_000_000_000;

let mem: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
let beaconMock: ReturnType<typeof vi.fn>;
let nav: { onLine: boolean; sendBeacon?: (url: string, body: string) => boolean };

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
  beaconMock = vi.fn(() => true);
  nav = { onLine: true, sendBeacon: beaconMock as unknown as (url: string, body: string) => boolean };
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', nav);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetRunBeacon();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The bodies sent so far, parsed: fetch's and sendBeacon's, in order. */
const fetched = () => fetchMock.mock.calls.map(c => JSON.parse((c[1] as RequestInit).body as string));
const beaconed = () => beaconMock.mock.calls.map(c => JSON.parse(c[1] as string));

/** A long Exact run pressed and started. */
function startLong(seconds = 3 * 3600): void {
  armLongRun('exact', seconds);
  runBeaconRunStarted(SUBMIT);
}

describe('the run code', () => {
  it('is 22 base64url characters, made from 16 random bytes, fresh each time', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const a = makeRunCode();
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(16);
    spy.mockRestore();
    expect(a).toHaveLength(22);
    expect(a).toMatch(RUN_RE);
    const many = new Set(Array.from({ length: 200 }, makeRunCode));
    expect(many.size).toBe(200);
    for (const c of many) expect(c).toMatch(RUN_RE);
  });
});

describe('where it is sent', () => {
  it("is the build's own collector (VITE_SUBMIT_URL's /submit made /runs), never a board setting", () => {
    expect(runsUrlOf(SUBMIT)).toBe(RUNS);
    expect(runsUrlOf(`${SUBMIT}/`)).toBe(RUNS);
    expect(runsUrlOf('')).toBe('');
    expect(runsUrlOf('https://x.example/other')).toBe('');
  });
});

describe('the kind', () => {
  it('follows the screen and the strength', () => {
    expect(beaconKindOf('smart', 'fast')).toBe('fast');
    expect(beaconKindOf('smart', 'exact')).toBe('exact');
    expect(beaconKindOf('smart', 'custom')).toBe('custom');
    expect(beaconKindOf('by-date', 'exact')).toBe('bydate');
    expect(beaconKindOf('full', undefined)).toBe('other');
    expect(beaconKindOf('smart', undefined)).toBe('other');
  });
});

describe('start', () => {
  it(`is sent only for a run estimated at ${BEACON_MIN_SECONDS} s (2 hours) or more`, () => {
    expect(BEACON_MIN_SECONDS).toBe(7200);
    startLong(7199);
    runBeaconRunEnded('finished');
    expect(fetchMock).not.toHaveBeenCalled();
    for (const v of [null, undefined, NaN, Infinity, -1, 0]) {
      armLongRun('fast', v as number);
      runBeaconRunStarted(SUBMIT);
      runBeaconRunEnded('finished');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    startLong(7200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('has exactly the shape the collector takes, and passes its checks', () => {
    startLong(3 * 3600 + 1800);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RUNS);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('omit');
    // A plain string body: text/plain, so no preflight (the collector answers CORS `*`).
    expect(typeof init.body).toBe('string');
    expect(init.headers).toBeUndefined();
    expect(new TextEncoder().encode(init.body as string).length).toBeLessThanOrEqual(512);
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['build', 'estHours', 'kind', 'run', 'startedAt', 't']);
    expect(body).toEqual({
      t: 'start',
      run: body.run,
      kind: 'exact',
      estHours: 3.5,
      build: body.build,
      startedAt: NOW,
    });
    expect(body.run).toMatch(RUN_RE);
    expect(body.build).toMatch(BUILD_RE);
    expect(Number.isInteger(body.startedAt)).toBe(true);
  });

  it('keeps estHours inside the collector’s 0.25 to 2000', () => {
    startLong(5000 * 3600);
    expect(fetched()[0].estHours).toBe(2000);
  });

  it('needs Run pressed on a long run: a run that starts by itself (no arm) sends nothing', () => {
    runBeaconRunStarted(SUBMIT);
    runBeaconRunEnded('finished');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works whichever comes first, the press or the store seeing the run start', () => {
    runBeaconRunStarted(SUBMIT);
    armLongRun('custom', 4 * 3600);
    expect(fetched()).toEqual([expect.objectContaining({ t: 'start', kind: 'custom', estHours: 4 })]);
  });

  it('a press whose run never starts goes stale and is not used by a later run', () => {
    armLongRun('exact', 3 * 3600);
    vi.setSystemTime(NOW + 5 * 60_000);
    runBeaconRunStarted(SUBMIT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing with no collector configured', () => {
    armLongRun('exact', 3 * 3600);
    runBeaconRunStarted('');
    runBeaconRunEnded('finished');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a new code for each run', () => {
    startLong();
    runBeaconRunEnded('finished');
    startLong();
    const [a, , b] = fetched();
    expect(a.t).toBe('start');
    expect(b.t).toBe('start');
    expect(a.run).not.toBe(b.run);
  });
});

describe('stop', () => {
  it.each([
    ['finished', 'done'],
    ['stopped', 'cancelled'],
    ['failed', 'failed'],
  ] as const)('a run that %s sends reason %s, once, with the start’s code', (how, reason) => {
    startLong();
    runBeaconRunEnded(how);
    runBeaconRunEnded(how);
    runBeaconPageClosing();
    const [start, stop, ...rest] = fetched();
    expect(stop).toEqual({ t: 'stop', run: start.run, reason });
    expect(Object.keys(stop).sort()).toEqual(['reason', 'run', 't']);
    expect(rest).toEqual([]);
    expect(beaconMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0]).toBe(RUNS);
  });

  it('a stop with no start sends nothing', () => {
    for (const how of ['finished', 'stopped', 'failed'] as const) runBeaconRunEnded(how);
    runBeaconPageClosing();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });
});

describe('the tab closing (pagehide)', () => {
  it("sends 'closed' once with sendBeacon while a run is going", () => {
    startLong();
    runBeaconPageClosing();
    runBeaconPageClosing();
    runBeaconRunEnded('failed');
    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(beaconMock.mock.calls[0][0]).toBe(RUNS);
    expect(typeof beaconMock.mock.calls[0][1]).toBe('string');
    expect(beaconed()).toEqual([{ t: 'stop', run: fetched()[0].run, reason: 'closed' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends no closed after the run already stopped', () => {
    startLong();
    runBeaconRunEnded('finished');
    runBeaconPageClosing();
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is missing or refuses', () => {
    nav.sendBeacon = undefined;
    startLong();
    runBeaconPageClosing();
    expect(fetched()[1]).toEqual({ t: 'stop', run: fetched()[0].run, reason: 'closed' });
    expect((fetchMock.mock.calls[1][1] as RequestInit).keepalive).toBe(true);
  });
});

describe('the off switch', () => {
  it(`is ${RUN_BEACON_DEFAULT ? 'ON' : 'OFF'} by default (RUN_BEACON_DEFAULT): changing it is deliberate`, () => {
    // Jordan may make this opt-in: flip RUN_BEACON_DEFAULT in lib/runBeacon.ts and this line with it.
    expect(RUN_BEACON_DEFAULT).toBe(true);
    expect(runBeaconSwitch().value).toBe(true);
    expect(beaconEnabled()).toBe(true);
  });

  it('is remembered in this browser', () => {
    runBeaconSwitch().value = false;
    expect(mem.get(RUN_BEACON_KEY)).toBe('0');
    resetRunBeacon();
    expect(runBeaconSwitch().value).toBe(false);
    runBeaconSwitch().value = true;
    expect(mem.get(RUN_BEACON_KEY)).toBe('1');
  });

  it('off: nothing is sent, start, stop or closed', () => {
    runBeaconSwitch().value = false;
    expect(beaconEnabled()).toBe(false);
    startLong();
    runBeaconRunEnded('finished');
    startLong();
    runBeaconPageClosing();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('turned off during a run: the stop is not sent either', () => {
    startLong();
    runBeaconSwitch().value = false;
    runBeaconRunEnded('finished');
    runBeaconPageClosing();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('blocked storage: the default holds, nothing throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    resetRunBeacon();
    expect(runBeaconSwitch().value).toBe(RUN_BEACON_DEFAULT);
    expect(() => (runBeaconSwitch().value = false)).not.toThrow();
  });
});

describe('offline', () => {
  it('sends nothing', () => {
    nav.onLine = false;
    startLong();
    runBeaconRunEnded('finished');
    startLong();
    runBeaconPageClosing();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beaconMock).not.toHaveBeenCalled();
  });
});

describe('a failed send never touches the run', () => {
  it('a fetch that throws, rejects or answers 404/429/503: no throw, no unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      fetchMock.mockImplementationOnce(() => {
        throw new TypeError('blocked by CSP');
      });
      expect(() => startLong()).not.toThrow();
      expect(() => runBeaconRunEnded('finished')).not.toThrow();
      fetchMock.mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });
      expect(() => startLong()).not.toThrow();
      expect(() => runBeaconRunEnded('failed')).not.toThrow();
      for (const status of [404, 429, 503, 400, 413]) {
        fetchMock.mockImplementation(async () => new Response('{}', { status }));
        expect(() => startLong()).not.toThrow();
        expect(() => runBeaconRunEnded('stopped')).not.toThrow();
      }
      await new Promise(r => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('a sendBeacon that throws, and no fetch at all: no throw', () => {
    nav.sendBeacon = () => {
      throw new TypeError('nope');
    };
    startLong();
    vi.stubGlobal('fetch', undefined);
    expect(() => runBeaconPageClosing()).not.toThrow();
    startLong();
    expect(() => runBeaconRunEnded('finished')).not.toThrow();
  });

  it('crypto missing: no code, nothing sent, no throw', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => startLong()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the hooks return nothing to wait on', () => {
    expect(armLongRun('exact', 3 * 3600)).toBeUndefined();
    expect(runBeaconRunStarted(SUBMIT)).toBeUndefined();
    expect(runBeaconRunEnded('finished')).toBeUndefined();
    expect(runBeaconPageClosing()).toBeUndefined();
  });

  it('every fetch is bounded by a timeout', () => {
    startLong();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('no player ID, ever', () => {
  it('no EI + 16 digits, no hash-like key, only the whitelisted fields', () => {
    startLong();
    runBeaconRunEnded('stopped');
    startLong();
    runBeaconPageClosing();
    const bodies = [
      ...fetchMock.mock.calls.map(c => (c[1] as RequestInit).body as string),
      ...beaconMock.mock.calls.map(c => c[1] as string),
    ];
    expect(bodies).toHaveLength(4);
    for (const text of bodies) {
      expect(text).not.toMatch(PLAYER_ID);
      // Nothing like a hashed ID or follow key: no run of 32+ hex characters, no field named for an account.
      expect(text).not.toMatch(/[0-9a-f]{32,}/i);
      expect(text).not.toMatch(/"(id|eid|playerId|player|account|hash|key|follow|owner|name|nickname)"/i);
      const keys = Object.keys(JSON.parse(text));
      for (const k of keys) expect(['t', 'run', 'kind', 'estHours', 'build', 'startedAt', 'reason']).toContain(k);
    }
  });
});
