/**
 * A placeholder build-up (no player data) shaped like the format oracle's plan (notes/jordan-a2-buildup-2026-10-29.md
 * sections C and D: a prestige Fri Oct 30 2026 8:41 am Mountain, sales on Oct 30 and Nov 6 and Nov 13, the silo
 * trick on both Sundays). The buys are cut down and invented in that style; the times are the oracle's, so the
 * tracker's lines can be compared with the oracle's line for line where the buys are the same. Specs and the
 * WebKit screenshots of the build-up tracker use it.
 */
import type { BuildUpAction, BuildUpPlan } from '@/search/buildUpActions';
import type { Availability } from '@/search/availability';

export const ZONE = 'America/Denver';
/** The oracle's hours: nothing from 1 am to 7 am. */
export const HOURS: Availability = { days: [], fromHour: 7, toHour: 1, timezone: ZONE };

/** Mountain wall time to unix seconds (MDT until Sun Nov 1 2026 2:00 am, MST after). */
export function mt(month: 10 | 11 | 12, day: number, h: number, m: number, s = 0): number {
  const mdt = month === 10 || (month === 11 && day === 1 && h < 1);
  return Date.UTC(2026, month - 1, day, h + (mdt ? 6 : 7), m, s) / 1000;
}

const r = (t: number, label: string, from: number, to: number, id?: string): BuildUpAction => ({
  t,
  kind: 'research',
  label,
  id: id ?? label.toLowerCase().replace(/[^a-z]+/g, '_'),
  fromLevel: from,
  level: to,
});
const shift = (t: number, egg: string): BuildUpAction => ({ t, kind: 'shift', label: egg[0].toUpperCase(), id: egg });
const trains = (t: number, slots: number[]): BuildUpAction[] =>
  slots.flatMap(s => [
    { t, kind: 'vehicle', label: 'Hyperloop Train', slot: s, itemId: 11, level: 1 } as BuildUpAction,
    { t, kind: 'trainCar', label: 'train car', slot: s, fromLevel: 1, level: 5 } as BuildUpAction,
  ]);
