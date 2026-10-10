/**
 * "Watch this run from your phone", run side: when the tab posts, what it posts, the ntfy notes, and
 * that a carried-on run keeps its key.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  activeWatch,
  currentWatchLink,
  installWatchLink,
  resetWatchLink,
  watchLinkPageClosing,
  watchLinkRunEnded,
  watchLinkRunStarted,
  watchLinkTick,
  watchOptions,
} from './useWatchLink';
import { DEFAULT_WATCH_OPTIONS, WATCH_EVERY_MS, type ProgressLike } from '@/search/watchLink';

const T0 = Date.UTC(2026, 9, 10, 12);
let clock = T0;
let calls: { url: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => new Response('{}');
let progress: ProgressLike | null = null;
let running: 'smart' | 'sweep' | 'deadline' | null = null;

const posts = () => calls.filter(c => c.url.endsWith('/watch'));
const notes = () => calls.filter(c => c.url === 'https://ntfy.sh');

beforeEach(async () => {
  clock = T0;
  calls = [];
  answer = () => new Response('{}');
  progress = { done: 100, total: 400, secondsLeft: 3600, best: { chain: [150, 247], te: 247, at: 1783944000 } };
  // No run going while the options are set up (ticking during a run starts a link at once).
  running = null;
  resetWatchLink();
  watchOptions.value = { ...DEFAULT_WATCH_OPTIONS };
  await nextTick();
  calls = [];
  installWatchLink({
    collector: () => 'https://c.example',
    buildCollector: () => 'https://c.example',
    progress: () => progress,
    workers: () => 8,
    deadline: () => null,
    running: () => running,
    now: () => clock,
    origin: () => 'https://site.example',
    base: () => '/ascension-planner/',
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      return answer();
    }) as typeof fetch,
  });
});

async function tickAt(ms: number): Promise<void> {
  clock = ms;
  watchLinkTick();
  await Promise.resolve();
}

describe('off', () => {
  it('posts nothing unless ticked', async () => {
    watchLinkRunStarted('smart');
    await tickAt(T0 + WATCH_EVERY_MS);
    watchLinkRunEnded('finished');
    expect(calls).toEqual([]);
    expect(activeWatch.value).toBeNull();
  });
});

describe('the heartbeat scheduler', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
  });

  it('posts at once on start, then every 5 minutes, and at once at the end', async () => {
    watchLinkRunStarted('smart');
    expect(posts()).toHaveLength(1);
    const first = posts()[0].body;
    expect(first).toMatchObject({ status: 'running', mode: 'fastest', done: 100, total: 400, workers: 8 });
    expect(String(first.key)).toMatch(/^[A-Za-z0-9_-]{24}$/);
    // Nothing personal: no nickname, no player id, no save, and no label unless typed.
    expect(Object.keys(first).sort()).toEqual(
      ['bestSoFar', 'done', 'key', 'mode', 'startedAt', 'status', 'timeLeftSec', 'total', 'updatedAt', 'workers'].sort()
    );
    await tickAt(T0 + 60_000);
    await tickAt(T0 + 4 * 60_000);
    expect(posts()).toHaveLength(1);
    await tickAt(T0 + WATCH_EVERY_MS);
    expect(posts()).toHaveLength(2);
    await tickAt(T0 + WATCH_EVERY_MS + 60_000);
    expect(posts()).toHaveLength(2);
    clock = T0 + WATCH_EVERY_MS + 90_000;
    watchLinkRunEnded('finished');
    expect(posts()).toHaveLength(3);
    expect(posts()[2].body).toMatchObject({ status: 'finished', key: first.key });
    // Nothing more after the end.
    await tickAt(T0 + 3 * WATCH_EVERY_MS);
    expect(posts()).toHaveLength(3);
  });

  it('gives the page link for the key', () => {
    watchLinkRunStarted('deadline');
    const key = activeWatch.value!.link.key;
    expect(activeWatch.value!.url).toBe(`https://site.example/ascension-planner/watch.html?k=${key}`);
    expect(posts()[0].body.mode).toBe('by-date');
  });

  it('never throws, and a failed post is just noted', async () => {
    answer = () => {
      throw new Error('offline');
    };
    expect(() => watchLinkRunStarted('smart')).not.toThrow();
    await new Promise(r => setTimeout(r, 0));
    expect(activeWatch.value!.lastError).toMatch(/offline/);
    expect(() => watchLinkRunEnded('failed')).not.toThrow();
  });

  it('retries the last word once when the collector says too soon', async () => {
    vi.useFakeTimers();
    try {
      watchLinkRunStarted('smart');
      answer = () => new Response('{}', { status: 429, headers: { 'retry-after': '20' } });
      watchLinkRunEnded('stopped');
      await vi.advanceTimersByTimeAsync(0);
      expect(posts()).toHaveLength(2);
      answer = () => new Response('{}');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(posts()).toHaveLength(3);
      expect(posts()[2].body.status).toBe('stopped');
      await vi.advanceTimersByTimeAsync(200_000);
      expect(posts()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says stopped when the page is closed on purpose', () => {
    watchLinkRunStarted('smart');
    watchLinkPageClosing();
    expect(posts()[1].body.status).toBe('stopped');
  });

  it('a label goes only when typed', async () => {
    watchOptions.value = { ...watchOptions.value, label: ' big sweep ' };
    await nextTick();
    watchLinkRunStarted('sweep');
    expect(posts()[0].body.label).toBe('big sweep');
  });
});

describe('the key across a carry-on', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
  });

  it('the checkpoint keeps the link, and the carried-on run posts under the same key', () => {
    watchLinkRunStarted('deadline');
    const saved = currentWatchLink()!;
    expect(saved.key).toBe(activeWatch.value!.link.key);
    // The page dies; a fresh page loads (nothing active) and carries on from the checkpoint.
    resetWatchLink();
    clock = T0 + 3600_000;
    watchLinkRunStarted('deadline', JSON.parse(JSON.stringify(saved)));
    const last = posts()[posts().length - 1].body;
    expect(last.key).toBe(saved.key);
    expect(last.startedAt).toBe(T0);
    expect(activeWatch.value!.url).toContain(saved.key);
  });

  it('a carried-on run keeps its link even with the box unticked since', async () => {
    watchLinkRunStarted('smart');
    const saved = currentWatchLink()!;
    resetWatchLink();
    watchOptions.value = { ...watchOptions.value, phone: false };
    await nextTick();
    watchLinkRunStarted('smart', saved);
    expect(activeWatch.value!.link.key).toBe(saved.key);
  });

  it('a fresh run gets a fresh key', () => {
    watchLinkRunStarted('smart');
    const a = activeWatch.value!.link.key;
    watchLinkRunEnded('finished');
    watchLinkRunStarted('smart');
    expect(activeWatch.value!.link.key).not.toBe(a);
  });

  it("a Full sweep queue's later chains keep the queue's key", () => {
    watchLinkRunStarted('sweep');
    const a = activeWatch.value!.link.key;
    watchLinkRunEnded('finished');
    watchLinkRunStarted('sweep', null, true);
    expect(activeWatch.value!.link.key).toBe(a);
  });

  it('is still kept after a Stop, so Carry on later picks it back up', () => {
    watchLinkRunStarted('smart');
    watchLinkRunEnded('stopped');
    expect(currentWatchLink()?.key).toBe(activeWatch.value!.link.key);
  });
});

describe('ntfy', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true, ntfy: true, ntfyTopic: 'aaap-test', ntfyEveryMin: 60 };
    await nextTick();
  });

  it('sends the topic to the collector, a progress note each interval, and the finish', async () => {
    watchLinkRunStarted('smart');
    expect(posts()[0].body.notify).toBe('aaap-test');
    await tickAt(T0 + 59 * 60_000);
    expect(notes()).toHaveLength(0);
    await tickAt(T0 + 60 * 60_000);
    expect(notes()).toHaveLength(1);
    expect(notes()[0].body).toMatchObject({ topic: 'aaap-test', message: expect.stringMatching(/^Run 25% done/) });
    expect(String(notes()[0].body.click)).toContain('watch.html?k=');
    await tickAt(T0 + 100 * 60_000);
    expect(notes()).toHaveLength(1);
    watchLinkRunEnded('finished');
    expect(notes()[1].body.message).toMatch(/^Run finished: 247 TE/);
  });

  it('notes a failure, but not a Stop', () => {
    watchLinkRunStarted('smart');
    watchLinkRunEnded('failed');
    expect(notes().map(n => n.body.message)).toEqual([expect.stringMatching(/^Run stopped with an error/)]);
    watchLinkRunStarted('smart');
    watchLinkRunEnded('stopped');
    expect(notes()).toHaveLength(1);
  });

  it('no topic goes when notifications are off', async () => {
    watchOptions.value = { ...watchOptions.value, ntfy: false };
    await nextTick();
    watchLinkRunStarted('smart');
    expect(posts()[0].body).not.toHaveProperty('notify');
    watchLinkRunEnded('finished');
    expect(notes()).toHaveLength(0);
  });
});

describe('ticking during a run', () => {
  it('starts a link for the run going, and unticking says it stopped', async () => {
    running = 'sweep';
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body.mode).toBe('full-sweep');
    watchOptions.value = { ...watchOptions.value, phone: false };
    await nextTick();
    expect(posts()[1].body.status).toBe('stopped');
  });
});
