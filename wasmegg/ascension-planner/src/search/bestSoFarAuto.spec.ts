import { describe, expect, it } from 'vitest';
import {
  autoDecision,
  autoStatusLine,
  aboutIn,
  bestKey,
  nextDueAt,
  readAutoEveryMin,
  type AutoInput,
} from './bestSoFarAuto';
import { BEST_SO_FAR_GAP_MS } from './submission';
import { DEFAULT_OPTIONS, readOptions } from './stepAway';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 9, 9, 12, 0, 0).getTime();

function input(over: Partial<AutoInput> = {}): AutoInput {
  return {
    now: T0,
    active: true,
    everyMs: HOUR,
    startedAt: T0,
    lastSentAt: null,
    lastSentKey: null,
    lastFailAt: null,
    retryAt: null,
    key: '248:1,2,3',
    sending: false,
    ...over,
  };
}

describe('autoDecision', () => {
  it('is idle when off, not agreed, or the run is not going', () => {
    expect(autoDecision(input({ active: false, now: T0 + 5 * HOUR }))).toEqual({ do: 'idle' });
  });

  it('waits one interval after the run began, then sends the best', () => {
    expect(autoDecision(input({ now: T0 + 59 * MIN }))).toEqual({ do: 'wait', at: T0 + HOUR });
    expect(autoDecision(input({ now: T0 + HOUR }))).toEqual({ do: 'send' });
  });

  it('uses the shorter interval when chosen', () => {
    expect(autoDecision(input({ everyMs: 30 * MIN, now: T0 + 29 * MIN }))).toEqual({ do: 'wait', at: T0 + 30 * MIN });
    expect(autoDecision(input({ everyMs: 30 * MIN, now: T0 + 30 * MIN }))).toEqual({ do: 'send' });
  });

  it('skips, silently, when the best has not changed since the last send', () => {
    const sent = T0 + 10 * MIN;
    const i = input({ lastSentAt: sent, lastSentKey: '248:1,2,3', now: sent + HOUR });
    expect(autoDecision(i)).toEqual({ do: 'skip' });
    expect(autoDecision({ ...i, key: '250:1,2,4' })).toEqual({ do: 'send' });
  });

  it('skips when nothing has been found yet', () => {
    expect(autoDecision(input({ key: null, now: T0 + 2 * HOUR }))).toEqual({ do: 'skip' });
  });

  it('never sends sooner than the gap after the last send, whatever the interval', () => {
    const sent = T0 + 40 * MIN;
    // A manual send at 40 min moves the next one a full interval on, and never inside the gap.
    expect(nextDueAt(input({ lastSentAt: sent }))).toBe(sent + HOUR);
    expect(nextDueAt(input({ lastSentAt: sent, everyMs: 5 * MIN }))).toBe(sent + BEST_SO_FAR_GAP_MS);
    const i = input({ lastSentAt: sent, lastSentKey: 'old', everyMs: 30 * MIN });
    expect(autoDecision({ ...i, now: sent + 29 * MIN })).toEqual({ do: 'wait', at: sent + 30 * MIN });
    expect(autoDecision({ ...i, now: sent + 30 * MIN })).toEqual({ do: 'send' });
  });

  it('waits for the time the collector named after "too soon"', () => {
    const retryAt = T0 + HOUR + 7 * MIN;
    expect(autoDecision(input({ now: T0 + HOUR + MIN, retryAt }))).toEqual({ do: 'wait', at: retryAt });
    expect(autoDecision(input({ now: retryAt, retryAt }))).toEqual({ do: 'send' });
  });

  it('after another failure tries again one interval later', () => {
    const failedAt = T0 + HOUR;
    expect(autoDecision(input({ now: failedAt + 59 * MIN, lastFailAt: failedAt }))).toEqual({
      do: 'wait',
      at: failedAt + HOUR,
    });
    expect(autoDecision(input({ now: failedAt + HOUR, lastFailAt: failedAt }))).toEqual({ do: 'send' });
  });

  it('does not start a second send while one is in flight', () => {
    expect(autoDecision(input({ now: T0 + HOUR, sending: true }))).toEqual({ do: 'wait', at: T0 + HOUR });
  });

  it('stops when the run ends (the store stops calling it: inactive is idle at any time)', () => {
    expect(autoDecision(input({ now: T0 + 9 * HOUR, active: false }))).toEqual({ do: 'idle' });
  });

  it('counts from the start of a carried-on run, not from its old send', () => {
    // The row went up 5 hours ago; the run came back just now: not due for an interval, then it sends once.
    const i = input({ lastSentAt: T0 - 5 * HOUR, lastSentKey: null, startedAt: T0 });
    expect(autoDecision({ ...i, now: T0 + MIN })).toEqual({ do: 'wait', at: T0 + HOUR });
    expect(autoDecision({ ...i, now: T0 + HOUR })).toEqual({ do: 'send' });
  });
});

