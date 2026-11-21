/**
 * Weekly hours (R10, 21 Nov 2026) on the two paths that hand a player exact times: "Simulate this route" and Follow /
 * My Runs. Does `Availability.blocked` reach the simulation on each, and does what comes back fit the week?
 *
 * The week is "split": free 6-8 AM and 5-10 PM every day in America/Denver, everything else blocked. Its daily window
 * (6 AM-10 PM) is carried beside it, so a path that read the window instead of the mask would come back different.
 *
 * (a) The chain evaluator (search/chain.ts, the one both the searches and My Runs' simulation use): legs are synthetic
 *     (as chain.hours.spec.ts), but each leg's shifts go through the REAL `legContext` hook (search/leg.ts), which is
 *     what the simulator's `holdUntil` is. Every shift and every prestige lands in a free hour, and the route is not
 *     the one with no hours nor the one with the window alone.
 * (b) Simulate this route (search/simulateRoute.ts -> store `applyChain` -> Single run's generator): the route goes to
 *     Single run, whose generator (auto/useAscensionGenerator.ts) never takes the hours. These FAIL: the mask (and the
 *     daily window with it) does not survive the trip.
 * (c) Follow / My Runs (composables/useNowPage.ts `simRequest` -> composables/useCurrentSim.ts -> search/pool.ts): the
 *     store's `collectInputs` carries the mask, the worker copy keeps it, and the kept record's key tells two masks
 *     apart. The followed route's `hours` (lib/followCloud.ts `hoursOf`, the "set with other hours" check) keeps only
 *     the window: that one FAILS.
 */
import '../../scripts/node-shims';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { SearchInputs } from './types';

/** Seconds from the leg's (held) start to each shift, then from the last shift to the leg's end. */
const SHIFT_GAPS = [2 * 3600, 2 * 3600, 2 * 3600];
const TAIL = 4 * 3600;
const starts: number[] = [];

vi.mock('./leg', async () => {
  const actual = await vi.importActual<typeof import('./leg')>('./leg');
  return {
    ...actual,
    runLeg: (inputs: SearchInputs, state: object, start: number, target: number) => {
      starts.push(start);
      // The simulator's own hook for this leg (auto/hold.ts reads `context.holdUntil`).
      const hold = actual.legContext(inputs, start).holdUntil ?? ((t: number) => t);
      const shifts: { at: number; egg: string }[] = [];
      let t = start;
      let held = 0;
      for (const gap of SHIFT_GAPS) {
        const raw = t + gap;
        t = hold(raw);
        held += t - raw;
        shifts.push({ at: t, egg: shifts.length % 2 ? 'kindness' : 'curiosity' });
      }
      const end = t + TAIL;
      return {
        summary: {
          startTime: start,
          endTime: end,
          totalDurationSeconds: end - start,
          endTE: target,
          maxELR: 1e12,
          tier13Unlocked: false,
          buildPhaseEndTime: start,
          buildPhaseSaleCount: 1,
        },
        key: '1-sale',
        nextState: { ...state, eggsDelivered: { humility: 0 }, teEarned: { humility: 0 }, te: target },
        shifts,
        heldSeconds: held,
        lastEgg: 'humility',
      };
    },
  };
});

import { createChainEvaluator } from './chain';
import { isAvailable, type Availability } from './availability';
import { maskOfWindow, weekIndex } from './availabilitySchedule';
import { workerCopy } from './workerCopy';
import { inputsForWorkers } from './workerBackup';
import { simSetupKey } from '@/lib/followSim';
import { buildCloudValue, hoursOf, sameHours } from '@/lib/followCloud';

const TZ = 'America/Denver';
const FREE = [6, 7, 17, 18, 19, 20, 21];
/** "split": free 6-8 AM and 5-10 PM every day, everything else blocked. */
const SPLIT_BLOCKED = [0, 1, 2, 3, 4, 5, 6].flatMap(d =>
  Array.from({ length: 24 }, (_, h) => h).filter(h => !FREE.includes(h)).map(h => weekIndex(d, h))
).sort((a, b) => a - b);
/** Its daily window, carried beside the mask (what an older reader would see). */
const WINDOW: Availability = { days: [], fromHour: 6, toHour: 22, timezone: TZ };
const SPLIT: Availability = { ...WINDOW, blocked: SPLIT_BLOCKED };

