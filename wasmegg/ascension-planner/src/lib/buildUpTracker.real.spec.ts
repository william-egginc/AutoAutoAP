/**
 * The build-up tracker end to end on a REAL simulated build-up: the synthetic save (src/test/syntheticSave.ts, no
 * player data) followed to 192 TE, its first ascension simulated by the chain evaluator with the build-up list kept
 * (search/chain.ts `keepPurchases`, the path useCurrentSim takes with `wantBuildUp`), turned into the plan as
 * useCurrentSim does (lib/followSim.ts `buildUpPlanFromSegments`), then through lib/buildUpTracker.ts and the fold
 * (BuildUpTracker.vue, rendered on the server). Fixed clock (the synthetic save's), zone America/Denver, hours 7 am to
 * 1 am. One leg of simulation (a minute or two).
 *
 * With BUILDUP_SHOT_DIR set it also writes the rendered fold for the WebKit screenshots.
 */
import '../../scripts/node-shims';

import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from '@/search/chain';
import { buildUpPlanFromSegments } from './followSim';
import { siloSeconds } from './saveAge';
import { buildPart, buildUpTracker, compactPlan, lineText, trackerSummary, type TrackerResult } from './buildUpTracker';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from '@/components/myruns/BuildUpTracker.vue';
import type { BuildUpPlan } from '@/search/buildUpActions';
import type { SearchInputs } from '@/search/types';

const ZONE = 'America/Denver';
const HOURS = { days: [], fromHour: 7, toHour: 1, timezone: ZONE };

let inputs: SearchInputs;
let plan: BuildUpPlan;
let r: TrackerResult;
let now: number;

beforeAll(async () => {
  inputs = await syntheticInputs();
  const route = createChainEvaluator(inputs).evaluate([192], { keepPurchases: true })!;
  const level = (inputs.context?.epicResearchLevels as Record<string, number> | undefined)?.['silo_capacity'];
  const made = buildUpPlanFromSegments(route.legs, {
    accountKey: 'acct-synthetic',
    siloSeconds: siloSeconds(inputs.currentFarmState?.numSilos, level),
  })!;
  // As useCurrentSim does: the start farm's silos (1 on a fresh ascension), not the save's 4.
  plan = { ...made, siloSeconds: siloSeconds(made.start!.siloCount, level) };
  now = plan.startedAt + 600;
  r = buildUpTracker({
    actions: plan.actions,
    zone: ZONE,
    hours: HOURS,
    siloSeconds: plan.siloSeconds,
    startSilos: plan.start?.siloCount ?? null,
    startEgg: plan.start?.egg ?? null,
    now,
  });
  if (process.env.BUILDUP_DUMP) {
    fs.writeFileSync(
      process.env.BUILDUP_DUMP,
      [
        `variant ${plan.variantKey} start ${new Date(plan.startedAt * 1000).toISOString()} actions ${plan.actions.length} raw ${JSON.stringify(plan).length} compact ${JSON.stringify(compactPlan(plan)).length}`,
        `save silos ${inputs.currentFarmState?.numSilos} start ${JSON.stringify({ ...plan.start, researchLevels: undefined })} siloSeconds ${plan.siloSeconds}`,
        `kinds ${JSON.stringify(plan.actions.reduce((m: Record<string, number>, a) => ((m[a.kind + (a.kind === 'wait' || a.kind === 'artifactSet' ? ':' + (a.id ?? a.detail) : '')] = (m[a.kind + (a.kind === 'wait' || a.kind === 'artifactSet' ? ':' + (a.id ?? a.detail) : '')] ?? 0) + 1), m), {}))}`,
        ...plan.actions.filter(a => a.kind !== 'research').slice(0, 120).map(a => `${new Date(a.t * 1000).toISOString()} ${a.kind} ${a.label} ${a.id ?? ''} ${a.detail ?? ''} ${a.slot ?? ''} ${a.level ?? ''} ${a.count ?? ''} ${a.seconds ?? ''}`),
        '----',
        ...r.days.flatMap(d => [`## ${d.title} ${d.clockNote} (${d.checkIns})`, ...d.lines.map(l => (l.bold ? 'B ' : '  ') + lineText(l) + (l.sub ? ` [${l.sub}]` : ''))]),
      ].join('\n')
    );
  }
}, 1_800_000);

