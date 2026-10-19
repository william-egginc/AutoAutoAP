import { describe, expect, it } from 'vitest';
import {
  AUTO_WIDEN_ROUNDS,
  CENTRE_TE_SLACK,
  FALLBACK_BUDGET_SECONDS,
  NEARBY_MIN_SECONDS,
  WIDEN_MAX_SETS,
  afterScanStatus,
  budgetBands,
  nearbyBudgetSeconds,
  roundChains,
  roundFits,
  INSTANT_SETTLE_MS,
  INSTANT_TIMEOUT_STATUS,
  INSTANT_WAIT_STATUS,
  QUICK_SCAN_SHAPES,
  autoFallbackNote,
  awaitInstant,
  betterRoute,
  canCentreOn,
  decideInstant,
  needsQuickScan,
  type InstantState,
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

/** The widening as it was before the round budget (18 Oct 2026), for the specs about which edges move. */
const unbudgeted = { maxRounds: 3, maxSets: Infinity };

describe('nextWidenRound', () => {
  it('TE 78, every stop on its floor: the 1st (79, your TE + 1) is a true floor; the 2nd and 3rd widen', () => {
    const d = nextWidenRound({ ...te78, ...unbudgeted, roundsDone: 0 });
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

  it('stops after its rounds: 1 by default (since 18 Oct 2026), and none at 0', () => {
    expect(AUTO_WIDEN_ROUNDS).toBe(1);
    expect(nextWidenRound({ ...te78, roundsDone: 0 })).toMatchObject({ next: true, round: 1 });
    expect(nextWidenRound({ ...te78, roundsDone: AUTO_WIDEN_ROUNDS })).toEqual({ next: false, why: 'rounds' });
    expect(nextWidenRound({ ...te78, roundsDone: 2, maxRounds: 3 })).toMatchObject({ next: true, round: 3 });
    expect(nextWidenRound({ ...te78, roundsDone: 3, maxRounds: 3 })).toEqual({ next: false, why: 'rounds' });
    // Off: no automatic round at all (Widen and run again under the answer still goes by hand).
    expect(nextWidenRound({ ...te78, roundsDone: 0, maxRounds: 0 })).toEqual({ next: false, why: 'rounds' });
  });

  it("holds the widened box to the round's budget: TE 78's 7 x 17 x 17 sets come down to 36 or fewer", () => {
    const d = nextWidenRound({ ...te78, roundsDone: 0 });
    expect(d.next).toBe(true);
    if (!d.next) return;
    const b = parseBands(d.text);
    const sets = b.reduce((n, x) => n * x.length, 1);
    expect(sets).toBeLessThanOrEqual(WIDEN_MAX_SETS);
    // The 1st stop (not on a movable edge) pinned to the best route's; the 2nd and 3rd still reach
    // below their old floors, and the best route is still in the box.
    expect(b[0]).toEqual([79]);
    expect(b[1][0]).toBeLessThan(94);
    expect(b[2][0]).toBeLessThan(119);
    expect(b[1]).toContain(94);
    expect(b[2]).toContain(119);
    expect(d.status).toBe('Widening the 2nd stop below 94 and the 3rd stop below 119, one small round…');
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
    const d = nextWidenRound({
      ...te78,
      ...unbudgeted,
      bands: [[80, 85, 90]],
      chain: [80, 160],
      currentTE: 77,
      roundsDone: 0,
    });
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
      ...unbudgeted,
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
        ...unbudgeted,
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

describe("the fallback's time limits", () => {
  it('scans 100 sets and holds the whole fallback to about 15 min', () => {
    expect(QUICK_SCAN_SHAPES).toBe(100);
    expect(FALLBACK_BUDGET_SECONDS).toBe(15 * 60);
    expect(WIDEN_MAX_SETS).toBe(36);
  });

  it("gives Nearby routes what is left after the scan, never under a minute", () => {
    expect(nearbyBudgetSeconds(0)).toBe(900);
    expect(nearbyBudgetSeconds(9 * 60)).toBe(6 * 60);
    expect(nearbyBudgetSeconds(14.5 * 60)).toBe(NEARBY_MIN_SECONDS);
    expect(nearbyBudgetSeconds(40 * 60)).toBe(NEARBY_MIN_SECONDS);
    expect(nearbyBudgetSeconds(NaN)).toBe(900);
  });

  it('starts a widening round only when it fits what is left', () => {
    expect(roundFits({ elapsedSeconds: 600, roundSeconds: 200 })).toBe(true);
    expect(roundFits({ elapsedSeconds: 800, roundSeconds: 200 })).toBe(false);
    expect(roundFits({ elapsedSeconds: 0, roundSeconds: NaN })).toBe(false);
    expect(roundFits({ elapsedSeconds: 100, roundSeconds: 100, budget: 150 })).toBe(false);
  });

  it('says how long Nearby routes was given, and that Stop keeps the best', () => {
    expect(afterScanStatus(361)).toBe(
      "Checking the routes near the quick scan's best, in boxes sized to take about 6 min so the whole search " +
        'stays near 15 min. Stop keeps the best route so far…'
    );
    expect(afterScanStatus(10)).toContain('about 1 min');
  });

  it('budgetBands: as widened when it fits, else pins the stops not widened, then thins the widened ones', () => {
    // TE 100's widened box measured 18 Oct (best 125 152 177): 5 x 15 x 15 = 1,125 sets.
    const wide = [run(123, 127), run(148, 162), run(173, 187)];
    const edges = [{ band: 2 }, { band: 3 }];
    expect(budgetBands(wide, [125, 152, 177, 203], edges, 2000)).toEqual(wide);
    const fit = budgetBands(wide, [125, 152, 177, 203], edges);
    expect(fit[0]).toEqual([125]);
    expect(fit[1].length * fit[2].length).toBeLessThanOrEqual(36);
    expect(fit[1]).toContain(152);
    expect(fit[2]).toContain(177);
    // Every 3rd TE from the best route's stop: 149 152 ... 161 and 174 177 ... 186.
    expect(fit[1]).toEqual([149, 152, 155, 158, 161]);
    expect(fit[2]).toEqual([174, 177, 180, 183, 186]);
    // Pinning alone is enough here.
    expect(budgetBands([run(123, 127), run(150, 155)], [125, 155, 200], [{ band: 2 }], 6)).toEqual([
      [125],
      run(150, 155),
    ]);
  });

  it('roundChains: the widened box, and every other count as its best route', () => {
    const chains = [
      { asc: 1, text: '' },
      { asc: 2, text: '147-153:1' },
      { asc: 3, text: '122-128:1; 172-178:1' },
      { asc: 4, text: '123-127:1; 148-152:1; 173-177:1' },
      { asc: 5, text: '104-106:1; 124-126:1; 149-151:1; 174-176:1' },
    ];
    const byStops = [[188], [151, 200], [125, 173, 202], [125, 152, 177, 203]];
    expect(roundChains({ chains, row: 3, text: '125; 149-161:3; 173-185:3', byStops })).toEqual([
      { asc: 1, text: '' },
      { asc: 2, text: '151' },
      { asc: 3, text: '125; 173' },
      { asc: 4, text: '125; 149-161:3; 173-185:3' },
      // No 5-ascension route in the answer: left out.
    ]);
  });

  it('runAutoWiden starts no round that does not fit', async () => {
    let ran = 0;
    const out = await runAutoWiden({
      read: () => te78,
      fits: () => false,
      runRound: async () => {
        ran++;
      },
    });
    expect(out).toEqual({ rounds: 0, why: 'budget' });
    expect(ran).toBe(0);
  });
});

describe('the quick scan', () => {
  const DATE = 2_000_000_000;
  const answer = (chains: number[][], o: { deadline?: number; te?: number } = {}) => ({
    deadline: o.deadline ?? DATE,
    te: o.te ?? 78,
    chains,
  });

  it('goes first only with no instant answer and no earlier answer to centre on', () => {
    expect(needsQuickScan({ hadInstant: false, answer: null, deadline: DATE, currentTE: 78 })).toBe(true);
    expect(needsQuickScan({ hadInstant: true, answer: null, deadline: DATE, currentTE: 78 })).toBe(false);
    expect(needsQuickScan({ hadInstant: false, answer: answer([[95, 160]]), deadline: DATE, currentTE: 78 })).toBe(
      false
    );
    // An answer from below the TE now (or of one stop) has nothing to centre on.
    expect(
      needsQuickScan({ hadInstant: false, answer: answer([[70, 160], [160]]), deadline: DATE, currentTE: 78 })
    ).toBe(true);
  });

  it('centres on an earlier answer only for the same date and within 3 TE of the save', () => {
    expect(CENTRE_TE_SLACK).toBe(3);
    const chains = [[95, 160]];
    // Same date, TE within 3 either way: centre on it.
    for (const te of [75, 76.5, 78, 80, 81])
      expect(canCentreOn({ answer: answer(chains, { te }), deadline: DATE, currentTE: 78 })).toBe(true);
    // TE off by more than 3: scan.
    for (const te of [74, 74.9, 81.1, 90]) {
      expect(canCentreOn({ answer: answer(chains, { te }), deadline: DATE, currentTE: 78 })).toBe(false);
      expect(needsQuickScan({ hadInstant: false, answer: answer(chains, { te }), deadline: DATE, currentTE: 78 })).toBe(
        true
      );
    }
    // Another date, even at the same TE: scan.
    expect(canCentreOn({ answer: answer(chains, { deadline: DATE + 86400 }), deadline: DATE, currentTE: 78 })).toBe(
      false
    );
    expect(
      needsQuickScan({
        hadInstant: false,
        answer: answer(chains, { deadline: DATE - 3600 }),
        deadline: DATE,
        currentTE: 78,
      })
    ).toBe(true);
    // An instant answer: never a scan, whatever the earlier answer.
    expect(
      needsQuickScan({ hadInstant: true, answer: answer(chains, { te: 50 }), deadline: DATE + 1, currentTE: 78 })
    ).toBe(false);
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

describe('waiting for the instant answer before the fallback', () => {
  it('decides from the instant answer as it stands', () => {
    // Still loading: wait.
    expect(decideInstant({ state: 'loading', waitedMs: 0 })).toEqual({ go: 'wait' });
    expect(decideInstant({ state: 'loading', waitedMs: INSTANT_SETTLE_MS - 1 })).toEqual({ go: 'wait' });
    // Settled with none: the fallback.
    expect(decideInstant({ state: 'none', waitedMs: 0 })).toEqual({ go: 'fallback', timedOut: false });
    // Not settled in 10 seconds: the fallback, saying so.
    expect(INSTANT_SETTLE_MS).toBe(10_000);
    expect(decideInstant({ state: 'loading', waitedMs: INSTANT_SETTLE_MS })).toEqual({
      go: 'fallback',
      timedOut: true,
    });
    // Settled with an answer: the normal run, centred on it.
    expect(decideInstant({ state: 'answer', waitedMs: 0 })).toEqual({ go: 'normal' });
    expect(decideInstant({ state: 'answer', waitedMs: 60_000 })).toEqual({ go: 'normal' });
  });

  /** A fake clock: `sleep` moves it on, and `states` gives the state at each look. */
  function clock(states: (t: number) => InstantState) {
    let t = 0;
    const looks: number[] = [];
    return {
      read: () => {
        looks.push(t);
        return states(t);
      },
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
      looks,
    };
  }

  it('goes straight on when the instant answer has already settled, with no waiting line', async () => {
    for (const [state, want] of [
      ['answer', { go: 'normal' }],
      ['none', { go: 'fallback', timedOut: false }],
    ] as const) {
      const c = clock(() => state);
      let waited = false;
      expect(await awaitInstant({ ...c, onWait: () => (waited = true) })).toEqual(want);
      expect(waited).toBe(false);
      expect(c.looks).toEqual([0]);
    }
  });

  it('waits while it loads, then runs around it if it came in with a route', async () => {
    const c = clock(t => (t < 3000 ? 'loading' : 'answer'));
    let waits = 0;
    expect(await awaitInstant({ ...c, onWait: () => waits++ })).toEqual({ go: 'normal' });
    // The waiting line once, not at every look.
    expect(waits).toBe(1);
  });

  it('waits while it loads, then the fallback if it settled with none', async () => {
    const c = clock(t => (t < 1000 ? 'loading' : 'none'));
    expect(await awaitInstant(c)).toEqual({ go: 'fallback', timedOut: false });
  });

  it('gives up after 10 seconds and goes on without it', async () => {
    const c = clock(() => 'loading');
    expect(await awaitInstant(c)).toEqual({ go: 'fallback', timedOut: true });
    expect(c.looks[c.looks.length - 1]).toBe(INSTANT_SETTLE_MS);
  });

  it('stops waiting when cancelled', async () => {
    const c = clock(() => 'loading');
    expect(await awaitInstant({ ...c, cancelled: () => c.now() >= 400 })).toEqual({ go: 'fallback', timedOut: false });
  });

  it('says what it is doing in player words', () => {
    expect(INSTANT_WAIT_STATUS).toBe('Checking for an instant answer…');
    expect(INSTANT_TIMEOUT_STATUS).toContain('10 seconds');
    for (const t of [INSTANT_WAIT_STATUS, INSTANT_TIMEOUT_STATUS]) expect(t).not.toMatch(/table/i);
  });
});
