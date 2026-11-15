/**
 * "Tier 13 unlocks" in the Build-up tracker (spec-tierunlock, 13 Nov 2026): the check-in where the research bought so far in
 * the tiers BELOW a tier reaches that tier's threshold (lib/planners/calculations/commonResearch.ts TIER_UNLOCK_THRESHOLDS,
 * the planner's own rule: Tier 13 needs 1655 levels from tiers 1-12). Pure, from the plan's start levels and the tracker's
 * lines; no hash input is touched. Synthetic plans, placeholder data only.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, type TrackerLine } from './buildUpTracker';
import { tierUnlocks } from './buildUpTiers';
import { tierAheadWords, tierUnlocksChipWords, tierUnlocksWords } from './buildUpWords';
import type { BuildUpAction } from '@/search/buildUpActions';

const ZONE = 'America/Denver';
const T0 = Date.UTC(2026, 9, 30, 15, 0, 0) / 1000;
const buy = (min: number, id: string, from: number, to: number): BuildUpAction => ({ t: T0 + min * 60, kind: 'research', label: id, id, fromLevel: from, level: to });
const linesOf = (actions: BuildUpAction[]): TrackerLine[] =>
  buildUpTracker({ actions, zone: ZONE, hours: null, siloSeconds: 0, startSilos: 1, startEgg: 'curiosity', now: T0 }).lines;
const researchLines = (ls: TrackerLine[]) => ls.filter(l => l.kind === 'research');

describe('tierUnlocks: where a tier unlocks in the plan', () => {
  it('Tier 2 (30 levels from tier 1): the check-in whose buy takes tier 1 from 25 to 32', () => {
    const ls = linesOf([buy(0, 'comfy_nests', 0, 25), buy(10, 'comfy_nests', 25, 32), buy(20, 'comfy_nests', 32, 40)]);
    const rl = researchLines(ls);
    expect(rl).toHaveLength(3);
    const u = tierUnlocks({}, ls);
    expect(u).toHaveLength(1);
    expect(u[0].tiers).toEqual([2]);
    expect(u[0].key).toBe(rl[1].key);
    expect(u[0].at).toBe(rl[1].at);
    expect(u[0].time).toBe(rl[1].time);
  });
  it('counts the start levels: tier 1 already at 28 unlocks it on the first buy of 2', () => {
    const ls = linesOf([buy(0, 'comfy_nests', 28, 30)]);
    expect(tierUnlocks({ comfy_nests: 28 }, ls).map(u => u.tiers)).toEqual([[2]]);
  });
  it('a tier already unlocked at the start has no marker', () => {
    const ls = linesOf([buy(0, 'comfy_nests', 30, 31), buy(10, 'comfy_nests', 31, 33)]);
    expect(tierUnlocks({ comfy_nests: 30 }, ls)).toEqual([]);
  });
  it('only tiers BELOW count: tier 2 research does not unlock tier 2', () => {
    const ls = linesOf([buy(0, 'hab_capacity1', 0, 8), buy(10, 'padded_packaging', 0, 30), buy(20, 'comfy_nests', 0, 29)]);
    expect(tierUnlocks({}, ls)).toEqual([]);
    // ...but they do count toward tier 3 (80 from tiers 1-2): 35 + 8 + 30 = 73, then 40 more.
    const more = linesOf([buy(0, 'hab_capacity1', 0, 8), buy(10, 'padded_packaging', 0, 30), buy(20, 'comfy_nests', 0, 35), buy(30, 'nutritional_sup', 0, 40)]);
    const u = tierUnlocks({}, more);
    expect(u.map(x => x.tiers)).toEqual([[2], [3]]);
  });
  it('tiers crossed by one check-in are said together (tiers 1-2 hold 168 here: tiers 2, 3 and 4)', () => {
    const ls = linesOf([buy(0, 'comfy_nests', 0, 50), buy(0, 'nutritional_sup', 0, 40), buy(0, 'better_incubators', 0, 15), buy(0, 'excitable_chickens', 0, 25), buy(0, 'hab_capacity1', 0, 8), buy(0, 'padded_packaging', 0, 30)]);
    const u = tierUnlocks({}, ls);
    expect(u).toHaveLength(1);
    expect(u[0].tiers).toEqual([2, 3, 4]);
  });
  it('without start levels nothing is guessed', () => {
    expect(tierUnlocks(undefined, linesOf([buy(0, 'comfy_nests', 0, 40)]))).toEqual([]);
    expect(tierUnlocks(null, linesOf([buy(0, 'comfy_nests', 0, 40)]))).toEqual([]);
  });
  it('an id the common research table does not know counts for nothing', () => {
    expect(tierUnlocks({}, linesOf([buy(0, 'not_a_research', 0, 99)]))).toEqual([]);
  });
});

describe('the words (DRAFT, Words)', () => {
  it('on the check-in', () => {
    expect(tierUnlocksWords([13])).toBe('Tier 13 unlocks');
    expect(tierUnlocksWords([12, 13])).toBe('Tiers 12 and 13 unlock');
  });
  it('as a Compact chip, with its time (as the sale chips)', () => {
    expect(tierUnlocksChipWords([13], '4:41 PM')).toBe('Tier 13 unlocks 4:41 PM');
    expect(tierUnlocksChipWords([12, 13], '4:41 PM')).toBe('Tiers 12 and 13 unlock 4:41 PM');
  });
  it('in the header, with the time as the tracker writes it', () => {
    expect(tierAheadWords([13], '4:41 PM')).toBe('Tier 13 at 4:41 PM');
    expect(tierAheadWords([12, 13], '4:41 PM')).toBe('Tiers 12 and 13 at 4:41 PM');
  });
});
