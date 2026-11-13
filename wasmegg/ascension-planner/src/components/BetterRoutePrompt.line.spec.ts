/**
 * THE BETTER-ROUTE OFFER AS ONE LINE IN THE FOLLOWING BAR (the instant card clean-up, Jordan 12 Nov 2026,
 * notes/instant-proposal.md question 2): on the instant answer card the offer is one line ("The answer above is better:
 * …", lib/instantCardWords.ts betterAboveLine) with Keep mine, in the Following bar (layout/NowLine.vue) under the card.
 * "Follow it" goes: the card's main button is the same press, and reads "Follow this route instead" while another route
 * is followed. BetterRoutePrompt's `line` is the instant card's only; the search result cards and My runs keep theirs.
 * Rendered on the server like the other component specs. Fake collector and fetch; fixed clock; placeholder id only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { renderHtml, textOf } from '@/test/renderComponent';
import { headlineGap } from '@/lib/format';
import { FOLLOW_THIS_ROUTE_INSTEAD, betterAboveLine, fasterAboveLine } from '@/lib/instantCardWords';
import { dateAt } from '@/lib/eventWhen';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';
import FollowButton from '@/components/FollowButton.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const H = 3600;
const CLOCK = Date.UTC(2026, 10, 3, 19, 19);
const now = () => Math.floor(Date.now() / 1000);
const DEADLINE = Math.floor(CLOCK / 1000) + 17 * 86400;
const GOAL = `date-${DEADLINE}`;
const FOLLOWED = [198, 200, 202];
const ANSWER = [203];

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

/** The instant answer: 203 TE, 46 h 14 min to spare; the followed route: 202 TE, 10 h 46 min to spare (its saved price). */
const candidate = () => ({ chain: ANSWER, end: DEADLINE - (46 * H + 14 * 60), endTE: 203, at: CLOCK + 1000, source: 'instant' as const, planStart: now() });

async function setup(followedEnd = DEADLINE - (10 * H + 46 * 60)) {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  expect(await follows.follow(GOAL, FOLLOWED, 'answer', undefined, { finish: followedEnd, endTE: 202, planStart: now() - H })).toBe(true);
  const show = (props: Record<string, unknown>) =>
    renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'date', deadline: DEADLINE, candidate: candidate(), ...props }, {}, [pinia]);
  return { pinia, show };
}

describe('the instant card\'s line (`line`)', () => {
  it('one line: Words\' betterAboveLine with the box\'s own spare style, then Keep mine; no Follow it, no box', async () => {
    const { show } = await setup();
    const html = await show({ line: true });
    expect(html).toContain('data-testid="better-route"');
    expect(html).toContain('data-variant="line"');
    expect(html).not.toContain('data-testid="better-route-follow"');
    expect(html).not.toMatch(/rounded-xl border border-indigo-300/);
    const words = betterAboveLine({
      better: { te: '203 TE', size: headlineGap(46 * H + 14 * 60) },
      yours: { te: '202 TE', size: headlineGap(10 * H + 46 * 60) },
    });
    expect(words).toBe(`The answer above is better: 203 TE, ${headlineGap(46 * H + 14 * 60)} to spare (yours: 202 TE, ${headlineGap(10 * H + 46 * 60)}).`);
    expect(textOf(html)).toBe(`${words} Keep mine`);
    const keep = html.match(/<button[^>]*data-testid="better-route-keep"[^>]*>/)![0];
    expect(keep).toContain('min-h-[44px]');
    expect(keep).toContain('focus-visible:ring-2');
  });
  it('yours lands after the date: said so ("lands … after the date")', async () => {
    const { show } = await setup(DEADLINE + 3 * H);
    expect(textOf(await show({ line: true }))).toContain(`(yours: 202 TE, lands ${headlineGap(3 * H)} after the date).`);
  });
  it('without `line` (the search result cards): the box with Follow it and Keep mine, as before', async () => {
    const { show } = await setup();
    const html = await show({});
    expect(html).toContain('data-testid="better-route-follow"');
    expect(html).toMatch(/rounded-xl border border-indigo-300/);
    expect(textOf(html)).toContain('This is a better route than the one you');
  });
});

