/**
 * lib/followPrice.ts: a followed route priced from what is saved, never worked out. This save's snapshot first, then
 * an older save's (said so on the card), then Check exactly's history (finish only), else unpriced.
 */
import { describe, expect, it } from 'vitest';
import { followPrice, type FollowHistory, type FollowSnap } from './followPrice';
import { currentSetup, setupCheck } from './currentAnswer';
import type { SnapLike } from './nowPlan';
import type { LegSummary } from '@/search/types';

const H = 3600;
const SAVE = Date.UTC(2026, 9, 16, 18) / 1000; // the loaded save
const OLD = SAVE - 30 * H; // an earlier save
const setup = { availability: null, timeOff: [] };
const here = currentSetup(setup);
const elsewhere = setupCheck(setup, setup, '2026-10-16');
const legs = [{ key: 'continue', endTE: 222, shifts: [] } as unknown as LegSummary];

function snap(o: { backupTime: number; te: number; exact: SnapLike['exact']; at?: number }): SnapLike {
  return {
    at: (o.backupTime + H) * 1000,
    result: { best: null, byAscensions: [] },
    exact: o.exact,
    answerStart: o.backupTime,
    meta: { account: 'acct', goal: 'target 490', backupTime: o.backupTime, teByEgg: [o.te] },
  };
}
const fastest = { goal: 'fastest' as const, target: 490, deadline: null };
const base = { goal: fastest, currentTE: 200, loadedSave: SAVE, history: [] as FollowHistory[] };

describe('followPrice', () => {
  it("this save's snapshot: the stops above its TE, with the legs kept", () => {
    const own: FollowSnap = {
      snap: snap({ backupTime: SAVE, te: 200, exact: { '222,490': { end: SAVE + 100 * H, endTE: 490, legs } } }),
      startTE: 200,
      ownKey: true,
      check: here,
    };
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [own] });
    expect(p.priced).toBe('exact');
    if (p.priced !== 'exact') return;
    expect(p.source).toBe('this-save');
    expect(p.plan.chain).toEqual([222, 490]);
    expect(p.plan.end).toBe(SAVE + 100 * H);
    expect(p.plan.legs).toEqual(legs);
    expect(p.plan.exact).toBe(true);
  });

  it("an older save's snapshot when this save has none: priced from that save's TE, said to be older", () => {
    const older: FollowSnap = {
      snap: snap({ backupTime: OLD, te: 190, exact: { '197,222,490': { end: OLD + 120 * H, endTE: 490 } } }),
      startTE: 190,
      ownKey: false,
      check: elsewhere,
    };
    const ownWithout: FollowSnap = {
      snap: snap({ backupTime: SAVE, te: 200, exact: { '230,490': { end: SAVE + 90 * H, endTE: 490 } } }),
      startTE: 200,
      ownKey: true,
      check: here,
    };
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [ownWithout, older] });
    expect(p.priced).toBe('exact');
    if (p.priced !== 'exact') return;
    expect(p.source).toBe('older-save');
    expect(p.plan.chain).toEqual([197, 222, 490]);
    expect(p.plan.meta?.backupTime).toBe(OLD);
  });

  it("this save wins over an older save (the current answer rule)", () => {
    const older: FollowSnap = {
      snap: snap({ backupTime: OLD, te: 190, exact: { '197,222,490': { end: OLD + 50 * H, endTE: 490 } } }),
      startTE: 190,
      ownKey: false,
      check: elsewhere,
    };
    const own: FollowSnap = {
      snap: snap({ backupTime: SAVE, te: 200, exact: { '222,490': { end: SAVE + 100 * H, endTE: 490 } } }),
      startTE: 200,
      ownKey: true,
      check: here,
    };
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [older, own] });
    expect(p.priced === 'exact' && p.source).toBe('this-save');
  });

  it("a snapshot without its TE: the longest priced tail", () => {
    const s: FollowSnap = {
      snap: snap({ backupTime: SAVE, te: 200, exact: { '490': { end: 1, endTE: 490 }, '222,490': { end: SAVE + 9 * H, endTE: 490 } } }),
      startTE: null,
      ownKey: true,
      check: here,
    };
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [s] });
    expect(p.priced === 'exact' && p.plan.chain).toEqual([222, 490]);
  });

  it("Check exactly's history when no snapshot has it: finish only, the newest check", () => {
    const history: FollowHistory[] = [
      { at: 1000, backupTime: OLD, mode: 'fastest', target: 490, exact: { chain: [197, 222, 490], end: OLD + 80 * H, endTE: 490 } },
      { at: 2000, backupTime: SAVE, mode: 'fastest', target: 490, exact: { chain: [222, 490], end: SAVE + 70 * H, endTE: 490 } },
      { at: 3000, backupTime: SAVE, mode: 'fastest', target: 490, exact: { chain: [230, 490], end: SAVE + 60 * H } },
      { at: 4000, backupTime: SAVE, mode: 'date', deadline: SAVE + 999 * H, exact: { chain: [222, 490], end: SAVE + 50 * H } },
    ];
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [], history });
    expect(p).toEqual({
      priced: 'finish',
      source: 'history',
      chain: [222, 490],
      end: SAVE + 70 * H,
      endTE: 490,
      at: 2000,
      backupTime: SAVE,
    });
  });

  it('unpriced: the stops still ahead', () => {
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [] });
    expect(p).toEqual({ priced: 'none', chain: [222, 490] });
  });

  it('By a date: matched on its date, a route landing after it still priced (the card says so)', () => {
    const deadline = SAVE + 50 * H;
    const s: FollowSnap = {
      snap: { ...snap({ backupTime: SAVE, te: 200, exact: { '222,300': { end: SAVE + 60 * H, endTE: 300 } } }), meta: undefined },
      startTE: 200,
      ownKey: true,
      check: here,
    };
    const p = followPrice({ ...base, goal: { goal: 'date', target: 490, deadline }, chain: [222, 300], snaps: [s] });
    expect(p.priced === 'exact' && p.plan.spareHours).toBe(-10);
  });
});

