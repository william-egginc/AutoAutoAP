/**
 * HOLD A POINTLESS SWEEP BUY TO THE SALE, EVEN DAYS BEFORE IT (design spec, failing first; game expert, 9 Nov 2026).
 *
 * A tester on the live site (about TE 197, building toward Matter Reconfiguration 2 and tier 13 at the Friday sale) is
 * told "buy Enlightened Chickens 68 -> 72 now (cheap sweep)", then nothing until the sale on Fri Nov 13, 10:00 am. The
 * same shape is in Jordan's save of Tue Nov 3, 11:19 am: the plan opens with Neural Linking 24 -> 25 and Enlightened
 * Chickens 71 -> 72 at 11:23 am (cheap sweep, full price, 1.5e41 + 4.1e41), then "wait for the sale: offline until Fri
 * Nov 6 10:00 am (2 d 22 h 37 min)". Both categories are excluded from the ROI ranking and worth nothing in the
 * simulation (skipGrowth): they only count toward a tier unlock, and nothing else is bought between the sweep and the
 * sale, so the count at the sale's first check-in is the same whether they are bought now or then. At the sale they
 * cost 30%.
 *
 * buildUpTracker.holdsweep.spec.ts holds such a buy only when the sale starts within 3 hours (HOLD_BEFORE_SALE_SECONDS);
 * this is the case beyond it: no other purchase between the sweep and the sale start, the sale days away.
 * The rule: hold the pointless sweep to the sale start whenever no other player action (research, vehicle, hab, silo,
 * train, shift, set swap) lies between the buy and the sale start, at any distance. A different action in between, with
 * the sale more than 3 hours away, keeps the buy at its time (the 22-hour control in buildUpTracker.holdsweep.spec.ts
 * now has one in between; it had none and expected "not held").
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, lineText } from './buildUpTracker';
import { HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const research = (
  t: number,
  id: string,
  label: string,
  from: number,
  to: number,
  cost: number,
  cheap = true
): BuildUpAction => ({
  t,
  kind: 'research',
  label,
  id,
  fromLevel: from,
  level: to,
  cost,
  ...(cheap ? { cheap: true as const } : {}),
});
const sale = (t: number): BuildUpAction[] => [
  { t, kind: 'wait', label: 'wait_for_research_sale', id: 'wait_for_research_sale', seconds: 250000 },
  { t, kind: 'event', label: 'research sale', id: 'research', on: true },
];
const run = (actions: BuildUpAction[], now: number) =>
  buildUpTracker({ actions, zone: ZONE, hours: HOURS, siloSeconds: 97200, startSilos: 9, startEgg: 'curiosity', now });

describe('a pointless sweep buy days before a research sale, with nothing bought in between', () => {
  const actions = [
    research(mt(11, 3, 11, 23), 'neural_linking', 'Neural Linking', 24, 25, 1.5e41),
    research(mt(11, 3, 11, 23), 'enlightened_chickens', 'Enlightened Chickens', 71, 72, 4.1e41),
    ...sale(mt(11, 6, 10, 0)),
    research(mt(11, 6, 10, 0), 'eggsistor', 'Eggsistor Miniturization', 40, 46, 3e44, false),
  ];

  it('is held to the sale: no 11:23 AM check-in on Nov 3, the levels are in the 10:00 AM line', () => {
    const r = run(actions, mt(11, 3, 11, 23));
    expect(r.checkIns[0].at).toBe(mt(11, 6, 10, 0));
    const first = r.lines.map(lineText).find(t => t.startsWith('10:00 AM · buy'))!;
    expect(first).toContain('Neural Linking');
    expect(first).toContain('Enlightened Chickens');
    expect(r.lines.map(lineText).some(t => t.startsWith('11:23 AM'))).toBe(false);
  });

  it('is NOT held when another purchase lies between the sweep and the sale (it keeps its time)', () => {
    const r = run(
      [
        research(mt(11, 3, 11, 23), 'enlightened_chickens', 'Enlightened Chickens', 71, 72, 4.1e41),
        research(mt(11, 4, 9, 0), 'eggsistor', 'Eggsistor Miniturization', 39, 40, 1e43, false),
        ...sale(mt(11, 6, 10, 0)),
      ],
      mt(11, 3, 11, 23)
    );
    expect(r.checkIns[0].at).toBe(mt(11, 3, 11, 23));
  });
});
