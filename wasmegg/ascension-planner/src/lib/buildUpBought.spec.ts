/**
 * lib/buildUpBought.ts (build-up tracker Phase 2): what the save says is bought, line by line, against the fixed plan.
 * Table-driven, placeholder data only (lib/buildUpTracker.fixture.ts and small hand-made lines), fixed clock.
 */
import { describe, expect, it } from 'vitest';
import {
  boughtFromSave,
  carryTicks,
  contains,
  effectiveTicks,
  farmOfStart,
  OFF_PLAN_GRACE,
  offPlan,
  REPLAN_BEHIND,
  replanOffer,
  saveFarmFor,
  saveFit,
  type PlanItem,
  type SaveFarm,
} from './buildUpBought';
import { buildUpTracker, type TrackerLine } from './buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpStart } from '@/search/buildUpActions';

const T0 = mt(10, 30, 9, 0);
let n = 0;
function line(kind: TrackerLine['kind'], items: PlanItem[] | undefined, at = T0, parts?: string[]): TrackerLine {
  return {
    key: `${at}:${n++}`,
    kind,
    at,
    time: '',
    text: '',
    tail: '',
    bold: false,
    granular: kind === 'research',
    tickable: true,
    checkIn: 0,
    ...(items ? { items } : {}),
    ...(parts ? { parts } : {}),
  };
}
const START: BuildUpStart = {
  egg: 'curiosity',
  researchLevels: { comfy_nests: 10 },
  habIds: [0, null, null, null],
  vehicles: [{ vehicleId: 0, trainLength: 1 }],
  siloCount: 1,
  artifactSet: 'earnings',
};
function farm(over: Partial<SaveFarm> = {}): SaveFarm {
  return { ...farmOfStart(START), ...over };
}

describe('saveFarmFor: the save as comparable values', () => {
  it('reads the save farm (empty hab 19 already null), egg by number, set by the gear match', () => {
    const f = saveFarmFor(
      {
        eggType: 54,
        cash: 0,
        numSilos: 3,
        commonResearches: { comfy_nests: 20 },
        habs: [12, null, 13, null],
        vehicles: [
          { vehicleId: 11, trainLength: 6 },
          { vehicleId: null, trainLength: 1 },
        ],
        population: 0,
        deliveredEggs: 0,
        lastStepTime: 0,
        cashEarned: 0,
        cashSpent: 0,
      },
      'production'
    )!;
    expect(f).toEqual({
      egg: 'kindness',
      researchLevels: { comfy_nests: 20 },
      habIds: [12, null, 13, null],
      vehicles: [
        { vehicleId: 11, trainLength: 6 },
        { vehicleId: null, trainLength: 1 },
      ],
      siloCount: 3,
      artifactSet: 'elr',
    });
    expect(saveFarmFor(null, null)).toBeNull();
    expect(saveFarmFor({ eggType: 1, numSilos: 1, commonResearches: {}, habs: [], vehicles: [] } as never, 'mix')?.egg).toBeNull();
  });
  it.each([
    ['earnings', 'earnings'],
    ['production', 'elr'],
    ['both', null],
    ['mix', null],
    [null, null],
  ] as const)('gear match %s -> set %s', (m, want) => {
    const f = saveFarmFor({ eggType: 50, numSilos: 1, commonResearches: {}, habs: [], vehicles: [] } as never, m)!;
    expect(f.artifactSet).toBe(want);
  });
});

