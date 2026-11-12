/**
 * M13 follow-up (12 Nov 2026): the better-route box compared a candidate with the finish SAVED with the follow ("yours: 313
 * TE, 37h 6m to spare") even when that price was worked out by another version of the planner or with other awake hours:
 * it disagreed with My runs, which prices the same chain fresh (hours 7 AM-10 PM on the fixture: the older chain lands 4 days
 * later). A price that isn't for the current setup is not compared: the offer is "Re-plan from this save" without "yours: ...".
 * Rendered on the server like BetterRoutePrompt.replanDone.spec.ts; a fake chain-search store; placeholder id only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const D = 86400;
const ZONE = 'America/Denver';
const CLOCK = Date.UTC(2026, 10, 12, 17, 3);
const GOAL = 'eggday-2027';
const DEADLINE = Date.UTC(2027, 6, 14, 16) / 1000;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLOCK);
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ goals: {}, now: Date.now() }) }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function show(mutate: (f: { simVersion?: string; hours?: unknown }) => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: 'https://collector.example/submit', availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  // Followed with a finish saved with it: 313 TE, a day and a half before the date.
  expect(await follows.follow(GOAL, [218, 247, 278, 313], 'saved', undefined, { source: 'instant', finish: DEADLINE - 37 * 3600, endTE: 313, planStart: now() - D })).toBe(true);
  mutate(follows.followed(GOAL) as never);
  // The instant answer's route: sooner, one more TE, found after the follow.
  const candidate = { chain: [222, 251, 282, 314], end: DEADLINE - 19 * 3600, endTE: 314, at: CLOCK + 1000, source: 'instant' as const, planStart: now() };
  const html = await renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'date', deadline: DEADLINE, candidate, zone: ZONE }, {}, [pinia]);
  return textOf(html);
}

describe('BetterRoutePrompt: a kept price from another version or other hours is not compared', () => {
  it('the follow\'s price is for this setup: the numbers, as before', async () => {
    const t = await show(() => undefined);
    expect(t).toContain('yours: 313 TE');
  });
  it('set with another version of the planner: no "yours" numbers, a re-plan from this save', async () => {
    const t = await show(f => {
      f.simVersion = 'an-older-simulator';
    });
    expect(t).not.toContain('yours:');
    expect(t).not.toContain('37h');
    expect(t).toContain('another version of the planner');
    expect(t).toContain('Re-plan from this save');
  });
  it('set with other awake hours: no "yours" numbers either', async () => {
    const t = await show(f => {
      f.hours = { start: '09:00', end: '17:00' };
    });
    expect(t).not.toContain('yours:');
    expect(t).toContain('Re-plan from this save');
  });
});

// QA (12 Nov 2026, t230): a RESTORED instant answer carries its snapshot's time, a recomputed one Date.now(); one saved 1-3 s
// before Follow was pressed was never offered (about 1 session in 3, sticky). An instant answer's age says nothing (it is
// worked out again each visit), so it is offered whether or not it is older than the follow.
describe('BetterRoutePrompt: an instant answer older than the follow is still offered', () => {
  const run = async (candidateAt: number, chain: number[], source: 'instant' | 'fast' = 'instant') => {
    const pinia = createPinia();
    setActivePinia(pinia);
    defineStore('chainSearch', () => ({ submitUrl: 'https://collector.example/submit', availability: null }))();
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    expect(await follows.follow(GOAL, [218, 247, 278, 313], 'saved', undefined, { source: 'instant', finish: DEADLINE - 37 * 3600, endTE: 313, planStart: now() - D })).toBe(true);
    const candidate = { chain, end: DEADLINE - 60 * 3600, endTE: 314, at: candidateAt, source, planStart: now() };
    return textOf(await renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'date', deadline: DEADLINE, candidate, zone: ZONE }, {}, [pinia]));
  };
  it('restored 2 s before the Follow press: offered', async () => {
    expect(await run(CLOCK - 2000, [222, 251, 282, 314])).toContain('better route');
  });
  it('recomputed after the press: offered (as before)', async () => {
    expect(await run(CLOCK + 1000, [222, 251, 282, 314])).toContain('better route');
  });
  it('the same route as the one followed: never offered', async () => {
    expect(await run(CLOCK - 2000, [218, 247, 278, 313])).toBe('');
    expect(await run(CLOCK + 1000, [218, 247, 278, 313])).toBe('');
  });
  it('a Fast result older than the follow is still not offered (its age says it was found before)', async () => {
    expect(await run(CLOCK - 2000, [222, 251, 282, 314], 'fast')).toBe('');
  });
});
