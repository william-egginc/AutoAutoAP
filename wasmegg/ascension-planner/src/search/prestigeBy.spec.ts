import { describe, expect, it } from 'vitest';
import { canonicalDelivered, lastWaitEgg, pacificHourOfWeek, type BuildParams } from './precomputedLeg';
import { findRoutes, polishFound, type BuildLookup, type FirstLeg, type FoundRoutes, type Route } from './routeFinder';
import { getNextSaleEnd } from '@/lib/events';
import {
  candidatesOf,
  describeCutoff,
  eggsAfter,
  estimateAt,
  estimateProfile,
  findCutoff,
  hourOf,
  keeps,
  layingAfterFirstLeg,
  outcomeOf,
  prestigePlan,
  recordOfCutoff,
  splitHours,
  startOf,
  stretchEnd,
  teOfEggs,
  type Cutoff,
  type LineContext,
  type Outcome,
} from './prestigeBy';

const HOUR = 3600;
// Fri 27 Nov 2026, 2:40 am MST.
const P = Date.parse('2026-11-27T09:40:00Z') / 1000;
const DEADLINE = Date.parse('2027-07-14T16:00:00Z') / 1000;

/** A profile by hour: TE `te(h)`, landing `spare(h)` hours before the deadline. */
function profileOf(n: number, te: (h: number) => number, spare = (_h: number) => 10): Outcome[] {
  return Array.from({ length: n }, (_, h) => ({ te: te(h), end: DEADLINE - spare(h) * HOUR }));
}

/** A cutoff run on fake estimate and finder profiles; the finder's at an hour is `exact[h]`. */
async function cutoffOn(o: {
  hours: number;
  estimate: Outcome[];
  exact?: Outcome[];
  /** The estimate once the finder's routes from these hours are added (default: unchanged). */
  learned?: (looked: number[]) => Outcome[];
  maxLookups?: number;
  mode?: 'date' | 'fastest';
  keep?: Outcome;
}): Promise<Cutoff & { asked: number[] }> {
  const asked: number[] = [];
  const exact = o.exact ?? o.estimate;
  const cut = await findCutoff({
    mode: o.mode ?? 'date',
    keep: o.keep ?? o.estimate[0],
    hours: o.hours,
    maxLookups: o.maxLookups,
    profile: (extra, from) => {
      const prof = extra.length && o.learned ? o.learned(extra.map(c => c[0])) : o.estimate;
      return prof.slice(from, o.hours + 1);
    },
    exact: async h => {
      asked.push(h);
      // The finder's routes, labelled by the hour they were found at.
      return { outcome: exact[h], chains: [[h]] };
    },
  });
  return { ...cut, asked };
}

