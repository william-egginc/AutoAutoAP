/** The screen reader's status lines (lib/liveStatus.ts): the instant answer's state, a search's progress, throttled. */
import { describe, expect, it } from 'vitest';
import { LIVE_GAP_MS, instantLiveText, runEndText, runLiveText, runName, shouldSay } from './liveStatus';
import { NAMES } from './siteNav';

describe('instantLiveText', () => {
  it('says it is working, then that it is ready; nothing when idle, failed or empty', () => {
    expect(instantLiveText('loading', false)).toBe('Working out the instant answer');
    expect(instantLiveText('loading', true)).toBe('Working out the instant answer');
    expect(instantLiveText('done', true)).toBe('Instant answer ready');
    expect(instantLiveText('done', false)).toBe('');
    expect(instantLiveText('idle', false)).toBe('');
    expect(instantLiveText('error', true)).toBe('');
  });
});

describe('a search', () => {
  it('is named as the player picked it', () => {
    expect(runName('smart', 'quick')).toBe('Fast');
    expect(runName('smart', 'normal')).toBe('Exact');
    expect(runName('full', 'quick')).toBe('Custom');
    expect(runName('by-date', null)).toBe(NAMES.byDate);
    expect(runName('start-times', null)).toBe(NAMES.start);
  });
  it('says how far it is, with or without a total, and when it stops or ends', () => {
    const p = { done: 3, total: 12, unit: 'routes', stopping: false };
    expect(runLiveText(p, 'Fast')).toBe('Fast search: 3 of 12 routes done');
    expect(runLiveText({ ...p, total: null, done: 1200 }, 'Custom')).toBe('Custom search: 1,200 routes done');
    expect(runLiveText({ ...p, stopping: true }, 'Fast')).toBe('Fast search: stopping');
    expect(runEndText('Exact')).toBe('Exact search finished');
  });
});

describe('shouldSay', () => {
  const t0 = 1_000_000;
  it('says the first line at once, and nothing empty or repeated', () => {
    expect(shouldSay(null, 'a', t0, false)).toBe(true);
    expect(shouldSay(null, '', t0, true)).toBe(false);
    expect(shouldSay({ text: 'a', at: t0 }, 'a', t0 + LIVE_GAP_MS * 3, true)).toBe(false);
  });
  it('waits 10 s between progress lines', () => {
    expect(LIVE_GAP_MS).toBe(10_000);
    expect(shouldSay({ text: 'a', at: t0 }, 'b', t0 + 9_999, false)).toBe(false);
    expect(shouldSay({ text: 'a', at: t0 }, 'b', t0 + 10_000, false)).toBe(true);
  });
  it('says the end at once, however soon after the last line', () => {
    expect(shouldSay({ text: 'a', at: t0 }, 'Fast search finished', t0 + 1, true)).toBe(true);
  });
  it('a search ticking every second for a minute is said 7 times (at 0, 10, … 60 s), then its end', () => {
    let last: { text: string; at: number } | null = null;
    let n = 0;
    for (let s = 0; s <= 60; s++) {
      const text = `Fast search: ${s} of 60 routes done`;
      if (shouldSay(last, text, t0 + s * 1000, false)) {
        last = { text, at: t0 + s * 1000 };
        n++;
      }
    }
    expect(n).toBe(7);
    expect(shouldSay(last, runEndText('Fast'), t0 + 60_500, true)).toBe(true);
  });
});
