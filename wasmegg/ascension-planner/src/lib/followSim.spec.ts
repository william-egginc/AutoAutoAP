import { describe, expect, it } from 'vitest';
import {
  SIM_MAX_BYTES,
  SIM_RECORD_KEY,
  findSimRecord,
  readSimRecords,
  recordSim,
  simKey,
  simLegOf,
  simSetupKey,
  withCurrentSim,
  type SimRecord,
} from './followSim';
import type { LegSummary } from '@/search/types';
import type { NowPlan } from './nowPlan';

const T0 = 1_800_000_000;
const H = 3600;

function mem(o: { failWrites?: (text: string) => boolean; failReads?: boolean } = {}) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => {
      if (o.failReads) throw new Error('blocked');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (o.failWrites?.(v)) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
  };
}
const leg = { key: 'continue', startTime: T0, endTime: T0 + 30 * H, endTE: 226, buildPhaseEndTime: T0, shifts: [{ at: T0 + 2 * H, egg: 'humility' }] };
const rec = (backupTime: number, extra: Partial<SimRecord> = {}): SimRecord => ({
  account: 'acct-hash',
  backupTime,
  route: [226, 277, 490],
  setup: '[]',
  at: backupTime * 1000,
  leg,
  ...extra,
});

describe('the record (aap-follow-sim)', () => {
  it('keeps the newest three, one per account, save, route and setup', () => {
    const st = mem();
    for (const t of [1, 2, 3, 4]) expect(recordSim(rec(T0 + t), st)).toBe(true);
    expect(readSimRecords(st).map(r => r.backupTime)).toEqual([T0 + 4, T0 + 3, T0 + 2]);
    // The same key again replaces it.
    recordSim(rec(T0 + 3, { at: 5 }), st);
    expect(readSimRecords(st).map(r => [r.backupTime, r.at])).toEqual([
      [T0 + 3, 5],
      [T0 + 4, (T0 + 4) * 1000],
      [T0 + 2, (T0 + 2) * 1000],
    ]);
    expect(findSimRecord(readSimRecords(st), { account: 'acct-hash', backupTime: T0 + 4, route: [226, 277, 490], setup: '[]' })?.backupTime).toBe(T0 + 4);
    expect(findSimRecord(readSimRecords(st), { account: 'acct-hash', backupTime: T0 + 4, route: [226, 490], setup: '[]' })).toBeNull();
  });

  it('a record too big is not kept; a full storage keeps fewer rather than none; nothing throws', () => {
    const st = mem();
    const huge = rec(T0, { leg: { ...leg, shifts: Array.from({ length: 2000 }, (_, i) => ({ at: T0 + i, egg: 'curiosity' })) } });
    expect(JSON.stringify(huge).length).toBeGreaterThan(SIM_MAX_BYTES);
    expect(recordSim(huge, st)).toBe(false);
    expect(st.m.has(SIM_RECORD_KEY)).toBe(false);
    // Room for two records only.
    const two = mem({ failWrites: text => (JSON.parse(text) as unknown[]).length > 2 });
    for (const t of [1, 2]) recordSim(rec(T0 + t), two);
    expect(recordSim(rec(T0 + 3), two)).toBe(true);
    expect(readSimRecords(two).map(r => r.backupTime)).toEqual([T0 + 3, T0 + 2]);
    expect(recordSim(rec(T0 + 4), mem({ failWrites: () => true }))).toBe(false);
    expect(recordSim(rec(T0), null)).toBe(false);
  });

  it('unreadable or garbled storage reads as none', () => {
    expect(readSimRecords(mem({ failReads: true }))).toEqual([]);
    const st = mem();
    st.m.set(SIM_RECORD_KEY, '{not json');
    expect(readSimRecords(st)).toEqual([]);
    st.m.set(SIM_RECORD_KEY, JSON.stringify([{ account: 'x' }, rec(T0)]));
    expect(readSimRecords(st)).toHaveLength(1);
  });

  it('never holds a player id: the account is the hash it is given', () => {
    const st = mem();
    recordSim(rec(T0), st);
    expect(st.m.get(SIM_RECORD_KEY)).not.toMatch(/EI\d{16}/);
  });
});

describe('keys and the leg', () => {
  it('the setup key follows what the simulation depends on', () => {
    const base = { availability: { days: [], fromHour: 7, toHour: 23, timezone: 'UTC' }, useHours: true, timeOff: [], noPrestige: [], firstAscension: 'auto', deferShifts: true };
    expect(simSetupKey(base)).not.toBe(simSetupKey({ ...base, useHours: false }));
    expect(simSetupKey(base)).not.toBe(simSetupKey({ ...base, deferShifts: false }));
    expect(simSetupKey(base)).not.toBe(simSetupKey({ ...base, noPrestige: [{ date: '2026-11-01' }] }));
    expect(simKey({ account: 'a', backupTime: 5, route: [1, 2], setup: 's' })).toBe('a|5|1,2|s');
  });

  it('simLegOf keeps the times and shifts, and refuses a leg without times', () => {
    const l = { key: '1-sale', endTE: 226, durationSeconds: 10 * H, maxELR: 1, endTime: T0 + 10 * H, tier13Unlocked: false, buildPhaseEndTime: T0 + 2 * H, shifts: [{ at: T0 + H, egg: 'kindness', fromEgg: 'curiosity', te: 3 }] } as LegSummary;
    expect(simLegOf(l)).toEqual({ key: '1-sale', startTime: T0, endTime: T0 + 10 * H, endTE: 226, buildPhaseEndTime: T0 + 2 * H, shifts: [{ at: T0 + H, egg: 'kindness' }] });
    expect(simLegOf({ ...l, endTime: NaN })).toBeNull();
    expect(simLegOf(null)).toBeNull();
  });
});

describe('withCurrentSim', () => {
  const plan = {
    goal: 'fastest',
    deadline: null,
    chain: [226, 277],
    end: T0 + 80 * H,
    endTE: 277,
    legs: null,
    tableLegs: [
      { from: 200, to: 226, endTE: 226, start: T0, end: T0 + 24 * H },
      { from: 226, to: 277, endTE: 277, start: T0 + 25 * H, end: T0 + 80 * H, shifts: [{ at: T0 + 50 * H, egg: 'humility' }] },
    ],
    exact: false,
    instantTE: null,
    calculatedAt: 0,
    planStart: T0,
    spareHours: null,
    runnerUpHours: null,
    meta: null,
    whatIf: null,
  } as NowPlan;
  it('the first ascension becomes the simulated one; the later ones keep the table\'s', () => {
    const p = withCurrentSim(plan, leg);
    expect(p.tableLegs![0]).toMatchObject({ simulated: true, start: T0, end: T0 + 30 * H, shifts: leg.shifts, buildEnd: T0 });
    expect(p.tableLegs![1]).toBe(plan.tableLegs![1]);
    expect(p.end).toBe(plan.end);
  });
  it('a one-stop route ends with it; another stop or exact legs leave the plan as it was', () => {
    const one = { ...plan, chain: [226], tableLegs: [plan.tableLegs![0]], end: T0 + 24 * H, endTE: 226 };
    expect(withCurrentSim(one, leg)).toMatchObject({ end: T0 + 30 * H, endTE: 226 });
    expect(withCurrentSim({ ...plan, chain: [230, 277] }, leg)).toEqual({ ...plan, chain: [230, 277] });
    expect(withCurrentSim(plan, { ...leg, endTE: 220 })).toBe(plan);
    expect(withCurrentSim(plan, null)).toBe(plan);
  });
});
