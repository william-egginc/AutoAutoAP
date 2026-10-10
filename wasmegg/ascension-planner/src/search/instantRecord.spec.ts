import { describe, expect, it, vi } from 'vitest';
import {
  buildGapOf,
  exactLegs,
  firstLegOf,
  fitRecord,
  holdsPlayerId,
  INSTANT_GAP_MS,
  INSTANT_MAX_BYTES,
  instantLegs,
  instantUrlOf,
  noteSent,
  recordSig,
  recordSlot,
  SENT_KEY,
  sendInstantRecord,
  sendInstantRecordWhy,
  shouldSend,
  type InstantRecord,
} from './instantRecord';
import type { LegSummary } from './types';
import type { Route } from './routeFinder';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

const T0 = 1791000000; // Oct 2026
const leg = (o: Partial<LegSummary>): LegSummary => ({
  key: '2-sale-tier13',
  endTE: 200,
  durationSeconds: 86400 * 10,
  maxELR: 1.5e15 / 3600, // 1.5 Q/h
  endTime: T0 + 86400 * 10,
  tier13Unlocked: true,
  ...o,
});

const route: Route = {
  chain: [210, 490],
  legs: [
    { from: 200, to: 210, endTE: 210.4, start: T0, end: T0 + 3600 * 50, sales: 0, tier13: false, label: 'continue' },
    { from: 210, to: 490, endTE: 490, start: T0 + 3600 * 51, end: T0 + 86400 * 300, sales: 2, tier13: true, label: '2-sale-tier13' },
  ],
  end: T0 + 86400 * 300,
  seconds: 86400 * 300,
};

const record = (o: Partial<InstantRecord> = {}): InstantRecord => ({
  v: 1,
  mode: 'fastest',
  target: 490,
  planStart: T0,
  backupTime: T0 - 3600,
  currentTE: 200,
  gear: { answer: 'maxed', adjusted: true, earningsShort: 12.5, deliveryScale: 0.97 },
  instant: { chain: route.chain, end: route.end, legs: instantLegs(route) },
  ...o,
});

describe('what a record carries', () => {
  it('the instant answer leg by leg', () => {
    expect(instantLegs(route)[0]).toEqual({
      to: 210,
      endTE: 210.4,
      start: T0,
      end: T0 + 3600 * 50,
      label: 'continue',
      sales: 0,
      tier13: false,
    });
  });

  it('the exact legs in days and Q/h, with holds and prestige delays in hours', () => {
    const [l] = exactLegs([
      leg({ startTime: T0, buildPhaseSaleCount: 2, shiftDelaySeconds: 5400, sleepDelaySeconds: 7200 }),
    ]);
    expect(l).toEqual({
      te: 200,
      start: T0,
      days: 10,
      strategy: '2-sale-tier13',
      sales: 2,
      tier13: true,
      peakQph: 1.5,
      holdHours: 1.5,
      delayHours: 2,
    });
  });

  it("leg 1's choice and the other way's hours", () => {
    const legs = [leg({ key: 'continue', endTime: T0 + 3600 * 10, firstLegRival: { key: '1-sale', endTime: T0 + 3600 * 13.5 } })];
    expect(firstLegOf(legs)).toEqual({ firstLeg: 'continue', firstLegOtherHours: 3.5 });
    expect(firstLegOf([leg({})])).toEqual({ firstLeg: 'fresh' });
    expect(firstLegOf([])).toEqual({});
  });

  it('the build gap: the farm continued against the first fresh build', () => {
    const legs = [leg({ key: 'continue', maxELR: 4.564e15 / 3600 }), leg({ maxELR: 6.06e15 / 3600 })];
    expect(buildGapOf(4.564e15 / 3600, legs)).toEqual({ contQph: 4.564, freshQph: 6.06, ratio: 0.753, freshLeg: 2 });
    expect(buildGapOf(null, legs)).toBeUndefined();
    expect(buildGapOf(1, [leg({ key: 'continue' })])).toBeUndefined();
  });

  it('never a player id', () => {
    expect(holdsPlayerId(record())).toBe(false);
    expect(holdsPlayerId(record({ timezone: 'EI1234567890123456' }))).toBe(true);
  });
});

describe('size', () => {
  it('fits the collector cap, dropping detail before refusing', () => {
    const big = record({
      rows: Array.from({ length: 24 }, (_, i) => ({ n: i + 1, chain: [490], iEnd: T0, xEnd: null })),
      exact: { chain: [490], end: T0, legs: exactLegs(Array.from({ length: 64 }, () => leg({}))) },
    });
    const fit = fitRecord(big)!;
    expect(new TextEncoder().encode(JSON.stringify(fit)).length).toBeLessThanOrEqual(INSTANT_MAX_BYTES);
    expect(fit.instant.chain).toEqual(route.chain);
    expect(fitRecord(record({ timezone: 'x'.repeat(INSTANT_MAX_BYTES) }))).toBeNull();
  });
});