describe('itemBought, table-driven (one line per item kind)', () => {
  const S = farm({
    researchLevels: { comfy_nests: 20, leafsprings: 5 },
    habIds: [13, 12, null, null],
    vehicles: [
      { vehicleId: 11, trainLength: 8 },
      { vehicleId: 10, trainLength: 1 },
      { vehicleId: 9, trainLength: 1 },
    ],
    siloCount: 4,
  });
  it.each<[string, PlanItem, boolean]>([
    ['research level reached', { kind: 'research', id: 'comfy_nests', level: 20 }, true],
    ['research level passed', { kind: 'research', id: 'comfy_nests', level: 15 }, true],
    ['research level not reached', { kind: 'research', id: 'comfy_nests', level: 21 }, false],
    ['research never started', { kind: 'research', id: 'grav_plating', level: 1 }, false],
    ['hab in slot', { kind: 'hab', slot: 1, habId: 12 }, true],
    ['hab or better', { kind: 'hab', slot: 0, habId: 12 }, true],
    ['hab not yet', { kind: 'hab', slot: 1, habId: 13 }, false],
    ['hab empty slot', { kind: 'hab', slot: 2, habId: 0 }, false],
    ['train with its cars', { kind: 'vehicle', slot: 0, vehicleId: 11, cars: 8 }, true],
    ['train, too few cars', { kind: 'vehicle', slot: 0, vehicleId: 11, cars: 9 }, false],
    ['vehicle or better (a QT where a Hover Semi was planned)', { kind: 'vehicle', slot: 1, vehicleId: 9, cars: 0 }, true],
    ['vehicle not yet (a QT where a train is planned)', { kind: 'vehicle', slot: 1, vehicleId: 11, cars: 5 }, false],
    ['vehicle in a slot the save does not have', { kind: 'vehicle', slot: 7, vehicleId: 0, cars: 0 }, false],
    ['train cars per slot, reached', { kind: 'trainCar', slot: 0, cars: 8 }, true],
    ['train cars per slot, not reached', { kind: 'trainCar', slot: 0, cars: 10 }, false],
    ['train cars on a slot without a train', { kind: 'trainCar', slot: 1, cars: 2 }, false],
    ['silo #4 of 4', { kind: 'silo', count: 4 }, true],
    ['silo #5 of 4', { kind: 'silo', count: 5 }, false],
  ])('%s', (_name, item, want) => {
    const l = line(item.kind === 'research' ? 'research' : item.kind === 'hab' ? 'hab' : item.kind === 'silo' ? 'silo' : 'trains', [item]);
    const b = boughtFromSave({ lines: [l], save: S, start: START, startEgg: 'curiosity' });
    expect(b.fit).toBe('fits');
    expect(b.lines.get(l.key)?.items).toEqual([want]);
    expect(b.lines.get(l.key)?.auto).toBe(want);
  });
});

describe('vehicle tiers climbed in one moment (Trike -> QT -> Hyperloop): only the last tier counts', () => {
  it('the tracker line carries one item per slot, the last vehicle, with its cars', () => {
    const r = buildUpTracker({
      actions: [
        { t: T0, kind: 'vehicle', label: 'Trike', slot: 0, itemId: 0 },
        { t: T0, kind: 'vehicle', label: 'Quantum Transporter', slot: 0, itemId: 10 },
        { t: T0, kind: 'vehicle', label: 'Hyperloop Train', slot: 0, itemId: 11, level: 1 },
        { t: T0, kind: 'trainCar', label: 'train car', slot: 0, fromLevel: 1, level: 4 },
      ],
      zone: ZONE,
      now: T0,
    });
    const l = r.lines.find(x => x.kind === 'trains')!;
    expect(l.items).toEqual([{ kind: 'vehicle', slot: 0, vehicleId: 11, cars: 4 }]);
    // A save with the QT only: not bought (the train is what counts).
    const qt = farm({ vehicles: [{ vehicleId: 10, trainLength: 1 }] });
    expect(boughtFromSave({ lines: [l], save: qt, start: START, startEgg: 'curiosity' }).lines.get(l.key)?.auto).toBe(false);
    const tr = farm({ vehicles: [{ vehicleId: 11, trainLength: 4 }] });
    expect(boughtFromSave({ lines: [l], save: tr, start: START, startEgg: 'curiosity' }).lines.get(l.key)?.auto).toBe(true);
  });
});

describe('a partly bought line: "3 of 5"', () => {
  it('counts its items and says which are bought (research parts in order)', () => {
    const l = line(
      'research',
      [
        { kind: 'research', id: 'a', level: 1 },
        { kind: 'research', id: 'b', level: 2 },
        { kind: 'research', id: 'c', level: 3 },
        { kind: 'research', id: 'd', level: 4 },
        { kind: 'research', id: 'e', level: 5 },
      ],
      T0,
      ['A 1', 'B 2', 'C 3', 'D 4', 'E 5']
    );
    const b = boughtFromSave({ lines: [l], save: farm({ researchLevels: { comfy_nests: 10, a: 1, c: 3, e: 9, d: 3 } }), start: START, startEgg: 'curiosity' });
    const lb = b.lines.get(l.key)!;
    expect(lb).toEqual({ bought: 3, total: 5, items: [true, false, true, false, true], auto: false });
    expect(b.ticks.has(l.key)).toBe(false);
  });
  it('silos #2-5 with 3 silos: 2 of 4', () => {
    const l = line('silo', [2, 3, 4, 5].map(c => ({ kind: 'silo', count: c }) as PlanItem));
    const lb = boughtFromSave({ lines: [l], save: farm({ siloCount: 3 }), start: START, startEgg: 'curiosity' }).lines.get(l.key)!;
    expect([lb.bought, lb.total, lb.auto]).toEqual([2, 4, false]);
  });
});

