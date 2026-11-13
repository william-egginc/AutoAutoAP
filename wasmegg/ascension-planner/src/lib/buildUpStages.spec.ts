/**
 * The build-up tracker's stages (spec-stages, 13 Nov 2026; the rule is the game expert's, ~/code/aaap-tools/notes/
 * spec-buildup-stages.md): Buying to Tier 13 (only on a Tier 13 variant, up to and including the buy that takes tiers 1-12
 * to 1,655 levels), Delivery research (the unbroken final run of delivery-category research, from no earlier than the
 * start of the sale holding the last buy), Focus on ROI (the rest). A check-in takes the stage of its last research buy; one
 * with none takes the one before. Synthetic plans, placeholder data, pure.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, type TrackerLine } from './buildUpTracker';
import { buildUpStages, type Stage } from './buildUpStages';
import { STAGE_WORDS, stageNowWords, stageStartWords } from './buildUpWords';
import { getCommonResearches } from '@/calculations/commonResearch';
import type { BuildUpAction } from '@/search/buildUpActions';

const ZONE = 'America/Los_Angeles';
/** PST (UTC-8) from Nov 1 2026. The research sale runs Fri 9:00 AM Pacific to Sat 9:00 AM: Nov 6 17:00 UTC to Nov 7 17:00 UTC. */
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, day, h, m, 0) / 1000;
const buy = (t: number, id: string, from: number, to: number): BuildUpAction => ({ t, kind: 'research', label: id, id, fromLevel: from, level: to });
const hab = (t: number): BuildUpAction => ({ t, kind: 'hab', label: 'hab', slot: 0, itemId: 1 });

// Tiers 1-12 hold 1,794 levels maxed. Start 160 short of max: 1,634 levels, 21 short of Tier 13's 1,655.
const LOWERED = new Set(['comfy_nests', 'nutritional_sup', 'better_incubators', 'excitable_chickens', 'padded_packaging']);
const START: Record<string, number> = {};
for (const r of getCommonResearches()) if (r.tier <= 12) START[r.id] = LOWERED.has(r.id) ? 0 : r.levels;

const PLAN: BuildUpAction[] = [
  hab(at(4, 15, 0)), // before any research: takes the first stage
  buy(at(4, 15, 5), 'comfy_nests', 0, 20), // 1,654: not yet
  buy(at(4, 15, 15), 'comfy_nests', 20, 22), // 1,656: Tier 13 opens here
  buy(at(4, 15, 25), 'comfy_nests', 22, 30), // ROI
  buy(at(5, 15, 0), 'usde_prime', 0, 1), // ROI (egg value)
  buy(at(5, 22, 0), 'grav_plating', 0, 2), // a delivery category, but before the final sale and before an earnings prelude: ROI
  hab(at(5, 22, 30)),
  buy(at(6, 18, 0), 'padded_packaging', 0, 5), // the sale's earnings prelude (egg value): ROI
  buy(at(6, 20, 0), 'grav_plating', 2, 4), // the delivery run starts (the sale holds it)
  buy(at(6, 20, 10), 'leafsprings', 0, 3), // delivery
  hab(at(6, 20, 30)), // no research: takes Delivery
];

const linesOf = (actions: BuildUpAction[]): TrackerLine[] =>
  buildUpTracker({ actions, zone: ZONE, hours: null, siloSeconds: 0, startSilos: 1, startEgg: 'curiosity', now: at(4, 14, 0) }).lines;
const lines = linesOf(PLAN);
const research = lines.filter(l => l.kind === 'research');
const perLine = (start: Record<string, number> | null = START, ls: TrackerLine[] = lines): (Stage | undefined)[] => {
  const s = buildUpStages(start, ls);
  return ls.map(l => s.stageOf.get(l.key));
};
const perResearch = (start: Record<string, number> | null = START, ls: TrackerLine[] = lines) => {
  const s = buildUpStages(start, ls);
  return ls.filter(l => l.kind === 'research').map(l => s.stageOf.get(l.key));
};

describe('the plan is as built', () => {
  it('eight research check-ins, and the habs between', () => {
    expect(research).toHaveLength(8);
    expect(lines.filter(l => l.kind === 'hab')).toHaveLength(3);
  });
});

