import { describe, expect, it } from 'vitest';
import {
  base64url,
  bestWords,
  buildHeartbeat,
  cleanLabel,
  heartbeatDue,
  isNtfyTopic,
  isWatchKey,
  newNtfyTopic,
  newWatchKey,
  ntfyBody,
  ntfyMessage,
  ntfyProgressDue,
  readWatchLinkState,
  readWatchOptions,
  watchPageUrl,
  watchView,
  WATCH_EVERY_MS,
  WATCH_OPTIONS_KEY,
  WATCH_STALE_MS,
  type WatchHeartbeat,
} from './watchLink';

const T0 = Date.UTC(2026, 9, 10, 12);
const JUL13 = Date.UTC(2027, 6, 13, 12) / 1000;

function hb(over: Partial<WatchHeartbeat> = {}): WatchHeartbeat {
  return {
    key: 'AbCdEfGhIjKlMnOpQrStUvWx',
    status: 'running',
    mode: 'fastest',
    done: 250,
    total: 1000,
    timeLeftSec: 3 * 3600,
    bestSoFar: { te: 247, route: [150, 200, 247], finish: JUL13 },
    startedAt: T0 - 3600_000,
    updatedAt: T0,
    workers: 8,
    ...over,
  };
}

describe('keys and topics', () => {
  it('a watch key is 144 random bits as base64url', () => {
    const k = newWatchKey();
    expect(k).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(isWatchKey(k)).toBe(true);
    expect(newWatchKey()).not.toBe(k);
    // From crypto.getRandomValues: the bytes it is given are the key.
    expect(newWatchKey(a => a.fill(255))).toBe('________________________');
  });

  it('base64url matches the standard encoding', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    const std = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64url(bytes)).toBe(std);
  });

  it('refuses short or odd keys', () => {
    expect(isWatchKey('short')).toBe(false);
    expect(isWatchKey('AbCdEfGhIjKlMnOpQrStUv!x')).toBe(false);
    expect(isWatchKey(42)).toBe(false);
  });

  it('a topic is aaap- and random, and valid for ntfy', () => {
    const t = newNtfyTopic();
    expect(t).toMatch(/^aaap-[A-Za-z0-9_-]{16}$/);
    expect(isNtfyTopic(t)).toBe(true);
    expect(isNtfyTopic('has space')).toBe(false);
  });

  it('a label is one trimmed line of at most 40 characters', () => {
    expect(cleanLabel('  big\nsweep  ')).toBe('big sweep');
    expect(cleanLabel('x'.repeat(60))).toHaveLength(40);
    expect(cleanLabel(5)).toBe('');
  });
});

describe('the checkpoint field', () => {
  it('reads back a stored link, and nothing else', () => {
    const link = { key: 'AbCdEfGhIjKlMnOpQrStUvWx', startedAt: 5, topic: 'aaap-x', label: 'run' };
    expect(readWatchLinkState(JSON.parse(JSON.stringify(link)))).toEqual(link);
    expect(readWatchLinkState({ key: 'bad', startedAt: 5 })).toBeNull();
    expect(readWatchLinkState({ ...link, topic: 'not ok!' })).toEqual({ key: link.key, startedAt: 5, label: 'run' });
    expect(readWatchLinkState(undefined)).toBeNull();
  });
});

describe('options', () => {
  const kv = (v: string | null) => ({ getItem: () => v, setItem: () => undefined });
  it('are off by default and checked when read', () => {
    expect(readWatchOptions(kv(null)).phone).toBe(false);
    const o = readWatchOptions(
      kv(JSON.stringify({ phone: true, ntfy: true, ntfyTopic: 'bad topic', ntfyEveryMin: 7 }))
    );
    expect(o).toMatchObject({ phone: true, ntfy: true, ntfyTopic: '', ntfyEveryMin: 180 });
    expect(WATCH_OPTIONS_KEY).toBe('aap.watchLink.options');
  });
});

describe('the heartbeat', () => {
  it('holds only the run figures, and a label only when typed', () => {
    const h = buildHeartbeat({
      link: { key: 'AbCdEfGhIjKlMnOpQrStUvWx', startedAt: 1 },
      status: 'running',
      kind: 'sweep',
      progress: { done: 10.4, total: 40, secondsLeft: 99.6, best: { chain: [150, 247], te: 247, at: JUL13 } },
      workers: 6,
      now: T0,
    });
    expect(h).toEqual({
      key: 'AbCdEfGhIjKlMnOpQrStUvWx',
      status: 'running',
      mode: 'full-sweep',
      done: 10,
      total: 40,
      timeLeftSec: 100,
      bestSoFar: { te: 247, route: [150, 247], finish: JUL13 },
      startedAt: 1,
      updatedAt: T0,
      workers: 6,
    });
    expect(JSON.stringify(h).length).toBeLessThan(2048);
  });

  it('By a date carries its fill and the days to spare', () => {
    const h = buildHeartbeat({
      link: { key: 'AbCdEfGhIjKlMnOpQrStUvWx', startedAt: 1, label: 'mine' },
      status: 'running',
      kind: 'deadline',
      progress: { done: 5, total: null, percent: 42.26, secondsLeft: null, best: { chain: [247], te: 247, at: JUL13 } },
      workers: 2,
      deadline: JUL13 + 3 * 86400,
      now: T0,
    });
    expect(h.mode).toBe('by-date');
    expect(h.pct).toBe(42.3);
    expect(h.bestSoFar?.spareDays).toBe(3);
    expect(h.label).toBe('mine');
  });
});

