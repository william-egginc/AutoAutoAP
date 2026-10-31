/**
 * The tracker's Smart Buy line and its "(cheap sweep)" marks (spec-buylabel, 30 Oct 2026; notes
 * ~/code/aaap-tools/notes/spec-buylabel.md, ~/code/aaap-tools/notes/smartbuy-vs-c3-2026-10-30.md).
 *
 *  - The header line says how many sales the plan's Smart Buy looks ahead: the plan's own count (the simulator's
 *    `buildPhaseSaleCount`, carried as `BuildUpPlan.saleCount`), else the variant key's ('2-sale', '1-sale-tier13'),
 *    else 3 (an older kept 'buildup' plan that carries neither). None for 'continue' (nothing is bought).
 *  - A research buy that cost 10 s of the farm's income or less (`BuildUpAction.cheap`, set where the engine's actions
 *    become records) gets "(cheap sweep)" after its part; the line's `items` stay as they were.
 * Fixed clock, placeholder actions, no wall-clock waits.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, buyRuleWords, compactPlan, lineText, type TrackerResult } from './buildUpTracker';
import { buildUpPlanFromSegments } from './followSim';
import { fixturePlan, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction, BuildUpPlan } from '@/search/buildUpActions';
import type { LegSummary } from '@/search/types';

const NOW = mt(10, 30, 22, 0);

const r3 = (id: string, label: string, from: number, to: number, cheap: boolean, t = mt(10, 30, 23, 22)): BuildUpAction => ({
  t,
  kind: 'research',
  label,
  id,
  fromLevel: from,
  level: to,
  ...(cheap ? { cheap: true as const } : {}),
});

function run(actions: BuildUpAction[], over: Partial<Parameters<typeof buildUpTracker>[0]> = {}): TrackerResult {
  return buildUpTracker({ actions, zone: ZONE, hours: null, now: NOW, ...over });
}

describe('the Smart Buy line (DRAFT words)', () => {
  it('3 sales from the plan', () => {
    expect(run([], { saleCount: 3 }).buyRule).toBe(
      "Buys follow Smart Buy, set to 3 sales (the Manual Planner's 70% Return card with its stepper on 3)"
    );
  });
  it('1 sale, singular', () => {
    expect(buyRuleWords({ saleCount: 1 })).toBe(
      "Buys follow Smart Buy, set to 1 sale (the Manual Planner's 70% Return card with its stepper on 1)"
    );
  });
  it("the plan's own count wins over the variant key", () => {
    expect(buyRuleWords({ saleCount: 2, variantKey: '3-sale' })).toMatch(/set to 2 sales .* on 2\)$/);
  });
  it('from the variant key when the plan has no count', () => {
    expect(buyRuleWords({ variantKey: '2-sale' })).toMatch(/set to 2 sales .* on 2\)$/);
    expect(buyRuleWords({ variantKey: '1-sale-tier13' })).toMatch(/set to 1 sale .* on 1\)$/);
  });
  it('an older kept build-up plan with neither: the 3-sale words (the fallback)', () => {
    expect(buyRuleWords({ variantKey: 'buildup' })).toMatch(/set to 3 sales .* on 3\)$/);
  });
  it("'continue' buys nothing: no line", () => {
    expect(buyRuleWords({ variantKey: 'continue' })).toBe('');
    expect(run([], { variantKey: 'continue' }).buyRule).toBe('');
  });
  it('the plan carries the count from its first segment (buildPhaseSaleCount) and keeps it when compacted', () => {
    const seg = {
      key: '3-sale',
      endTime: mt(12, 22, 21, 9),
      durationSeconds: 1000,
      startTime: mt(10, 30, 23, 5),
      buildPhaseSaleCount: 3,
      buildUp: { actions: [r3('neural_linking', 'Neural Linking', 24, 25, true)] },
    } as unknown as LegSummary;
    const p = buildUpPlanFromSegments([seg], { accountKey: 'acct', siloSeconds: 0 })!;
    expect(p.saleCount).toBe(3);
    expect(compactPlan(p).saleCount).toBe(3);
    const noCount = buildUpPlanFromSegments([{ ...seg, buildPhaseSaleCount: undefined } as LegSummary], { accountKey: 'acct', siloSeconds: 0 })!;
    expect('saleCount' in noCount).toBe(false);
  });
});

describe('"(cheap sweep)" marks', () => {
  const merged = [
    r3('neural_linking', 'Neural Linking', 24, 25, true),
    r3('neural_linking', 'Neural Linking', 25, 26, true),
    r3('enlightened_chickens', 'Enlightened Chickens', 71, 72, true),
    r3('timeline_diversion', 'Timeline Diversion', 39, 40, false),
  ];

  it('a merged line marks only the cheap buys; items unchanged', () => {
    const l = run(merged).lines.find(x => x.kind === 'research')!;
    expect(lineText(l)).toBe('11:22 pm · buy Neural Linking 25-26 (cheap sweep), Enlightened Chickens 72 (cheap sweep), Timeline Diversion 40');
    expect(l.parts).toEqual(['Neural Linking 25-26 (cheap sweep)', 'Enlightened Chickens 72 (cheap sweep)', 'Timeline Diversion 40']);
    expect(l.items).toEqual([
      { kind: 'research', id: 'neural_linking', level: 26 },
      { kind: 'research', id: 'enlightened_chickens', level: 72 },
      { kind: 'research', id: 'timeline_diversion', level: 40 },
    ]);
  });

  it('items are the same with or without the marks', () => {
    const plain = run(merged.map(({ cheap: _c, ...a }) => a)).lines.find(x => x.kind === 'research')!;
    const marked = run(merged).lines.find(x => x.kind === 'research')!;
    expect(plain.text).toBe('buy Neural Linking 25-26, Enlightened Chickens 72, Timeline Diversion 40');
    expect(marked.items).toEqual(plain.items);
    expect(marked.key).toBe(plain.key);
  });

  it('no mark on a line without cheap buys', () => {
    const l = run([r3('timeline_diversion', 'Timeline Diversion', 39, 40, false)]).lines.find(x => x.kind === 'research')!;
    expect(l.text).toBe('buy Timeline Diversion 40');
  });

  it('a research whose levels in the line are part cheap, part not: no mark (not all of it was the sweep)', () => {
    const l = run([r3('neural_linking', 'Neural Linking', 24, 25, true), r3('neural_linking', 'Neural Linking', 25, 26, false)]).lines.find(
      x => x.kind === 'research'
    )!;
    expect(l.text).toBe('buy Neural Linking 25-26');
  });

  it('the placeholder plan (no cheap flags) is unchanged: the oracle lines hold', () => {
    const p = fixturePlan();
    const r = run(p.actions, { hours: null, now: mt(10, 30, 12, 10) });
    expect(r.lines.some(l => /cheap sweep/.test(l.text))).toBe(false);
  });

  it('the kept (compacted) plan keeps the flag (cost goes, the mark stays)', () => {
    const p: BuildUpPlan = {
      ...fixturePlan(),
      actions: [{ ...r3('neural_linking', 'Neural Linking', 24, 25, true), cost: 1e43 }],
    };
    const c = compactPlan(p);
    expect(c.actions[0].cheap).toBe(true);
    expect(c.actions[0].cost).toBeUndefined();
  });
});
