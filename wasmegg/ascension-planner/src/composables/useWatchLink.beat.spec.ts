/**
 * The phone link's 5-minute beat survives (ux35-f, 28 Oct 2026). Jordan's phone said "Not reporting, last update
 * 10 h ago" while the By a date run was still going on his PC (Edge, hidden tab, a watcher tab open).
 *
 * The beat used to ride on one thing only: the store's 15 s black-box timer (stores/chainSearch.ts `blackBoxBeat`
 * -> `watchLinkTick`). A page timer is what a browser throttles or stops in a hidden tab (Chrome's intensive
 * throttling, Edge's sleeping tabs and efficiency mode), while the run's own progress keeps arriving from its
 * workers. These specs pin each suspect on a fixed clock with a fake fetch (no wall-clock waits, no collector):
 *
 *  - after a progress note (every 3 h) the beat goes on;
 *  - after failed posts (429, 503, offline, a post that never answers) the beat goes on;
 *  - a panel mounted and unmounted again changes nothing (the beat belongs to the store, not a component);
 *  - with no timer firing at all, the run's progress events still carry the beat, one post per 5 minutes;
 *  - consecutive failures are counted, for the run page's amber note (search/watchLink.ts `watchFailingNote`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import {
  activeWatch,
  installWatchLink,
  resetWatchLink,
  watchLinkNoteProgress,
  watchLinkRunEnded,
  watchLinkRunStarted,
  watchLinkTick,
  watchOptions,
} from './useWatchLink';
import {
  DEFAULT_WATCH_OPTIONS,
  WATCH_EVERY_MS,
  WATCH_FAILS_NOTE,
  watchFailingNote,
  type ProgressLike,
} from '@/search/watchLink';

const T0 = Date.UTC(2026, 9, 27, 17);
let clock = T0;
let calls: { url: string; body: Record<string, unknown> }[] = [];
let answer: () => Response | Promise<Response> = () => new Response('{}');
let progress: ProgressLike | null = null;
/** No run going while the options are set up (ticking during a run starts a link at once). */
let running: 'deadline' | null = null;

const posts = () => calls.filter(c => c.url.endsWith('/watch'));
const notes = () => calls.filter(c => c.url === 'https://ntfy.sh');
/** Let the sealing (WebCrypto) and the fetch go through. Not a timer, so nothing here waits on a clock. */
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r));
};

beforeEach(async () => {
  clock = T0;
  calls = [];
  answer = () => new Response('{}');
  progress = {
    done: 1000,
    total: 417_953,
    percent: 0.2,
    secondsLeft: 80_000,
    best: { chain: [150, 247], te: 247, at: 1783944000 },
  };
  running = null;
  resetWatchLink();
  watchOptions.value = { ...DEFAULT_WATCH_OPTIONS };
  await nextTick();
  await settle();
  installWatchLink({
    collector: () => 'https://c.example',
    buildCollector: () => 'https://c.example',
    progress: () => progress,
    workers: () => 19,
    deadline: () => 1783944000,
    running: () => running,
    now: () => clock,
    origin: () => 'https://site.example',
    base: () => '/ascension-planner/',
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      return answer();
    }) as typeof fetch,
  });
  watchOptions.value = { ...watchOptions.value, phone: true };
  await nextTick();
  await settle();
  calls = [];
  running = 'deadline';
});

/** The store's 15 s black-box timer, from `from` to `to` (as a visible tab runs it). */
async function timerTicks(from: number, to: number, every = 15_000): Promise<void> {
  for (let t = from; t <= to; t += every) {
    clock = t;
    watchLinkTick();
    await settle();
  }
}

/** The run's own progress (a worker's batch back), with no timer firing at all: a hidden, throttled tab. */
async function progressEvents(from: number, to: number, every = 30_000): Promise<void> {
  for (let t = from; t <= to; t += every) {
    clock = t;
    progress = { ...progress!, done: progress!.done + 50 };
    watchLinkNoteProgress(progress);
    await settle();
  }
}

/** One post per 5-minute window from T0, through `to`. */
const expectedPosts = (to: number) => Math.floor((to - T0) / WATCH_EVERY_MS) + 1;

