/**
 * The tracker's Smart Buy line and its "(cheap sweep)" marks (spec-buylabel, 30 Oct 2026; notes
 * ~/code/aaap-tools/notes/spec-buylabel.md, ~/code/aaap-tools/notes/smartbuy-vs-c3-2026-10-30.md).
 *
 *  - The header line says how many sales the plan's Smart Buy looks ahead: the plan's own count (the simulator's
 *    `buildPhaseSaleCount`, carried as `BuildUpPlan.saleCount`), else the variant key's ('2-sale', '1-sale-tier13'),
 *    else 3 (an older kept 'buildup' plan that carries neither). None for 'continue' (nothing is bought).
 *  - A research buy that cost 10 s of the farm's income or less (`BuildUpAction.cheap`, set where the engine's actions
 *    become records) is a "cheap sweep" buy. R7 (31 Oct 2026, Jordan: about 45 names a check-in were marked on a fresh
 *    ascension): a name is marked only when its line also has non-sweep buys, to tell them apart; a line that is all
 *    sweep gets ONE "(cheap sweep)" at its end. The line's `items` and keys stay as they were; `sweep` keeps which
 *    part was the sweep.
 * Fixed clock, placeholder actions, no wall-clock waits.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, buyRuleWords, compactPlan, lineText, sweepTail, type TrackerResult } from './buildUpTracker';
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

  it('a mixed line (sweep and non-sweep buys) marks only the sweep names; items unchanged', () => {
    const l = run(merged).lines.find(x => x.kind === 'research')!;
    expect(lineText(l)).toBe('11:22 pm · buy Neural Linking 25-26 (cheap sweep), Enlightened Chickens 72 (cheap sweep), Timeline Diversion 40');
    expect(l.parts).toEqual(['Neural Linking 25-26 (cheap sweep)', 'Enlightened Chickens 72 (cheap sweep)', 'Timeline Diversion 40']);
    expect(l.sweep).toEqual([true, true, false]);
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
    expect(l.sweep).toBeUndefined();
  });

  const allSweep = [
    r3('comfortable_nests', 'Comfortable Nests', 0, 50, true),
    r3('excitable_chickens', 'Excitable Chickens', 0, 25, true),
    r3('bigger_eggs', 'Bigger Eggs', 0, 1, true),
  ];
  /** The same buys, then a check-in a minute later, so the line gets its "offline" tail. */
  const withNext = (acts: BuildUpAction[]) => [...acts, r3('timeline_diversion', 'Timeline Diversion', 39, 40, false, mt(10, 30, 23, 23))];

  it('an all-sweep line: ONE "(cheap sweep)" at the end of the line, before the offline tail', () => {
    const r = run(withNext(allSweep));
    const l = r.lines.find(x => x.kind === 'research')!;
    expect(lineText(l)).toBe('11:22 pm · buy Comfortable Nests 1-50, Excitable Chickens 1-25, Bigger Eggs 1 (cheap sweep) · offline 1 min');
    expect(l.text.match(/cheap sweep/g)).toHaveLength(1);
    // The names stay plain for striking through; which ones were the sweep is kept.
    expect(l.parts).toEqual(['Comfortable Nests 1-50', 'Excitable Chickens 1-25', 'Bigger Eggs 1']);
    expect(l.sweep).toEqual([true, true, true]);
    expect(sweepTail(l)).toBe(' (cheap sweep)');
    expect(l.items).toEqual([
      { kind: 'research', id: 'comfortable_nests', level: 50 },
      { kind: 'research', id: 'excitable_chickens', level: 25 },
      { kind: 'research', id: 'bigger_eggs', level: 1 },
    ]);
    // Same keys and items as without the flags.
    const plain = run(withNext(allSweep.map(({ cheap: _c, ...a }) => a))).lines.find(x => x.kind === 'research')!;
    expect(l.key).toBe(plain.key);
    expect(l.items).toEqual(plain.items);
    // The next line (not sweep) has no mark.
    expect(r.lines.filter(x => x.kind === 'research')[1].text).toBe('buy Timeline Diversion 40');
  });

  it('a mixed line has no line-end mark; a line with no sweep has neither', () => {
    const mixed = run(merged).lines.find(x => x.kind === 'research')!;
    expect(sweepTail(mixed)).toBe('');
    expect(mixed.text.endsWith('Timeline Diversion 40')).toBe(true);
    expect(sweepTail(run([r3('timeline_diversion', 'Timeline Diversion', 39, 40, false)]).lines[0])).toBe('');
  });

  it('a research part cheap, part not counts as a non-sweep buy: the line is mixed, the all-cheap name is marked', () => {
    const l = run([
      r3('neural_linking', 'Neural Linking', 24, 25, true),
      r3('neural_linking', 'Neural Linking', 25, 26, false),
      r3('enlightened_chickens', 'Enlightened Chickens', 71, 72, true),
    ]).lines.find(x => x.kind === 'research')!;
    expect(l.parts).toEqual(['Neural Linking 25-26', 'Enlightened Chickens 72 (cheap sweep)']);
    expect(l.sweep).toEqual([false, true]);
    expect(sweepTail(l)).toBe('');
  });

  it('trains and habs in the same check-in are lines of their own: the research line beside them is judged alone (all sweep: one mark)', () => {
    const t = mt(10, 30, 23, 22);
    const train: BuildUpAction = { t, kind: 'vehicle', label: 'Hyperloop Train', slot: 0, itemId: 11, level: 2 };
    const hab: BuildUpAction = { t, kind: 'hab', label: 'Chicken Universe', slot: 1, itemId: 18 };
    const r = run(withNext([train, ...allSweep, hab]));
    const own = r.lines.filter(x => x.at === t);
    expect(own.map(x => x.kind)).toEqual(['trains', 'research', 'hab']);
    expect(own[0].text).toBe('buy 1 Hyperloop Train (slot 1), cars to 2');
    expect(own[1].text).toBe('buy Comfortable Nests 1-50, Excitable Chickens 1-25, Bigger Eggs 1 (cheap sweep)');
    expect(own[2].text).toBe('buy Chicken Universe in hab slot 2');
    expect(own[2].tail).toBe('offline 1 min');
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
