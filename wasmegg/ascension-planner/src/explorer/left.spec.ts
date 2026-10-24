import { describe, it, expect } from 'vitest';
import { bandedChains, buildPool, countBanded, countChainsWithGap, exhaustiveChainsWithGap } from '@/search/exhaustive';
import type { SearchSpace } from '@/search/submission';
import type { CollectorRow } from './collector';
import { leftOf, leftShareText, leftTitle, longEstimate, plansText, type Left } from './left';

function row(over: Partial<CollectorRow>): CollectorRow {
  return {
    schema: 5,
    chain: [200, 300, 490],
    ascensions: 3,
    currentTE: 180,
    finalTE: 490,
    durationDays: 800,
    startLocal: '2026-09-01 10:00',
    endLocal: '',
    timezone: 'America/Denver',
    effort: 'balanced',
    window: null,
    holdShifts: false,
    waitingHours: null,
    artifacts: [],
    stones: [],
    legs: [],
    chainsPriced: 100,
    submittedAt: '',
    id: 'r',
    ...over,
  } as CollectorRow;
}

const step = (lo: number, hi: number, by: number) =>
  Array.from({ length: Math.floor((hi - lo) / by) + 1 }, (_, i) => lo + i * by);

/** A banded box as a finished run would store it: its own count, all of it priced. */
function banded(bands: number[][], minGap: number, currentTE = 180, finalTE = 490): Partial<CollectorRow> {
  const chains = countBanded(bands, finalTE, currentTE, minGap);
  const space: SearchSpace = {
    mode: 'bands',
    bands,
    minGap,
    minAscensions: bands.length + 1,
    maxAscensions: bands.length + 1,
    chains,
    chainsPriced: chains,
    stoppedEarly: false,
  };
  return { currentTE, finalTE, chainsPriced: chains, space };
}

describe('leftOf', () => {
  it('counts the same box at every TE and takes off what the run priced', () => {
    // An M2-style run: every 2nd TE in two bands, 10 TE apart.
    const r = row(banded([step(181, 279, 2), step(270, 372, 2)], 10));
    const l = leftOf(r)!;
    expect(l.everyTE).toBe(countBanded([step(181, 279, 1), step(270, 372, 1)], 490, 180, 10));
    expect(l.priced).toBe(r.space!.chains);
    expect(l.left).toBe(l.everyTE - r.space!.chains);
    // Roughly three quarters of the every-TE box sits between the steps of an every-2nd-TE run.
    expect(l.left / l.everyTE).toBeGreaterThan(0.7);
    expect(l.finishedBox).toBe(true);
    expect(l.pieces).toEqual(['181-279:1;', '270-372:1', '· gap 10']);
    expect(l.seconds).toBeGreaterThan(0);
  });

  it('has every plan the run priced inside the every-TE box, checked by listing both', () => {
    // Unsorted, overlapping, single-value and past-the-account's-TE bands, all at once.
    const bands = [[190, 175, 185], [186, 196], [240]];
    const r = row(banded(bands, 4, 178, 400));
    const l = leftOf(r)!;
    const own = bandedChains(bands, 400, 178, 4).map(c => c.join(' '));
    const wide = new Set(
      bandedChains([step(175, 190, 1), step(186, 196, 1), [240]], 400, 178, 4).map(c => c.join(' '))
    );
    expect(own.every(c => wide.has(c))).toBe(true);
    expect(l.everyTE).toBe(wide.size);
    expect(l.left).toBe(wide.size - own.length);
  });

  it('leaves nothing when the run already tried every TE and priced it all', () => {
    const l = leftOf(row(banded([step(215, 235, 1), step(245, 265, 1), step(290, 310, 1)], 10, 198)))!;
    expect(l.left).toBe(0);
    expect(leftTitle(l)).toContain('nothing is left in this box');
  });

  it('counts the part of its own box a run stopped before, as well as the steps it skipped', () => {
    const bands = [[195], step(300, 320, 10)];
    const r = row({
      space: {
        mode: 'bands',
        bands,
        minGap: 0,
        minAscensions: 3,
        maxAscensions: 3,
        chains: 3,
        chainsPriced: 1,
        stoppedEarly: true,
      },
    });
    const l = leftOf(r)!;
    expect(l.everyTE).toBe(21); // 195, then any of 300..320
    expect(l.left).toBe(20);
    expect(l.finishedBox).toBe(false);
    expect(l.pieces).toEqual(['195;', '300-320:1']);
    expect(leftTitle(l)).toContain('the part of its own box it never reached');
  });

  it("reads the row's own count when the run never filled in how much of its box it priced", () => {
    // The planner writes 0 priced and not stopped when a run starts, and fills both in at the end.
    const base = banded([step(181, 279, 2), step(270, 372, 2)], 10);
    const chains = base.space!.chains;
    const unfilled = (rowPriced: number) =>
      leftOf(row({ ...base, chainsPriced: rowPriced, space: { ...base.space!, chainsPriced: 0 } }))!;
    expect(unfilled(chains).priced).toBe(chains);
    expect(unfilled(chains).finishedBox).toBe(true);
    expect(unfilled(1000).priced).toBe(1000);
    expect(unfilled(1000).finishedBox).toBe(false);
    // A run that WAS stopped wrote its count when it stopped: a 0 there is real.
    const stopped = leftOf(row({ ...base, space: { ...base.space!, chainsPriced: 0, stoppedEarly: true } }))!;
    expect(stopped.priced).toBe(0);
  });

  it("widens one shared pool to every TE, dropping TEs at or below the account's and at or past the target", () => {
    // The pool reaches below the account's TE (180) and past the target (300): the run never
    // could use those, so neither can what is left of it.
    const own = countChainsWithGap(buildPool({ lo: 140, hi: 280, step: 5 }, 180, 300), 5, 5, 10);
    const r = row({
      currentTE: 180,
      finalTE: 300,
      chainsPriced: own,
      space: {
        mode: 'range',
        range: { lo: 140, hi: 280, step: 5 },
        minGap: 10,
        minAscensions: 5,
        maxAscensions: 5,
        chains: own,
        chainsPriced: own,
        stoppedEarly: false,
      },
    });
    const l = leftOf(r)!;
    const pool1 = buildPool({ lo: 140, hi: 280, step: 1 }, 180, 300);
    expect(l.everyTE).toBe(countChainsWithGap(pool1, 5, 5, 10));
    expect(l.everyTE).toBe(exhaustiveChainsWithGap(pool1, 5, 5, 300, 180, 10).length);
    expect(l.pieces).toEqual(['140-280:1 for every target', '· 5 asc', '· gap 10']);
  });

  it('measures nothing when the row cannot reproduce the box the run stored', () => {
    const base = banded([step(181, 279, 2), step(270, 372, 2)], 10);
    expect(leftOf(row({ ...base, space: { ...base.space!, chains: base.space!.chains + 7 } }))).toBeNull();
  });

  it('has nothing to measure a staged search against', () => {
    expect(leftOf(row({ effort: 'thorough', chainsPriced: 5806 }))).toBeNull();
  });
});

