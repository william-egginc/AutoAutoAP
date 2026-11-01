/**
 * R7 red-team "Re-plan after Keep mine" (31 Oct 2026, could not be settled by QA): pins the sequence on Right now's
 * BetterRoutePrompt. A better result is offered ("Follow it" / "Keep mine"); Keep mine dismisses THAT offer only (its
 * id is the result's own). Later the save contradicts the follow (lib/followStale.ts) with the same newer answer: the
 * "Re-plan from this save" offer has its own id (`|over|<followed route>`), so it shows; pressing it (the Follow
 * press, stores/follow.ts `followBetter`) makes the answer the follow and the offer goes (same route now). Keep mine
 * on the Re-plan offer hides it for that follow and answer only; a new follow asks again. The Build-up tracker's own
 * "Re-plan from this save" never reads Keep mine (composables/useBuildUpTracker.ts). A fake chain-search store holds the
 * collector URL; fetch is a fake. Fixed clock; ids are placeholders only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { followPrompt, keepMine, readKeptMine } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;
const ZONE = 'America/Chicago';
const CLOCK = Date.UTC(2026, 9, 30, 14, 52);

let mem: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLOCK);
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.stubGlobal('fetch', async (_url: string, init?: { method?: string }) => {
    const body = (init?.method ?? 'GET') === 'GET' ? { goals: {}, now: Date.now() } : { ok: true, version: 1 };
    return { ok: true, status: 200, json: async () => body };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const GOAL = 'fastest-490';
const now = () => Math.floor(Date.now() / 1000);
const stale = { kind: 'egg' as const, saveEgg: 'kindness', planEgg: 'curiosity' };
/** A Fast result found after the follow, finishing 3 days sooner. */
const candidate = () => ({ chain: [160, 195, 216, 490], end: now() + 37 * D, endTE: 490, at: Date.now() + 1000, source: 'fast' as const, planStart: now() });

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  expect(await follows.follow(GOAL, [209, 287, 490], 'saved', undefined, { source: 'fast', finish: now() + 40 * D, endTE: 490, planStart: now() - D })).toBe(true);
  const props = { goalKey: GOAL, goal: 'fastest', deadline: null, candidate: candidate(), zone: ZONE };
  const show = async (s: typeof stale | null) => {
    const html = await renderHtml(BetterRoutePrompt, { ...props, stale: s }, {}, [pinia]);
    return { html, text: textOf(html), id: /data-id="([^"]*)"/.exec(html)?.[1] ?? null };
  };
  const promptOf = (s: typeof stale | null) => {
    const f = follows.followed(GOAL)!;
    return followPrompt({
      goalKey: GOAL,
      goal: 'fastest',
      deadline: null,
      followed: { chain: f.chain, at: f.at, finish: { end: f.finish!, endTE: f.endTE ?? 490 }, priced: true, source: f.source },
      candidate: props.candidate,
      keptMine: readKeptMine(),
      when: t => dateAt(t, now(), ZONE),
      stale: s,
    });
  };
  return { follows, show, promptOf };
}

describe('Keep mine, then Re-plan from this save', () => {
  it('Keep mine on the better-route offer does not hide the later Re-plan offer; pressing Re-plan changes the follow', async () => {
    const { follows, show, promptOf } = await setup();
    // 1. The better result is offered.
    const better = await show(null);
    expect(better.text).toContain('Follow it');
    expect(better.text).toContain('Keep mine');
    // 2. Keep mine (BetterRoutePrompt `keepIt`): that offer is gone.
    keepMine(better.id!);
    expect((await show(null)).text).toBe('');
    // 3. The save now contradicts the follow, with the same answer: the Re-plan offer has its own id, so it shows.
    const replan = await show(stale);
    expect(replan.id).toBe(`${better.id}|over|209-287-490`);
    expect(replan.text).toContain('Re-plan from this save');
    // 4. Pressing it (`followIt`: the Follow press): the answer is the follow now, and the offer goes.
    expect(await follows.followBetter(GOAL, promptOf(stale)!, null)).toBe(true);
    expect(follows.followed(GOAL)).toMatchObject({ chain: [160, 195, 216, 490], source: 'fast' });
    expect((await show(stale)).text).toBe('');
  });

  it('Keep mine on the Re-plan offer: hidden for that follow and answer only', async () => {
    const { show } = await setup();
    const replan = await show(stale);
    keepMine(replan.id!);
    expect((await show(stale)).text).toBe('');
    // The better-route offer for the same result is its own (not dismissed by it).
    expect((await show(null)).text).toContain('Follow it');
  });

  it("the Build-up tracker's Re-plan never reads Keep mine", () => {
    const src = fs.readFileSync(path.join(__dirname, '../composables/useBuildUpTracker.ts'), 'utf8');
    expect(src).not.toMatch(/keepMine|KEEP_MINE|readKeptMine/);
  });
});
