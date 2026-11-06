/**
 * HOLD A POINTLESS SWEEP BUY TO THE SALE (design spec, failing first; game expert, 6 Nov 2026).
 *
 * The 6 Nov 2026 9:03 am save: the build-up opens with two "(cheap sweep)" buys at 9:07 am, Neural Linking (internal
 * hatchery rate) 24 -> 25 and Enlightened Chickens (running chicken bonus) 71 -> 72, at full price, 53 minutes before
 * the research sale starts at 10:00 am. The ROI ranking excludes both categories (calculations/researchRanking.ts
 * ROI_EXCLUDED_CATEGORIES) and the engine's skipGrowth makes them worth nothing in the simulation: they are only
 * purchase-count fodder for tier unlocks. At the sale they cost 30% of the price, and the tier-13 unlock (purchase
 * number 60, 2:19 pm that day) is not moved by buying them at 10:00 instead of 9:07.
 *
 * The rule: a `cheap` research buy in an excluded category (internal hatchery rate, running chicken bonus, hatchery
 * capacity, hatchery refill) that falls when no sale is on and a sale starts within HOLD_BEFORE_SALE_SECONDS
 * (3 hours) is held to the sale's first check-in (priced there at the sale price). It opens no check-in of its own.
 * Any other buy keeps its time.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, lineText } from './buildUpTracker';
import { HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const research = (t: number, id: string, label: string, from: number, to: number, cost: number, cheap = true): BuildUpAction => ({
  t, kind: 'research', label, id, fromLevel: from, level: to, cost, ...(cheap ? { cheap: true as const } : {}),
});
const sale = (t: number): BuildUpAction[] => [
  { t, kind: 'wait', label: 'wait_for_research_sale', id: 'wait_for_research_sale', seconds: 3180 },
  { t, kind: 'event', label: 'research sale', id: 'research', on: true },
];

function plan(extra: BuildUpAction[]): BuildUpAction[] {
  return [
    ...extra,
    ...sale(mt(11, 6, 10, 0)),
    research(mt(11, 6, 10, 0), 'eggsistor', 'Eggsistor Miniturization', 40, 46, 3e44, false),
    research(mt(11, 6, 10, 26), 'eggsistor', 'Eggsistor Miniturization', 46, 47, 3e44, false),
  ];
}
const run = (actions: BuildUpAction[], now = mt(11, 6, 9, 3)) =>
  buildUpTracker({ actions, zone: ZONE, hours: HOURS, siloSeconds: 97200, startSilos: 9, startEgg: 'curiosity', now });

describe('a pointless sweep buy just before a research sale', () => {
  it('is held to the sale: no 9:07 am check-in, and the buys are in the 10:00 am line', () => {
    const r = run(
      plan([
        research(mt(11, 6, 9, 7), 'neural_linking', 'Neural Linking', 24, 25, 1.5e41),
        research(mt(11, 6, 9, 7), 'enlightened_chickens', 'Enlightened Chickens', 71, 72, 4.1e41),
      ])
    );
    expect(r.checkIns[0].at).toBe(mt(11, 6, 10, 0));
    const first = r.lines.map(lineText).find(t => t.startsWith('10:00 am · buy'))!;
    expect(first).toContain('Neural Linking');
    expect(first).toContain('Enlightened Chickens');
    expect(r.lines.map(lineText).some(t => t.startsWith('9:07 am'))).toBe(false);
  });

  it('is NOT held when the cheap buy raises earnings (egg value), which keeps its time', () => {
    const r = run(plan([research(mt(11, 6, 9, 7), 'atomic_purification', 'Atomic Purification', 36, 37, 1e41)]));
    expect(r.checkIns[0].at).toBe(mt(11, 6, 9, 7));
  });

  it('is NOT held when the sale is more than 3 hours away (a control: 22 hours)', () => {
    const r = run(
      [
        research(mt(11, 5, 12, 0), 'neural_linking', 'Neural Linking', 24, 25, 1.5e41),
        ...sale(mt(11, 6, 10, 0)),
        research(mt(11, 6, 10, 0), 'eggsistor', 'Eggsistor Miniturization', 40, 46, 3e44, false),
      ],
      mt(11, 5, 11, 0)
    );
    expect(r.checkIns[0].at).toBe(mt(11, 5, 12, 0));
  });

  it('is NOT held when the buy is not cheap (an ROI pick)', () => {
    const r = run(plan([research(mt(11, 6, 9, 7), 'neural_linking', 'Neural Linking', 24, 25, 1.5e41, false)]));
    expect(r.checkIns[0].at).toBe(mt(11, 6, 9, 7));
  });
});
