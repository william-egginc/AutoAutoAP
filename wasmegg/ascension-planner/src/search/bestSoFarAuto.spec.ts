import { describe, expect, it } from 'vitest';
import {
  autoDecision,
  autoStatusLine,
  aboutIn,
  bestKey,
  bestLabel,
  nextDueAt,
  progressKey,
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
    lastSkipAt: null,
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

describe('progressKey: anything new since the last send', () => {
  const best = { chain: [212, 280, 490], te: 490 };
  it('moves when more was priced, even with the same best, and with a new best', () => {
    const k = progressKey({ done: 3735, best });
    expect(progressKey({ done: 3735, best })).toBe(k);
    expect(progressKey({ done: 3736, best })).not.toBe(k);
    expect(progressKey({ done: 3735, best: { chain: [212, 281, 490], te: 490 } })).not.toBe(k);
  });
  it('is null until the run has a best', () => {
    expect(progressKey({ done: 50, best: null })).toBeNull();
    expect(progressKey(null)).toBeNull();
  });
  it('sends at the due time when only the count moved', () => {
    const sent = T0 + 10 * MIN;
    const i = input({ lastSentAt: sent, lastSentKey: progressKey({ done: 100, best }), now: sent + HOUR });
    expect(autoDecision({ ...i, key: progressKey({ done: 100, best }) })).toEqual({ do: 'skip' });
    expect(autoDecision({ ...i, key: progressKey({ done: 180, best }) })).toEqual({ do: 'send' });
  });
});

describe('autoStatusLine', () => {
  const base = { lastBest: 'best 248' as string | null, failed: false };
  it('says when it last sent and when the next is due', () => {
    const sent = T0;
    const line = autoStatusLine({ ...input({ lastSentAt: sent, now: sent + 20 * MIN }), ...base });
    expect(line).toBe('Last progress sent 12:00 pm (best 248). Next in about 40 min.');
  });
  it("says what the send carried: the best, how much was priced, and the CSV (the user's example)", () => {
    const sent = new Date(2026, 9, 9, 16, 20).getTime();
    const line = autoStatusLine({
      ...input({ lastSentAt: sent, startedAt: sent - 2 * HOUR, now: sent }),
      lastBest: bestLabel('fastest', 490, '24 Feb 2029'),
      lastDetail: '3,735 chains, CSV 2.1 MB',
      failed: false,
    });
    expect(line).toBe(
      'Last progress sent 4:20 pm (best reaches 490 on 24 Feb 2029; 3,735 chains, CSV 2.1 MB). Next in about 60 min.'
    );
  });
  it("says the collector's daily cap, until the next send", () => {
    const refusedAt = T0 + 2 * HOUR;
    const i = {
      ...input({ lastSentAt: T0, retryAt: refusedAt + 5 * HOUR, now: refusedAt + MIN }),
      ...base,
      refused: { at: refusedAt, why: 'the board takes at most 48 progress sends a day from one account' },
    };
    expect(autoStatusLine(i)).toBe(
      'Not sent at 2:00 pm: the board takes at most 48 progress sends a day from one account. Next in about 4 h 59 min.'
    );
    expect(autoStatusLine({ ...i, lastSentAt: refusedAt + 6 * HOUR, now: refusedAt + 6 * HOUR })).toMatch(
      /^Last progress sent/
    );
  });
  it('says so before the first send', () => {
    expect(autoStatusLine({ ...input({ now: T0 + 10 * MIN }), ...base })).toBe(
      'Nothing sent yet. Next in about 50 min.'
    );
  });
  it('leaves the best out when a carry-on no longer knows it', () => {
    const line = autoStatusLine({ ...input({ lastSentAt: T0, now: T0 + 30 * MIN }), lastBest: null, failed: false });
    expect(line).toBe('Last progress sent 12:00 pm. Next in about 30 min.');
  });
  it('mentions a failed try, and the next one', () => {
    const failedAt = T0 + HOUR;
    const line = autoStatusLine({
      ...input({ lastSentAt: T0, lastFailAt: failedAt, now: failedAt + 5 * MIN }),
      ...base,
      failed: true,
    });
    expect(line).toBe("Last progress sent 12:00 pm (best 248). Couldn't send at 1:00 pm. Next in about 55 min.");
  });
  it('says a due time passed with nothing new priced, and when it looks again (review, 9 Oct)', () => {
    // Sent 3:50 pm; due 4:20 pm (every 30 min) with nothing new priced: not sent, and said.
    const sent = new Date(2026, 9, 9, 15, 50).getTime();
    const skip = sent + 30 * MIN;
    const i = {
      ...input({ everyMs: 30 * MIN, startedAt: T0, lastSentAt: sent, lastSkipAt: skip, now: skip }),
      ...base,
    };
    expect(autoStatusLine(i)).toBe(
      'Not sent at 4:20 pm: nothing new priced since 3:50 pm. Next check in about 30 min.'
    );
    // The next check is one interval on from the skip.
    expect(nextDueAt(i)).toBe(skip + 30 * MIN);
    expect(autoDecision({ ...i, key: 'better', now: skip + 10 * MIN })).toEqual({ do: 'wait', at: skip + 30 * MIN });
    expect(autoDecision({ ...i, key: 'better', now: skip + 30 * MIN })).toEqual({ do: 'send' });
    // Nothing found yet at the first due time.
    expect(autoStatusLine({ ...input({ key: null, lastSkipAt: T0 + HOUR, now: T0 + HOUR }), ...base })).toBe(
      'Not sent at 1:00 pm: nothing found yet. Next check in about 60 min.'
    );
    // A later send wins the line back.
    expect(
      autoStatusLine({ ...input({ lastSentAt: skip + 30 * MIN, lastSkipAt: skip, now: skip + 31 * MIN }), ...base })
    ).toBe('Last progress sent 4:50 pm (best 248). Next in about 59 min.');
  });
  it('names a Fastest best by its finish date, a By a date best by its TE', () => {
    expect(bestLabel('fastest', 490, 'Feb 24, 2029')).toBe('best reaches 490 on Feb 24, 2029');
    expect(bestLabel('deadline', 248, 'Feb 24, 2029')).toBe('best 248');
    const line = autoStatusLine({
      ...input({ lastSentAt: T0, now: T0 + 20 * MIN }),
      lastBest: bestLabel('fastest', 490, 'Feb 24, 2029'),
      failed: false,
    });
    expect(line).toBe('Last progress sent 12:00 pm (best reaches 490 on Feb 24, 2029). Next in about 40 min.');
  });
  it('says it goes as soon as something new is priced once the time has come', () => {
    const line = autoStatusLine({ ...input({ lastSentAt: T0, now: T0 + 2 * HOUR }), ...base });
    expect(line).toContain('Next as soon as something new is priced.');
  });
});

describe('aboutIn', () => {
  it('rounds up to whole minutes', () => {
    expect(aboutIn(30_000)).toBe('under a minute');
    expect(aboutIn(40 * MIN - 1)).toBe('about 40 min');
    expect(aboutIn(60 * MIN)).toBe('about 60 min');
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