describe('suspect (c): a progress note every 3 hours', () => {
  it('the beat goes on after each 3-hourly note, for 7 hours', async () => {
    watchOptions.value = { ...watchOptions.value, ntfy: true, ntfyTopic: 'aaap-test', ntfyEveryMin: 180 };
    await nextTick();
    watchLinkRunStarted('deadline');
    await settle();
    const end = T0 + 7 * 3600_000;
    await timerTicks(T0 + 60_000, end, 60_000);
    expect(notes()).toHaveLength(2);
    expect(posts()).toHaveLength(expectedPosts(end));
    // Every post is the run's, running, under the one link.
    expect(new Set(posts().map(p => p.body.id))).toEqual(new Set([activeWatch.value!.link.id]));
    expect(posts().every(p => p.body.status === 'running')).toBe(true);
  });
});

describe('suspect (b): failed posts', () => {
  for (const [what, fail] of [
    ['429 too soon', () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } })],
    ['429 from the per-address limit', () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } })],
    ['503', () => new Response('{}', { status: 503 })],
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a post that never answers', () => new Promise<Response>(() => undefined)],
  ] as [string, () => Response | Promise<Response>][])
    it(`${what}: tried again every 5 minutes, and back to normal once the collector takes one`, async () => {
      watchLinkRunStarted('deadline');
      await settle();
      answer = fail;
      await timerTicks(T0 + 15_000, T0 + 30 * 60_000);
      expect(posts()).toHaveLength(expectedPosts(T0 + 30 * 60_000));
      answer = () => new Response('{}');
      await timerTicks(T0 + 30 * 60_000 + 15_000, T0 + 60 * 60_000);
      expect(posts()).toHaveLength(expectedPosts(T0 + 60 * 60_000));
      expect(activeWatch.value!.lastOkAt).toBe(T0 + 60 * 60_000);
      expect(activeWatch.value!.fails).toBe(0);
    });

  it('counts failures in a row, and a success clears the count', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    expect(activeWatch.value!.fails).toBe(0);
    answer = () => new Response('{}', { status: 503 });
    for (let i = 1; i <= 4; i++) {
      clock = T0 + i * WATCH_EVERY_MS;
      watchLinkTick();
      await settle();
      expect(activeWatch.value!.fails).toBe(i);
    }
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    clock = T0 + 5 * WATCH_EVERY_MS;
    watchLinkTick();
    await settle();
    expect(activeWatch.value!.fails).toBe(5);
    expect(activeWatch.value!.lastOkAt).toBe(T0);
    answer = () => new Response('{}');
    clock = T0 + 6 * WATCH_EVERY_MS;
    watchLinkTick();
    await settle();
    expect(activeWatch.value!.fails).toBe(0);
    expect(activeWatch.value!.lastOkAt).toBe(T0 + 6 * WATCH_EVERY_MS);
  });
});

describe('suspect (d): the timer and the panels', () => {
  it("the beat's driver lives in the store, never in a component a re-render could unmount", () => {
    const root = path.join(__dirname, '..');
    const compDir = path.join(root, 'components');
    const vue: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true }))
        if (f.isDirectory()) walk(path.join(d, f.name));
        else if (f.name.endsWith('.vue')) vue.push(path.join(d, f.name));
    };
    walk(compDir);
    for (const f of vue) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/watchLinkTick|watchLinkNoteProgress/);
    const store = fs.readFileSync(path.join(root, 'stores', 'chainSearch.ts'), 'utf8');
    // The 15 s timer and the progress hook are both the store's, set up once.
    expect(store).toMatch(/blackBoxTimer = setInterval\(blackBoxBeat, 15_000\)/);
    expect(store).toMatch(/watch\(runProgress, p => watchLinkNoteProgress\(/);
  });

  it('a run started again on the same page keeps exactly one beat (the old link stops)', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    const first = activeWatch.value!.link.id;
    watchLinkRunEnded('stopped');
    await settle();
    clock = T0 + 60_000;
    watchLinkRunStarted('deadline');
    await settle();
    const second = activeWatch.value!.link.id;
    expect(second).not.toBe(first);
    calls = [];
    await timerTicks(T0 + 75_000, T0 + 61_000 + 30 * 60_000);
    await progressEvents(T0 + 61_000 + 30 * 60_000 + 30_000, T0 + 61_000 + 60 * 60_000);
    // The first link's only word after its end is its stop (sealing is async, so it can land late).
    expect(posts().filter(p => p.body.id === first && p.body.status !== 'stopped')).toEqual([]);
    expect(posts().filter(p => p.body.id === second)).toHaveLength(12);
  });
});

