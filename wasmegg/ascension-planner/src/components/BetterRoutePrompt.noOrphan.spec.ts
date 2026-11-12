/**
 * R7 red-team QA (1 Nov 2026, LOW): after a Re-plan press "Keep mine" stayed on screen with no offer text. Nothing of
 * Right now's offer (BetterRoutePrompt.vue) may stay without the rest: the words, the press button and "Keep mine"
 * show together or not at all. From the press on (stores/follow.ts `pressing`, while the Follow press is under way)
 * the whole offer goes; a press that doesn't follow brings it back whole. A Build-up tracker re-plan never touches
 * the follow (composables/useBuildUpTracker.ts), so it leaves the offer whole; a follow that changes (the Re-plan
 * press, or any other Follow press) leaves nothing of it. Rendered on the server like the other component specs: a
 * press is the call the button makes. Fake collector and fetch; fixed clock; placeholder id only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { parse } from '@vue/compiler-sfc';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { followPrompt, readKeptMine } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { renderHtml, textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;
const ZONE = 'America/Chicago';
const CLOCK = Date.UTC(2026, 9, 30, 14, 52);
const GOAL = 'fastest-490';
const stale = { kind: 'egg' as const, saveEgg: 'kindness', planEgg: 'curiosity' };
const now = () => Math.floor(Date.now() / 1000);
const ANSWER = [160, 195, 216, 490];
const FOLLOWED = [209, 287, 490];

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

const candidate = () => ({ chain: ANSWER, end: now() + 37 * D, endTE: 490, at: CLOCK + 1000, source: 'fast' as const, planStart: now() });

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  const follows = useFollowStore();
  expect(await follows.follow(GOAL, FOLLOWED, 'saved', undefined, { source: 'fast', finish: now() + 40 * D, endTE: 490, planStart: now() - D })).toBe(true);
  const show = async (s: typeof stale | null) => {
    const html = await renderHtml(BetterRoutePrompt, { goalKey: GOAL, goal: 'fastest', deadline: null, candidate: candidate(), stale: s, zone: ZONE }, {}, [pinia]);
    return { html, text: textOf(html) };
  };
  const promptOf = (s: typeof stale | null) => {
    const f = follows.followed(GOAL)!;
    return followPrompt({
      goalKey: GOAL,
      goal: 'fastest',
      deadline: null,
      followed: { chain: f.chain, at: f.at, finish: { end: f.finish!, endTE: f.endTE ?? 490 }, priced: true, source: f.source },
      candidate: candidate(),
      keptMine: readKeptMine(),
      when: t => dateAt(t, now(), ZONE),
      stale: s,
    })!;
  };
  return { follows, show, promptOf };
}

/** The whole offer, or nothing of it. */
function wholeOrNothing(html: string, press: string): 'whole' | 'nothing' {
  const t = textOf(html);
  const parts = [html.includes('data-testid="better-route-words"'), t.includes(press), t.includes('Keep mine')];
  if (parts.every(Boolean)) return 'whole';
  if (!parts.some(Boolean) && !html.includes('data-testid="better-route"')) return 'nothing';
  throw new Error(`part of the offer left: ${t}`);
}

describe('BetterRoutePrompt: no "Keep mine" without its offer', () => {
  for (const [name, s, press] of [
    ['Re-plan from this save', stale, 'Re-plan from this save'],
    ['the better route', null, 'Follow it'],
  ] as const) {
    it(`${name}: the offer shows whole; from the press on nothing of it stays`, async () => {
      const { follows, show, promptOf } = await setup();
      expect(wholeOrNothing((await show(s)).html, press)).toBe('whole');
      // The press, under way (the account's partition is read, then the route is kept and saved online).
      const pressed = s ? follows.replanFromSave(GOAL, promptOf(s), null) : follows.followBetter(GOAL, promptOf(s), null);
      expect(wholeOrNothing((await show(s)).html, press)).toBe('nothing');
      expect(await pressed).toBe(true);
      expect(follows.followed(GOAL)!.chain).toEqual(ANSWER);
      // Done: the follow is the answer. Nothing of the offer, whether or not the save still reads stale.
      for (const x of [s, null]) {
        const html = (await show(x)).html;
        expect(html).not.toContain('better-route-keep');
        expect(textOf(html)).not.toContain('Keep mine');
        expect(html).not.toContain('data-testid="better-route"');
      }
    });
  }

  it('a press that does not follow brings the offer back whole', async () => {
    const { follows, show, promptOf } = await setup();
    const pressed = follows.replanFromSave(GOAL, { ...promptOf(stale), chain: [] }, null);
    expect(wholeOrNothing((await show(stale)).html, 'Re-plan from this save')).toBe('nothing');
    expect(await pressed).toBe(false);
    expect(wholeOrNothing((await show(stale)).html, 'Re-plan from this save')).toBe('whole');
  });

  it("the Build-up tracker's re-plan leaves the follow alone: the offer stays whole, and goes whole when the follow changes", async () => {
    const { follows, show } = await setup();
    // The tracker's re-plan (useBuildUpTracker `replan`) re-anchors its own kept plan and never presses Follow.
    const tracker = fs.readFileSync(path.join(__dirname, '../composables/useBuildUpTracker.ts'), 'utf8');
    expect(tracker).not.toMatch(/useFollowStore|followBetter|replanFromSave|\.follow\(/);
    expect(wholeOrNothing((await show(stale)).html, 'Re-plan from this save')).toBe('whole');
    // Any later Follow press of the answer (another screen, Restore): nothing of the offer is left.
    vi.setSystemTime(CLOCK + 5000);
    expect(await follows.follow(GOAL, ANSWER, 'saved')).toBe(true);
    expect(wholeOrNothing((await show(stale)).html, 'Re-plan from this save')).toBe('nothing');
  });

  it('in the file: "Keep mine" and the press sit inside the block that shows the words, nowhere else', () => {
    const src = fs.readFileSync(path.join(__dirname, 'BetterRoutePrompt.vue'), 'utf8');
    const tpl = parse(src).descriptor.template!.content;
    // Two blocks since the instant card's one line (`line`, 12 Nov 2026): the line (words, Keep mine; its press is the
    // card's main button) and the box (words, the press, Keep mine). Each shows its words with its buttons or nothing.
    const opens = [...tpl.matchAll(/<div\s+v-(?:else-)?if="([^"]+)"[^>]*data-testid="better-route"/g)];
    expect(opens).toHaveLength(2);
    const blocks = opens.map(o => {
      expect(o[1]).toContain('prompt');
      return tpl.slice(o.index!, tpl.indexOf('\n  </div>', o.index!));
    });
    expect(opens[0][1]).toContain('line');
    for (const b of blocks) for (const id of ['better-route-words', 'better-route-keep']) expect(b).toContain(`data-testid="${id}"`);
    expect(blocks[0]).not.toContain('data-testid="better-route-follow"');
    expect(blocks[1]).toContain('data-testid="better-route-follow"');
    for (const [id, n] of [['better-route-words', 2], ['better-route-keep', 2], ['better-route-follow', 1]] as const)
      expect(tpl.split(`data-testid="${id}"`).length - 1).toBe(n);
    const last = tpl.indexOf('\n  </div>', opens[1].index!);
    expect(tpl.slice(last)).not.toContain('Keep mine');
  });
});
