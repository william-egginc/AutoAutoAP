import { describe, expect, it } from 'vitest';
import {
  AUTO_WIDEN_ROUNDS,
  QUICK_SCAN_SHAPES,
  autoFallbackNote,
  betterRoute,
  needsQuickScan,
  nextWidenRound,
  quickScanSpec,
  runAutoWiden,
  scanLastHi,
  widenStatus,
  type WidenState,
} from './autoWiden';
import { parseBands } from './exhaustive';
import { countShapes, stepForBudget } from './deadline';

const run = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

/** The low-TE player's case (TE 78): the best route on the floor of every box. */
const te78: WidenState = {
  hadInstant: false,
  bands: [run(79, 85), run(94, 100), run(119, 125)],
  chain: [79, 94, 119, 160],
  currentTE: 78,
  stopped: false,
  busy: false,
};

describe('nextWidenRound', () => {
  it('TE 78, every stop on its floor: the 1st (79, your TE + 1) is a true floor; the 2nd and 3rd widen', () => {
    const d = nextWidenRound({ ...te78, roundsDone: 0 });
    expect(d.next).toBe(true);
    if (!d.next) return;
    expect(d.round).toBe(1);
    expect(d.edges.map(e => e.band)).toEqual([2, 3]);
    const wider = parseBands(d.text);
    expect(wider[0]).toEqual(run(79, 85));
    expect(wider[1][0]).toBeLessThan(94);
    expect(wider[2][0]).toBeLessThan(119);
    expect(d.status).toBe('Round 1 of up to 3: widening the 2nd stop below 94 and the 3rd stop below 119…');
  });

  it('stops after 3 rounds', () => {
    expect(nextWidenRound({ ...te78, roundsDone: 2 })).toMatchObject({ next: true, round: 3 });
    expect(nextWidenRound({ ...te78, roundsDone: AUTO_WIDEN_ROUNDS })).toEqual({ next: false, why: 'rounds' });
  });

  it('never with an instant answer, after a stop, or while another run goes', () => {
    expect(nextWidenRound({ ...te78, hadInstant: true, roundsDone: 0 })).toEqual({ next: false, why: 'instant' });
    expect(nextWidenRound({ ...te78, stopped: true, roundsDone: 0 })).toEqual({ next: false, why: 'stopped' });
    expect(nextWidenRound({ ...te78, busy: true, roundsDone: 0 })).toEqual({ next: false, why: 'busy' });
  });

  it('ends with no edge: the best route inside its box, or no box holding it', () => {
    expect(nextWidenRound({ ...te78, chain: [79, 97, 122, 160], roundsDone: 0 })).toEqual({
      next: false,
      why: 'noEdge',
    });
    expect(nextWidenRound({ ...te78, bands: null, roundsDone: 0 })).toEqual({ next: false, why: 'noEdge' });
    // Only the 1st stop on its floor, which can't move.
    expect(nextWidenRound({ ...te78, bands: [run(79, 85)], chain: [79, 160], roundsDone: 0 })).toEqual({
      next: false,
      why: 'noEdge',
    });
  });

  it('widens a wide-step box down to the floor (80-90:5 at TE 77 tries 78 and 79)', () => {
    const d = nextWidenRound({ ...te78, bands: [[80, 85, 90]], chain: [80, 160], currentTE: 77, roundsDone: 0 });
    expect(d.next && parseBands(d.text)[0]).toEqual([78, 79, 80, 85, 90]);
    expect(d.next && d.status).toBe('Round 1 of up to 3: widening the 1st stop below 80…');
  });

  it('says a high edge as "above"', () => {
    expect(widenStatus(2, 3, [{ band: 1, side: 'high', value: 140 }])).toBe(
      'Round 2 of up to 3: widening the 1st stop above 140…'
    );
  });
});

