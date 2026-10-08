import { describe, expect, it } from 'vitest';
import { simpleWidths, summariseByDate, tookDuration } from './deadlineSummary';

const base = { shapes: 236, priced: 1107, stoppedEarly: false, lastHi: 318 };
const band = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

describe('By a date run summary', () => {
  it('formats durations', () => {
    expect(tookDuration(45)).toBe('45 s');
    expect(tookDuration(340)).toBe('5 min 40 s');
    expect(tookDuration(600)).toBe('10 min');
    expect(tookDuration(4320)).toBe('1 h 12 min');
  });

  it('says how long Simple took and what it searched', () => {
    const s = summariseByDate({
      ...base,
      simple: true,
      elapsedSeconds: 340,
      workers: 7,
      bandSets: [[band(197, 203), band(250, 256)], [band(150, 152), band(180, 184), band(220, 222), band(260, 262), band(300, 302)]],
    });
    expect(s.line).toBe(
      "Took 5 min 40 s on 7 workers · searched 236 sets of early stops (Simple: around the instant answer's routes, ±3/±2 TE) · 1,107 routes priced"
    );
    expect(s.chains).toEqual([]);
  });

  it('lists Advanced chains and the last stop box', () => {
    const s = summariseByDate({
      ...base,
      elapsedSeconds: 3700,
      workers: 1,
      lastLo: 278,
      bandSets: [[band(189, 215), band(211, 251).filter((_, i) => i % 10 === 0), [257, 267, 277, 287, 297]]],
    });
    expect(s.line.startsWith('Took 1 h 2 min on 1 worker · searched 236 sets of early stops (Advanced')).toBe(true);
    expect(s.chains).toEqual(['4 ascensions 189-215:1; 211-251:10; 257-297:10']);
    expect(s.lastStop).toBe('last stop 278-318');
  });

  it('copes with a result saved before the time was kept', () => {
    const s = summariseByDate({ ...base });
    expect(s.line.startsWith('Searched 236 sets of early stops')).toBe(true);
    expect(s.chains).toEqual([]);
    expect(simpleWidths(undefined)).toBe('');
  });
});