describe('the words', () => {
  const l: Left = {
    everyTE: 242_307,
    priced: 2085,
    left: 240_222,
    pieces: [],
    seconds: 1,
    machine: '',
    measuredSpeed: true,
    finishedBox: true,
  };

  it('keeps small counts exact and shortens big ones', () => {
    expect(plansText(49)).toBe('49');
    expect(plansText(7308)).toBe('7,308');
    expect(plansText(240_222)).toBe('240K');
    expect(plansText(11_247_285)).toBe('11M');
    expect(plansText(Infinity)).toBe('too many to count');
  });

  it('never rounds the share left up to 100% while anything was priced, or down to 0% while any is left', () => {
    expect(leftShareText(l)).toBe('99%');
    expect(leftShareText({ ...l, priced: 0, left: l.everyTE })).toBe('100%');
    expect(leftShareText({ ...l, everyTE: 16_004, priced: 15_604, left: 400 })).toBe('2.5%');
    expect(leftShareText({ ...l, everyTE: 40_656, priced: 40_650, left: 6 })).toBe('<0.1%');
  });

  it('says which speed the estimate used', () => {
    expect(leftTitle({ ...l, pieces: ['181-246:1'] })).toContain("the board's own speed");
    expect(leftTitle({ ...l, pieces: ['181-246:1'], measuredSpeed: false })).toContain("the planner's usual speed");
  });

  it('stretches the estimate from minutes to years', () => {
    expect(longEstimate(30)).toBe('under a minute');
    expect(longEstimate(3 * 3600)).toBe('3.0 h');
    expect(longEstimate(5 * 86400)).toBe('5 days');
    expect(longEstimate(200 * 86400)).toBe('7 months');
    expect(longEstimate(3 * 365 * 86400)).toBe('3 years');
    expect(longEstimate(5_000 * 365 * 86400)).toBe('5,000 years');
  });
});