describe('findCutoff (the first hour a later prestige gets less)', () => {
  it('finds the edge of a steady fall and confirms it and the hour before with the finder', async () => {
    const est = profileOf(
      193,
      h => (h <= 12 ? 248 : h <= 40 ? 247 : 246),
      h => (h <= 12 ? 16 - h : 40)
    );
    const cut = await cutoffOn({ hours: 192, estimate: est });
    expect(cut.kind).toBe('drop');
    expect(cut.lastKeep).toBe(12);
    expect(cut.drop).toBe(13);
    expect(cut.dropOutcome?.te).toBe(247);
    expect(cut.asked.slice(0, 2)).toEqual([13, 12]);
    expect(cut.lookups).toBeGreaterThanOrEqual(2);
    expect(cut.lookups).toBeLessThanOrEqual(7);
    // The 247 stretch, to its end.
    expect(cut.next?.until).toBe(40);
    expect(cut.next?.then.te).toBe(246);
  });

  it('a later prestige never keeps more than the hours that keep it: spare is the last keeping hour’s', async () => {
    const est = profileOf(
      50,
      h => (h <= 5 ? 248 : 247),
      h => 20 - h * 3
    );
    const cut = await cutoffOn({ hours: 49, estimate: est });
    expect(cut.lastKeep).toBe(5);
    expect(DEADLINE - cut.lastKeepOutcome!.end!).toBe(5 * HOUR);
  });

  it('walks on when the finder keeps the TE where the estimate dropped (the estimate is pessimistic)', async () => {
    const est = profileOf(100, h => (h <= 7 ? 248 : 247));
    const exact = profileOf(100, h => (h <= 12 ? 248 : 247));
    const cut = await cutoffOn({
      hours: 99,
      estimate: est,
      exact,
      // With the finder's route from hour 8, the estimate keeps 248 as long as the finder does.
      learned: () => exact,
    });
    expect(cut.estimateDrop).toBe(8);
    expect(cut.asked[0]).toBe(8);
    expect(cut.lastKeep).toBe(12);
    expect(cut.drop).toBe(13);
    expect(cut.kind).toBe('drop');
  });

  it('never offers a one-hour fluke after the drop as a window', async () => {
    // 248 to 3 pm (+12), 247 at 4 pm, 248 again at 5 pm only (the alt's frozen timeline), then 247.
    const est = profileOf(80, h => (h <= 12 || h === 14 || h === 18 ? 248 : 247));
    const cut = await cutoffOn({ hours: 79, estimate: est });
    expect(cut.lastKeep).toBe(12);
    expect(cut.drop).toBe(13);
    expect(cut.next).toBeNull();
  });

  it('skips one-hour dips inside the stretch after the drop', async () => {
    // 247 from +13 with a single 246 hour at +20 (the alt's Sun 2 am), lasting 246 from +46.
    const est = profileOf(100, h => (h <= 12 ? 248 : h === 20 ? 246 : h < 46 ? 247 : 246));
    const cut = await cutoffOn({ hours: 99, estimate: est });
    expect(cut.drop).toBe(13);
    expect(cut.next?.until).toBe(45);
    expect(cut.next?.then.te).toBe(246);
  });

  it('a confirmed one-hour hole before the edge is the drop (cautious: prestige before it)', async () => {
    const est = profileOf(60, h => (h === 6 || h > 30 ? 247 : 248));
    const cut = await cutoffOn({ hours: 59, estimate: est });
    expect(cut.lastKeep).toBe(5);
    expect(cut.drop).toBe(6);
  });

  it('says none when the answer holds through the horizon', async () => {
    const cut = await cutoffOn({ hours: 48, estimate: profileOf(49, () => 248) });
    expect(cut.kind).toBe('none');
    expect(cut.lookups).toBe(0);
    expect(cut.lastKeep).toBe(48);
  });

  it('says unsure when the lookups run out before a drop is confirmed', async () => {
    // The estimate drops every hour from +3; the finder keeps it everywhere (and teaches it nothing).
    const est = profileOf(40, h => (h < 3 ? 248 : 247));
    const exact = profileOf(40, () => 248);
    const cut = await cutoffOn({ hours: 39, estimate: est, exact, maxLookups: 4 });
    expect(cut.kind).toBe('unsure');
    expect(cut.lookups).toBe(4);
    expect(cut.asked).toEqual([3, 4, 5, 6]);
    expect(cut.lastKeep).toBe(6);
    expect(cut.drop).toBeNull();
  });

  it('fastest route: a slip of more than the slack is the drop, a few minutes is not', async () => {
    const E = DEADLINE;
    const est: Outcome[] = Array.from({ length: 30 }, (_, h) => ({
      te: 490,
      end: h <= 9 ? E + h * 120 : E + 7 * 86400,
    }));
    const cut = await cutoffOn({ hours: 29, estimate: est, mode: 'fastest', keep: { te: 490, end: E } });
    expect(cut.lastKeep).toBe(9);
    expect(cut.drop).toBe(10);
    expect(cut.next).toBeNull();
  });
});

describe('keeps and stretchEnd', () => {
  it('By a date keeps the TE or more; Fastest keeps within the slack', () => {
    expect(keeps('date', { te: 248, end: 1 }, { te: 248, end: 5 })).toBe(true);
    expect(keeps('date', { te: 248, end: 1 }, { te: 247, end: 0 })).toBe(false);
    expect(keeps('date', { te: 248, end: 1 }, null)).toBe(false);
    expect(keeps('fastest', { te: 490, end: 0 }, { te: 490, end: 3600 })).toBe(true);
    expect(keeps('fastest', { te: 490, end: 0 }, { te: 490, end: 3601 })).toBe(false);
    expect(keeps('fastest', { te: 490, end: 0 }, { te: 0, end: null })).toBe(false);
  });
  it('ends a stretch at the first two-hour fall', () => {
    const p = profileOf(20, h => (h === 4 || h >= 9 ? 246 : 247));
    expect(stretchEnd('date', { te: 247, end: 0 }, h => p[h], 1, 20)).toEqual({ until: 8, then: p[9] });
    expect(stretchEnd('date', { te: 247, end: 0 }, h => p[h], 1, 9)).toBeNull();
  });
});