describe('at most one per save, mode and target an hour, never the same twice', () => {
  const slot = recordSlot('part', record());

  it('keys on the save time and the mode, not on the plan start', () => {
    expect(slot).toBe(`part|${T0 - 3600}|target 490`);
    expect(recordSlot('part', record({ planStart: T0 + 99 }))).toBe(slot);
    expect(recordSlot('part', record({ mode: 'date', target: undefined, deadline: T0 + 5 }))).toBe(`part|${T0 - 3600}|date ${T0 + 5}`);
  });

  it('skips an unchanged repeat even hours later, and a changed one inside the hour', () => {
    const st = mem();
    const now = 1_000_000_000_000;
    const sig = recordSig(record());
    expect(shouldSend(st, slot, sig, now)).toBe(true);
    noteSent(st, slot, sig, now);
    expect(shouldSend(st, slot, sig, now + 5 * INSTANT_GAP_MS)).toBe(false);
    const other = recordSig(record({ planStart: T0 + 3600 }));
    expect(shouldSend(st, slot, other, now + INSTANT_GAP_MS - 1)).toBe(false);
    expect(shouldSend(st, slot, other, now + INSTANT_GAP_MS)).toBe(true);
  });

  it('ignores the check time when telling repeats apart', () => {
    expect(recordSig(record({ checkSeconds: 40 }))).toBe(recordSig(record({ checkSeconds: 90 })));
  });

  it('forgets entries after two days', () => {
    const st = mem();
    noteSent(st, 'old', 'a', 0);
    noteSent(st, 'new', 'b', 3 * 86400 * 1000);
    expect(Object.keys(JSON.parse(st.map.get(SENT_KEY)!))).toEqual(['new']);
  });
});

describe('sending', () => {
  const ok = () => vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

  it('posts once to /instant with the owner code, then skips the repeat', async () => {
    const st = mem();
    const fetchImpl = ok();
    const args = { url: 'https://c.test/instant', owner: 'a'.repeat(32), partition: 'p', record: record(), storage: st, fetchImpl };
    expect(await sendInstantRecord(args)).toBe('sent');
    expect(await sendInstantRecord(args)).toBe('skipped');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://c.test/instant');
    expect((init.headers as Record<string, string>)['x-owner-token']).toBe('a'.repeat(32));
    expect(JSON.parse(init.body as string).instant.chain).toEqual([210, 490]);
  });

  it('sends nothing without a collector, an owner code or an account', async () => {
    const fetchImpl = ok();
    const base = { url: 'https://c.test/instant', owner: 'a'.repeat(32), partition: 'p', record: record(), storage: mem(), fetchImpl };
    expect(await sendInstantRecord({ ...base, url: '' })).toBe('skipped');
    expect(await sendInstantRecord({ ...base, owner: null })).toBe('skipped');
    expect(await sendInstantRecord({ ...base, partition: '' })).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a record holding a player id', async () => {
    const fetchImpl = ok();
    const r = await sendInstantRecord({
      url: 'https://c.test/instant',
      owner: 'a'.repeat(32),
      partition: 'p',
      record: record({ timezone: 'EI1234567890123456' }),
      storage: mem(),
      fetchImpl,
    });
    expect(r).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a refusal or a network failure is not remembered, so the next check tries again', async () => {
    const st = mem();
    const base = { url: 'https://c.test/instant', owner: 'a'.repeat(32), partition: 'p', record: record(), storage: st };
    expect(await sendInstantRecord({ ...base, fetchImpl: vi.fn(async () => new Response('', { status: 429 })) })).toBe('failed');
    expect(await sendInstantRecord({ ...base, fetchImpl: vi.fn(async () => Promise.reject(new Error('offline'))) })).toBe('failed');
    expect(st.map.has(SENT_KEY)).toBe(false);
  });

  it('says why a record did not go', async () => {
    const st = mem();
    const now = 1_800_000_000_000;
    const base = { url: 'https://c.test/instant', owner: 'a'.repeat(32), partition: 'p', storage: st, now };
    expect(await sendInstantRecordWhy({ ...base, url: '', record: record() })).toEqual({ result: 'skipped', why: 'no-collector' });
    expect(await sendInstantRecordWhy({ ...base, record: record(), fetchImpl: vi.fn(async () => new Response('', { status: 429 })) })).toEqual({
      result: 'failed',
      why: 'server',
      status: 429,
    });
    expect((await sendInstantRecordWhy({ ...base, record: record(), fetchImpl: vi.fn(async () => Promise.reject(new Error('x'))) })).why).toBe('network');
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await sendInstantRecordWhy({ ...base, record: record(), fetchImpl })).toEqual({ result: 'sent' });
    expect(await sendInstantRecordWhy({ ...base, record: record(), fetchImpl })).toEqual({ result: 'skipped', why: 'same' });
    const other = await sendInstantRecordWhy({ ...base, now: now + 60_000, record: record({ planStart: T0 + 3600 }), fetchImpl });
    expect(other).toEqual({ result: 'skipped', why: 'hourly', nextAt: now + INSTANT_GAP_MS });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('finds /instant beside /submit, and nothing without one', () => {
    expect(instantUrlOf('https://c.test/submit')).toBe('https://c.test/instant');
    expect(instantUrlOf('https://c.test/submit/')).toBe('https://c.test/instant');
    expect(instantUrlOf('')).toBe('');
    expect(instantUrlOf('https://c.test/other')).toBe('');
  });
});