describe('the tracker on a real simulated build-up (synthetic save)', () => {
  it('has real lines: check-ins at least a minute apart, day headers, research merged', () => {
    expect(r.checkIns.length).toBeGreaterThan(20);
    for (let i = 1; i < r.checkIns.length; i++) expect(r.checkIns[i].at - r.checkIns[i - 1].at).toBeGreaterThanOrEqual(60);
    expect(r.days.length).toBeGreaterThan(1);
    for (const d of r.days) expect(d.title).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d+$/);
    expect(r.lines.some(l => l.kind === 'research' && /^buy [A-Z].* \d+(-\d+)?(, |$)/.test(l.text))).toBe(true);
  });

  it('the starting set is not a swap; the Humility set swap is one bold line; nothing dropped', () => {
    expect(r.droppedSwaps).toBe(0);
    expect(r.lines.filter(l => l.kind === 'note')).toHaveLength(0);
    const swaps = r.lines.filter(l => l.kind === 'setSwap');
    expect(swaps.length).toBe(1);
    expect(swaps[0].bold).toBe(true);
    expect(swaps[0].text).toBe('set swap: equip the ELR set');
    const i = r.lines.indexOf(swaps[0]);
    expect(r.lines.slice(0, i).reverse().find(l => l.kind === 'shift')?.text).toBe('shift to Humility');
  });

  it('a sale wait line fixed to the clock (10:00 am Mountain), and the sale start line', () => {
    const w = r.lines.filter(l => l.kind === 'saleWait');
    expect(w.length).toBeGreaterThan(0);
    for (const l of w) expect(l.text).toMatch(/^wait for the sale: offline until (Fri|Thu|Sat) [A-Z][a-z]{2} \d+ 10:00 am \(/);
    // 7 silos at 3 h each hold 21 h; the wait is 22 h 21 min: open the farm before they run out.
    expect(w[0].text).toBe('wait for the sale: offline until Fri Oct 2 10:00 am (22 h 21 min) (your silos hold 21 h: open the farm before they run out; nothing to buy)');
    expect(r.lines.some(l => l.kind === 'saleStart' && l.time === '10:00 am')).toBe(true);
  });

  it('a Sunday inside the build-up: the silo trick line or a warning that says why not', () => {
    const tricks = r.lines.filter(l => l.kind === 'siloTrick' || (l.kind === 'warning' && /silo/i.test(l.text)));
    const sundays = r.days.filter(d => d.title.startsWith('Sun') || d.title.startsWith('Mon'));
    if (sundays.length) expect(tricks.length).toBeGreaterThan(0);
  });

  it('every research item the build buys is on a line, to its last level', () => {
    const top = new Map<string, number>();
    for (const a of buildPart(plan.actions)) if (a.kind === 'research') top.set(a.label, Math.max(top.get(a.label) ?? 0, a.level ?? 0));
    const text = r.lines.map(l => l.text).join(' | ');
    for (const [name, lvl] of top) expect(text, name).toMatch(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(tier \\d\\))? (\\d+-)?${lvl}(,| \\||$)`));
  });

  it("silo time is the start farm's (1 silo on a fresh ascension), not the save's", () => {
    expect(plan.start?.siloCount).toBe(1);
    expect(plan.siloSeconds).toBe(siloSeconds(1, (inputs.context?.epicResearchLevels as Record<string, number> | undefined)?.['silo_capacity']));
  });

  it('vehicles climbed in one moment say only the last one per slot', () => {
    const at = r.lines.filter(l => l.kind === 'trains' && /Hyperloop/.test(l.text));
    expect(at.length).toBeGreaterThan(0);
    for (const l of at) expect(r.lines.filter(x => x.at === l.at && x.kind === 'trains' && /slot/.test(x.text)).every(x => !/Trike|Quantum/.test(x.text))).toBe(true);
  });

  it('the kept plan (compacted) fits the 400 kB cap', () => {
    const raw = JSON.stringify(plan).length;
    const kept = JSON.stringify(compactPlan(plan)).length;
    expect(kept).toBeLessThan(400_000);
    expect(kept).toBeLessThan(raw);
  });

  it('the fold renders the real list', async () => {
    const ticks = new Set<string>();
    const props = { state: 'ready', open: true, result: r, ticks, summary: trackerSummary(r, ticks), now, zone: ZONE, saveSeconds: inputs.planStart - 3600, planSave: inputs.planStart - 3600 };
    const html = await renderHtml(BuildUpTracker, props);
    const t = textOf(html);
    expect(t).toContain('Build-up tracker 0 of ');
    expect(t).toContain(r.days[0].title);
    expect(html).toContain('<span class="font-bold">shift to Kindness</span>');
    if (process.env.BUILDUP_SHOT_DIR) {
      fs.writeFileSync(
        `${process.env.BUILDUP_SHOT_DIR}/real.html`,
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${process.env.BUILDUP_SHOT_CSS}"></head><body class="bg-slate-50"><div class="p-4 max-w-5xl mx-auto">${html}</div></body></html>`
      );
    }
  });
});
