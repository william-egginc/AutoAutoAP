/**
 * CACHED ANSWERS FIRST, THEN RECHECK (Jordan, 27 Oct 2026: "answers recalculating with nothing shown"). While the
 * instant answer for the goal is worked out again (a setup or save change, new tables, an INSTANT_RULES bump, a reload
 * after a day), the last answer kept for the same goal is shown at once, marked "From <time>, checking…": the exact
 * key's even when it no longer fits (too old for `readSnapshot`, other tables), else the newest of this account and
 * goal under any key. The exact-key path (`readSnapshot`) is unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_AGE_MS,
  STALE_MAX_AGE_MS,
  latestSnapshotFor,
  readSnapshot,
  writeSnapshot,
  type SnapMeta,
  type StorageLike,
} from './instantSnapshot';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  };
}
const meta = (account: string, goal: string, backupTime = 1_790_000_000): SnapMeta => ({ account, goal, backupTime });
const snap = (at: number, m: SnapMeta, tag: string) => ({ v: 1, at, meta: m, result: { tag }, header: { from: 100 } });
const NOW = 1_800_000_000_000;

describe('the last answer for the goal, shown while it is worked out again', () => {
  it("the exact key's answer even when it is older than a day (readSnapshot itself still drops it)", () => {
    const st = mem();
    writeSnapshot('k1|0', snap(NOW - MAX_AGE_MS - 60_000, meta('acct', 'target 490'), 'exact'), st);
    expect(readSnapshot('k1|0', NOW, st)).toBeNull();
    const got = latestSnapshotFor<{ at: number; result: { tag: string } }>({ key: 'k1|0', account: 'acct', goal: 'target 490' }, NOW, st);
    expect(got?.key).toBe('k1|0');
    expect(got?.value.result.tag).toBe('exact');
  });

  it("else the newest of this account and goal under another key (another setup, save or tables)", () => {
    const st = mem();
    writeSnapshot('old|0', snap(NOW - 5 * 3600_000, meta('acct', 'target 490'), 'older'), st);
    writeSnapshot('new|0', snap(NOW - 2 * 3600_000, meta('acct', 'target 490'), 'newer'), st);
    writeSnapshot('date|0', snap(NOW - 3600_000, meta('acct', 'date 1815670800'), 'date'), st);
    writeSnapshot('other|0', snap(NOW - 60_000, meta('someone', 'target 490'), 'other account'), st);
    const got = latestSnapshotFor<{ at: number; result: { tag: string } }>({ key: 'mine|0', account: 'acct', goal: 'target 490' }, NOW, st);
    expect(got?.key).toBe('new|0');
    expect(got?.value.result.tag).toBe('newer');
    expect(latestSnapshotFor({ key: 'mine|0', account: 'acct', goal: 'date 1815670800' }, NOW, st)?.key).toBe('date|0');
  });

  it('never another account, another goal, or one older than STALE_MAX_AGE_MS; none at all: null (today’s loading)', () => {
    const st = mem();
    expect(latestSnapshotFor({ key: 'x|0', account: 'acct', goal: 'target 490' }, NOW, st)).toBeNull();
    writeSnapshot('a|0', snap(NOW - 60_000, meta('someone', 'target 490'), 'a'), st);
    writeSnapshot('b|0', snap(NOW - 60_000, meta('acct', 'target 300'), 'b'), st);
    writeSnapshot('c|0', snap(NOW - STALE_MAX_AGE_MS - 1, meta('acct', 'target 490'), 'c'), st);
    expect(latestSnapshotFor({ key: 'x|0', account: 'acct', goal: 'target 490' }, NOW, st)).toBeNull();
    // No account (no save yet): only the exact key.
    expect(latestSnapshotFor({ key: 'x|0', account: null, goal: 'target 490' }, NOW, st)).toBeNull();
  });

  it('one without a route or header (half written, an old format) is passed over', () => {
    const st = mem();
    writeSnapshot('good|0', snap(NOW - 7200_000, meta('acct', 'target 490'), 'good'), st);
    writeSnapshot('bad|0', { at: NOW - 3600_000, meta: meta('acct', 'target 490') } as { at: number }, st);
    expect(latestSnapshotFor({ key: 'x|0', account: 'acct', goal: 'target 490' }, NOW, st)?.key).toBe('good|0');
  });
});