describe('describeCutoff (the display rules)', () => {
  const show = (u: number) => new Date(u * 1000).toISOString().slice(5, 16).replace('T', ' ');
  const base: LineContext = {
    mode: 'date',
    prestigeAt: P,
    fresh: false,
    firstStop: 161,
    now: P - 3 * 86400,
    deadline: DEADLINE,
    final: 490,
    show,
  };
  const drop = (lastKeep: number, spareH: number, next: Cutoff['next'] = null): Cutoff => ({
    kind: 'drop',
    keep: { te: 248, end: DEADLINE - 16 * HOUR },
    lastKeep,
    lastKeepOutcome: { te: 248, end: DEADLINE - spareH * HOUR },
    drop: lastKeep + 1,
    dropOutcome: { te: 247, end: DEADLINE - 47 * HOUR },
    next,
    estimateDrop: lastKeep + 1,
    lookups: 2,
    looked: [],
  });

  it('names a whole hour one before the last keeping start, and what comes after', () => {
    const line = describeCutoff(drop(12, 5.6, { until: 60, then: { te: 246, end: DEADLINE - 40 * HOUR } }), base);
    expect(line.show).toBe(true);
    expect(line.latestHour).toBe(hourOf(P, 12));
    expect(line.latestHour).toBe(Date.parse('2026-11-27T22:00:00Z') / 1000); // 3 pm MST
    expect(line.byHour).toBe(line.latestHour - HOUR);
    expect(line.text).toBe(
      `Prestige by ${show(line.byHour)} to keep 248 TE (${show(line.latestHour)} at the latest, on the hour). ` +
        `After that: 247 (until about ${show(hourOf(P, 60))}), then 246.`
    );
  });

  it('is tight under 12 h of spare at the latest start, not at 12 h or more', () => {
    expect(describeCutoff(drop(12, 5.6), base).tight).toBe(true);
    expect(describeCutoff(drop(12, 11.9), base).tight).toBe(true);
    expect(describeCutoff(drop(12, 12), base).tight).toBe(false);
    expect(describeCutoff(drop(12, 30), base).spareSeconds).toBe(30 * HOUR);
  });

  it('shows when the next prestige is within ~7 days, or the window is under ~48 h', () => {
    const far = { ...base, now: P - 30 * 86400 };
    // 30 days off with a 13-hour window: shown (narrow).
    expect(describeCutoff(drop(12, 6), far).show).toBe(true);
    // 30 days off with a 4-day window: not yet.
    expect(describeCutoff(drop(96, 6), far).show).toBe(false);
    // 3 days off with the same 4-day window: shown.
    expect(describeCutoff(drop(96, 6), base).show).toBe(true);
    // Just inside and outside both lines.
    expect(describeCutoff(drop(96, 6), { ...base, now: P - 7 * 86400 }).show).toBe(true);
    expect(describeCutoff(drop(96, 6), { ...base, now: P - 7 * 86400 - 1 }).show).toBe(false);
    expect(describeCutoff(drop(47, 6), far).show).toBe(true); // window 47 h 20 m
    expect(describeCutoff(drop(48, 6), far).show).toBe(false); // window 48 h 20 m
  });

  it('is not shown when nothing changes within the horizon', () => {
    const none: Cutoff = { ...drop(192, 20), kind: 'none', drop: null, dropOutcome: null };
    expect(describeCutoff(none, base).show).toBe(false);
  });

  it('says prestige right away when even the next hour is the last that keeps it', () => {
    const line = describeCutoff(drop(0, 15), base);
    expect(line.text.startsWith('Prestige as soon as you reach 161 TE to keep 248 TE')).toBe(true);
    const fresh = describeCutoff(drop(0, 15), { ...base, fresh: true });
    expect(fresh.text.startsWith('Prestige now to keep 248 TE')).toBe(true);
  });

  it('says "to be sure of" when the lookups ran out', () => {
    const unsure: Cutoff = { ...drop(20, 8), kind: 'unsure', drop: null, dropOutcome: null };
    const line = describeCutoff(unsure, base);
    expect(line.show).toBe(true);
    expect(line.text).toContain('to be sure of 248 TE');
    expect(line.text).not.toContain('After that');
  });

  it('Fastest: the date it still reaches, and how much later after that', () => {
    const E = DEADLINE;
    const c: Cutoff = {
      ...drop(5, 0),
      keep: { te: 490, end: E },
      lastKeepOutcome: { te: 490, end: E },
      dropOutcome: { te: 490, end: E + 7 * 86400 },
    };
    const line = describeCutoff(c, { ...base, mode: 'fastest', deadline: undefined });
    expect(line.text).toBe(
      `Prestige by ${show(hourOf(P, 5) - HOUR)} to still reach 490 TE on ${show(E)} (${show(hourOf(P, 5))} at the latest, on the hour). ` +
        `After that: ${show(E + 7 * 86400)} (7.0 days later).`
    );
    expect(line.tight).toBe(false);
  });

  it('keeps a prediction record that matches the line', () => {
    const c = drop(12, 5.6, { until: 60, then: { te: 246, end: DEADLINE } });
    const line = describeCutoff(c, base);
    const rec = recordOfCutoff(c, line, base, 'silo');
    expect(rec).toMatchObject({
      v: 1,
      mode: 'date',
      eggs: 'silo',
      keepTE: 248,
      kind: 'drop',
      latest: line.latestHour,
      drop: hourOf(P, 13),
      dropTE: 247,
      until: hourOf(P, 60),
      thenTE: 246,
      spareHours: 5.6,
      tight: true,
      shown: true,
      lookups: 2,
    });
    expect(JSON.stringify(rec).length).toBeLessThan(600);
  });
});

