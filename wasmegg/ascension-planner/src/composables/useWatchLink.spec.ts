/**
 * "Watch this run from your phone", run side: when the tab posts, that what it posts is sealed (and
 * opens with the link's secret), the ntfy notes, and that a carried-on run keeps its link.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  activeWatch,
  currentWatchLink,
  installWatchLink,
  resetWatchLink,
  watchLinkNoteProgress,
  watchLinkPageClosing,
  watchLinkRunEnded,
  watchLinkRunStarted,
  watchLinkTick,
  watchOptions,
} from './useWatchLink';
import {
  DEFAULT_WATCH_OPTIONS,
  openHeartbeat,
  parseWatchFragment,
  WATCH_EVERY_MS,
  type ProgressLike,
  type WatchHeartbeat,
} from '@/search/watchLink';

const T0 = Date.UTC(2026, 9, 10, 12);
let clock = T0;
let calls: { url: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => new Response('{}');
let progress: ProgressLike | null = null;
let running: 'smart' | 'sweep' | 'deadline' | null = null;

const posts = () => calls.filter(c => c.url.endsWith('/watch'));
const notes = () => calls.filter(c => c.url === 'https://ntfy.sh');
/** Let the sealing (WebCrypto) and the fetch go through. Not a timer, so fake timers don't stop it. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
};
/** A post opened with the active link's secret, as the phone would. */
async function opened(i: number, secret = activeWatch.value!.link.secret): Promise<WatchHeartbeat | null> {
  const b = posts()[i].body;
  return openHeartbeat(secret, String(b.iv), String(b.ct));
}

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
  await settle();
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
  await settle();
}

describe('off', () => {
  it('posts nothing unless ticked', async () => {
    watchLinkRunStarted('smart');
    await tickAt(T0 + WATCH_EVERY_MS);
    watchLinkRunEnded('finished');
    await settle();
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
    await settle();
    expect(posts()).toHaveLength(1);
    const first = posts()[0].body;
    const id = activeWatch.value!.link.id;
    // The collector gets the id, the IV, the ciphertext and the status. Nothing else, and no secret.
    expect(Object.keys(first).sort()).toEqual(['ct', 'id', 'iv', 'status']);
    expect(first).toMatchObject({ id, status: 'running' });
    expect(JSON.stringify(first)).not.toContain(activeWatch.value!.link.secret);
    expect(JSON.stringify(first)).not.toMatch(/247|fastest|bestSoFar/);
    // The phone opens it: the run figures, and nothing personal (no label unless typed).
    const h = (await opened(0))!;
    expect(h).toMatchObject({ status: 'running', mode: 'fastest', done: 100, total: 400, workers: 8 });
    expect(Object.keys(h).sort()).toEqual(
      ['bestSoFar', 'done', 'mode', 'startedAt', 'status', 'timeLeftSec', 'total', 'updatedAt', 'workers'].sort()
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
    await settle();
    expect(posts()).toHaveLength(3);
    expect(posts()[2].body).toMatchObject({ status: 'finished', id });
    expect((await opened(2))!.status).toBe('finished');
    // A fresh IV every time.
    expect(new Set(posts().map(p => p.body.iv)).size).toBe(3);
    // Nothing more after the end.
    await tickAt(T0 + 3 * WATCH_EVERY_MS);
    expect(posts()).toHaveLength(3);
  });

  it('gives the page link, with the secret only in the fragment', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    const { id, secret } = activeWatch.value!.link;
    expect(activeWatch.value!.url).toBe(`https://site.example/ascension-planner/watch.html#${id}.${secret}`);
    expect(parseWatchFragment(new URL(activeWatch.value!.url).hash)).toEqual({ id, secret });
    expect((await opened(0))!.mode).toBe('by-date');
  });

  it('never throws, and a failed post is just noted', async () => {
    answer = () => {
      throw new Error('offline');
    };
    expect(() => watchLinkRunStarted('smart')).not.toThrow();
    await settle();
    expect(activeWatch.value!.lastError).toMatch(/offline/);
    expect(() => watchLinkRunEnded('failed')).not.toThrow();
    await settle();
  });

  it('retries the last word once when the collector says too soon', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      watchLinkRunStarted('smart');
      await settle();
      answer = () => new Response('{}', { status: 429, headers: { 'retry-after': '20' } });
      watchLinkRunEnded('stopped');
      await settle();
      expect(posts()).toHaveLength(2);
      answer = () => new Response('{}');
      await vi.advanceTimersByTimeAsync(20_000);
      await settle();
      expect(posts()).toHaveLength(3);
      expect(posts()[2].body.status).toBe('stopped');
      await vi.advanceTimersByTimeAsync(200_000);
      await settle();
      expect(posts()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says stopped at once, in plain status only, when the page is closed on purpose', async () => {
    watchLinkRunStarted('smart');
    await settle();
    watchLinkPageClosing();
    // Sent straight away (no sealing to wait for: the page is going).
    expect(posts()).toHaveLength(2);
    expect(posts()[1].body).toEqual({ id: activeWatch.value!.link.id, status: 'stopped' });
  });

  it('a label goes only when typed, and only inside the ciphertext', async () => {
    watchOptions.value = { ...watchOptions.value, label: ' big sweep ' };
    await nextTick();
    watchLinkRunStarted('sweep');
    await settle();
    expect(JSON.stringify(posts()[0].body)).not.toContain('big sweep');
    expect((await opened(0))!.label).toBe('big sweep');
  });
});