const hab = (t: number, label: string, slot: number, itemId: number): BuildUpAction => ({ t, kind: 'hab', label, slot, itemId });
const silo = (t: number, from: number): BuildUpAction => ({ t, kind: 'silo', label: 'silo', fromLevel: from, count: from + 1 });
const saleWait = (t: number, seconds: number): BuildUpAction => ({ t, kind: 'wait', label: 'wait_for_research_sale', id: 'wait_for_research_sale', seconds });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function fixtureActions(): BuildUpAction[] {
  return [
    { t: mt(10, 30, 8, 41), kind: 'prestige', label: 'prestige', id: 'curiosity' },
    // The starting set, equipped at the prestige before any shift (the engine's real shape): not a swap.
    { t: mt(10, 30, 8, 41), kind: 'artifactSet', label: 'earnings set', id: 'earnings', detail: 'equip_artifact_set' },
    r(mt(10, 30, 8, 41, 30), 'Comfortable Nests', 0, 50),
    r(mt(10, 30, 8, 41, 31), 'Excitable Chickens', 0, 25),
    r(mt(10, 30, 8, 41, 32), 'Internal Hatchery Expansion', 0, 15, 'internal_hatchery3'),
    r(mt(10, 30, 8, 41, 33), 'Bigger Eggs', 0, 1),
    r(mt(10, 30, 8, 41, 34), 'Internal Hatchery Expansion', 0, 5, 'internal_hatchery4'),
    r(mt(10, 30, 8, 47), 'Grav Plating', 17, 18),
    r(mt(10, 30, 8, 47), 'Autonomous Vehicles', 1, 2),
    // Level by level, as the engine buys: one range on the line.
    ...range(59, 67).map(l => r(mt(10, 30, 8, 47), 'Crystalline Shelling', l - 1, l)),
    r(mt(10, 30, 9, 1, 29), 'Crystalline Shelling', 83, 84),
    r(mt(10, 30, 9, 1, 29), 'Telepathic Will', 10, 11),
    shift(mt(10, 30, 9, 1, 29), 'kindness'),
    ...trains(mt(10, 30, 9, 2, 29), range(0, 13)),
    ...trains(mt(10, 30, 9, 3, 29), [14, 15]),
    ...trains(mt(10, 30, 9, 4, 29), [16]),
    shift(mt(10, 30, 9, 4, 29), 'integrity'),
    hab(mt(10, 30, 9, 5, 29), 'Planet Portal', 0, 17),
    hab(mt(10, 30, 9, 5, 29), 'Chicken Universe', 0, 18),
    hab(mt(10, 30, 9, 6, 29), 'Chicken Universe', 1, 18),
    hab(mt(10, 30, 9, 6, 29), 'Chicken Universe', 2, 18),
    hab(mt(10, 30, 9, 6, 29), 'Chicken Universe', 3, 18),
    shift(mt(10, 30, 9, 6, 29), 'curiosity'),
    // Under a minute after the last: joins the next check-in at 9:07:29.
    r(mt(10, 30, 9, 7, 10), 'Timeline Diversion', 20, 22),
    r(mt(10, 30, 9, 7, 20), 'Atomic Purification', 17, 20),
    r(mt(10, 30, 9, 7, 29), 'Dark Containment', 18, 19),
    r(mt(10, 30, 9, 35, 48), 'Atomic Purification', 23, 24),
    // The engine's wait ends 2 s short of the sale: the buys after it are fixed to the clock (10:00 am).
    saleWait(mt(10, 30, 9, 59, 58), 1450),
    r(mt(10, 30, 9, 59, 58), 'Eggsistor Miniturization', 15, 22),
    r(mt(10, 30, 9, 59, 58), 'Neural Net Refinement', 9, 11),
    r(mt(10, 30, 10, 30, 31), 'Eggsistor Miniturization', 26, 27),
    r(mt(10, 30, 12, 3), 'Graviton Coupling', 2, 3),
    shift(mt(10, 30, 12, 3), 'kindness'),
    ...range(0, 16).map(s => ({ t: mt(10, 30, 12, 3), kind: 'trainCar', label: 'train car', slot: s, fromLevel: 5, level: 8 }) as BuildUpAction),
    shift(mt(10, 30, 12, 3), 'resilience'),
    // A set swap off Humility during the build-up: left out, with a note.
    { t: mt(10, 30, 12, 3), kind: 'artifactSet', label: 'elr set', id: 'elr', detail: 'equip_artifact_set' },
    ...range(1, 4).map(n => silo(mt(10, 30, 12, 3), n)),
    ...range(5, 7).map(n => silo(mt(10, 30, 12, 4), n)),
    silo(mt(10, 30, 12, 16, 10), 8),
    shift(mt(10, 30, 12, 16, 10), 'curiosity'),
    r(mt(10, 30, 12, 17, 10), 'Timeline Diversion', 24, 30),
    r(mt(10, 30, 12, 17, 10), 'Wormhole Dampening', 4, 5),
    r(mt(10, 30, 22, 52, 5), 'Atomic Purification', 35, 36),
    r(mt(10, 31, 0, 57, 40), 'Timeline Diversion', 40, 41),
    // Due at 3:10 am, inside the night: bought at 7:00 am, still inside the sale.
    r(mt(10, 31, 3, 10), 'Wormhole Dampening', 11, 12),
    r(mt(10, 31, 5, 20), 'Eggsistor Miniturization', 39, 40),
    r(mt(10, 31, 9, 49, 1), 'Timeline Diversion', 41, 42),
    saleWait(mt(11, 6, 10, 0), 6 * 86400),
    r(mt(11, 6, 10, 0), 'Multiversal Layering', 1, 2),
    r(mt(11, 6, 10, 0, 50), 'Enlightened Chickens', 95, 96),
    saleWait(mt(11, 13, 10, 0), 6 * 86400),
    r(mt(11, 13, 10, 0), 'Relativity Optimization', 2, 4),
    shift(mt(11, 13, 10, 0), 'humility'),
    // H1 (the engine's real shape): update the ELR set, then equip it, on Humility: one swap line.
    { t: mt(11, 13, 10, 0), kind: 'artifactSet', label: 'elr set', id: 'elr', detail: 'update_artifact_set' },
    { t: mt(11, 13, 10, 0), kind: 'artifactSet', label: 'elr set', id: 'elr', detail: 'equip_artifact_set' },
    // The TE part: left out of the build-up list.
    { t: mt(11, 21, 18, 32), kind: 'wait', label: 'wait_for_te', id: 'wait_for_te', seconds: 700000 },
    shift(mt(11, 21, 18, 32), 'kindness'),
  ];
}

/** The fixture as a plan (silos: 1 at the start, 3 h each). */
export function fixturePlan(accountKey = 'acct-fixture'): BuildUpPlan {
  return {
    startedAt: mt(10, 30, 8, 41),
    accountKey,
    variantKey: '2-sale',
    start: { egg: 'curiosity', researchLevels: {}, habIds: [null, null, null, null], vehicles: [], siloCount: 1, artifactSet: 'earnings' },
    actions: fixtureActions(),
    siloSeconds: 3 * 3600,
    endTime: mt(12, 23, 4, 50),
  };
}