describe("Fastest's line (Words' fasterAboveLine, 12 Nov 2026)", () => {
  const ZONE = 'America/Los_Angeles';
  const FAST_GOAL = 'fastest-490';
  /** The answer finishes 8 days sooner than the followed route's saved finish. */
  const yoursEnd = () => now() + 40 * 86400;
  const betterEnd = () => now() + 32 * 86400;
  async function fastest() {
    const pinia = createPinia();
    setActivePinia(pinia);
    defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    expect(await useFollowStore().follow(FAST_GOAL, [198, 490], 'answer', undefined, { finish: yoursEnd(), endTE: 490, planStart: now() - H })).toBe(true);
    const cand = { chain: [490], end: betterEnd(), endTE: 490, at: CLOCK + 1000, source: 'instant' as const, planStart: now() };
    return renderHtml(BetterRoutePrompt, { goalKey: FAST_GOAL, goal: 'fastest', deadline: null, candidate: cand, zone: ZONE, line: true }, {}, [pinia]);
  }
  it('"The answer above is faster: <its finish> (yours: <your finish>)." with the times as the card writes them; Keep mine, no Follow it', async () => {
    const html = await fastest();
    expect(html).toContain('data-variant="line"');
    const words = fasterAboveLine({ better: dateAt(betterEnd(), now(), ZONE), yours: dateAt(yoursEnd(), now(), ZONE) });
    expect(words).toMatch(/^The answer above is faster: /);
    expect(textOf(html)).toBe(`${words} Keep mine`);
    expect(html).not.toContain('data-testid="better-route-follow"');
    expect(html.match(/<button[^>]*data-testid="better-route-keep"[^>]*>/)![0]).toContain('min-h-[44px]');
  });
  it('no player words in BetterRoutePrompt for it: the line is fasterAboveLine\'s', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'BetterRoutePrompt.vue'), 'utf8');
    expect(src).toMatch(/fasterAboveLine\(\{\s*better: dateAt\(p\.end, /);
    expect(src).not.toContain('is faster');
  });
});

describe('the main button while another route is followed', () => {
  it('reads "Follow this route instead" (main only); the plain buttons and the followed route itself as before', async () => {
    const { pinia } = await setup();
    const label = async (p: Record<string, unknown>) =>
      textOf(await renderHtml(FollowButton, { goalKey: GOAL, from: 'answer', primary: true, ...p }, {}, [pinia]));
    expect(await label({ chain: ANSWER, main: true })).toBe(FOLLOW_THIS_ROUTE_INSTEAD);
    expect(await label({ chain: ANSWER })).toBe('Follow this route');
    expect(await label({ chain: FOLLOWED, main: true })).toBe('Following ✓');
  });
  it('nothing followed for the goal: "Follow this route"', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
    useInitialStateStore().rawBackup = { eiUserId: ID } as never;
    expect(textOf(await renderHtml(FollowButton, { goalKey: GOAL, chain: ANSWER, from: 'answer', main: true }, {}, [pinia]))).toBe('Follow this route');
  });
});

describe('where it sits', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  it('InstantRoute: both boxes hand the line to the Following bar (a Teleport to NowLine\'s slot), never drawn while stale', () => {
    const src = read('auto/InstantRoute.vue');
    const tpl = src.slice(0, src.indexOf('<script setup'));
    const prompts = [...tpl.matchAll(/<Teleport :to="nowEl \?\? 'body'" :disabled="!nowEl">\s*<BetterRoutePrompt\s+v-if="!staleAt"\s+line\b/g)];
    expect(prompts).toHaveLength(2);
    expect(src).toContain("const nowEl = useTeleportTarget(() => (props.nowTo ? `#${props.nowTo}` : undefined), () => !!result.value);");
  });
  it('NowLine: the slot under its line, at every state; the screens name it', () => {
    const now = read('layout/NowLine.vue');
    expect(now).toContain(':id="`now-offer-${screen}`"');
    expect(read('auto/DeadlinePanel.vue')).toContain('now-to="now-offer-by-date"');
    expect(read('auto/FastestRoute.vue')).toContain('now-to="now-offer-fastest"');
  });
  it('My runs keeps its own (replanOnly), the result cards theirs: no `line` outside the instant card', () => {
    for (const f of ['myruns/RightNowCard.vue', 'auto/ChainSearchPanel.vue', 'auto/DeadlinePanel.vue'])
      expect(read(f)).not.toMatch(/<BetterRoutePrompt[^>]*\sline\b/);
  });
});
