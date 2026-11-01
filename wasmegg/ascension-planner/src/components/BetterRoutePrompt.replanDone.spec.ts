/**
 * R7 red-team (1 Nov 2026, spec-r7redteam-b's "Keep mine" check proposal): after Right now's "Re-plan from this save"
 * press, one line where the offer was, "Now following the answer for this save" (DRAFT words, for Words review). It
 * shows only after that press (never on load, never after the plain better-route "Follow it"), stays while the follow
 * is the one the press made and is the answer shown, and goes when the follow or the answer changes.
 *
 * Rendered on the server like the other component specs (no DOM, so no click): the press is the call the button makes
 * (stores/follow.ts `replanFromSave` for the Re-plan offer, `followBetter` for "Follow it"; the button's handler is
 * pinned from the file's source). A fake chain-search store holds the collector URL; fetch is a fake. Fixed clock;
 * placeholder id only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { followPrompt, readKeptMine } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt, { REPLAN_DONE_WORDS } from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;
const ZONE = 'America/Chicago';
const CLOCK = Date.UTC(2026, 9, 30, 14, 52);
const GOAL = 'fastest-490';
const stale = { kind: 'egg' as const, saveEgg: 'kindness', planEgg: 'curiosity' };
const now = () => Math.floor(Date.now() / 1000);

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

/** A Fast result found after the follow, finishing 3 days sooner. */
const candidateOf = (chain: number[], days = 37) => ({ chain, end: now() + days * D, endTE: 490, at: CLOCK + 1000, source: 'fast' as const, planStart: now() });
const ANSWER = [160, 195, 216, 490];

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  expect(await follows.follow(GOAL, [209, 287, 490], 'saved', undefined, { source: 'fast', finish: now() + 40 * D, endTE: 490, planStart: now() - D })).toBe(true);
  const show = async (s: typeof stale | null, candidate = candidateOf(ANSWER)) => {
    const html = await renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'fastest', deadline: null, candidate, stale: s, zone: ZONE }, {}, [pinia]);
    return { html, text: textOf(html) };
  };
  /** The offer the button presses (BetterRoutePrompt `prompt`). */
  const promptOf = (s: typeof stale | null) => {
    const f = follows.followed(GOAL)!;
    return followPrompt({
      goalKey: GOAL,
      goal: 'fastest',
      deadline: null,
      followed: { chain: f.chain, at: f.at, finish: { end: f.finish!, endTE: f.endTE ?? 490 }, priced: true, source: f.source },
      candidate: candidateOf(ANSWER),
      keptMine: readKeptMine(),
      when: t => dateAt(t, now(), ZONE),
      stale: s,
    })!;
  };
  return { follows, show, promptOf };
}

describe('BetterRoutePrompt: the line after "Re-plan from this save"', () => {
  it('the words are the DRAFT ones', () => {
    expect(REPLAN_DONE_WORDS).toBe('Now following the answer for this save');
  });

  it('not on load without a press', async () => {
    const { show } = await setup();
    const before = await show(stale);
    expect(before.text).toContain('Re-plan from this save');
    expect(before.html).not.toContain('better-route-replanned');
    expect(before.text).not.toContain(REPLAN_DONE_WORDS);
  });

  it('press Re-plan from this save: the answer is the follow, the offer goes and the line shows in its place', async () => {
    const { follows, show, promptOf } = await setup();
    expect(await follows.replanFromSave(GOAL, promptOf(stale), null)).toBe(true);
    expect(follows.followed(GOAL)).toMatchObject({ chain: ANSWER, source: 'fast' });
    // Whether or not the save still reads as contradicting it (it no longer does once the answer is the follow).
    for (const s of [stale, null]) {
      const after = await show(s);
      expect(after.html).not.toContain('data-testid="better-route"');
      expect(after.text).not.toContain('Re-plan from this save');
      expect(after.text).toBe(REPLAN_DONE_WORDS);
      expect(after.html).toMatch(/<p[^>]*class="[^"]*text-small[^"]*"[^>]*role="status"[^>]*data-testid="better-route-replanned"/);
    }
    // It stays (no timer): still there a minute later.
    vi.setSystemTime(CLOCK + 60_000);
    expect((await show(null)).text).toBe(REPLAN_DONE_WORDS);
  });

  it('goes when the answer or the follow changes', async () => {
    const { follows, show, promptOf } = await setup();
    await follows.replanFromSave(GOAL, promptOf(stale), null);
    // A different answer for the save, not better (so not offered): the line would not say what is on screen.
    expect((await show(null, candidateOf([160, 216, 490], 50))).text).toBe('');
    expect((await show(null)).text).toBe(REPLAN_DONE_WORDS);
    // Another follow press (even of the same route): gone for good.
    vi.setSystemTime(CLOCK + 5000);
    expect(await follows.follow(GOAL, [209, 287, 490], 'saved')).toBe(true);
    expect((await show(null)).text).not.toContain(REPLAN_DONE_WORDS);
    vi.setSystemTime(CLOCK + 9000);
    expect(await follows.follow(GOAL, ANSWER, 'saved')).toBe(true);
    expect((await show(null)).text).not.toContain(REPLAN_DONE_WORDS);
  });

  it('a Re-plan press that does not follow shows no line', async () => {
    const { follows, show, promptOf } = await setup();
    // A press the store refuses (an empty route here; also no account): nothing followed, nothing said.
    expect(await follows.replanFromSave(GOAL, { ...promptOf(stale), chain: [] }, null)).toBe(false);
    expect(follows.replanned(GOAL)).toBe(false);
    expect((await show(stale)).text).toContain('Re-plan from this save');
    expect((await show(stale)).text).not.toContain(REPLAN_DONE_WORDS);
  });

  it('the plain better-route "Follow it" press shows no line', async () => {
    const { follows, show, promptOf } = await setup();
    expect((await show(null)).text).toContain('Follow it');
    expect(await follows.followBetter(GOAL, promptOf(null), null)).toBe(true);
    expect(follows.followed(GOAL)).toMatchObject({ chain: ANSWER });
    const after = await show(null);
    expect(after.html).not.toContain('better-route-replanned');
    expect(after.text).toBe('');
  });

  it("the button: Re-plan offer → replanFromSave, Follow it → followBetter", () => {
    const src = fs.readFileSync(path.join(__dirname, 'BetterRoutePrompt.vue'), 'utf8');
    const body = /function followIt\(\): void \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
    expect(body).toMatch(/p\.stale\s*\?\s*follows\.replanFromSave\(/);
    expect(body).toMatch(/:\s*follows\.followBetter\(/);
  });
});