describe('runAutoWiden', () => {
  it('runs up to 3 rounds while an edge stays, each on the box the last one widened', async () => {
    let state: WidenState = { ...te78 };
    const statuses: string[] = [];
    const ran: string[] = [];
    const out = await runAutoWiden({
      read: () => state,
      onStatus: s => statuses.push(s),
      runRound: async d => {
        ran.push(d.text);
        // The best route moves to the new floor of the 2nd box each time: still an edge.
        const bands = parseBands(d.text);
        state = { ...state, bands, chain: [79, bands[1][0], bands[2][0], 160] };
      },
    });
    expect(out).toEqual({ rounds: 3, why: 'rounds' });
    expect(ran).toHaveLength(3);
    expect(statuses.map(s => s.slice(0, 18))).toEqual([
      'Round 1 of up to 3',
      'Round 2 of up to 3',
      'Round 3 of up to 3',
    ]);
    // The 1st box never moved.
    for (const t of ran) expect(parseBands(t)[0]).toEqual(run(79, 85));
  });

  it('ends when the edge goes, and starts nothing after a stop', async () => {
    let state: WidenState = { ...te78 };
    let rounds = 0;
    expect(
      await runAutoWiden({
        read: () => state,
        runRound: async () => {
          rounds++;
          state = { ...state, chain: [79, 97, 122, 160], bands: [run(79, 85), run(84, 100), run(109, 125)] };
        },
      })
    ).toEqual({ rounds: 1, why: 'noEdge' });
    expect(rounds).toBe(1);

    state = { ...te78 };
    rounds = 0;
    expect(
      await runAutoWiden({
        read: () => state,
        runRound: async () => {
          rounds++;
          state = { ...state, stopped: true };
        },
      })
    ).toEqual({ rounds: 1, why: 'stopped' });
    expect(rounds).toBe(1);
  });
});

describe('the quick scan', () => {
  it('goes first only with no instant answer and no earlier answer to centre on', () => {
    expect(needsQuickScan({ hadInstant: false, answers: [], currentTE: 78 })).toBe(true);
    expect(needsQuickScan({ hadInstant: true, answers: [], currentTE: 78 })).toBe(false);
    expect(needsQuickScan({ hadInstant: false, answers: [[95, 160]], currentTE: 78 })).toBe(false);
    // An answer from below the TE now (or of one stop) has nothing to centre on.
    expect(needsQuickScan({ hadInstant: false, answers: [[70, 160], [160]], currentTE: 78 })).toBe(true);
  });

  it('looks up to TE + 150 at least, never past 490', () => {
    expect(scanLastHi(78, 193)).toBe(228);
    expect(scanLastHi(78, 300)).toBe(300);
    expect(scanLastHi(400, 0)).toBe(490);
  });

  it('is a Nearby routes run of the coarse pass alone, 1 to 5 ascensions, inside its budget', () => {
    const s = quickScanSpec({
      currentTE: 78,
      deadline: 2_000_000_000,
      guessHi: 193,
      ascendNeeded: false,
      level: 'quick',
    });
    expect(s).toMatchObject({
      minStops: 1,
      maxStops: 5,
      lastLo: 79,
      lastHi: 228,
      extend: true,
      refine: false,
      simple: true,
      level: 'quick',
      fallback: { scanned: true, widenRounds: 0 },
    });
    expect(s.bandSets).toBeUndefined();
    const shape = {
      currentTE: 78,
      planStart: 0,
      deadline: s.deadline,
      minStops: 1,
      maxStops: 5,
      lastLo: 79,
      lastHi: 228,
      step: 5,
      maxShapes: QUICK_SCAN_SHAPES,
    };
    expect(s.sets).toBe(countShapes(shape, stepForBudget(shape)));
    expect(s.sets!).toBeLessThanOrEqual(QUICK_SCAN_SHAPES);
    expect(s.estimate).toBe(s.sets! * 4);
  });
});

describe('betterRoute (Stop & keep best)', () => {
  const r = (last: number, spare: number) => ({ chain: [90, last], spare });
  it('prefers the higher last stop, then the time to spare', () => {
    expect(betterRoute(r(160, 0), r(159, 99))).toBe(true);
    expect(betterRoute(r(159, 99), r(160, 0))).toBe(false);
    expect(betterRoute(r(160, 5), r(160, 5))).toBe(true);
    expect(betterRoute(r(160, 4), r(160, 5))).toBe(false);
  });
  it('a missing route is never better; anything beats none', () => {
    expect(betterRoute(null, r(160, 0))).toBe(false);
    expect(betterRoute(r(100, 0), undefined)).toBe(true);
  });
});

describe('autoFallbackNote', () => {
  it('says what the fallback did, never "table"', () => {
    expect(autoFallbackNote({ scanned: true, widenRounds: 2 })).toBe(
      'No instant answer for your TE yet: started from a quick scan and widened automatically.'
    );
    expect(autoFallbackNote({ scanned: true, widenRounds: 0 })).toBe(
      'No instant answer for your TE yet: started from a quick scan.'
    );
    expect(autoFallbackNote({ scanned: false, widenRounds: 1 })).toBe(
      'No instant answer for your TE yet: started from your last answer and widened automatically.'
    );
    for (const f of [true, false])
      for (const n of [0, 3]) expect(autoFallbackNote({ scanned: f, widenRounds: n })).not.toMatch(/table/i);
  });
});
