/**
 * RIGHT NOW: THE INSTANT ANSWER'S EXPLAINER BEHIND AN "i" (spec-myruns-fix, 12 Nov 2026, Jordan's review): the line
 * after the "from the instant answer" pill ("worked out ahead of time, times rounded to the hour. For exact times, use
 * a run from Try next below.", and its two followed-route forms) is no longer a paragraph on the card. It is the tip of
 * an "i" beside the pill (Tip.vue: hover, keyboard focus on the "i", a tap on it or a long press on the pill; a 44 px
 * target; the pill and the "i" point at it with aria-describedby), in Words' own sentences (lib/nowSourceWords.ts
 * `*_INFO_WORDS`, each starting with a capital). A search's result keeps its "done …, your save of …" line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString, type SSRContext } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import { drivingPlan } from '@/lib/searchPlan';
import type { CardPlan } from '@/composables/useNowPage';
import { eggDaySeconds } from '@/lib/eggDay';
import { SOURCE_ESTIMATE_INFO_WORDS, SOURCE_ESTIMATE_SIM_INFO_WORDS, SOURCE_INSTANT_INFO_WORDS } from '@/lib/nowSourceWords';
import { tipInfoLabel } from '@/lib/tipWords';

const ZONE = 'America/Los_Angeles';
const H = 3600;
const D = 86400;
const NOW = Date.UTC(2026, 9, 22, 18, 3) / 1000;
const DEADLINE = eggDaySeconds(2027);
const OLD_TAIL = 'times rounded to the hour. For exact times, use a run from Try next below.';

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

const snap = {
  at: NOW * 1000,
  answerStart: NOW,
  result: {
    best: null,
    byAscensions: [],
    byDate: {
      chain: [197, 228, 313],
      legs: [
        { to: 197, endTE: 197, start: NOW, end: NOW + 5 * D + 17 * H },
        { to: 228, endTE: 228, start: NOW + 6 * D, end: NOW + 60 * D },
        { to: 313, endTE: 313, start: NOW + 60 * D, end: DEADLINE - 1.46 * D },
      ],
      end: DEADLINE - 1.46 * D,
    },
    byDateByAscensions: [],
  },
};

function propsFor(plan: NowPlan, driving: ReturnType<typeof drivingPlan> | undefined): Record<string, unknown> {
  const card: CardPlan = { plan, goal: { goal: 'date', target: 490, deadline: DEADLINE }, state: 'this-save', key: 'eggday-2027', name: 'Egg Day 2027', ...(driving ? { driving } : {}) };
  const events = planEvents(plan, NOW);
  return { card, onVirtue: true, currentEgg: 'integrity', teSoFar: 186, ascNow: 1, track: null, events, shownEvents: tableEvents(events), gear: null, now: NOW, zone: ZONE, saveSeconds: NOW, eggDayYear: 2027 };
}

async function render(props: Record<string, unknown>) {
  const ctx: SSRContext = {};
  const app = createSSRApp({ render: () => h(RightNowCard, props as never) });
  const html = await renderToString(app, ctx);
  return { html, text: textOf(html), tip: textOf(String(ctx.teleports?.body ?? '')) };
}

const instant = () => drivingPlan(snap as never, 'date', DEADLINE);
const estimated = (simulated: boolean): NowPlan => {
  const p = instant().plan as NowPlan;
  return { ...p, estimated: true, tableLegs: (p.tableLegs ?? []).map((l, i) => (i === 0 && simulated ? { ...l, simulated: true } : l)) as never };
};

describe('Right now: the instant answer explained behind an "i" beside its pill', () => {
  it('the instant answer: no paragraph on the card; the "i" beside the pill holds Words\' sentence', async () => {
    const d = instant();
    const r = await render(propsFor(d.plan as NowPlan, d));
    expect(r.html).toContain('data-testid="now-source-pill"');
    expect(r.text).toContain('from the instant answer');
    expect(r.text).not.toContain(OLD_TAIL);
    expect(r.text).not.toContain('worked out ahead of time');
    expect(r.html).not.toContain('data-testid="now-source-sub"');
    expect(r.tip).toBe(SOURCE_INSTANT_INFO_WORDS);
    expect(r.tip).toMatch(/^[A-Z]/);
  });

  it('a followed route estimated on its data, and with the ascension you are in simulated: their own sentences', async () => {
    for (const [sim, words] of [
      [false, SOURCE_ESTIMATE_INFO_WORDS],
      [true, SOURCE_ESTIMATE_SIM_INFO_WORDS],
    ] as const) {
      const r = await render(propsFor(estimated(sim), undefined));
      expect(r.text).not.toContain(OLD_TAIL);
      expect(r.text).not.toContain('simulated on your save');
      expect(r.tip).toBe(words);
    }
  });

  it('the "i": a real button named after the pill, 44 px, on every screen; it and the pill point at the tip', async () => {
    const d = instant();
    const r = await render(propsFor(d.plan as NowPlan, d));
    const btn = r.html.match(/<button[^>]*data-testid="tip-info"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain('type="button"');
    expect(btn).toContain(`aria-label="${tipInfoLabel('from the instant answer')}"`);
    expect(btn).toContain('min-h-[44px]');
    expect(btn).toContain('min-w-[44px]');
    expect(btn).toContain('tip-info-always');
    const id = btn.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(btn).toContain(`aria-describedby="${id}"`);
    expect(r.html).toMatch(new RegExp(`aria-describedby="${id}"[^>]*data-testid="now-source-pill"`));
  });
});