describe("followPrice: the instant answer's route and this save's results keep their timeline (23 Oct 2026)", () => {
  // This save's instant answer: the lead 230 → 490, a 3-ascension row 222 → 260 → 490; no Check exactly prices.
  const tableLegs = (chain: number[], end: number) =>
    chain.map((to, i) => ({ to, endTE: to, start: SAVE + i * 10 * H, end: i === chain.length - 1 ? end : SAVE + (i + 1) * 10 * H }));
  const route = (chain: number[], end: number) => ({ chain, end, legs: tableLegs(chain, end) });
  const instantSnap = (o: { backupTime: number; search?: unknown }): SnapLike => ({
    ...snap({ backupTime: o.backupTime, te: 200, exact: {} }),
    result: { best: route([230, 490], SAVE + 80 * H), byAscensions: [null, route([230, 490], SAVE + 80 * H), route([222, 260, 490], SAVE + 90 * H)] },
    ...(o.search ? { search: o.search } : {}),
  });
  const fast = (chain: number[], end: number, at = SAVE * 1000 + 5000) => ({
    level: 'Fast' as const,
    chain,
    end,
    endTE: 490,
    legs: [{ key: 'continue', endTE: 490, endTime: end, shifts: [] } as unknown as LegSummary],
    at,
    planStart: SAVE,
  });
  const own = (s: SnapLike): FollowSnap => ({ snap: s, startTE: 200, ownKey: true, check: here });

  it("the instant answer's lead: its own plan, the table's times (not exact), this save", () => {
    const p = followPrice({ ...base, chain: [230, 490], snaps: [own(instantSnap({ backupTime: SAVE }))], prefer: 'instant' });
    expect(p.priced).toBe('exact');
    if (p.priced !== 'exact') return;
    expect(p.source).toBe('this-save');
    expect(p.plan).toMatchObject({ chain: [230, 490], exact: false, end: SAVE + 80 * H, legs: null, runnerUp: null });
    expect(p.plan.from).toBeUndefined();
    expect(p.plan.tableLegs?.length).toBe(2);
  });

  it("one of the instant answer's rows (a count, not the lead): that row's times; the stops passed are dropped", () => {
    const p = followPrice({ ...base, chain: [197, 222, 260, 490], snaps: [own(instantSnap({ backupTime: SAVE }))] });
    expect(p.priced === 'exact' && p.plan).toMatchObject({ chain: [222, 260, 490], exact: false, end: SAVE + 90 * H });
  });

  it("this save's kept Fast result (aap-search-plans): its plan, exact, from Fast", () => {
    const r = { found: fast([222, 490], SAVE + 70 * H), meta: null, check: here };
    const p = followPrice({ ...base, chain: [222, 490], snaps: [own(instantSnap({ backupTime: SAVE }))], results: [r] });
    expect(p.priced === 'exact' && p.plan).toMatchObject({ chain: [222, 490], exact: true, from: { level: 'Fast' }, end: SAVE + 70 * H });
    // No snapshot for the goal any more (a day old): the kept result alone.
    const q = followPrice({ ...base, chain: [222, 490], snaps: [], results: [r] });
    expect(q.priced === 'exact' && q.source).toBe('this-save');
    expect(q.priced === 'exact' && q.plan.from?.level).toBe('Fast');
  });

  it('the instant answer and a result both this route: where it was picked from leads', () => {
    const s = own(instantSnap({ backupTime: SAVE, search: fast([230, 490], SAVE + 79 * H) }));
    const inst = followPrice({ ...base, chain: [230, 490], snaps: [s], prefer: 'instant' });
    expect(inst.priced === 'exact' && inst.plan.exact).toBe(false);
    const srch = followPrice({ ...base, chain: [230, 490], snaps: [s], prefer: 'search' });
    expect(srch.priced === 'exact' && srch.plan.from?.level).toBe('Fast');
  });

  it('a route that is neither: not priced', () => {
    const r = { found: fast([222, 490], SAVE + 70 * H), meta: null, check: here };
    const p = followPrice({ ...base, chain: [240, 490], snaps: [own(instantSnap({ backupTime: SAVE }))], results: [r] });
    expect(p).toEqual({ priced: 'none', chain: [240, 490] });
  });

  it("an older save's instant answer is never matched; its result is, said to be that save's", () => {
    const old: FollowSnap = { snap: instantSnap({ backupTime: OLD, search: fast([222, 490], OLD + 70 * H) }), startTE: 200, ownKey: false, check: elsewhere };
    expect(followPrice({ ...base, chain: [230, 490], snaps: [old], prefer: 'instant' }).priced).toBe('none');
    const p = followPrice({ ...base, chain: [222, 490], snaps: [old] });
    expect(p.priced === 'exact' && p.source).toBe('older-save');
    expect(p.priced === 'exact' && p.plan.from?.level).toBe('Fast');
  });

  it("results kept from older saves (aap-search-plans): the newest that is this route; this save's own first", () => {
    const meta = (bt: number) => ({ account: 'acct', goal: 'target 490', backupTime: bt, teByEgg: [190] });
    const older = [
      { found: fast([222, 490], SAVE - 17 * H + 70 * H, (SAVE - 17 * H) * 1000), meta: meta(SAVE - 17 * H), check: here },
      { found: fast([222, 490], SAVE - 5 * H + 69 * H, (SAVE - 5 * H) * 1000), meta: meta(SAVE - 5 * H), check: here },
      { found: fast([240, 490], SAVE + 60 * H, SAVE * 1000), meta: meta(SAVE - 1 * H), check: here },
    ];
    const p = followPrice({ ...base, chain: [197, 222, 490], snaps: [], olderResults: older });
    expect(p.priced === 'exact' && p.source).toBe('older-save');
    expect(p.priced === 'exact' && p.plan.meta?.backupTime).toBe(SAVE - 5 * H);
    // This save has a result for it too: this save's leads.
    const mine = { found: fast([222, 490], SAVE + 71 * H), meta: meta(SAVE), check: here };
    const q = followPrice({ ...base, chain: [222, 490], snaps: [own(instantSnap({ backupTime: SAVE }))], results: [mine], olderResults: older });
    expect(q.priced === 'exact' && q.source).toBe('this-save');
    expect(q.priced === 'exact' && q.plan.end).toBe(SAVE + 71 * H);
  });
});
