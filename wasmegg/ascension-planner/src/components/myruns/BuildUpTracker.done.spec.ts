/**
 * Done work folded into lines that say what was bought (spec-trackercompact, 8 Nov 2026; Jordan via the orchestrator:
 * "fold completed research INTO a summary line that says what was done, instead of hiding it"; design
 * ~/code/aaap-tools/notes/tracker-compact-design.md, "all suggested"):
 *   - a day whose every boxed line is ticked (the save's ticks count) is one green line, "✓ Fri Oct 30 · bought …", a
 *     button (aria-expanded) that opens its full list in place; in Compact it jumps to List with it open;
 *   - more than 3 such days in a row from the top: the older ones under one "Earlier: N days, all done" line;
 *   - an open day's leading run of done lines is one green line, "✓ Bought 8:41 am to 9:01 am: …", which opens them in
 *     place; a line ticked after a gap stays where it is, dimmed;
 *   - the 8-line cap counts only lines still to do: "Show all N still to do".
 * Rendered on the server; a press is played on the setup state (as PanelFold.spec does). Placeholder plan, fixed clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, lineText, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { effectiveTicks } from '@/lib/buildUpBought';
import { toDoCount } from '@/lib/buildUpDays';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });
const fri = result.days[0];
const boxed = fri.lines.filter(l => l.tickable);
const boxedOf = (i: number) => result.days[i].lines.filter(l => l.tickable).map(l => l.key);

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function render(ticks: Set<string>, poke?: (s: Record<string, unknown>) => void): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(BuildUpTracker as Component, {
        state: 'ready',
        open: true,
        result,
        ticks,
        summary: trackerSummary(result, ticks),
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
const button = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
const section = (html: string, ymd: string) => html.match(new RegExp(`<section[^>]*data-testid="buildup-day-${ymd}"[\\s\\S]*?</section>`))?.[0] ?? '';
const call = (name: string, ...a: unknown[]) => (s: Record<string, unknown>) => (s[name] as (...x: unknown[]) => void)(...a);

describe('a done day: one green line that says what was bought', () => {
  // Every boxed line of Fri Oct 30, all from the save (nothing ticked by hand).
  const auto = new Map(boxed.map(l => [l.key, true as boolean | null]));
  const allFri = effectiveTicks(auto, new Set(), new Set()).ticked;

  it('in List: the line, a 44 px button with aria-expanded, in place of the day; its boxes gone', async () => {
    const html = await render(allFri);
    const b = button(html, 'buildup-doneday-2026-10-30');
    expect(b).toMatch(/^<button type="button"/);
    expect(b).toMatch(/min-h-\[44px\]/);
    expect(b).toContain('aria-expanded="false"');
    const t = textOf(b);
    expect(t).toMatch(/^✓ Fri Oct 30 · bought Comfortable Nests \(0 → 50\), /);
    expect(t).toContain('Crystalline Shelling (58 → 84)');
    expect(t).toContain('Atomic Purification (17 → 36)');
    expect(t).toContain('; prestige: start the ascension on Curiosity (earnings set on), shift to Kindness, 14 Hyperloop Trains (slots 1-14), cars to 5');
    expect(t).toContain('silo #9');
    expect(t).toContain('all done');
    expect(section(html, '2026-10-30')).toBe('');
    for (const l of boxed) expect(html).not.toContain(`data-testid="buildup-tick-${l.key}"`);
  });
  it('a tap opens the full day in place, ticked, with its boxes; aria-expanded true', async () => {
    const html = await render(allFri, call('toggleDoneDay', '2026-10-30'));
    expect(button(html, 'buildup-doneday-2026-10-30')).toContain('aria-expanded="true"');
    const sec = section(html, '2026-10-30');
    expect(textOf(sec)).toContain('buy silo #9');
    expect(textOf(sec)).toContain('buy Atomic Purification (35 → 36)');
    expect(sec.match(/type="checkbox"/g)?.length).toBe(boxed.length);
    expect(textOf(sec)).not.toContain('still to do');
  });
  it('one box unticked: not done, the day as it was', async () => {
    const less = new Set(allFri);
    less.delete(boxed[boxed.length - 1].key);
    const html = await render(less);
    expect(button(html, 'buildup-doneday-2026-10-30')).toBe('');
    expect(section(html, '2026-10-30')).not.toBe('');
  });
});

describe('more than 3 done days: the older ones under one line', () => {
  // Fri Oct 30, Sat Oct 31, Sun Nov 1, Mon Nov 2, Fri Nov 6 done (Sat Nov 7 has nothing to tick).
  const five = new Set([0, 1, 2, 3, 4].flatMap(boxedOf));
  it('"Earlier: 2 days, all done", a 44 px button with aria-expanded; the last 3 one line each', async () => {
    const html = await render(five);
    const g = button(html, 'buildup-donegroup');
    expect(g).toMatch(/min-h-\[44px\]/);
    expect(g).toContain('aria-expanded="false"');
    expect(textOf(g)).toBe('✓ Earlier: 2 days, all done ›');
    expect(button(html, 'buildup-doneday-2026-10-30')).toBe('');
    expect(button(html, 'buildup-doneday-2026-10-31')).toBe('');
    for (const ymd of ['2026-11-01', '2026-11-02', '2026-11-06']) expect(button(html, `buildup-doneday-${ymd}`), ymd).not.toBe('');
  });
  it('a tap shows their lines', async () => {
    const html = await render(five, call('toggleDoneGroup'));
    expect(button(html, 'buildup-donegroup')).toContain('aria-expanded="true"');
    expect(textOf(button(html, 'buildup-doneday-2026-10-31'))).toContain('Sat Oct 31 · bought Timeline Diversion (40 → 42)');
    expect(button(html, 'buildup-doneday-2026-10-30')).not.toBe('');
  });
  it('3 or fewer: no group', async () => {
    expect(button(await render(new Set([0, 1, 2].flatMap(boxedOf))), 'buildup-donegroup')).toBe('');
  });
});

describe('today: the done run in one line, the rest as it was, the cap on lines still to do', () => {
  // The first five boxed lines (8:41 am to 9:01 am) ticked.
  const run = new Set(boxed.slice(0, 5).map(l => l.key));
  it('"✓ Bought 8:41 am to 9:01 am: …", a 44 px button with aria-expanded; then the next line', async () => {
    const html = await render(run);
    const b = button(html, 'buildup-run-2026-10-30');
    expect(b).toMatch(/min-h-\[44px\]/);
    expect(b).toContain('aria-expanded="false"');
    expect(textOf(b)).toBe(
      '✓ Bought 8:41 am to 9:01 am: Comfortable Nests (0 → 50), Excitable Chickens (0 → max), Internal Hatchery Expansion (tier 5) (0 → max), Bigger Eggs (0 → 1), Internal Hatchery Expansion (tier 7) (0 → 5), Grav Plating (17 → 18), Autonomous Vehicles (1 → 2), Crystalline Shelling (58 → 84), Telepathic Will (10 → 11); prestige: start the ascension on Curiosity (earnings set on), shift to Kindness ›'
    );
    const sec = section(html, '2026-10-30');
    for (const k of run) expect(sec).not.toContain(`data-testid="buildup-tick-${k}"`);
    expect(textOf(sec)).toContain(lineText(boxed[5]));
  });
  it('a tap opens the run in place: its lines, ticked', async () => {
    const html = await render(run, call('toggleRun', '2026-10-30'));
    expect(button(html, 'buildup-run-2026-10-30')).toContain('aria-expanded="true"');
    const sec = section(html, '2026-10-30');
    for (const k of run) expect(sec).toMatch(new RegExp(`<input[^>]*checked[^>]*data-testid="buildup-tick-${k.replace(':', '\\:')}"|<input[^>]*data-testid="buildup-tick-${k.replace(':', '\\:')}"[^>]*checked`));
  });
  it('a line ticked after a gap stays in place, dimmed, with its box', async () => {
    const gap = new Set([boxed[0].key, boxed[1].key, boxed[6].key]);
    const sec = section(await render(gap), '2026-10-30');
    expect(sec).toMatch(new RegExp(`<li class="[^"]*text-slate-500[^"]*"[^>]*>[\\s\\S]*?data-testid="buildup-tick-${boxed[6].key.replace(':', '\\:')}"`));
    expect(textOf(button(sec, 'buildup-run-2026-10-30'))).toMatch(/^✓ Bought 8:41 am to 8:42 am: /);
  });
  it('the cap counts lines still to do: 8 of them, then "Show all N still to do"', async () => {
    const html = await render(run);
    const t = textOf(section(html, '2026-10-30'));
    expect(t).toContain(lineText(boxed[12]));
    expect(t).not.toContain(lineText(boxed[13]));
    const cap = button(html, 'buildup-cap-2026-10-30');
    expect(cap).toMatch(/min-h-\[44px\]/);
    expect(textOf(cap)).toBe(`Show all ${toDoCount(fri, run)} still to do`);
  });
});

describe('Compact', () => {
  beforeEach(() => mem.set('aap.fold.buildUpCompact', '1'));
  it('a done day: the same green line; a tap jumps to List with the day open', async () => {
    const all = new Set(boxedOf(0));
    const html = await render(all);
    expect(textOf(button(html, 'buildup-doneday-2026-10-30'))).toMatch(/^✓ Fri Oct 30 · bought Comfortable Nests \(0 → 50\)/);
    expect(html).not.toContain('data-testid="buildup-cday-2026-10-30"');
    const jumped = await render(all, call('openDoneDay', '2026-10-30'));
    expect(jumped).toMatch(/aria-pressed="true"[^>]*data-testid="buildup-view-list"/);
    expect(button(jumped, 'buildup-doneday-2026-10-30')).toContain('aria-expanded="true"');
    expect(textOf(section(jumped, '2026-10-30'))).toContain('buy silo #9');
  });
  it("today mid-run: \"Bought so far: …\", then \"Still to buy\" and what is left", async () => {
    const run = new Set(boxed.slice(0, 5).map(l => l.key));
    const html = await render(run);
    const block = html.match(/<section[^>]*data-testid="buildup-cday-2026-10-30"[\s\S]*?<\/section>/)![0];
    expect(textOf(button(block, 'buildup-crun-2026-10-30'))).toMatch(/^✓ Bought so far: Comfortable Nests \(0 → 50\), .*Crystalline Shelling \(58 → 84\), Telepathic Will \(10 → 11\); prestige: start the ascension on Curiosity \(earnings set on\), shift to Kindness ›$/);
    const t = textOf(block);
    expect(t).toContain('Still to buy');
    // What is left: the ranges after the run, and its chips not repeated.
    expect(t).toContain('Atomic Purification (17 → 36)');
    expect(t).not.toMatch(/Comfortable Nests \(0 → 50\)(?![\s\S]*Bought so far)[\s\S]*Comfortable Nests/);
    expect([...block.matchAll(/data-testid="buildup-chip"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]))).not.toContain('✓ shift to Kindness (done)');
  });
});

describe('the green line\'s template (BuildUpDoneLine.vue)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'BuildUpDoneLine.vue'), 'utf8');
  const tpl = src.slice(0, src.lastIndexOf('</template>'));
  it('a real button, 44 px, aria-expanded; the ✓ and chevron hidden from screen readers', () => {
    expect(tpl).toMatch(/<button\s+type="button"\s+class="[^"]*min-h-\[44px\]/);
    expect(tpl).toContain(':aria-expanded="expanded"');
    expect(tpl.match(/aria-hidden="true"/g)).toHaveLength(2);
  });
  it('type scale tokens only, explicit spaces, tabular-nums', () => {
    expect(tpl).not.toMatch(/text-\[\d|uppercase|font-medium|font-semibold|font-mono|text-xs|text-sm\b|text-base|text-lg/);
    expect(tpl).toContain("{{ ' · ' }}");
    expect(tpl).toContain("{{ ' ' }}");
    expect(tpl).toContain('tabular-nums');
  });
});