describe('the heartbeat scheduler', () => {
  it('posts at once on start and end, then every 5 minutes', () => {
    expect(heartbeatDue({ event: 'start', now: T0, lastTryAt: T0 })).toBe(true);
    expect(heartbeatDue({ event: 'end', now: T0, lastTryAt: T0 })).toBe(true);
    expect(heartbeatDue({ event: 'tick', now: T0, lastTryAt: null })).toBe(true);
    expect(heartbeatDue({ event: 'tick', now: T0 + WATCH_EVERY_MS - 1, lastTryAt: T0 })).toBe(false);
    expect(heartbeatDue({ event: 'tick', now: T0 + WATCH_EVERY_MS, lastTryAt: T0 })).toBe(true);
  });

  it('progress notes follow their own interval, and none when set to never', () => {
    expect(ntfyProgressDue({ now: T0 + 59 * 60_000, everyMin: 60, lastAt: null, startedAt: T0 })).toBe(false);
    expect(ntfyProgressDue({ now: T0 + 60 * 60_000, everyMin: 60, lastAt: null, startedAt: T0 })).toBe(true);
    expect(ntfyProgressDue({ now: T0 + 90 * 60_000, everyMin: 60, lastAt: T0 + 60 * 60_000, startedAt: T0 })).toBe(
      false
    );
    expect(ntfyProgressDue({ now: T0 + 999 * 60_000, everyMin: 0, lastAt: null, startedAt: T0 })).toBe(false);
  });
});

describe('words', () => {
  it('ntfy messages are plain and carry no personal data', () => {
    expect(ntfyMessage(hb({ status: 'finished' }), 'end')).toBe('Run finished: 247 TE, finishes Jul 13.');
    expect(ntfyMessage(hb({ status: 'failed' }), 'end')).toBe(
      'Run stopped with an error at 25%. Best so far: 247 TE, finishes Jul 13.'
    );
    expect(ntfyMessage(hb({ status: 'stopped' }), 'end')).toBe('');
    expect(ntfyMessage(hb(), 'progress')).toBe('Run 25% done, about 3 h left. Best so far: 247 TE, finishes Jul 13.');
    expect(ntfyMessage(hb({ label: 'Jordan secret' }), 'progress')).not.toContain('Jordan');
    const body = JSON.parse(ntfyBody({ topic: 'aaap-x', message: 'm', click: 'https://x/watch.html?k=1' }));
    expect(body).toEqual({
      topic: 'aaap-x',
      title: 'Ascension Planner',
      message: 'm',
      click: 'https://x/watch.html?k=1',
    });
  });

  it('By a date says the days to spare', () => {
    expect(bestWords(hb({ mode: 'by-date', bestSoFar: { te: 247, route: [], finish: JUL13, spareDays: 3 } }))).toBe(
      '247 TE by Jul 13, 3 days spare'
    );
  });

  it('the page link names the collector only when asked', () => {
    expect(watchPageUrl({ origin: 'https://site', base: '/ascension-planner/', key: 'K' })).toBe(
      'https://site/ascension-planner/watch.html?k=K'
    );
    expect(watchPageUrl({ origin: 'https://site', base: '/', key: 'K', collector: 'https://c.example' })).toBe(
      'https://site/watch.html?k=K&collector=https%3A%2F%2Fc.example'
    );
  });
});

describe('the watch page', () => {
  it('a running run that reported recently is running', () => {
    const v = watchView(hb(), T0, T0 + 2 * 60_000);
    expect(v.title).toBe('Running');
    expect(v.tone).toBe('ok');
    expect(v.stale).toBe('');
    expect(v.updated).toBe('Last update 2 min ago');
    expect(v.percent).toBe(25);
    expect(v.timeLeft).toBe('About 3 h left');
    expect(v.best).toBe('247 TE, finishes Jul 13');
    expect(v.route).toBe('150 → 200 → 247');
  });

  it('warns when a running run has not reported for over 15 minutes', () => {
    expect(watchView(hb(), T0, T0 + WATCH_STALE_MS).stale).toBe('');
    const v = watchView(hb(), T0, T0 + WATCH_STALE_MS + 1);
    expect(v.title).toBe('Not reporting');
    expect(v.tone).toBe('warn');
    expect(v.stale).toBe(
      "This run hasn't reported in 15+ min — the tab may have crashed or the computer may be asleep."
    );
  });

  it('a finished or stopped run is never stale', () => {
    const v = watchView(hb({ status: 'finished' }), T0, T0 + 5 * 3600_000);
    expect(v.title).toBe('Finished');
    expect(v.stale).toBe('');
    expect(v.percent).toBe(100);
    expect(v.timeLeft).toBe('');
    expect(watchView(hb({ status: 'stopped' }), T0, T0 + 5 * 3600_000).stale).toBe('');
  });

  it('goes by the collector time, not the run computer clock', () => {
    // The run's own clock says an hour ago; the collector stored it a minute ago.
    expect(watchView(hb({ updatedAt: T0 - 3600_000 }), T0, T0 + 60_000).stale).toBe('');
  });

  it('nothing found yet', () => {
    expect(watchView(hb({ bestSoFar: null, total: null, done: 0 }), T0, T0).best).toBe('Nothing found yet.');
  });
});
