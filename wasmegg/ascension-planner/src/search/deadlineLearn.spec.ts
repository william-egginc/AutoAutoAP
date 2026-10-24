/**
 * What a space run reports about its sets as it goes (deadline.ts `learnNow`), and the route total
 * worked out from it (deadlineEstimate.ts `estimateRoutes`): guesses handed out count as in flight,
 * not as used; it is refreshed after every batch; and the total never falls to the routes priced
 * while sets are still open -- which is what made a real 32,645-set run read full with 8.3 h to go.
 */
import { describe, expect, it } from 'vitest';
import type { ChainResult } from './types';
import { runDeadlineSearch, type DeadlineProgress, type DeadlineSpec } from './deadline';
import { estimateRoutes } from './deadlineEstimate';

const DAY = 86400;
const START = 1_790_000_000;

/** The same stand-in simulator as deadline.spec.ts. */
function legSeconds(a: number, b: number): number {
  return DAY + (b - a) * DAY * (150 / (a + 20));
}
function priceChain(currentTE: number, chain: number[]): ChainResult {
  let te = currentTE;
  let seconds = 0;
  for (const c of chain) {
    seconds += legSeconds(te, c);
    te = c;
  }
  return { chain: [...chain], seconds, legs: [] };
}

const spec: DeadlineSpec = {
  currentTE: 100,
  planStart: START,
  deadline: START + 75 * DAY,
  minStops: 1,
  maxStops: 3,
  lastLo: 120,
  lastHi: 260,
  step: 5,
  extend: true,
  bandSets: [
    [
      [101, 103, 105, 107, 109, 111],
      [120, 125, 130, 135, 140, 145, 150],
    ],
    [[102, 106, 110, 114, 118, 122, 126, 130]],
  ],
  // Small batches, so a round is several of them.
  chunk: 7,
};

async function run(s: DeadlineSpec) {
  const reports: DeadlineProgress[] = [];
  const asked: string[] = [];
  const out = await runDeadlineSearch(s, {
    evaluate: async chains => {
      for (const c of chains) asked.push(c.join(','));
      return chains.map(c => priceChain(s.currentTE, c));
    },
    onProgress: p => reports.push({ ...p, learn: p.learn ? { ...p.learn } : undefined }),
  });
  return { out, reports, asked };
}

describe('what a space run learns about its sets', () => {
  it('counts guesses in flight apart from routes used, and finishes with every set accounted for', async () => {
    const { out, reports } = await run(spec);
    const learned = reports.filter(r => r.learn);
    expect(learned.length).toBeGreaterThan(5);
    // At the start of the main pass every set has its first guess out: in flight, except the few the
    // first look already priced (those count as used at once, as a carry-on's replayed ones do).
    const first = learned[0].learn!;
    expect(first.round).toBe(0);
    expect(first.inFlight! + first.openRoutes).toBe(first.sets - first.finishedSets);
    expect(first.inFlight).toBeGreaterThan(first.openRoutes);
    const last = learned[learned.length - 1].learn!;
    expect(last.finishedSets).toBe(last.sets);
    expect(last.inFlight).toBe(0);
    expect(last.openRoutes).toBe(0);
    expect(last.bracketNeed).toBe(0);
    expect(last.sets).toBe(out.shapes);
  });

  it('refreshes after every batch, not only when a round starts', async () => {
    const { reports } = await run(spec);
    const byRound = new Map<number, Set<string>>();
    for (const r of reports) {
      if (!r.learn) continue;
      const l = r.learn;
      const key = `${l.finishedSets}/${l.openRoutes}/${l.inFlight}`;
      const seen = byRound.get(l.round ?? 0) ?? new Set<string>();
      seen.add(key);
      byRound.set(l.round ?? 0, seen);
    }
    expect(byRound.get(0)!.size).toBeGreaterThan(2);
    expect(byRound.get(1)!.size).toBeGreaterThan(2);
  });

  it('never estimates fewer routes than priced + in flight + one for every open set', async () => {
    const { reports } = await run(spec);
    for (const r of reports) {
      const l = r.learn;
      if (!l) continue;
      const total = estimateRoutes(r.priced, 0, l).total;
      if (!total) continue;
      const open = l.sets - l.finishedSets;
      expect(total).toBeGreaterThanOrEqual(r.priced + Math.max(l.inFlight ?? 0, open));
      if (open) expect(total).toBeGreaterThan(r.priced);
    }
    // And lands on the routes priced at the end.
    const end = reports[reports.length - 1];
    expect(estimateRoutes(end.priced, 0, end.learn).total).toBe(end.priced);
  });

  it('says how many sets are finished and open, by round', async () => {
    const { reports } = await run(spec);
    const lines = reports.filter(r => r.learn && r.stage.startsWith('Round')).map(r => r.stage);
    expect(lines.length).toBeGreaterThan(3);
    for (const s of lines)
      expect(s).toMatch(/^Round \d+ · [\d,]+ of [\d,]+ sets of early stops finished · [\d,]+ still open$/);
    expect(lines[0]).toMatch(/^Round 1 · 0 of /);
  });

  it('estimates close to what the run really priced once every set has been tried', async () => {
    const { reports, out } = await run(spec);
    const afterFirst = reports.find(r => r.learn && (r.learn.round ?? 0) >= 1 && !r.learn.untouched)!;
    const total = estimateRoutes(afterFirst.priced, 0, afterFirst.learn).total;
    // The brackets' arithmetic is an estimate, not a count: within a third either way here.
    expect(total).toBeGreaterThan(out.priced * 0.67);
    expect(total).toBeLessThan(out.priced * 1.33);
  });
});