describe('the link across a carry-on', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
  });

  it('the checkpoint keeps id and secret, and the carried-on run posts under the same link', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    const saved = currentWatchLink()!;
    expect(saved.id).toBe(activeWatch.value!.link.id);
    expect(saved.secret).toBe(activeWatch.value!.link.secret);
    // The page dies; a fresh page loads (nothing active) and carries on from the checkpoint.
    resetWatchLink();
    clock = T0 + 3600_000;
    watchLinkRunStarted('deadline', JSON.parse(JSON.stringify(saved)));
    await settle();
    const n = posts().length - 1;
    expect(posts()[n].body.id).toBe(saved.id);
    // The phone's old link still opens it.
    const h = (await opened(n, saved.secret))!;
    expect(h.startedAt).toBe(T0);
    expect(activeWatch.value!.url).toContain(`#${saved.id}.${saved.secret}`);
  });

  it('a carried-on run keeps its link even with the box unticked since', async () => {
    watchLinkRunStarted('smart');
    const saved = currentWatchLink()!;
    resetWatchLink();
    watchOptions.value = { ...watchOptions.value, phone: false };
    await nextTick();
    watchLinkRunStarted('smart', saved);
    expect(activeWatch.value!.link).toMatchObject({ id: saved.id, secret: saved.secret });
    await settle();
  });

  it('a fresh run gets a fresh id and secret', async () => {
    watchLinkRunStarted('smart');
    const a = { ...activeWatch.value!.link };
    watchLinkRunEnded('finished');
    watchLinkRunStarted('smart');
    expect(activeWatch.value!.link.id).not.toBe(a.id);
    expect(activeWatch.value!.link.secret).not.toBe(a.secret);
    await settle();
  });

  it("a Full sweep queue's later chains keep the queue's link", async () => {
    watchLinkRunStarted('sweep');
    const a = { ...activeWatch.value!.link };
    watchLinkRunEnded('finished');
    watchLinkRunStarted('sweep', null, true);
    expect(activeWatch.value!.link).toMatchObject({ id: a.id, secret: a.secret });
    await settle();
  });

  it('is still kept after a Stop, so Carry on later picks it back up', async () => {
    watchLinkRunStarted('smart');
    watchLinkRunEnded('stopped');
    expect(currentWatchLink()?.id).toBe(activeWatch.value!.link.id);
    await settle();
  });
});