describe('bestKey', () => {
  it('names the route and TE, not when it was found', () => {
    expect(bestKey({ chain: [1, 2], te: 248 })).toBe('248:1,2');
    expect(bestKey(null)).toBeNull();
    expect(bestKey({ chain: [1, 2], te: 248 })).not.toBe(bestKey({ chain: [1, 3], te: 248 }));
  });
});

describe('autoStatusLine', () => {
  const base = { lastTe: 248 as number | null, failed: false };
  it('says when it last sent and when the next is due', () => {
    const sent = T0;
    const line = autoStatusLine({ ...input({ lastSentAt: sent, now: sent + 20 * MIN }), ...base });
    expect(line).toBe('Last sent 12:00 pm (best 248). Next in about 40 min.');
  });
  it('says so before the first send', () => {
    expect(autoStatusLine({ ...input({ now: T0 + 10 * MIN }), ...base })).toBe(
      'Nothing sent yet. Next in about 50 min.'
    );
  });
  it('leaves the best out when a carry-on no longer knows it', () => {
    const line = autoStatusLine({ ...input({ lastSentAt: T0, now: T0 + 30 * MIN }), lastTe: null, failed: false });
    expect(line).toBe('Last sent 12:00 pm. Next in about 30 min.');
  });
  it('mentions a failed try, and the next one', () => {
    const failedAt = T0 + HOUR;
    const line = autoStatusLine({
      ...input({ lastSentAt: T0, lastFailAt: failedAt, now: failedAt + 5 * MIN }),
      ...base,
      failed: true,
    });
    expect(line).toBe("Last sent 12:00 pm (best 248). Couldn't send at 1:00 pm. Next in about 55 min.");
  });
  it('says it goes as soon as the best changes once the time has come', () => {
    const line = autoStatusLine({ ...input({ lastSentAt: T0, now: T0 + 2 * HOUR }), ...base });
    expect(line).toContain('Next as soon as the best changes.');
  });
});

describe('aboutIn', () => {
  it('rounds up to whole minutes', () => {
    expect(aboutIn(30_000)).toBe('under a minute');
    expect(aboutIn(40 * MIN - 1)).toBe('about 40 min');
    expect(aboutIn(65 * MIN)).toBe('about 1 h 5 min');
    expect(aboutIn(2 * HOUR)).toBe('about 2 h');
  });
});

describe('the remembered choice', () => {
  it('defaults to off and an hour', () => {
    expect(DEFAULT_OPTIONS.autoSendBest).toBe(false);
    expect(DEFAULT_OPTIONS.autoSendEveryMin).toBe(60);
    expect(readAutoEveryMin(undefined)).toBe(60);
    expect(readAutoEveryMin(45)).toBe(60);
    expect(readAutoEveryMin(30)).toBe(30);
  });
  it('reads back from the browser, and survives one that cannot be read', () => {
    const kv = (v: string | null) => ({ getItem: () => v, setItem: () => undefined });
    expect(readOptions(kv(JSON.stringify({ autoSendBest: true, autoSendEveryMin: 30 })))).toMatchObject({
      autoSendBest: true,
      autoSendEveryMin: 30,
    });
    // An option set by an older build has neither field.
    expect(readOptions(kv(JSON.stringify({ autoCarryOn: true })))).toMatchObject({
      autoCarryOn: true,
      autoSendBest: false,
      autoSendEveryMin: 60,
    });
    expect(readOptions(kv('not json'))).toEqual(DEFAULT_OPTIONS);
  });
});