// Wednesday 6 Jan 2027, 7:00 AM MST (UTC-7): a free hour.
const PLAN_START = Date.parse('2027-01-06T14:00:00Z') / 1000;
const inputs = (over: Partial<SearchInputs>) =>
  ({
    baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 190 },
    planStart: PLAN_START,
    currentTE: 190,
    final: 490,
    timeOff: [],
    milestones: [],
    ...over,
  }) as unknown as SearchInputs;

const ROUTE = [220, 490];
function evaluate(over: Partial<SearchInputs>) {
  starts.length = 0;
  const r = createChainEvaluator(inputs(over)).evaluate(ROUTE)!;
  return { r, starts: [...starts] };
}

describe('(a) the chain evaluator reads the mask: every shift and prestige in a free hour', () => {
  it('the mask is not its own window: 9 AM and 1 PM are inside the window and blocked by the mask', () => {
    for (const iso of ['2027-01-06T16:00:00Z', '2027-01-06T20:00:00Z']) {
      const t = Date.parse(iso) / 1000;
      expect(isAvailable(t, WINDOW)).toBe(true);
      expect(isAvailable(t, SPLIT)).toBe(false);
    }
    expect(SPLIT_BLOCKED.length).toBe(168 - 7 * FREE.length);
    expect(SPLIT_BLOCKED).not.toEqual(maskOfWindow([], 6, 22));
  });

  it('with held shifts: every shift instant and every prestige instant is free', () => {
    const { r, starts: s } = evaluate({ availability: SPLIT, deferShifts: true });
    expect(r.legs.length).toBe(2);
    for (const leg of r.legs) for (const sh of leg.shifts ?? []) expect(isAvailable(sh.at, SPLIT)).toBe(true);
    const first = r.legs[0]!;
    // The prestige between the two ascensions: the second starts when the player is back.
    const prestige = first.endTime + (first.sleepDelaySeconds ?? 0);
    expect(isAvailable(prestige, SPLIT)).toBe(true);
    expect(s[1]).toBe(prestige);
    expect(r.legs[0].sleepDelaySeconds).toBeGreaterThan(0);
    expect(r.legs[0].shiftDelaySeconds).toBeGreaterThan(0);
    expect(r.legs.every(l => l.nightShifts === 0)).toBe(true);
  });

  it('differs from the same route with no hours, and from the window alone', () => {
    const masked = evaluate({ availability: SPLIT, deferShifts: true });
    const none = evaluate({ availability: null, deferShifts: true });
    const window = evaluate({ availability: WINDOW, deferShifts: true });
    expect(masked.r.seconds).toBeGreaterThan(none.r.seconds);
    expect(masked.r.seconds).not.toBe(window.r.seconds);
    expect((masked.r.legs[0]!.shifts ?? []).map(x => x.at)).not.toEqual((window.r.legs[0]!.shifts ?? []).map(x => x.at));
    // Without held shifts the prestige still waits for the mask, and the night shifts are counted against it.
    const prestigeOnly = evaluate({ availability: SPLIT, deferShifts: false });
    const p = prestigeOnly.r.legs[0]!;
    expect(isAvailable(p.endTime + (p.sleepDelaySeconds ?? 0), SPLIT)).toBe(true);
    expect(p.nightShifts).toBeGreaterThan(0);
  });
});