describe('ntfy', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true, ntfy: true, ntfyTopic: 'aaap-test', ntfyEveryMin: 60 };
    await nextTick();
  });

  it('sends the topic, a bare progress note each interval, and a bare finish', async () => {
    watchLinkRunStarted('smart');
    await settle();
    expect(posts()[0].body.notify).toBe('aaap-test');
    await tickAt(T0 + 59 * 60_000);
    expect(notes()).toHaveLength(0);
    await tickAt(T0 + 60 * 60_000);
    expect(notes()).toHaveLength(1);
    expect(notes()[0].body).toMatchObject({ topic: 'aaap-test', message: expect.stringMatching(/still going/) });
    // No link (its secret would be readable by the topic) and no figures.
    expect(notes()[0].body).not.toHaveProperty('click');
    expect(JSON.stringify(notes())).not.toMatch(/247|25%|watch\.html/);
    await tickAt(T0 + 100 * 60_000);
    expect(notes()).toHaveLength(1);
    watchLinkRunEnded('finished');
    await settle();
    expect(notes()[1].body.message).toBe('Your planner run finished. Open your watch link to see it.');
  });

  it('with "include results" ticked, the notes carry the figures', async () => {
    watchOptions.value = { ...watchOptions.value, ntfyDetails: true };
    await nextTick();
    watchLinkRunStarted('smart');
    await tickAt(T0 + 60 * 60_000);
    expect(notes()[0].body.message).toMatch(/^Run 25% done/);
    watchLinkRunEnded('finished');
    await settle();
    expect(notes()[1].body.message).toMatch(/^Run finished: 247 TE/);
  });

  it('notes a failure, but not a Stop', async () => {
    watchLinkRunStarted('smart');
    watchLinkRunEnded('failed');
    expect(notes().map(n => n.body.message)).toEqual([expect.stringMatching(/stopped with an error/)]);
    watchLinkRunStarted('smart');
    watchLinkRunEnded('stopped');
    expect(notes()).toHaveLength(1);
    await settle();
  });

  it('no topic goes when notifications are off', async () => {
    watchOptions.value = { ...watchOptions.value, ntfy: false };
    await nextTick();
    watchLinkRunStarted('smart');
    await settle();
    expect(posts()[0].body).not.toHaveProperty('notify');
    watchLinkRunEnded('finished');
    await settle();
    expect(notes()).toHaveLength(0);
  });
});

describe('ticking during a run', () => {
  it('starts a link for the run going, and unticking says it stopped', async () => {
    running = 'sweep';
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
    await settle();
    expect(posts()).toHaveLength(1);
    expect((await opened(0))!.mode).toBe('full-sweep');
    watchOptions.value = { ...watchOptions.value, phone: false };
    await nextTick();
    await settle();
    expect(posts()[1].body.status).toBe('stopped');
  });
});

describe('the last word keeps what the run knew', () => {
  beforeEach(async () => {
    watchOptions.value = { ...watchOptions.value, phone: true };
    await nextTick();
  });

  // The store empties its progress the moment the run ends, so the final post used to carry no best,
  // no count, and (on the phone) "Nothing found yet".
  for (const how of ['finished', 'stopped', 'failed'] as const) {
    it(`a ${how} run posts the last best, count and times though the store's progress is gone`, async () => {
      running = 'deadline';
      progress = {
        done: 1200,
        total: 3000,
        secondsLeft: 60,
        best: { chain: [150, 247], te: 247, at: 1783944000 },
        startedAt: T0,
      };
      watchLinkRunStarted('deadline');
      await settle();
      await tickAt(T0 + 20 * 60_000);
      progress = { ...progress!, done: 1232 };
      watchLinkNoteProgress(progress);
      // The run ends: the store's progress is null by the time the last word is built.
      progress = null;
      clock = T0 + 21 * 60_000;
      watchLinkRunEnded(how);
      await settle();
      const last = (await opened(posts().length - 1))!;
      expect(last.status).toBe(how);
      expect(last.bestSoFar).toMatchObject({ te: 247, route: [150, 247], finish: 1783944000 });
      expect(last.done).toBe(1232);
      if (how === 'finished') expect(last.total).toBe(1232);
      expect(last.startedAt).toBe(T0);
      expect(last.endedAt).toBe(T0 + 21 * 60_000);
    });
  }
});