describe('the waiting farm and the hours', () => {
  it('lays on its egg for at most the silo time', () => {
    const laying = { egg: 1, rate: 1e12, capSeconds: 10 * HOUR };
    expect(eggsAfter([1, 2, 3, 4, 5], null, 99999)).toEqual([1, 2, 3, 4, 5]);
    expect(eggsAfter([0, 0, 0, 0, 0], laying, 5 * HOUR)[1]).toBe(1e12 * 5 * HOUR);
    expect(eggsAfter([0, 0, 0, 0, 0], laying, 50 * HOUR)[1]).toBe(1e12 * 10 * HOUR);
    expect(eggsAfter([0, 0, 0, 0, 0], laying, -5)[1]).toBe(0);
  });
  it('counts the TE eggs carry', () => {
    expect(teOfEggs(canonicalDelivered(150))).toBe(150);
  });
  it('starts right away, then on each whole hour after the next', () => {
    expect(startOf(P, 0)).toBe(P);
    expect(startOf(P, 1)).toBe(Date.parse('2026-11-27T11:00:00Z') / 1000);
    expect(hourOf(P, 0)).toBe(Date.parse('2026-11-27T10:00:00Z') / 1000);
    const onHour = Date.parse('2026-11-27T10:00:00Z') / 1000;
    expect(startOf(onHour, 1)).toBe(onHour + HOUR);
  });
  it('splits the hours among workers, in order and whole', () => {
    expect(splitHours(0, 192, 4)).toEqual([
      [0, 48],
      [49, 96],
      [97, 144],
      [145, 192],
    ]);
    expect(splitHours(5, 6, 4)).toEqual([
      [5, 5],
      [6, 6],
    ]);
  });
  it('reads the farm a first ascension leaves laying: its own egg and rate, else the next checkpoint’s', () => {
    const a: FirstLeg = {
      to: 161,
      endTE: 161,
      end: P,
      delivered: [1e18, 2e18, 0, 0, 0],
      label: 'buildup',
      egg: 3,
      peakELR: 8e11,
    };
    expect(layingAfterFirstLeg([a], 161, 86400)).toEqual({ egg: 3, rate: 8e11, capSeconds: 86400 });
    const plain = { ...a, egg: undefined, peakELR: undefined };
    const b: FirstLeg = {
      to: 162,
      endTE: 162,
      end: P + 1000,
      delivered: [1e18, 2e18 + 5e14, 1e14, 0, 0],
      label: 'buildup',
    };
    expect(layingAfterFirstLeg([plain, b], 161, 86400)).toEqual({ egg: 1, rate: 6e14 / 1000, capSeconds: 86400 });
    expect(layingAfterFirstLeg([plain], 161, 86400)).toBeNull();
  });
  it('the farm ends on the last egg the waits raised (kindness when none)', () => {
    expect(lastWaitEgg([0, 0, 0, 0, 0], [0, 5, 0, 0, 0])).toBe(1);
    expect(lastWaitEgg([0, 0, 0, 0, 0], [5, 5, 0, 7, 0])).toBe(3);
    expect(lastWaitEgg([1, 1, 1, 1, 1], [1, 1, 1, 1, 1])).toBe(1);
  });
});