describe('suspect (a): a hidden, throttled tab', () => {
  it("with no timer firing for 2 hours, the run's own progress events still send one beat every 5 minutes", async () => {
    watchLinkRunStarted('deadline');
    await settle();
    const end = T0 + 2 * 3600_000;
    await progressEvents(T0 + 30_000, end);
    expect(posts()).toHaveLength(expectedPosts(end));
    // The phone gets the fresh count.
    expect(activeWatch.value!.lastOkAt).toBe(T0 + 24 * WATCH_EVERY_MS);
  });

  it('timer ticks and progress events together still make exactly one beat per 5 minutes', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    for (let t = T0 + 5_000; t <= T0 + 3600_000; t += 5_000) {
      clock = t;
      if (t % 15_000 === 0) watchLinkTick();
      progress = { ...progress!, done: progress!.done + 1 };
      watchLinkNoteProgress(progress);
      await settle();
    }
    expect(posts()).toHaveLength(expectedPosts(T0 + 3600_000));
    expect(posts()).toHaveLength(13);
  });

  it('progress events after the run ended send nothing more', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    clock = T0 + 60_000;
    watchLinkRunEnded('finished');
    await settle();
    expect(posts()).toHaveLength(2);
    await progressEvents(T0 + 6 * 60_000, T0 + 30 * 60_000);
    expect(posts()).toHaveLength(2);
  });
});

describe('the failing-sends note (search/watchLink.ts watchFailingNote)', () => {
  const base = {
    status: 'running' as const,
    lastOkAt: Date.UTC(2026, 9, 27, 10, 5) as number | null,
    lastError: 'the collector said 503',
  };

  it(`appears after ${WATCH_FAILS_NOTE} failures in a row, with the last time one went`, () => {
    expect(WATCH_FAILS_NOTE).toBe(3);
    for (let f = 0; f < WATCH_FAILS_NOTE; f++) expect(watchFailingNote({ ...base, fails: f })).toBe('');
    const note = watchFailingNote({ ...base, fails: WATCH_FAILS_NOTE });
    const when = new Date(base.lastOkAt!);
    const h = when.getHours();
    const clock12 = `${h % 12 || 12}:${String(when.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    expect(note).toBe(
      `Your phone link isn't updating: the last 3 updates didn't go (the collector said 503). The last one sent was at ${clock12}. It keeps trying every 5 minutes.`
    );
    expect(note).toMatch(/\d{1,2}:\d{2} (am|pm)/);
  });

  it('says so when none has gone yet', () => {
    expect(watchFailingNote({ ...base, lastOkAt: null, fails: 4 })).toBe(
      "Your phone link isn't updating: the last 4 updates didn't go (the collector said 503). None has gone yet. It keeps trying every 5 minutes."
    );
  });

  it('a post that never answers counts as failed once the next one is due', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    answer = () => new Promise<Response>(() => undefined);
    for (let i = 1; i <= 4; i++) {
      clock = T0 + i * WATCH_EVERY_MS;
      watchLinkTick();
      await settle();
    }
    // Posts 1-3 never answered by the time 2-4 went; the 4th is still out.
    expect(activeWatch.value!.fails).toBe(3);
    expect(watchFailingNote(activeWatch.value!)).toContain('(no answer from the server)');
  });

  it('is gone once the run ends, or once one goes again', () => {
    expect(watchFailingNote({ ...base, fails: 0 })).toBe('');
    expect(watchFailingNote({ ...base, status: 'finished', fails: 9 })).toBe('');
  });

  it('end to end: three failed beats show it, the next success clears it', async () => {
    watchLinkRunStarted('deadline');
    await settle();
    answer = () => new Response('{}', { status: 429 });
    for (let i = 1; i <= 3; i++) {
      clock = T0 + i * WATCH_EVERY_MS;
      watchLinkTick();
      await settle();
      expect(watchFailingNote(activeWatch.value!) === '').toBe(i < 3);
    }
    expect(watchFailingNote(activeWatch.value!)).toContain('the collector said 429');
    answer = () => new Response('{}');
    clock = T0 + 4 * WATCH_EVERY_MS;
    watchLinkTick();
    await settle();
    expect(watchFailingNote(activeWatch.value!)).toBe('');
  });
});
