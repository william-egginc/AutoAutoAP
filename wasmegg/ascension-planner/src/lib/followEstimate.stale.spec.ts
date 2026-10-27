/**
 * My runs prices a followed route with the account's newest pricing record while the one for this save and setup is
 * worked out (cached answers first, then recheck: Jordan, 27 Oct 2026). Only a record that starts at the save's TE
 * (the first ascensions are from it), of the same account; never the exact record (that one is not stale).
 */
import { describe, expect, it } from 'vitest';
import { pickWithStale, staleRecordSources, type PricingRecord, type PricingSource, type SnapPricing } from './followEstimate';
import { goalFollowOf, followOptionWords } from './planGoals';

const pricing = (startTE: number, final = 490): SnapPricing => ({
  v: 1,
  final,
  options: { startTE, start: 1, firstLegs: [{ to: 225, endTE: 225, end: 2, delivered: [1] }] } as SnapPricing['options'],
});
const rec = (o: Partial<PricingRecord> & { startTE?: number }): PricingRecord => ({
  account: 'acct',
  backupTime: 100,
  setup: 'now',
  url: 'precompute/table-v2.bin',
  tableTo: 489,
  at: 1000,
  pricing: pricing(o.startTE ?? 194),
  ...o,
});

describe('stale pricing sources', () => {
  it("the account's other records starting at the save's TE, newest first, marked stale", () => {
    const list = [
      rec({ setup: 'now', at: 5000 }),
      rec({ setup: 'old', at: 2000 }),
      rec({ backupTime: 90, at: 3000 }),
      rec({ account: 'other', setup: 'x', at: 9000 }),
      rec({ setup: 'y', at: 8000, startTE: 150 }),
    ];
    const got = staleRecordSources(list, { account: 'acct', backupTime: 100, setup: 'now', currentTE: 194.6, meta: null });
    expect(got.map(s => s.at)).toEqual([3000, 2000]);
    expect(got.every(s => s.stale === true && !s.ownGoal)).toBe(true);
    expect(staleRecordSources(list, { account: null, backupTime: 100, setup: 'now', currentTE: 194, meta: null })).toEqual([]);
  });

  it('the exact pick wins; a stale one only where the exact sources need a record; none: the exact answer as before', () => {
    const src = (at: number, stale = false): PricingSource => ({ url: 'u', pricing: pricing(194), tableTo: 489, ownGoal: false, at, meta: null, ...(stale ? { stale: true as const } : {}) });
    const exact = pickWithStale([src(1)], [src(2, true)], [225, 300], 194);
    expect(exact && 'source' in exact && exact.source.at).toBe(1);
    const stale = pickWithStale([], [src(2, true)], [225, 300], 194);
    expect(stale && 'source' in stale && stale.source.stale).toBe(true);
    expect(pickWithStale([], [], [225, 300], 194)).toBeNull();
    // The exact source stops short of the first stop: a record is needed, so the stale one prices meanwhile.
    const short: PricingSource = { ...src(1), pricing: pricing(194, 200) };
    const p = pickWithStale([short], [src(2, true)], [225, 300], 194);
    expect(p && 'source' in p && p.source.at).toBe(2);
  });
});

describe('the pill says it is being checked', () => {
  it('an estimate shown from before: "· checking…"', () => {
    const f = goalFollowOf({ price: 'estimate', staleAt: 1000 }, 1_800_000_000);
    expect(f).toMatchObject({ times: 'estimate', checking: true });
    expect(followOptionWords(f, () => 'Nov 4, 2026', 'late')).toBe('following · lands about Nov 4, 2026 · checking…');
    const fresh = goalFollowOf({ price: 'estimate' }, 1_800_000_000);
    expect(fresh.checking).toBeUndefined();
    expect(followOptionWords(fresh, () => 'Nov 4, 2026', 'late')).toBe('following · lands about Nov 4, 2026');
  });
});