// A synthetic table, as in routeFinder.polish.spec.ts.
const START = Date.parse('2027-01-04T17:00:00Z') / 1000;
const FROM = 100;
const FINAL = 130;
const table: BuildLookup = (te, hour) => {
  if (te < FROM || te > FINAL) return null;
  const cellStart = START + ((hour - pacificHourOfWeek(START) + 168) % 168) * 3600;
  const b: BuildParams = {
    sales: 1,
    tier13: false,
    waitStart: 3600 * (2 + (te % 7) + (hour % 5)),
    saleEnd: getNextSaleEnd(cellStart) - cellStart,
    peakELR: 2e12 * (1 + (te - FROM) / 5),
    delivered: canonicalDelivered(te),
  };
  return [b];
};

describe('the estimate on a table', () => {
  const deadline = START + 10 * 86400;
  async function found(start: number, startTE = FROM): Promise<FoundRoutes> {
    const f = await findRoutes({ table, startTE, start, final: FINAL, maxAscensions: 6, deadline });
    return { ...f, ...polishFound(table, { startTE, start, deadline }, f) };
  }

  it('right away, prices the finder’s own answer exactly', async () => {
    const f = await found(START);
    const req = {
      mode: 'date' as const,
      prestigeAt: START,
      startTE: FROM,
      delivered: canonicalDelivered(FROM),
      laying: null,
      final: FINAL,
      deadline,
      deliveryScale: 1,
      candidates: candidatesOf(f, 'date', true),
      hours: 0,
    };
    const est = estimateAt(table, req, 0);
    const want = outcomeOf(f, 'date', FROM, FINAL);
    expect(want.te).toBeLessThan(FINAL);
    expect(est.te).toBeGreaterThanOrEqual(want.te);
    if (est.te === want.te) expect(est.end).toBeLessThanOrEqual(want.end!);
  });

  it('is never above what the finder finds at the same hour (frozen eggs)', async () => {
    const f0 = await found(START);
    const req = {
      mode: 'date' as const,
      prestigeAt: START,
      startTE: FROM,
      delivered: canonicalDelivered(FROM),
      laying: null,
      final: FINAL,
      deadline,
      deliveryScale: 1,
      candidates: candidatesOf(f0, 'date', true),
      hours: 30,
    };
    const prof = estimateProfile(table, req);
    expect(prof).toHaveLength(31);
    for (const h of [5, 17, 30]) {
      const fh = await found(startOf(START, h));
      expect(prof[h].te).toBeLessThanOrEqual(outcomeOf(fh, 'date', FROM, FINAL).te);
      expect(prof[h].te).toBeLessThan(FINAL);
    }
    // A part of the profile is the same as the whole profile's hours.
    expect(estimateProfile(table, { ...req, from: 10, hours: 12 })).toEqual(prof.slice(10, 13));
  });

  it('Fastest: the soonest of the routes to the target', async () => {
    const f = await findRoutes({ table, startTE: FROM, start: START, final: FINAL, maxAscensions: 6 });
    const req = {
      mode: 'fastest' as const,
      prestigeAt: START,
      startTE: FROM,
      delivered: canonicalDelivered(FROM),
      laying: null,
      final: FINAL,
      deliveryScale: 1,
      candidates: candidatesOf(f, 'fastest', true),
      hours: 0,
    };
    expect(estimateAt(table, req, 0).end).toBeLessThanOrEqual(f.best!.end);
    expect(outcomeOf(f, 'fastest', FROM)).toEqual({ te: FINAL, end: f.best!.end });
  });
});

