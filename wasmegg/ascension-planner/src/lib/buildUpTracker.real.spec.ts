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
import { syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import { saveFarmOf } from './farmFacts';
import { boughtFromSave, effectiveTicks, replanOffer, saveFarmFor, type SaveFarm } from './buildUpBought';
import { virtueEggType } from './virtueEggs';
import { createChainEvaluator } from '@/search/chain';
import { buildUpPlanFromSegments } from './followSim';
import { siloSeconds } from './saveAge';
import { buildPart, buildUpTracker, compactPlan, lineText, trackerSummary, type TrackerResult } from './buildUpTracker';
import { renderHtml, textOf } from '@/test/renderComponent';
import BuildUpTracker from '@/components/myruns/BuildUpTracker.vue';
import type { BuildUpAction, BuildUpPlan } from '@/search/buildUpActions';
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

// ------------------------------------------------------------------ Phase 2: ticks from a second synthetic save
/** The plan's farm once every action up to `upTo` (unix seconds) is done: research, habs, vehicles (the last tier per
 *  slot), train cars, silos, the egg. */
function farmAt(upTo: number, skip: (a: BuildUpAction) => boolean = () => false) {
  const s = plan.start!;
  const research: Record<string, number> = { ...s.researchLevels };
  const habs = [...s.habIds];
  const vehicles = s.vehicles.map(v => ({ ...v }));
  let silos = s.siloCount;
  let egg = s.egg;
  for (const a of buildPart(plan.actions)) {
    if (a.t > upTo || skip(a)) continue;
    if (a.kind === 'research' && a.id) research[a.id] = Math.max(research[a.id] ?? 0, a.level ?? 0);
    else if (a.kind === 'hab' && a.slot != null) habs[a.slot] = a.itemId ?? null;
    else if (a.kind === 'vehicle' && a.slot != null) vehicles[a.slot] = { vehicleId: a.itemId ?? null, trainLength: a.level ?? 1 };
    else if (a.kind === 'trainCar' && a.slot != null) vehicles[a.slot] = { vehicleId: vehicles[a.slot]?.vehicleId ?? 11, trainLength: a.level ?? 1 };
    else if (a.kind === 'silo') silos = Math.max(silos, a.count ?? silos);
    else if (a.kind === 'shift' && a.id) egg = a.id;
  }
  return { research, habs, vehicles, silos, egg };
}
/** A second synthetic save (placeholder data, no player): the synthetic backup with its virtue farm replaced by `f`. */
function secondSave(f: ReturnType<typeof farmAt>): SaveFarm {
  const b = syntheticBackup();
  for (let i = 0; i < f.vehicles.length; i++) if (!f.vehicles[i]) f.vehicles[i] = { vehicleId: null, trainLength: 1 };
  b.farms[0] = {
    ...b.farms[0],
    eggType: virtueEggType(f.egg),
    commonResearch: Object.entries(f.research).map(([id, level]) => ({ id, level })),
    habs: f.habs.map(h => (h == null ? 19 : h)),
    vehicles: f.vehicles.map(v => v.vehicleId),
    trainLength: f.vehicles.map(v => v.trainLength),
    silosOwned: f.silos,
  };
  return saveFarmFor(saveFarmOf(b), 'earnings')!;
}

describe('Phase 2 end to end: a second synthetic save ticks the right lines of the real plan', () => {
  let anchorFarm: SaveFarm;
  beforeAll(() => {
    anchorFarm = saveFarmFor(saveFarmOf(syntheticBackup()), 'earnings')!;
  });
  const bought = (f: SaveFarm | null) =>
    boughtFromSave({ lines: r.lines, save: f, start: plan.start, startEgg: plan.start?.egg, anchorFarm });

  it('the first synthetic save (the anchor, before the fresh start): nothing ticked, "before the prestige"', () => {
    const b = bought(anchorFarm);
    expect(plan.variantKey).not.toBe('buildup');
    expect(b.fit).toBe('beforePrestige');
    expect(b.ticks.size).toBe(0);
  });

  it('a second save at the 12th check-in: every line up to it ticks, none after (the last vehicle tier counts)', () => {
    const T = r.checkIns[11].at;
    const f = secondSave(farmAt(T));
    const b = bought(f);
    expect(b.fit).toBe('fits');
    for (const l of r.lines) {
      const lb = b.lines.get(l.key);
      if (!lb || lb.auto === null) continue;
      if (l.at <= T) expect(lb.auto, `${lineText(l)}`).toBe(true);
    }
    const later = r.lines.filter(l => l.at > T && l.items?.some(i => i.kind === 'research'));
    expect(later.length).toBeGreaterThan(0);
    for (const l of later) expect(b.ticks.has(l.key), lineText(l)).toBe(false);
    // The trains line(s) up to T are bought on the Hyperloop alone.
    const trains = r.lines.filter(l => l.kind === 'trains' && l.at <= T);
    for (const l of trains) expect(b.ticks.has(l.key), lineText(l)).toBe(true);
  });

  it('a later save only adds ticks; one research left out of a line makes it "N of M bought"', () => {
    const T1 = r.checkIns[11].at;
    const T2 = r.checkIns[Math.min(r.checkIns.length - 1, 40)].at;
    const b1 = bought(secondSave(farmAt(T1)));
    const b2 = bought(secondSave(farmAt(T2)));
    for (const k of b1.ticks) expect(b2.ticks.has(k)).toBe(true);
    expect(b2.ticks.size).toBeGreaterThan(b1.ticks.size);
    const multi = r.lines.find(l => l.at <= T2 && l.at > T1 && (l.items?.length ?? 0) >= 3 && l.items!.every(i => i.kind === 'research'))!;
    expect(multi).toBeTruthy();
    const leftOut = (multi.items![0] as { id: string }).id;
    const b3 = bought(secondSave(farmAt(T2, a => a.kind === 'research' && a.id === leftOut && a.t >= multi.at - 60)));
    const lb = b3.lines.get(multi.key)!;
    expect(lb.auto).toBe(false);
    expect(lb.items[0]).toBe(false);
    expect(lb.bought).toBe(lb.total - 1);
  });

  it('Re-plan: hidden on plan, shown over 1 h behind, shown for an off-plan buy', () => {
    const T = r.checkIns[11].at;
    const f = secondSave(farmAt(T));
    const base = { lines: r.lines, start: plan.start, startEgg: plan.start?.egg, anchorSeconds: inputs.planStart - 3600, anchorFarm };
    expect(replanOffer({ ...base, save: f, saveSeconds: T + 60 }).show).toBe(false);
    const next = r.checkIns[12].at;
    expect(replanOffer({ ...base, save: f, saveSeconds: next + 3600 + 120 }).show).toBe(true);
    const off = secondSave({ ...farmAt(T), research: { ...farmAt(T).research, never_in_this_plan: 2 } });
    const o = replanOffer({ ...base, save: off, saveSeconds: T + 60 });
    expect(o.show).toBe(true);
    expect(o.offPlan.map(x => x.what)).toContain('never_in_this_plan 2');
  });

  it('renders (and writes the screenshots\' pages): fresh, partly done, mostly done, Re-plan', async () => {
    const T1 = r.checkIns[11].at;
    const T2 = r.checkIns[Math.floor(r.checkIns.length * 0.8)].at;
    const multi = r.lines.find(l => l.at > T1 && (l.items?.length ?? 0) >= 3 && l.items!.every(i => i.kind === 'research'))!;
    const half = new Set((multi.items as { id: string }[]).slice(0, Math.ceil(multi.items!.length / 2)).map(i => i.id));
    const states: [string, SaveFarm, number, boolean][] = [
      ['fresh', anchorFarm, inputs.planStart - 3600, false],
      ['partly', secondSave(farmAt(multi.at, a => a.kind === 'research' && a.t >= multi.at - 60 && half.has(a.id ?? ''))), multi.at + 120, false],
      ['mostly', secondSave(farmAt(T2)), T2 + 120, false],
      ['replan', secondSave(farmAt(T1)), r.checkIns[12].at + 2 * 3600, true],
    ];
    for (const [name, f, saveSeconds, replan] of states) {
      const b = bought(f);
      const auto = new Map(r.lines.filter(l => l.tickable).map(l => [l.key, b.lines.get(l.key)?.auto ?? null] as const));
      const e = effectiveTicks(auto, new Set(), new Set());
      const o = replanOffer({ lines: r.lines, save: f, start: plan.start, startEgg: plan.start?.egg, saveSeconds, anchorSeconds: inputs.planStart - 3600, anchorFarm });
      expect(o.show, name).toBe(replan);
      const html = await renderHtml(BuildUpTracker, {
        state: 'ready',
        open: true,
        result: r,
        ticks: e.ticked,
        summary: trackerSummary(r, e.ticked),
        now: saveSeconds + 300,
        zone: ZONE,
        saveSeconds,
        planSave: inputs.planStart - 3600,
        bought: b.lines,
        tickSource: e.source,
        saveFit: b.fit,
        replan: o.show ? { shown: true, working: false, error: '', behind: o.behind, offPlan: o.offPlan.map(x => x.what), keepsTicks: false } : null,
      });
      const t = textOf(html);
      if (name === 'fresh') expect(t).toContain('This save is from before the plan’s prestige');
      if (name === 'partly') expect(t).toMatch(/\d+ of \d+ bought/);
      if (name === 'replan') expect(t).toContain('Re-plan from this save');
      if (process.env.BUILDUP_SHOT_DIR)
        fs.writeFileSync(
          `${process.env.BUILDUP_SHOT_DIR}/p2-${name}.html`,
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${process.env.BUILDUP_SHOT_CSS}"></head><body class="bg-slate-50"><div class="p-4 max-w-5xl mx-auto">${html}</div></body></html>`
        );
    }
  });
});
