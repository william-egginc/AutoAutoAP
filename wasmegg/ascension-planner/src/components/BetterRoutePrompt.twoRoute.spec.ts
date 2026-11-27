/**
 * TWO ROUTES AND A FOLLOWED ROUTE (R10 option C, 21 Nov 2026; Jordan: a followed route never switches by itself): Fastest to 490 and
 * Egg Day auto-follow the box's first pick as soon as the answer is in. If the exact check then finds the pick without the held buys
 * faster and the box switches to it, the followed route stays the first one and the box's own offer asks (BetterRoutePrompt, the
 * instant card's line), as for any better answer: the faster route's finish against the followed finish, a minute or more sooner.
 * Rendered on the server like BetterRoutePrompt.line.spec.ts; fake collector and fetch; fixed clock; placeholder id only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { renderHtml, textOf } from '@/test/renderComponent';
import { fasterAboveLine } from '@/lib/instantCardWords';
import { dateAt } from '@/lib/eventWhen';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const H = 3600;
const CLOCK = Date.UTC(2026, 10, 21, 19, 19);
const ZONE = 'America/Los_Angeles';
const GOAL = 'fastest-490';
const FIRST = [198, 350, 490];
const FASTER = [198, 400, 490];
const now = () => Math.floor(Date.now() / 1000);
const firstEnd = () => now() + 40 * 86400;

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
  vi.stubGlobal('fetch', async (_url: string, init?: { method?: string }) => {
    const body = (init?.method ?? 'GET') === 'GET' ? { goals: {}, now: Date.now() } : { ok: true, version: 1 };
    return { ok: true, status: 200, json: async () => body };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The first pick was followed on its own at its quick estimate; the box now shows the faster route, offered as the candidate. */
async function offer(fasterBy: number) {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  expect(await useFollowStore().follow(GOAL, FIRST, 'answer', undefined, { finish: firstEnd(), endTE: 490, planStart: now() - H })).toBe(true);
  const cand = { chain: FASTER, end: firstEnd() - fasterBy, endTE: 490, at: CLOCK + 1000, source: 'instant' as const, planStart: now() };
  return renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'fastest', deadline: null, candidate: cand, zone: ZONE, line: true }, {}, [pinia]);
}

describe('the followed first pick, the box on the faster route', () => {
  it('the box offers the faster route against the followed one: "The answer above is faster", with Keep mine', async () => {
    const html = await offer(2 * H);
    expect(html).toContain('data-testid="better-route"');
    const words = fasterAboveLine({ better: dateAt(firstEnd() - 2 * H, now(), ZONE), yours: dateAt(firstEnd(), now(), ZONE) });
    expect(textOf(html)).toBe(`${words} Keep mine`);
  });
  it('a gain under a minute is no offer (the followed route stays quiet)', async () => {
    expect(await offer(30)).not.toContain('data-testid="better-route"');
  });
});

describe('InstantRoute hands the box\'s own route to the offer', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'auto/InstantRoute.vue'), 'utf8');
  it('both goals: the candidate is the route on screen (boxLead / dateBoxOf), which is the faster route once the box switched', () => {
    expect(src).toContain(':candidate="boxCandidate({ chain: boxLead.chain, end: boxLead.end, endTE: boxLead.chain[boxLead.chain.length - 1] })"');
    expect(src).toContain(':candidate="boxCandidate(dateBoxOf(result.byDate))"');
    expect(src).toMatch(/const boxLead = computed<Route \| null>\(\(\) =>\s*swapped\.value && altRoute\.value \? altRoute\.value : pickLead\.value/);
  });
  it('auto-follow takes the box at the time the answer is finished (the first pick), never again by itself', () => {
    const at = src.indexOf('const follows = useFollowStore();');
    const body = src.slice(at, at + 2200);
    expect(body).toContain("backgroundStatus.value === 'running'");
    expect(body).toContain('!!follows.followed(goalKey)');
    expect(body).toMatch(/instantAutoFollowOf\(\{[\s\S]*followed: !!follows\.followed\(goalKey\)/);
  });
});

/** The exact check's numbers (R10 option C, orchestrator 21 Nov 2026): both finishes exact when the check covered the followed route. */
async function offerExact(o: { followedEst: number; candEst: number; followedExact: number | null; candExact: number }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  expect(await useFollowStore().follow(GOAL, FIRST, 'answer', undefined, { finish: o.followedEst, endTE: 490, planStart: now() - H })).toBe(true);
  const cand = { chain: FASTER, end: o.candExact, endTE: 490, at: CLOCK + 1000, source: 'instant' as const, planStart: now() };
  const props: Record<string, unknown> = { goalKey: GOAL, goal: 'fastest', deadline: null, candidate: cand, zone: ZONE, line: true };
  if (o.followedExact !== null) props.followedFinish = { end: o.followedExact, endTE: 490 };
  return renderHtml(BetterRoutePrompt, props, {}, [pinia]);
}

describe('with an exact result, both finishes are exact (the followed route\'s too, when the check covered it)', () => {
  it('the estimates are a tie but the exact finishes differ by 2 h: offered, in the exact times', async () => {
    const e = firstEnd();
    const html = await offerExact({ followedEst: e, candEst: e - 10, followedExact: e + 3 * H, candExact: e + H });
    const words = fasterAboveLine({ better: dateAt(e + H, now(), ZONE), yours: dateAt(e + 3 * H, now(), ZONE) });
    expect(textOf(html)).toBe(`${words} Keep mine`);
  });
  it('the estimates say faster but the exact finishes say it is not: no offer', async () => {
    const e = firstEnd();
    const html = await offerExact({ followedEst: e, candEst: e - 2 * H, followedExact: e + 3 * H, candExact: e + 3 * H - 30 });
    expect(html).not.toContain('data-testid="better-route"');
  });
});

describe('InstantRoute gives the offer the exact finishes, and the estimates only without an exact result', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'auto/InstantRoute.vue'), 'utf8');
  const tpl = src.slice(0, src.indexOf('</template>\n\n<script'));
  it('both goals pass the followed route\'s exact finish and the candidate with the box route\'s exact end', () => {
    expect(tpl.match(/:followed-finish="followedExactFinish"/g) ?? []).toHaveLength(2);
    expect(tpl).toContain(':candidate="boxCandidate({ chain: boxLead.chain, end: boxLead.end, endTE: boxLead.chain[boxLead.chain.length - 1] })"');
    expect(tpl).toContain(':candidate="boxCandidate(dateBoxOf(result.byDate))"');
  });
  it('exact only when the check covered the followed route and the box route: else both stay the quick estimates (never one of each)', () => {
    const at = src.indexOf('const followedExactFinish');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 1600);
    expect(body).toContain('exactRouteFor(');
    expect(body).toContain('exactBox.value');
    expect(body).toMatch(/function boxCandidate\(/);
    expect(body).toMatch(/instantCandidate\(e && f \? \{ \.\.\.r, end: e\.end \} : r\)/);
  });
});
