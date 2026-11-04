/**
 * L1 (spec-r7qa, QA 3 Nov 2026, LOW): "after pressing Re-plan directly the 'Keep mine' button stays with no offer text".
 * QA's sequence (harness-r7 snippets c44 to c46): My runs with the newer main save loaded over a plan of the older one;
 * the page shows the Build-up tracker's Re-plan strip ("Your save has bought things this plan buys later …" and its own
 * "Re-plan from this save") and, above it, Right now's offer (BetterRoutePrompt.vue). The harness clicks the first
 * button reading exactly "Re-plan from this save" and then lists the visible buttons reading exactly "Keep mine" or "Re-plan
 * from this save", with the "offer" read as the tracker's line.
 *
 * WHAT IT WAS (measured here, a841f801): when Right now's offer is the better-route kind, its press reads "Follow it",
 * which that list never matches. The first "Re-plan from this save" is then the tracker's; its re-plan re-anchors the
 * tracker's own plan and never touches the follow (BetterRoutePrompt.noOrphan.spec.ts), so Right now's offer stays WHOLE
 * (its words, Follow it, Keep mine) while the tracker's strip and line go: the harness sees ["Keep mine"] and no "offer".
 * No orphan "Keep mine" renders in any state below; this spec holds that and reads the page the harness's way too.
 *
 * Right now's offer and the tracker rendered together on the server (as MyRunsView.vue stacks them), the follow store
 * with a fake collector and fetch, fixed clock, placeholder id only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { createPinia, defineStore, setActivePinia, type Pinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { textOf } from '@/test/renderComponent';
import BetterRoutePrompt from '@/components/BetterRoutePrompt.vue';
import BuildUpTracker from '@/components/myruns/BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const ID = 'EI0000000000000000';
const SUBMIT = 'https://collector.example/submit';
const D = 86400;
const CLOCK = Date.UTC(2026, 9, 30, 14, 52);
const GOAL = 'fastest-490';
const STALE = { kind: 'egg' as const, saveEgg: 'kindness', planEgg: 'curiosity' };
const now = () => Math.floor(Date.now() / 1000);
const ANSWER = [160, 195, 216, 490];
const FOLLOWED = [209, 287, 490];
const TNOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: TNOW });
const STRIP = { shown: true, working: false, error: '', behind: 0, offPlan: ['Comfortable Nests 51', 'silo #5'], keepsTicks: false };

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

async function followed(): Promise<Pinia> {
  const pinia = createPinia();
  setActivePinia(pinia);
  defineStore('chainSearch', () => ({ submitUrl: SUBMIT, availability: null }))();
  useInitialStateStore().rawBackup = { eiUserId: ID } as never;
  expect(
    await useFollowStore().follow(GOAL, FOLLOWED, 'saved', undefined, { source: 'fast', finish: now() + 40 * D, endTE: 490, planStart: now() - D })
  ).toBe(true);
  return pinia;
}

/** Right now's offer above the tracker, as on My runs. `offer`: the candidate's kind, or none. */
async function page(pinia: Pinia, offer: 'better' | 'stale' | 'none', strip: typeof STRIP | null): Promise<string> {
  const candidate = offer === 'none' ? null : { chain: ANSWER, end: now() + 37 * D, endTE: 490, at: CLOCK + 1000, source: 'fast' as const, planStart: now() };
  const ticks = new Set<string>();
  const app = createSSRApp({
    render: () =>
      h('div', [
        h(BetterRoutePrompt, { goalKey: GOAL, goal: 'fastest', deadline: null, candidate, stale: offer === 'stale' ? STALE : null, zone: ZONE }),
        h(BuildUpTracker, {
          state: 'ready',
          open: true,
          result,
          ticks,
          summary: trackerSummary(result, ticks),
          now: TNOW,
          zone: ZONE,
          saveSeconds: mt(10, 30, 12, 5),
          planSave: mt(10, 30, 8, 41),
          replan: strip,
        }),
      ]),
  });
  app.use(pinia);
  return renderToString(app);
}

const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(m => textOf(m[1]));
/** The offer block: whole (its words, its press and Keep mine) or nothing; throws on a part of it. */
function offerState(html: string): 'whole' | 'nothing' {
  const block = /<div[^>]*data-testid="better-route"[\s\S]*?data-testid="better-route-keep"[\s\S]*?<\/button>/.exec(html)?.[0] ?? '';
  const keep = (html.match(/data-testid="better-route-keep"/g) ?? []).length;
  if (!block && keep === 0 && !html.includes('data-testid="better-route"')) return 'nothing';
  const words = textOf(/<p data-testid="better-route-words">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? '');
  const press = textOf(/data-testid="better-route-follow"[^>]*>([\s\S]*?)<\/button>/.exec(block)?.[1] ?? '');
  if (keep === 1 && words.length > 20 && /^(Follow it|Re-plan from this save)$/.test(press)) return 'whole';
  throw new Error(`part of the offer left: ${textOf(html).slice(0, 300)}`);
}
/** What QA's harness reads (c45/c46 `head`): the buttons reading exactly these, and the tracker's line as the offer. */
const harness = (html: string) => ({
  btns: buttons(html).filter(b => /^(keep mine|re-plan from this save)$/i.test(b)),
  offer: /Your save has bought things/.test(textOf(html)),
});

describe("L1: after the tracker's re-plan, no Keep mine without its offer", () => {
  it('the better-route offer: whole before and after; the harness reads ["Keep mine"] with no "offer" (QA\'s L1)', async () => {
    const pinia = await followed();
    const before = await page(pinia, 'better', STRIP);
    expect(offerState(before)).toBe('whole');
    expect(harness(before)).toEqual({ btns: ['Keep mine', 'Re-plan from this save'], offer: true });
    // The tracker's re-plan is in: its strip goes, the follow is as it was (it never presses Follow).
    expect(useFollowStore().followed(GOAL)!.chain).toEqual(FOLLOWED);
    const after = await page(pinia, 'better', null);
    expect(offerState(after)).toBe('whole');
    expect(buttons(after)).toEqual(expect.arrayContaining(['Follow it', 'Keep mine']));
    expect(harness(after)).toEqual({ btns: ['Keep mine'], offer: false });
  });

  it('the stale offer ("Re-plan from this save" on Right now): whole before and after the tracker\'s re-plan', async () => {
    const pinia = await followed();
    expect(offerState(await page(pinia, 'stale', STRIP))).toBe('whole');
    const after = await page(pinia, 'stale', null);
    expect(offerState(after)).toBe('whole');
    expect(buttons(after).filter(b => b === 'Re-plan from this save')).toHaveLength(1);
  });

  it('no offer at all: no Keep mine before or after', async () => {
    const pinia = await followed();
    for (const strip of [STRIP, null]) {
      const html = await page(pinia, 'none', strip);
      expect(offerState(html)).toBe('nothing');
      expect(buttons(html)).not.toContain('Keep mine');
    }
  });

  it('the offer gone (the follow is the answer, after any Follow press): nothing of it, strip or not', async () => {
    const pinia = await followed();
    vi.setSystemTime(CLOCK + 5000);
    expect(await useFollowStore().follow(GOAL, ANSWER, 'saved')).toBe(true);
    for (const kind of ['better', 'stale'] as const)
      for (const strip of [STRIP, null]) {
        const html = await page(pinia, kind, strip);
        expect(offerState(html)).toBe('nothing');
        expect(buttons(html)).not.toContain('Keep mine');
      }
  });
});