describe('shifts, the prestige and the set swap: from the save egg and set where it can tell', () => {
  // Curiosity -> Kindness -> Curiosity -> Humility (+ ELR swap).
  const research = (at: number, id: string, level: number) => line('research', [{ kind: 'research', id, level }], at);
  const L = [
    research(T0, 'r1', 1),
    line('shift', [{ kind: 'shift', egg: 'kindness', index: 1 }], T0 + 600),
    research(T0 + 700, 'r2', 1),
    line('shift', [{ kind: 'shift', egg: 'curiosity', index: 2 }], T0 + 1200),
    research(T0 + 1300, 'r3', 1),
    line('shift', [{ kind: 'shift', egg: 'humility', index: 3 }], T0 + 1800),
    line('setSwap', [{ kind: 'setSwap', set: 'elr', after: 3 }], T0 + 1800),
  ];
  const at = (egg: string | null, levels: Record<string, number>, set: SaveFarm['artifactSet'] = 'earnings') =>
    boughtFromSave({ lines: L, save: farm({ egg, artifactSet: set, researchLevels: { comfy_nests: 10, ...levels } }), start: START, startEgg: 'curiosity' });
  const autos = (b: ReturnType<typeof at>) => L.filter(l => l.kind !== 'research').map(l => b.lines.get(l.key)?.auto ?? null);

  it.each<[string, string | null, Record<string, number>, SaveFarm['artifactSet'], (boolean | null)[]]>([
    ['on the start egg, nothing bought: no shift done', 'curiosity', {}, 'earnings', [false, false, false, false]],
    ['on Kindness: the first shift done', 'kindness', { r1: 1 }, 'earnings', [true, false, false, false]],
    ['back on Curiosity after buying past Kindness: two shifts done', 'curiosity', { r1: 1, r2: 1 }, 'earnings', [true, true, false, false]],
    ['on Humility wearing the ELR set: all done', 'humility', { r1: 1, r2: 1, r3: 1 }, 'elr', [true, true, true, true]],
    ['on Humility, earnings set still on: the swap is to do', 'humility', { r1: 1, r2: 1, r3: 1 }, 'earnings', [true, true, true, false]],
    ['on Humility, set not known: the swap is left to the checkbox', 'humility', { r1: 1, r2: 1, r3: 1 }, null, [true, true, true, null]],
    ['on an egg the plan never visits: shifts left to the checkbox', 'resilience', { r1: 1 }, 'earnings', [null, null, null, null]],
    ['egg not known: shifts left to the checkbox', null, {}, 'earnings', [null, null, null, null]],
  ])('%s', (_n, egg, levels, set, want) => {
    expect(autos(at(egg, levels, set))).toEqual(want);
  });

  it('prestige: bought once the save is past it (fresh plan), to do while the save is from before it', () => {
    const anchor = farm({ researchLevels: { comfy_nests: 50, leafsprings: 30 }, siloCount: 4 });
    const fresh: BuildUpStart = { ...START, researchLevels: {}, siloCount: 1 };
    const p = line('prestige', [{ kind: 'prestige', egg: 'curiosity' }]);
    const r = line('research', [{ kind: 'research', id: 'comfy_nests', level: 5 }], T0 + 60);
    const before = boughtFromSave({ lines: [p, r], save: anchor, start: fresh, startEgg: 'curiosity', anchorFarm: anchor });
    expect(before.fit).toBe('beforePrestige');
    expect([before.lines.get(p.key)!.auto, before.lines.get(r.key)!.auto]).toEqual([false, false]);
    const after = boughtFromSave({
      lines: [p, r],
      save: farm({ researchLevels: { comfy_nests: 6 }, siloCount: 1 }),
      start: fresh,
      startEgg: 'curiosity',
      anchorFarm: anchor,
    });
    expect(after.fit).toBe('fits');
    expect([after.lines.get(p.key)!.auto, after.lines.get(r.key)!.auto]).toEqual([true, true]);
  });
});