describe('the store hands the mask on', () => {
  let mods: {
    chain: typeof import('@/stores/chainSearch');
    planner: typeof import('@/stores/autoPlanner');
    simulate: typeof import('./simulateRoute');
  };
  beforeAll(async () => {
    mods = {
      chain: await import('@/stores/chainSearch'),
      planner: await import('@/stores/autoPlanner'),
      simulate: await import('./simulateRoute'),
    };
  }, 120_000);
  function stores() {
    setActivePinia(createPinia());
    const planner = mods.planner.useAutoPlannerStore();
    planner.timezone = TZ;
    const store = mods.chain.useChainSearchStore();
    store.scheduleEnabled = true;
    store.availableFrom = 6;
    store.availableTo = 22;
    store.availableDays = [0, 1, 2, 3, 4, 5, 6];
    store.weekBlocked = SPLIT_BLOCKED;
    store.deferShifts = true;
    return { store, planner };
  }

  it("the store's availability carries the mask", () => {
    const { store } = stores();
    expect(store.availability?.blocked).toEqual(SPLIT_BLOCKED);
    expect(store.availability?.timezone).toBe(TZ);
  });

  describe('(b) Simulate this route', () => {
    // A KNOWN LIMIT, pinned so no words claim otherwise (21 Nov 2026, before R10 too, for any hours): simulateRoute
    // (search/simulateRoute.ts:35) calls store.applyChain, which hands Single run the targets, the start and the
    // time-off cuts and no hours; Single run's generator never sets `holdUntil` (auto/hold.ts). So "Simulate this route"
    // times assume the player is always there. Changing that is a change to Joo's Single run (src/auto): the
    // maintainer's call. When it changes, flip these two.
    it('the route handed to Single run carries no hours (Simulate this route ignores them)', () => {
      const { planner } = stores();
      mods.simulate.simulateRoute([220, 490], 'fastest', { start: PLAN_START });
      expect(planner.targetTE).toBe('220 490');
      expect(JSON.stringify(planner.$state).includes(JSON.stringify(SPLIT_BLOCKED))).toBe(false);
    });

    it("Single run's generator does not wait for the player's hours (never sets the simulator's holdUntil)", () => {
      const src = readFileSync(join(process.cwd(), 'src/auto/useAscensionGenerator.ts'), 'utf8');
      expect(/holdUntil/.test(src)).toBe(false);
    });
  });

  describe('(c) Follow / My Runs', () => {
    it("the simulation's inputs (collectInputs, as useNowPage simRequest builds them) keep the mask", () => {
      const { store } = stores();
      let i: SearchInputs;
      try {
        i = store.collectInputs();
      } catch {
        // No save loaded here: the hours part is all this checks.
        i = inputs({ availability: store.availability, deferShifts: store.deferShifts });
      }
      expect(i.availability?.blocked).toEqual(SPLIT_BLOCKED);
      // useNowPage simRequest: `{ ...i, ...carryOn, ...fastest, milestones: [] }` with the hours in use.
      const req = { ...i, milestones: [] } as SearchInputs;
      // search/pool.ts: what every worker's init message carries, then the structured clone postMessage makes.
      const sent = structuredClone(workerCopy(inputsForWorkers(req)));
      expect(sent.availability?.blocked).toEqual(SPLIT_BLOCKED);
      expect(sent.availability?.timezone).toBe(TZ);
      expect(sent.deferShifts).toBe(true);
      // And the worker prices with it: the same answer as (a).
      starts.length = 0;
      const there = createChainEvaluator(inputs({ availability: sent.availability, deferShifts: true })).evaluate(ROUTE)!;
      expect(there.seconds).toBe(evaluate({ availability: SPLIT, deferShifts: true }).r.seconds);
    });

    it("the kept simulation's key (lib/followSim.ts simSetupKey) tells two masks with one window apart", () => {
      const base = { useHours: true, timeOff: [], noPrestige: [], firstAscension: 'auto', deferShifts: true };
      const other: Availability = { ...WINDOW, blocked: maskOfWindow([], 6, 22) };
      expect(simSetupKey({ ...base, availability: SPLIT })).not.toBe(simSetupKey({ ...base, availability: other }));
      expect(simSetupKey({ ...base, availability: SPLIT })).not.toBe(simSetupKey({ ...base, availability: WINDOW }));
    });

    // The follow record's `hours` keeps the week (lib/followCloud.ts CloudHours.week) in this browser only: the collector
    // has no field for it, so a route read back from online carries none and says nothing about the week.
    it("the followed route's hours tell two masks with one window apart", () => {
      const other: Availability = { ...WINDOW, blocked: maskOfWindow([], 6, 22) };
      expect(sameHours(hoursOf(SPLIT), hoursOf(other))).toBe(false);
      expect(sameHours(hoursOf(SPLIT), hoursOf({ ...SPLIT }))).toBe(true);
    });

    it("the week is never sent to the collector, and a route with no week (read back from online) reads as the same", () => {
      const f = { chain: [0, 100], from: 'saved', at: Date.now(), source: 'fast', planStart: Math.floor(Date.now() / 1000), hours: hoursOf(SPLIT) } as never;
      expect(JSON.stringify(buildCloudValue(f)?.value.hours)).not.toContain('week');
      const { week: _w, ...noWeek } = hoursOf(SPLIT)!;
      expect(sameHours(noWeek, hoursOf(SPLIT))).toBe(true);
      expect(sameHours(noWeek, hoursOf({ ...WINDOW, blocked: maskOfWindow([], 6, 22) }))).toBe(true);
    });
  });
});
