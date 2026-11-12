/**
 * The Build-up tracker's Compact view (spec-trackercompact, 8 Nov 2026; design ~/code/aaap-tools/notes/
 * tracker-compact-design.md, Jordan: "all suggested"): one block per day, what it buys at a glance. The bold kinds
 * (shift, trains, habs, silos, the set swap, the prestige, the silo trick) as chips in the lines' own words without
 * "buy"; sale on and off as quiet chips; the research merged into one range per research (lib/buildUpDays.ts); warnings
 * and notes in full; no boxes (ticking is List's). The day's header is a button that jumps to List with that day open.
 * Rendered on the server; a press is played on the setup state (as PanelFold.spec does). Placeholder plan, fixed clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary, type TrackerResult } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map([['aap.fold.buildUpCompact', '1']]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function render(ticks: Set<string> = new Set(), poke?: (s: Record<string, unknown>) => void, r: TrackerResult = result): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(BuildUpTracker as Component, {
        state: 'ready',
        open: true,
        result: r,
        ticks,
        summary: trackerSummary(r, ticks),
        now: NOW,
        zone: ZONE,
        saveSeconds: mt(10, 30, 12, 5),
        planSave: mt(10, 30, 8, 41),
      }),
  });
  if (poke)
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/BuildUpTracker.vue')) poke(this.$.setupState);
      },
    });
  return renderToString(app);
}
/** One Compact day's block. */
const block = (html: string, ymd: string) => html.match(new RegExp(`<section[^>]*data-testid="buildup-cday-${ymd}"[\\s\\S]*?</section>`))?.[0] ?? '';
const chips = (b: string) => [...b.matchAll(/<li[^>]*data-testid="buildup-chip"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]));
const ranges = (b: string) => [...b.matchAll(/<li[^>]*data-testid="buildup-range"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]));