describe('saveFit: whether the save can tick this plan', () => {
  it.each<[string, SaveFarm | null, BuildUpStart | undefined, SaveFarm | null, string]>([
    ['the plan start itself', farm(), START, farm(), 'fits'],
    ['further on', farm({ siloCount: 3 }), START, farm(), 'fits'],
    ['older than the plan start (a research lower)', farm({ researchLevels: { comfy_nests: 9 } }), START, farm(), 'older'],
    ['a worse hab than the start', farm({ habIds: [null, null, null, null] }), START, farm(), 'older'],
    ['no save', null, START, null, 'unknown'],
    ['no plan start', farm(), undefined, null, 'unknown'],
  ])('%s -> %s', (_n, save, start, anchor, want) => {
    expect(saveFit(save, start, anchor)).toBe(want);
  });
  it('contains: research, silos, habs or better, vehicles or better, train length', () => {
    const a = farm({ vehicles: [{ vehicleId: 11, trainLength: 5 }] });
    expect(contains(a, farm())).toBe(true);
    expect(contains(farm(), a)).toBe(false);
    expect(contains(farm({ vehicles: [{ vehicleId: 11, trainLength: 4 }] }), a)).toBe(false);
  });
  it('older or other-ascension saves tick nothing: every purchase is "to buy"', () => {
    const l = line('research', [{ kind: 'research', id: 'x', level: 1 }]);
    const b = boughtFromSave({ lines: [l], save: farm({ researchLevels: { comfy_nests: 9, x: 5 } }), start: START, startEgg: 'curiosity' });
    expect(b.fit).toBe('older');
    expect(b.lines.get(l.key)!.auto).toBe(false);
  });
  it('no plan start or no save: nothing automatic (the checkbox only)', () => {
    const l = line('research', [{ kind: 'research', id: 'x', level: 1 }]);
    expect(boughtFromSave({ lines: [l], save: null, start: START, startEgg: 'curiosity' }).lines.get(l.key)?.auto ?? null).toBeNull();
  });
});

describe('the fixture plan: a fresh save only ADDS ticks', () => {
  const plan = fixturePlan();
  const r = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: mt(10, 30, 12, 10) });
  const anchor = farm({ researchLevels: { comfy_nests: 50, leafsprings: 30 }, siloCount: 4, habIds: [12, 12, 13, null] });
  const start = plan.start!;
  // Saves through the build-up, each further on than the last.
  const saves: SaveFarm[] = [
    { ...farmOfStart(start), researchLevels: { comfortable_nests: 50, excitable_chickens: 25 } },
    {
      ...farmOfStart(start),
      egg: 'curiosity',
      researchLevels: { comfortable_nests: 50, excitable_chickens: 25, internal_hatchery3: 15, internal_hatchery4: 5, bigger_eggs: 1 },
    },
    {
      ...farmOfStart(start),
      egg: 'kindness',
      researchLevels: { comfortable_nests: 50, excitable_chickens: 25, internal_hatchery3: 15, internal_hatchery4: 5, bigger_eggs: 1, grav_plating: 18, autonomous_vehicles: 2, crystalline_shelling: 84, telepathic_will: 11 },
      vehicles: Array.from({ length: 14 }, () => ({ vehicleId: 11, trainLength: 5 })),
    },
  ];
  const ticks = saves.map(s => boughtFromSave({ lines: r.lines, save: s, start, startEgg: 'curiosity', anchorFarm: anchor }).ticks);
  it('each newer save keeps every tick of the one before and adds some', () => {
    for (let i = 1; i < ticks.length; i++) {
      for (const k of ticks[i - 1]) expect(ticks[i].has(k)).toBe(true);
      expect(ticks[i].size).toBeGreaterThan(ticks[i - 1].size);
    }
  });
  it('the third save: the prestige, the first buys, the Kindness shift and 14 trains are bought', () => {
    const b = boughtFromSave({ lines: r.lines, save: saves[2], start, startEgg: 'curiosity', anchorFarm: anchor });
    const text = (k: string) => r.lines.find(l => l.key === k)!.kind;
    expect([...b.ticks].map(text)).toEqual(expect.arrayContaining(['prestige', 'research', 'shift', 'trains']));
    const trains = r.lines.filter(l => l.kind === 'trains');
    expect(b.lines.get(trains[0].key)!.auto).toBe(true);
    // Slots 15-16 not yet: that line is to buy.
    expect(b.lines.get(trains[1].key)!.bought).toBe(0);
  });
  it('the silo trick, back-online, events and waits are never automatic', () => {
    const b = boughtFromSave({ lines: r.lines, save: saves[2], start, startEgg: 'curiosity', anchorFarm: anchor });
    for (const l of r.lines.filter(x => ['siloTrick', 'back', 'saleStart', 'saleEnd', 'saleWait', 'warning', 'note'].includes(x.kind)))
      expect(b.lines.get(l.key)?.auto ?? null).toBeNull();
  });
});

