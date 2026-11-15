/**
 * M13 item 2 (12 Nov 2026, Jordan): a fresh ascension's early build-up is hours, but its third Curiosity wait (C3)
 * can take 1 to 3 weeks, and the Full timeline said only "Its first hours: about 6 build-up shifts". It lists C3
 * as its own line: "Wait on Curiosity (C3): about Dec 22 to Jan 1", from the ascension's start to its first listed
 * shift (H1, the swap to Humility once C3 is done), which the table's version 2 cell stores (`h1At`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ascensionSteps } from './instantSteps';
import { c3Wait } from './c3WaitWords';
const wait = (l: NonNullable<Parameters<typeof ascensionSteps>[0]>[number]) => c3Wait(ascensionSteps([l], null, null)[0]);
import { legShifts } from '@/search/legShifts';
import type { BuildParams } from '@/search/precomputedLeg';
import type { BuildExtras } from '@/search/tableV2';

const D = 86400;
const T0 = Date.parse('2026-12-22T17:00:00Z') / 1000;
const leg = (over: Record<string, unknown> = {}) => ({
  from: 222,
  to: 243,
  endTE: 243,
  start: T0,
  end: T0 + 20 * D,
  label: '2-sale',
  shifts: [
    { at: T0 + 10 * D, egg: 'humility' },
    { at: T0 + 10 * D + 3600, egg: 'kindness' },
  ],
  ...over,
});

describe('ascensionSteps: the C3 wait of a fresh ascension', () => {
  it('a fresh table ascension: C3 waits from its start to its first listed shift (H1)', () => {
    expect(wait(leg())).toEqual({ from: T0, to: T0 + 10 * D });
  });
  it('a short C3 (under half a day) is just the first hours: no line', () => {
    expect(wait(leg({ shifts: [{ at: T0 + 3 * 3600, egg: 'humility' }] }))).toBeNull();
  });
  it('the simulated ascension lists its shifts exactly: no estimated line', () => {
    expect(wait(leg({ simulated: true }))).toBeNull();
  });
  it('one that continues the save\'s farm has no C3 of its own', () => {
    expect(wait(leg({ label: 'continue' }))).toBeNull();
  });
  it('no shifts listed: nothing to end it at', () => {
    expect(wait(leg({ shifts: [] }))).toBeNull();
  });
});

// The sample check: the table's own cells (the version 2 generator's twenty), the numbers the finder prices with.
type Cell = { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] };
const cells: Cell[] = readFileSync(fileURLToPath(new URL('../search/tableV2.fixture.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));

describe('C3 wait on the generator cells: the first listed shift is H1 at h1At, from the ascension start', () => {
  it('every cell: the replay\'s first shift is Humility at start + h1At, so the wait is start to h1At', () => {
    let n = 0;
    for (const c of cells) {
      const b = c.builds[0];
      const start = T0;
      const r = legShifts(b, c.te + 3, { start });
      if (!r) continue;
      expect(r.shifts[0].egg).toBe('humility');
      expect(r.shifts[0].at).toBe(start + b.extras.h1At);
      const w = wait(leg({ start, end: start + r.seconds, shifts: r.shifts }));
      if (b.extras.h1At >= 0.5 * D) expect(w).toEqual({ from: start, to: start + b.extras.h1At });
      else expect(w).toBeNull();
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });
});