describe('Compact: a day at a glance', () => {
  it('one block per day, no boxes', async () => {
    const html = await render();
    for (const d of result.days) expect(block(html, d.ymd), d.ymd).not.toBe('');
    expect(html).not.toMatch(/type="checkbox"/);
    expect(html).not.toContain('data-testid="buildup-day-');
  });
  it('the header: a 44 px button in the heading, the day, its check-ins, first to last time (12-hour), the next one', async () => {
    const b = block(await render(), '2026-10-30');
    expect(b).toMatch(/<h3[^>]*><button type="button"[^>]*class="[^"]*min-h-\[44px\][^"]*"[^>]*data-testid="buildup-cday-open-2026-10-30"/);
    const head = textOf(b.match(/<h3[\s\S]*?<\/h3>/)![0]);
    expect(head).toMatch(/^Fri Oct 30 \d+ check-ins · 8:41 am to 10:52 pm next 8:41 am › show this day in the list$/);
  });
  it('the header of a one-check-in day that holds the next: its time once ("1 check-in · 7:46 am next 7:46 am"; spec-tidy)', async () => {
    const before = new Set(result.days.filter(d => d.ymd < '2026-11-01').flatMap(d => d.lines.filter(l => l.tickable).map(l => l.key)));
    const b = block(await render(before), '2026-11-01');
    const head = textOf(b.match(/<h3[\s\S]*?<\/h3>/)![0]);
    expect(head).toMatch(/^Sun Nov 1 1 check-in next \d+:\d\d [ap]m › show this day in the list$/);
  });
  it('bold kinds as chips in the lines\' words without "buy"; sale on and off as quiet chips', async () => {
    const html = await render();
    const fri = chips(block(html, '2026-10-30'));
    expect(fri).toEqual(
      expect.arrayContaining([
        'prestige: start the ascension on Curiosity (earnings set on)',
        'shift to Kindness',
        '14 Hyperloop Trains (slots 1-14), cars to 5',
        'Planet Portal in hab slot 1',
        'train cars: all 17 trains to 8',
        'silos #2-5',
        'sale starts 10:00 am',
      ])
    );
    expect(fri.some(c => c.startsWith('buy '))).toBe(false);
    expect(chips(block(html, '2026-10-31'))).toContain('sale ends 10:00 am');
    expect(chips(block(html, '2026-11-01'))).toEqual(['last Sunday check-in: collect, then go offline until Mon 10:01 am (26 h 15 min)']);
  });
  it('research: one range per research over the whole day, in a grid (1 column on a phone, 3 wider)', async () => {
    const b = block(await render(), '2026-10-30');
    const r = ranges(b);
    expect(r).toContain('Crystalline Shelling (58 → 84)');
    expect(r).toContain('Atomic Purification (17 → 36)');
    expect(r).toContain('Internal Hatchery Expansion (tier 5) (0 → max)');
    expect(r.filter(x => x.startsWith('Timeline Diversion'))).toEqual(['Timeline Diversion (20 → 30)']);
    expect(b).toMatch(/<ul class="[^"]*grid grid-cols-1[^"]*sm:grid-cols-3/);
  });
  it('warnings and notes in full; the waits left out', async () => {
    const html = await render();
    expect(textOf(block(html, '2026-10-31'))).toContain('Tight: the sale ends at 10:00 am. Buy this first: after that it costs 3.3 times as much.');
    expect(textOf(block(html, '2026-10-30'))).toContain('set swap left out: sets are swapped only on Humility (the plan had it on Resilience)');
    expect(textOf(html)).not.toContain('wait for the sale');
  });
  it('done: a ticked chip and a range whose every line is ticked show ✓, dimmed, and say so to a screen reader', async () => {
    const fri = result.days[0];
    const cs = fri.lines.filter(l => l.parts?.some(p => p.startsWith('Crystalline Shelling'))).map(l => l.key);
    const kindness = fri.lines.find(l => l.text === 'shift to Kindness')!.key;
    const b = block(await render(new Set([...cs, kindness])), '2026-10-30');
    expect(ranges(b)).toContain('✓ Crystalline Shelling (58 → 84) (bought)');
    // Grav Plating shares the ticked 8:47 am line: done too. Comfortable Nests' line isn't ticked.
    expect(ranges(b)).toContain('✓ Grav Plating (17 → 18) (bought)');
    expect(ranges(b)).toContain('Comfortable Nests (0 → 50)');
    expect(chips(b)).toContain('✓ shift to Kindness (done)');
    expect(b).toMatch(/<li[^>]*class="[^"]*text-slate-500[^"]*"[^>]*data-testid="buildup-range"[^>]*>\s*<span aria-hidden="true"[^>]*>✓<\/span>/);
  });
  it('a day partly done says how far in its header (a day all done is one green line: BuildUpTracker.done.spec)', async () => {
    const second = result.days[1].lines.filter(l => l.tickable)[1].key;
    expect(textOf(block(await render(new Set([second])), '2026-10-31').match(/<h3[\s\S]*?<\/h3>/)![0])).toContain('1 of 3 lines done');
  });
});

describe('Compact: tapping a day', () => {
  it('jumps to List with that day open; the Compact choice stays remembered', async () => {
    const html = await render(new Set(), s => (s.jumpToDay as (ymd: string) => void)('2026-11-06'));
    expect(html).toMatch(/data-testid="buildup-view-list"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="buildup-view-list"/);
    const day = html.match(/<section[^>]*data-testid="buildup-day-2026-11-06"[\s\S]*?<\/section>/)?.[0] ?? '';
    // Fri Nov 6 starts collapsed (one research line and "+ 1 more"); opened by the jump: both.
    expect(textOf(day)).toContain('buy Enlightened Chickens (95 → 96)');
    expect(textOf(day)).not.toContain('+ 1 more');
    expect(mem.get('aap.fold.buildUpCompact')).toBe('1');
  });
  it('the List day heading takes the focus after the jump (it can: tabindex -1, an id)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
    expect(src).toMatch(/<h3[^>]*:id="`buildup-dayhead-\$\{d\.ymd\}`"[^>]*tabindex="-1"/);
    expect(src).toMatch(/@click="jumpToDay\(d\.ymd\)"/);
  });
});