describe('effectiveTicks: the player\'s override beats the save, both ways; clearing goes back to the save', () => {
  const auto = new Map<string, boolean | null>([
    ['a', true],
    ['b', false],
    ['c', null],
  ]);
  it.each<[string, string[], string[], string[], Record<string, string>]>([
    ['save only', [], [], ['a'], { a: 'save' }],
    ['ticked by you where the save says to buy', ['b'], [], ['a', 'b'], { a: 'save', b: 'you' }],
    ['unticked by you where the save says bought', [], ['a'], [], { a: 'you' }],
    ['a manual-only line', ['c'], [], ['a', 'c'], { a: 'save', c: 'you' }],
  ])('%s', (_n, on, off, want, source) => {
    const e = effectiveTicks(auto, new Set(on), new Set(off));
    expect([...e.ticked].sort()).toEqual(want);
    expect(Object.fromEntries(e.source)).toEqual(source);
  });
});

describe('carryTicks: a re-plan keeps the overrides of lines that still exist', () => {
  it('matches by line key, drops the orphans', () => {
    expect(carryTicks({ on: new Set(['1:0', '2:0']), off: new Set(['3:1', '9:9']) }, ['1:0', '3:1', '4:0'])).toEqual({
      on: new Set(['1:0']),
      off: new Set(['3:1']),
      dropped: 2,
    });
  });
});

describe('off-plan and behind: when Re-plan shows', () => {
  const S0: BuildUpStart = { ...START, researchLevels: { comfy_nests: 10, a: 0 } };
  const L = [
    line('research', [{ kind: 'research', id: 'a', level: 5 }], T0, ['A 5']),
    line('research', [{ kind: 'research', id: 'a', level: 9 }], T0 + 3 * 3600, ['A 6-9']),
    line('hab', [{ kind: 'hab', slot: 0, habId: 4 }], T0 + 4 * 3600),
    line('silo', [{ kind: 'silo', count: 2 }], T0 + 5 * 3600),
  ];
  const args = (save: SaveFarm, saveSeconds: number) => ({ lines: L, save, start: S0, startEgg: 'curiosity', saveSeconds, anchorSeconds: T0 - 600 });

  it.each<[string, Partial<SaveFarm>, number, boolean, string[]]>([
    ['on plan, on time', { researchLevels: { comfy_nests: 10, a: 5 } }, T0 + 1800, false, []],
    ['bought before its check-in is due (A 9 at 9:30 am, planned 12:00 pm)', { researchLevels: { comfy_nests: 10, a: 9 } }, T0 + 1800, true, ['early research a 9']],
    ['inside the grace: not off-plan', { researchLevels: { comfy_nests: 10, a: 9 } }, T0 + 3 * 3600 - OFF_PLAN_GRACE + 1, false, []],
    ['research the plan never buys', { researchLevels: { comfy_nests: 11, a: 5 } }, T0 + 1800, true, ['never research comfy_nests 11']],
    ['a better hab than the plan ever buys', { researchLevels: { comfy_nests: 10, a: 9 }, habIds: [5, null, null, null] }, T0 + 4 * 3600, true, ['never hab 0 5']],
    ['more silos than the plan', { researchLevels: { comfy_nests: 10, a: 9 }, habIds: [4, null, null, null], siloCount: 3 }, T0 + 6 * 3600, true, ['never silo 3']],
    ['a vehicle the plan never buys', { researchLevels: { comfy_nests: 10, a: 5 }, vehicles: [{ vehicleId: 3, trainLength: 1 }] }, T0 + 60, true, ['never vehicle 0 3']],
  ])('%s', (_n, over, saveSeconds, show, want) => {
    const o = replanOffer(args(farm(over), saveSeconds));
    expect(o.offPlan.map(x => `${x.why} ${x.kind} ${x.what}`)).toEqual(want);
    expect(o.show).toBe(show);
  });

  it('behind: over 1 h past the first line the save has not bought', () => {
    const save = farm({ researchLevels: { comfy_nests: 10, a: 5 } });
    expect(replanOffer(args(save, T0 + 3 * 3600 + REPLAN_BEHIND)).show).toBe(false);
    const o = replanOffer(args(save, T0 + 3 * 3600 + REPLAN_BEHIND + 60));
    expect(o.show).toBe(true);
    expect(o.behind).toBe(REPLAN_BEHIND + 60);
  });
  it('the anchor save itself never offers it', () => {
    const save = farm({ researchLevels: { comfy_nests: 11 } });
    expect(replanOffer({ ...args(save, T0 - 600), saveSeconds: T0 - 600 }).show).toBe(false);
  });
  it('offPlan lists nothing for a save that does not fit the plan', () => {
    expect(offPlan({ lines: L, save: farm({ researchLevels: { comfy_nests: 9, a: 50 } }), start: S0, saveSeconds: T0 })).toEqual([]);
  });
});
