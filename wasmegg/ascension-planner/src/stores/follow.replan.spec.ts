/**
 * RE-PLAN FROM THIS SAVE (alt A1, 30 Oct 2026; lib/followStale.ts, lib/searchPlan.ts `followPrompt` `stale`): a priced
 * follow planned from an older save, the newer save's instant answer offered on Right now's BetterRoutePrompt. Showing
 * it changes nothing; its button is the existing Follow press (stores/follow.ts `followBetter`). A fake chain-search
 * store (same id) holds the collector URL; fetch is a fake. Fixed clock; ids are placeholders only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { followPrompt } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;
const ZONE = 'America/Chicago';
const CLOCK = Date.UTC(2026, 9, 30, 14, 52); // Oct 30, 9:52 am Central

let mem: Map<string, string>;
let calls: { url: string; method: string }[];

const fakeSearch = (submitUrl: string) => defineStore('chainSearch', () => ({ submitUrl, availability: null }))();

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
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    const body = method === 'GET' ? { goals: {}, now: Date.now() } : { ok: true, version: 1 };
    return { ok: true, status: 200, json: async () => body };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const now = () => Math.floor(Date.now() / 1000);
const puts = () => calls.filter(c => c.method === 'PUT');

describe('re-plan from this save', () => {
  const GOAL = 'fastest-490';
  const stale = { kind: 'egg' as const, saveEgg: 'kindness', planEgg: 'curiosity' };
  const candidate = () => ({ chain: [160, 195, 216, 249], end: now() + 42 * D, endTE: 249, at: Date.now() + 1000, source: 'instant' as const, planStart: now() });

  async function setup() {
    const pinia = createPinia();
    setActivePinia(pinia);
    fakeSearch(SUBMIT);
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    const follows = useFollowStore();
    expect(await follows.follow(GOAL, [209, 287, 490], 'saved', undefined, { source: 'fast', finish: now() + 40 * D, endTE: 490, planStart: now() - D })).toBe(true);
    return { pinia, follows };
  }

  it('shown over a priced follow with the reason first and "Re-plan from this save"; showing it changes nothing', async () => {
    const { pinia, follows } = await setup();
    const before = JSON.stringify(follows.followed(GOAL));
    const putsBefore = puts().length;
    const props = { goalKey: GOAL, goal: 'fastest', deadline: null, candidate: candidate(), zone: ZONE };
    expect(textOf(await renderHtml(BetterRoutePrompt, props, {}, [pinia]))).toBe('');
    const text = textOf(await renderHtml(BetterRoutePrompt, { ...props, stale }, {}, [pinia]));
    expect(text).toMatch(/^Your save doesn't match the route you follow: it's on Kindness, but the route expects Curiosity\. The answer for this save finishes .+ Re-plan from this save Keep mine$/);
    expect(JSON.stringify(follows.followed(GOAL))).toBe(before);
    expect(puts().length).toBe(putsBefore);
  });

  it("the button is the existing Follow press: the answer becomes the follow (instant, its plan start)", async () => {
    const { follows } = await setup();
    const f = follows.followed(GOAL)!;
    const p = followPrompt({
      goalKey: GOAL,
      goal: 'fastest',
      deadline: null,
      followed: { chain: f.chain, at: f.at, finish: { end: f.finish!, endTE: 490 }, priced: true, source: f.source },
      candidate: candidate(),
      keptMine: [],
      when: t => dateAt(t, now(), ZONE),
      stale,
    })!;
    expect(p.stale).toBe('egg');
    expect(await follows.followBetter(GOAL, p, null)).toBe(true);
    expect(follows.followed(GOAL)).toMatchObject({ chain: [160, 195, 216, 249], source: 'instant', planStart: now() });
    // BetterRoutePrompt's button calls exactly that, nothing new.
    const src = fs.readFileSync(path.join(__dirname, '../components/BetterRoutePrompt.vue'), 'utf8');
    const followIt = src.slice(src.indexOf('function followIt'), src.indexOf('function keepIt'));
    expect(followIt).toContain('void follows.followBetter(props.goalKey, p, props.goal === \'date\' ? props.deadline : null);');
    expect(src).toContain('@click.stop="followIt"');
  });
});

describe('Right now asks with the reason', () => {
  it("useNowPage gives the prompt the followed route's staleness against the save; RightNowCard passes it on", () => {
    const page = fs.readFileSync(path.join(__dirname, '../composables/useNowPage.ts'), 'utf8');
    expect(page).toContain('stale: followStaleness({');
    expect(page).toContain('plan: fs.plan?.plan ?? null,');
    expect(page).toContain('save: hasSave.value ? { seconds: saveSeconds.value, egg: currentEgg.value, te: saveTEOf(raw.value) } : null,');
    expect(page).toContain('hoursDiffer: f.hours !== undefined && !sameHours(f.hours, hoursOf(store.availability)),');
    const card = fs.readFileSync(path.join(__dirname, '../components/myruns/RightNowCard.vue'), 'utf8');
    expect(card).toContain(':stale="betterRoute.stale ?? null"');
  });
});
