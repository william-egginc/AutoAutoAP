/**
 * My runs' Build-up tracker (BuildUpTracker.vue): each fold state, the lines in the oracle format, ticks shown from
 * what is kept, days collapsed or open, and the template rules (type scale, explicit spaces). Rendered on the server
 * (test/renderComponent.ts), placeholder plan (lib/buildUpTracker.fixture.ts), fixed clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, dayView, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { boughtFromSave, effectiveTicks, farmOfStart, type SaveFarm } from '@/lib/buildUpBought';
import type { TrackerState } from '@/composables/useBuildUpTracker';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

function props(state: TrackerState, over: Record<string, unknown> = {}) {
  const ticks = new Set<string>();
  return {
    state,
    open: true,
    result: state === 'ready' ? result : null,
    ticks,
    summary: state === 'ready' ? trackerSummary(result, ticks) : null,
    now: NOW,
    zone: ZONE,
    saveSeconds: mt(10, 30, 12, 5),
    planSave: mt(10, 30, 8, 41),
    ...over,
  };
}
const render = async (state: TrackerState, over: Record<string, unknown> = {}) => renderHtml(BuildUpTracker, props(state, over));

describe('BuildUpTracker: the states', () => {
  it('not on virtue: nothing', async () => {
    expect(textOf(await render('hidden'))).toBe('');
  });
  it.each([
    ['noSave', 'load your save to see it', 'Load your save to see your build-up here.'],
    ['noRoute', 'follow a route first', 'Follow a route on Right now and its build-up shows here.'],
    ['notBuilding', 'nothing to buy until your next prestige', 'Nothing to buy until your next prestige'],
    ['working', 'working it out…', 'Working out your build-up'],
    ['failed', 'could not be worked out', "The build-up list could not be worked out (worker ran out of memory). Right now's shifts still hold."],
  ] as const)('%s: its hint and its line', async (state, hint, body) => {
    const html = await render(state, { failReason: 'worker ran out of memory', open: false });
    expect(html).toContain('data-testid="buildup-tracker"');
    expect(textOf(html)).toContain(`Build-up tracker ${hint}`);
    expect(textOf(html)).toContain(body);
  });
  it('closed by default when the page says so, open when it says so', async () => {
    expect(await render('notBuilding', { open: false })).not.toMatch(/<details[^>]*\sopen/);
    expect(await render('ready')).toMatch(/<details[^>]*\sopen/);
  });
});

describe('BuildUpTracker: the list', () => {
  it('summary, now and save lines, day headers, oracle lines, the footer', async () => {
    const t = textOf(await render('ready'));
    expect(t).toContain('Build-up tracker 0 of ');
    expect(t).toMatch(/check-ins done · next 8:41 am \(3 h 29 min ago\)/);
    expect(t).toMatch(/Now Fri Oct 30 12:10 pm · your save Fri Oct 30 12:05 pm \(5 min old\) ?\./);
    expect(t).toContain('Plan from your save of Fri Oct 30 8:41 am · check-ins at least 1 min apart');
    expect(t).toContain('Fri Oct 30 18 check-ins Show less');
    expect(t).toContain('Fri Nov 13 1 check-in 10:00 am');
    expect(t).toContain('9:02 am · buy 14 Hyperloop Trains (slots 1-14), cars to 5 · offline 1 min');
    expect(t).toContain('wait for the sale: offline until Fri Oct 30 10:00 am (25 min)');
    expect(t).toContain('clocks go back 1 h at 2:00 am');
    expect(t).toContain('Times are in your zone (America/Denver), rounded down to the minute.');
  });
  it('bold lines are bold, research is not', async () => {
    const html = await render('ready');
    expect(html).toMatch(/<span class="font-bold">shift to Kindness<\/span>/);
    expect(html).toMatch(/<span class="">buy Graviton Coupling 3<\/span>/);
  });
  it('a checkbox per check-in line with its label; kept ticks show checked', async () => {
    const key = result.checkIns[1].keys[0];
    const html = await render('ready', { ticks: new Set([key]), summary: trackerSummary(result, new Set([key])) });
    const box = html.match(new RegExp(`<input[^>]*data-testid="buildup-tick-${key.replace(':', '\\:')}"[^>]*>`))?.[0] ?? '';
    expect(box).toContain('checked');
    expect(box).toContain('aria-label="Done: 8:42 am · buy Comfortable Nests 1-50');
    expect(html.match(/type="checkbox"/g)?.length).toBeGreaterThan(10);
    // Event and wait lines have no checkbox.
    expect(html).not.toMatch(/aria-label="Done: wait for the sale/);
    expect(html).not.toMatch(/aria-label="Done: 10:00 am · research sale starts/);
  });
  it('today and tomorrow open; a later day collapsed to its bold lines, with "+ N more · show all"', async () => {
    const t = textOf(await render('ready'));
    // Fri Nov 6 (collapsed): its research beyond the first is hidden.
    expect(t).toContain('10:00 am · buy Multiversal Layering 2');
    expect(t).not.toContain('buy Enlightened Chickens 96');
    expect(t).toContain('+ 1 more · show all');
    expect(t).toContain('Show all ');
    expect(t).toContain('Show less');
  });
  it('the silo strip when the trick does not fit', async () => {
    const short = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: 3600, startSilos: 1, startEgg: 'curiosity', now: NOW });
    const t = textOf(await render('ready', { result: short, summary: trackerSummary(short, new Set()), siloWarnings: 2 }));
    expect(t).toContain('The silo trick does not fit this plan 2 times: see the amber lines.');
    expect(t).toContain('Your silos hold 9 h: going offline Mon Nov 2 12:59 am does not reach Mon Nov 2 10:01 am.');
  });
});

describe('dayView (per-day show all)', () => {
  const fri = result.days[0];
  it('open: every line; collapsed: bold and event lines and the first line not ticked', () => {
    expect(dayView(fri, true, new Set()).lines).toHaveLength(fri.lines.length);
    const c = dayView(fri, false, new Set());
    expect(c.lines.filter(l => l.granular)).toHaveLength(1);
    expect(c.hidden).toBe(fri.lines.filter(l => l.granular).length - 1);
    const firstResearch = fri.lines.find(l => l.granular)!;
    const after = dayView(fri, false, new Set([firstResearch.key]));
    expect(after.lines.find(l => l.granular)).not.toBe(firstResearch);
  });
});

describe('the template rules', () => {
  const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
  const tpl = src.slice(0, src.lastIndexOf('</template>'));
  it('type scale tokens only, no caps or weight classes outside .label', () => {
    expect(tpl).not.toMatch(/text-\[\d|uppercase|font-medium|font-semibold|font-mono|text-xs|text-sm\b|text-base|text-lg/);
    expect(tpl).toContain('tabular-nums');
    expect(tpl).toContain('class="label');
  });
  it('44 px targets for the boxes and the show-all buttons', () => {
    expect(tpl).toMatch(/<label[\s\S]*?min-h-\[44px\] min-w-\[44px\]/);
    expect(tpl.match(/min-h-\[44px\] px-2/g)?.length).toBe(2);
  });
});

// ------------------------------------------------------------------ Phase 2: ticks from the save
describe('BuildUpTracker Phase 2: ticks from the save', () => {
  const START = plan.start!;
  const save = (levels: Record<string, number>, over: Partial<SaveFarm> = {}): SaveFarm => ({ ...farmOfStart(START), researchLevels: levels, ...over });
  /** Props as the composable makes them, for a save and the player's overrides. */
  function fromSave(f: SaveFarm, on: string[] = [], off: string[] = [], over: Record<string, unknown> = {}) {
    const b = boughtFromSave({ lines: result.lines, save: f, start: START, startEgg: 'curiosity' });
    const auto = new Map(result.lines.filter(l => l.tickable).map(l => [l.key, b.lines.get(l.key)?.auto ?? null] as const));
    const e = effectiveTicks(auto, new Set(on), new Set(off));
    return props('ready', { ticks: e.ticked, summary: trackerSummary(result, e.ticked), bought: b.lines, tickSource: e.source, saveFit: b.fit, ...over });
  }
  const first = result.lines.find(l => l.kind === 'research')!;
  const PART = { comfortable_nests: 50, excitable_chickens: 25, bigger_eggs: 1 };

  it('a partly bought line: "3 of 5 bought" in amber, the bought names struck through (and said for screen readers)', async () => {
    const html = await renderHtml(BuildUpTracker, fromSave(save(PART)));
    const t = textOf(html);
    expect(t.replace(/ ,/g, ',')).toContain(
      '8:42 am · buy Comfortable Nests 1-50 (bought), Excitable Chickens 1-25 (bought), Internal Hatchery Expansion (tier 5) 1-15, Bigger Eggs 1 (bought), Internal Hatchery Expansion (tier 7) 1-5 · offline 5 min · 3 of 5 bought'
    );
    expect(html).toMatch(/<span class="tabular-nums text-amber-800"[^>]*>3 of 5 bought<\/span>/);
    expect(html.match(/class="line-through decoration-slate-400"/g)?.length).toBe(3);
    expect(html).toMatch(/<span class="line-through decoration-slate-400">Comfortable Nests 1-50<span class="sr-only"> \(bought\)<\/span><\/span>/);
    // Not ticked: the checkbox is empty.
    const box = html.match(new RegExp(`<input[^>]*data-testid="buildup-tick-${first.key.replace(':', '\\:')}"[^>]*>`))![0];
    expect(box).not.toContain('checked');
  });

  it('a bought line: ticked, "bought", and the label says it came from the save', async () => {
    const html = await renderHtml(BuildUpTracker, fromSave(save({ ...PART, internal_hatchery3: 15, internal_hatchery4: 5 })));
    const box = html.match(new RegExp(`<input[^>]*data-testid="buildup-tick-${first.key.replace(':', '\\:')}"[^>]*>`))![0];
    expect(box).toContain('checked');
    expect(box).toMatch(/aria-label="Done: 8:42 am · buy Comfortable Nests 1-50, [^"]*, from your save"/);
    expect(html).toMatch(/<label[^>]*title="from your save"/);
    expect(html).toMatch(/<span class="text-green-700"[^>]*>bought<\/span>/);
    expect(textOf(html)).toContain('Build-up tracker 2 of ');
  });

  it('the player\'s override: "ticked by you" / "unticked by you", with "use save" (44 px) to go back', async () => {
    const f = save({ ...PART, internal_hatchery3: 15, internal_hatchery4: 5 });
    const second = result.lines.filter(l => l.kind === 'research')[1];
    const html = await renderHtml(BuildUpTracker, fromSave(f, [second.key], [first.key]));
    const boxOf = (k: string) => html.match(new RegExp(`<input[^>]*data-testid="buildup-tick-${k.replace(':', '\\:')}"[^>]*>`))![0];
    expect(boxOf(first.key)).not.toContain('checked');
    expect(boxOf(first.key)).toMatch(/, unticked by you"/);
    expect(boxOf(second.key)).toContain('checked');
    expect(boxOf(second.key)).toMatch(/, ticked by you"/);
    const clear = html.match(new RegExp(`<button[^>]*data-testid="buildup-clear-${first.key.replace(':', '\\:')}"[^>]*>`))![0];
    expect(clear).toContain('min-h-[44px] min-w-[44px]');
    expect(clear).toMatch(/aria-label="Use what your save says: 8:42 am · buy Comfortable Nests/);
    // The status words give way to the override.
    expect(html).not.toMatch(new RegExp(`data-testid="buildup-status-${first.key.replace(':', '\\:')}"`));
  });

  it('a save older than the plan, or from before its prestige: said, nothing ticked', async () => {
    const older = await renderHtml(BuildUpTracker, fromSave(save({}, { siloCount: 0 })));
    expect(textOf(older)).toContain('This save is older than the plan’s start, so nothing is ticked from it.');
    const pre = await renderHtml(BuildUpTracker, props('ready', { saveFit: 'beforePrestige' }));
    expect(textOf(pre)).toContain('This save is from before the plan’s prestige, so nothing is ticked from it yet.');
  });
});

describe('BuildUpTracker Phase 2: Re-plan from this save', () => {
  const R = { shown: true, working: false, error: '', behind: 2 * 3600 + 600, offPlan: ['Comfortable Nests 51', 'silo #5', 'hab slot 2', 'vehicle slot 1'], keepsTicks: true };
  it('shown: why (behind, off-plan), the 44 px button, and that matching ticks are kept', async () => {
    const html = await render('ready', { replan: R });
    const t = textOf(html);
    expect(t).toContain('You are 2 h 10 min behind this plan.');
    expect(t).toContain('Your save has bought things this plan has later or not at all: Comfortable Nests 51, silo #5, hab slot 2 and 1 more.');
    expect(t).toContain('Re-plan from this save This keeps your ticks that still match.');
    expect(html).toMatch(/<button[^>]*class="min-h-\[44px\][^"]*"[^>]*data-testid="buildup-replan-button"/);
  });
  it('working: the button says so and is off; the old plan stays', async () => {
    const html = await render('ready', { replan: { ...R, working: true } });
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="buildup-replan-button"[^>]*>\s*Re-planning…/);
    expect(textOf(html)).toContain('Working out a new plan from this save. The plan below stays until it is in.');
    expect(textOf(html)).toContain('9:02 am · buy 14 Hyperloop Trains');
  });
  it('failed: the reason, and the plan stays', async () => {
    const t = textOf(await render('ready', { replan: { ...R, error: 'the worker ran out of memory' } }));
    expect(t).toContain('The new plan could not be worked out (the worker ran out of memory). The plan below stays as it was.');
    expect(t).toContain('9:02 am · buy 14 Hyperloop Trains');
  });
  it('hidden without it', async () => {
    expect(await render('ready')).not.toContain('buildup-replan');
  });
});

describe('the template rules (Phase 2)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
  const tpl = src.slice(0, src.lastIndexOf('</template>'));
  it('no text-[Npx], caps, medium/semibold weights or mono; every button at least 44 px', () => {
    expect(tpl).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    const buttons = tpl.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.length).toBe(4);
    for (const b of buttons) expect(b).toMatch(/class="[^"]*min-h-\[44px\]/);
  });
  it('meaningful spaces are explicit', () => {
    expect(tpl).toContain(`buy{{ ' ' }}`);
    expect(tpl).toContain(`<span class="sr-only">{{ ' ' }}(bought)</span>`);
  });
});