describe('prestigePlan (the prestige the line is about)', () => {
  const leg = (to: number, label: string, start: number, end: number) => ({
    from: 141,
    to,
    endTE: to,
    start,
    end,
    sales: 0,
    tier13: false,
    label,
  });
  const routeOf = (legs: ReturnType<typeof leg>[]): Route => ({
    chain: legs.map(l => l.to),
    legs,
    end: legs[legs.length - 1].end,
    seconds: 0,
  });
  const T0 = P - 40 * 86400;
  const save = [1, 2, 3, 4, 5];
  const farm = { egg: 0, rate: 5e11, capSeconds: 86400 };

  it('a build-up first ascension: the prestige is when its stop is reached, with its eggs and its farm', () => {
    const r = routeOf([
      leg(161, 'buildup', T0, P),
      leg(186, '2-sale', P, P + 9e5),
      leg(248, '2-sale', P + 9e5, DEADLINE - 9e4),
    ]);
    const found: FoundRoutes = { best: null, byAscensions: [], byDate: r, byDateByAscensions: [null, null, null, r] };
    const firstLegs: FirstLeg[] = [
      { to: 161, endTE: 161, end: P, delivered: [7, 7, 7, 7, 7], label: 'buildup', egg: 1, peakELR: 8e11 },
    ];
    const plan = prestigePlan({
      mode: 'date',
      found,
      firstLegs,
      planStart: T0,
      startTE: 141,
      saveDelivered: save,
      farm,
      siloSeconds: 3600,
    })!;
    expect(plan.fresh).toBe(false);
    expect(plan.prestigeAt).toBe(P);
    expect(plan.startTE).toBe(161);
    expect(plan.delivered).toEqual([7, 7, 7, 7, 7]);
    expect(plan.laying).toEqual({ egg: 1, rate: 8e11, capSeconds: 3600 });
    expect(plan.keep).toEqual({ te: 248, end: DEADLINE - 9e4 });
    expect(plan.candidates).toEqual([[186, 248]]);
    // Frozen: nothing laid.
    expect(
      prestigePlan({
        mode: 'date',
        found,
        firstLegs,
        planStart: T0,
        startTE: 141,
        saveDelivered: save,
        farm,
        siloSeconds: 3600,
        eggs: 'frozen',
      })!.laying
    ).toBeNull();
    // Played all along: no cap.
    expect(
      prestigePlan({
        mode: 'date',
        found,
        firstLegs,
        planStart: T0,
        startTE: 141,
        saveDelivered: save,
        farm,
        siloSeconds: 3600,
        eggs: 'laying',
      })!.laying!.capSeconds
    ).toBe(Infinity);
  });

  it('a fresh first ascension: the prestige is now, from the save’s eggs, with the save’s farm', () => {
    const r = routeOf([leg(170, '2-sale', T0, T0 + 9e5), leg(490, '2-sale', T0 + 9e5, T0 + 9e6)]);
    const found: FoundRoutes = { best: r, byAscensions: [null, null, r], byDate: null, byDateByAscensions: [] };
    const plan = prestigePlan({
      mode: 'fastest',
      found,
      firstLegs: [],
      planStart: T0,
      startTE: 141.6,
      saveDelivered: save,
      farm,
      siloSeconds: 3600,
    })!;
    expect(plan.fresh).toBe(true);
    expect(plan.prestigeAt).toBe(T0);
    expect(plan.startTE).toBe(141);
    expect(plan.delivered).toEqual(save);
    expect(plan.laying).toEqual(farm);
    expect(plan.candidates).toEqual([[170, 490]]);
    expect(plan.keep).toEqual({ te: 490, end: T0 + 9e6 });
  });

  it('no route: no plan', () => {
    const found: FoundRoutes = { best: null, byAscensions: [], byDate: null, byDateByAscensions: [] };
    expect(
      prestigePlan({
        mode: 'date',
        found,
        firstLegs: [],
        planStart: T0,
        startTE: 141,
        saveDelivered: save,
        farm,
        siloSeconds: 1,
      })
    ).toBeNull();
  });
});
