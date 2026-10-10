/**
 * The local check history (search/checkHistory.ts): newest first, capped per account, identical
 * consecutive checks kept once, the change against the previous check of the same goal, and storage
 * that fails quietly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, blocked } = vi.hoisted(() => ({ db: new Map<string, unknown>(), blocked: { on: false } }));
vi.mock('@/lib/storage/db', async () => {
  const m = (await import('@/test/memoryDb')).memoryDbModule(db);
  const guard =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    (...a: A) =>
      blocked.on ? Promise.reject(new Error('blocked')) : f(...a);
  return { ...m, saveMetadata: guard(m.saveMetadata), loadMetadata: guard(m.loadMetadata) };
});

import {
  addCheck,
  deltaOf,
  entryFromRecord,
  HISTORY_CAP,
  loadHistory,
  markShared,
  saveHistory,
  type CheckEntry,
} from './checkHistory';
import type { InstantRecord } from './instantRecord';

const T0 = 1791000000;
let n = 0;
function entry(o: Partial<CheckEntry> = {}): CheckEntry {
  n++;
  return {
    at: (T0 + n * 3600) * 1000,
    te: 200,
    mode: 'fastest',
    target: 490,
    instant: { chain: [210, 490], end: T0 + 86400 * 300 },
    exact: { chain: [210, 490], end: T0 + 86400 * 301 },
    firstLeg: 'continue',
    shared: false,
    sig: `s${n}`,
    ...o,
  };
}

beforeEach(() => {
  db.clear();
  blocked.on = false;
});

describe('check history', () => {
  it('keeps the newest first and drops the oldest past the cap', () => {
    let list: CheckEntry[] = [];
    const all: CheckEntry[] = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      const e = entry();
      all.push(e);
      list = addCheck(list, e);
    }
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0]).toBe(all[all.length - 1]);
    expect(list[list.length - 1]).toBe(all[5]);
    expect(addCheck([entry(), entry()], entry(), 2)).toHaveLength(2);
  });

  it('keeps an identical check once (the share dedupe), and keeps it shared', () => {
    const a = entry({ sig: 'same' });
    let list = addCheck([], a);
    list = addCheck(list, entry({ sig: 'same' }));
    expect(list).toEqual([a]);
    list = addCheck(list, entry({ sig: 'same', shared: true }));
    expect(list).toHaveLength(1);
    expect(list[0].shared).toBe(true);
    // Not consecutive: kept again.
    list = addCheck(list, entry({ sig: 'other' }));
    list = addCheck(list, entry({ sig: 'same' }));
    expect(list.map(e => e.sig)).toEqual(['same', 'other', 'same']);
  });

  it('marks a check shared', () => {
    const list = [entry({ sig: 'b' }), entry({ sig: 'a' })];
    const out = markShared(list, 'a');
    expect(out[1].shared).toBe(true);
    expect(list[1].shared).toBe(false);
    expect(markShared(out, 'zz')).toBe(out);
  });

  it('fastest: the change in finish against the previous check of the same target', () => {
    const older = entry({ exact: { chain: [210, 490], end: T0 + 86400 * 301 } });
    const otherTarget = entry({ target: 500, exact: { chain: [500], end: T0 } });
    const newer = entry({ exact: { chain: [220, 490], end: T0 + 86400 * 300.6 } });
    const list = [newer, otherTarget, older];
    expect(deltaOf(list, 0)).toEqual({ text: '−0.4 d', better: true });
    expect(deltaOf(list, 1)).toBeNull();
    expect(deltaOf(list, 2)).toBeNull();
    const later = entry({ exact: { chain: [210, 490], end: T0 + 86400 * 302 } });
    expect(deltaOf([later, older], 0)).toEqual({ text: '+1.0 d', better: false });
    expect(deltaOf([entry({ exact: older.exact }), older], 0)).toEqual({ text: 'same', better: null });
  });

  it('falls back to the instant answer when a check has no exact result', () => {
    const older = entry({ instant: { chain: [490], end: T0 + 86400 * 10 } });
    const newer = entry({ exact: null, instant: { chain: [490], end: T0 + 86400 * 8 } });
    expect(deltaOf([newer, older], 0)?.text).toBe('−2.0 d');
  });

  it('by a date: the change in TE against the previous check of the same deadline', () => {
    const d = T0 + 86400 * 30;
    const base = { mode: 'date' as const, target: undefined, deadline: d };
    const older = entry({ ...base, exact: { chain: [300], end: d - 3600, endTE: 51, spareHours: 1 } });
    const newer = entry({ ...base, exact: { chain: [310], end: d - 7200, endTE: 52, spareHours: 2 } });
    const otherDate = entry({ ...base, deadline: d + 1, exact: { chain: [1], end: d, endTE: 99 } });
    expect(deltaOf([newer, otherDate, older], 0)).toEqual({ text: '+1 TE', better: true });
    expect(deltaOf([older, newer], 0)).toEqual({ text: '−1 TE', better: false });
  });

  it('builds an entry from a record', () => {
    const rec = {
      v: 1,
      mode: 'date',
      deadline: T0 + 100,
      planStart: T0,
      backupTime: T0 - 60,
      currentTE: 200,
      gear: { answer: 'maxed' },
      instant: { chain: [300], end: T0 + 50, endTE: 51, spareHours: 0.5, legs: [] },
      exact: { chain: [300], end: T0 + 60, endTE: 51, spareHours: 0.4, firstLeg: 'fresh', legs: [] },
    } as unknown as InstantRecord;
    const e = entryFromRecord(rec, 'sig', 123);
    expect(e).toEqual({
      at: 123,
      backupTime: T0 - 60,
      te: 200,
      mode: 'date',
      deadline: T0 + 100,
      instant: { chain: [300], end: T0 + 50, endTE: 51, spareHours: 0.5 },
      exact: { chain: [300], end: T0 + 60, endTE: 51, spareHours: 0.4 },
      firstLeg: 'fresh',
      shared: false,
      sig: 'sig',
    });
    expect(JSON.stringify(e)).not.toMatch(/EI\d{16}/);
  });

  it('stores per account, and survives storage that throws', async () => {
    const list = [entry(), entry()];
    expect(await saveHistory('acct1', list)).toBe(true);
    expect(await loadHistory('acct1')).toEqual(list);
    expect(await loadHistory('acct2')).toEqual([]);
    expect(await loadHistory('')).toEqual([]);
    expect(await saveHistory('', list)).toBe(false);

    blocked.on = true;
    expect(await saveHistory('acct1', list)).toBe(false);
    expect(await loadHistory('acct1')).toEqual([]);
  });
});
