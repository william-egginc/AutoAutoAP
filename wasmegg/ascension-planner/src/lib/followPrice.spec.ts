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