describe('a Tier 13 build', () => {
  it('Tier 13 ends exactly on the buy that reaches 1,655 levels; ROI; Delivery from the final run, inside the sale', () => {
    expect(perResearch()).toEqual(['tier13', 'tier13', 'roi', 'roi', 'roi', 'roi', 'delivery', 'delivery']);
  });
  it('a check-in with no research takes the one before (the first: the plan\'s first stage)', () => {
    const habs = lines.map((l, i) => [l, i] as const).filter(([l]) => l.kind === 'hab').map(([, i]) => perLine()[i]);
    expect(habs).toEqual(['tier13', 'roi', 'delivery']);
  });
  it('stages only move forward, and the start of each is on the list', () => {
    const order = ['tier13', 'roi', 'delivery'];
    const per = perLine().map(s => order.indexOf(s as string));
    expect(per.every((x, i) => x >= 0 && (i === 0 || x >= per[i - 1]))).toBe(true);
    const s = buildUpStages(START, lines);
    expect(s.starts.map(x => x.stage)).toEqual(['tier13', 'roi', 'delivery']);
    expect(s.starts[0].key).toBe(lines[0].key);
    expect(s.starts[2].key).toBe(research[6].key);
  });
});

describe('Tier 13 wherever the plan unlocks it, whatever its variant (Jordan, 13 Nov 2026: "where applicable")', () => {
  it('the stage is not tied to the variant key: no variant is read at all', () => {
    expect(buildUpStages.length).toBe(2);
  });
  it('Tier 13 open at the start: no Tier 13 stage', () => {
    const open = { ...START, comfy_nests: 50, nutritional_sup: 40 };
    expect(perResearch(open)).not.toContain('tier13');
    expect(buildUpStages(open, lines).starts.map(x => x.stage)).toEqual(['roi', 'delivery']);
  });
  it('a plan that never reaches 1,655 levels has no Tier 13 stage', () => {
    const far = { ...START, hab_capacity1: 0, internal_hatchery1: 0, hatchery_expansion: 0, leafsprings: 0, vehicle_reliablity: 0 };
    const low: Record<string, number> = {};
    for (const k of Object.keys(far)) low[k] = 0;
    expect(perResearch(low)).not.toContain('tier13');
  });
});

describe('Jordan-style: a plan that starts inside the final sale', () => {
  const plan = [buy(at(6, 20, 0), 'grav_plating', 2, 4), buy(at(6, 20, 10), 'leafsprings', 0, 3), hab(at(6, 21, 0))];
  const ls = linesOf(plan);
  it('every check-in reads Delivery research from the first', () => {
    expect(perLine(START, ls)).toEqual(ls.map(() => 'delivery'));
    expect(buildUpStages(START, ls).starts.map(x => x.stage)).toEqual(['delivery']);
  });
});

describe('what is not a stage', () => {
  it('a final run outside any sale is not Delivery research (the last buy is not held by a sale)', () => {
    const plan = [buy(at(4, 15, 0), 'comfy_nests', 0, 10), buy(at(4, 16, 0), 'grav_plating', 0, 2)];
    const ls = linesOf(plan);
    expect(perLine(START, ls)).not.toContain('delivery');
  });
  it('delivery-category research bought by ROI in an earlier sale stays ROI', () => {
    const plan = [buy(at(6, 18, 0), 'grav_plating', 0, 2), buy(at(6, 18, 30), 'padded_packaging', 0, 5), buy(at(13, 18, 0), 'leafsprings', 0, 3)];
    const ls = linesOf(plan);
    // Nov 13 18:00 UTC is the next sale's Friday 10:00 AM Pacific: the last buy is delivery, the sale holds it.
    expect(perResearch(START, ls)).toEqual(['roi', 'roi', 'delivery']);
  });
  it('without start levels no Tier 13 stage is guessed, ROI and Delivery still are', () => {
    expect(perResearch(null)).not.toContain('tier13');
  });
});

describe('the words (DRAFT, Words)', () => {
  it('the three names', () => {
    expect(STAGE_WORDS).toEqual({ tier13: 'Buying to Tier 13', roi: 'Focus on ROI', delivery: 'Delivery research' });
  });
  it('the header\'s "now" and a band\'s start', () => {
    expect(stageNowWords('tier13')).toBe('now: Buying to Tier 13');
    expect(stageStartWords('roi', '11:16 AM')).toBe('Focus on ROI from 11:16 AM');
    expect(stageStartWords('roi', '')).toBe('Focus on ROI');
  });
});
