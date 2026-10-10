/**
 * A By a date run carried on from its checkpoint (10 Oct: a Safari run after a crash) sent its best
 * route with every leg's peak delivery 0, blank leg starts, no firstLegOtherHours and a CSV that said
 * "continue not simulated": the checkpoint keeps four numbers a leg. The routes anyone reads again
 * are priced afresh at the end, and whatever stays replayed says "unknown", never 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainResult, LegSummary } from './types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { runDeadlineSearch } = await import('./deadline');
const { replayingEvaluator, repriceReplayedRoutes, hasReplayedLegs } = await import('./deadlineStore');
const { buildDeadlineCsv } = await import('./csv');
const { buildSubmission } = await import('./submission');

const DAY = 86400;
const START = 1_790_000_000;
const SPEC = {
  currentTE: 100,
  planStart: START,
  deadline: START + 90 * DAY,
  minStops: 1,
  maxStops: 3,
  lastLo: 101,
  lastHi: 170,
  step: 10,
};

/** A full pricing: every leg with its peak, start and shifts; leg 1 with the way not taken. */
function price(chain: number[]): ChainResult {
  let te = 100;
  let seconds = 0;
  const legs: LegSummary[] = [];
  chain.forEach((c, i) => {
    const startTime = START + seconds;
    seconds += DAY + (c - te) * DAY * (150 / (te + 20));
    legs.push({
      key: '2-sale',
      endTE: c,
      endTime: START + seconds,
      durationSeconds: START + seconds - startTime,
      maxELR: (3 * 1e15) / 3600,
      tier13Unlocked: false,
      startTime,
      shifts: [],
      sleepDelaySeconds: 0,
      shiftDelaySeconds: 0,
      ...(i === 0 ? { firstLegRival: { key: 'continue' as const, endTime: START + seconds + 5 * 3600 } } : {}),
    });
    te = c;
  });
  return { chain: [...chain], seconds, legs };
}

const META = {
  planStart: START,
  timezone: 'UTC',
  currentTE: 100,
  final: 170,
  effort: 'deadline',
  firstAscension: 'auto' as const,
  availability: null,
  seedChain: [],
  loadouts: [],
  generatedAt: START * 1000,
};

function submissionOf(route: { chain: number[]; reachAt: number; legs: LegSummary[] }) {
  return buildSubmission({
    chain: route.chain,
    seconds: route.reachAt - START,
    legs: route.legs,
    planStart: START,
    timezone: 'UTC',
    currentTE: 100,
    finalTE: route.chain[route.chain.length - 1],
    effort: 'deadline',
    availability: null,
    holdShifts: false,
    artifacts: [],
    stones: [],
    chainsPriced: 1,
    now: START * 1000,
  });
}

/** A run that died once it had priced everything, carried on: every route it ranks is replayed. */
async function carriedOn() {
  const first = replayingEvaluator(async c => c.map(price));
  await runDeadlineSearch(SPEC, { evaluate: first.evaluate });
  const second = replayingEvaluator(async c => c.map(price), first.entries());
  return runDeadlineSearch(SPEC, { evaluate: second.evaluate });
}

describe('a carried-on By a date run', () => {
  beforeEach(() => db.clear());

  it('comes back with replayed legs marked as such, which the CSV and the board treat as unknown', async () => {
    const out = await carriedOn();
    const best = out.routes[0];
    expect(hasReplayedLegs(best.legs)).toBe(true);

    const csv = buildDeadlineCsv(out.routes, META, { deadline: SPEC.deadline, priced: out.priced });
    expect(csv).not.toContain('continue not simulated');
    expect(csv).toContain('replayed from a saved checkpoint');
    const header = csv
      .split('\n')
      .find(l => l.startsWith('rank,'))!
      .split(',');
    const first = csv
      .split('\n')
      .find(l => l.startsWith('1,'))!
      .split(',');
    expect(first[header.indexOf('peak_delivery_q_per_hr')]).toBe('');

    // No legs rather than legs that claim a peak of 0.
    const sub = submissionOf(best);
    expect(sub.legs).toEqual([]);
    expect(sub.waitingHours).toBeNull();
  });

  it('prices its best routes again, so the board row and the CSV carry full leg detail', async () => {
    const out = await carriedOn();
    const asked: number[][] = [];
    const filled = await repriceReplayedRoutes([...out.routes, ...out.byStops.values()], async chains => {
      asked.push(...chains);
      return chains.map(price);
    });
    // Each route once, the best per stop count included through the shared objects.
    expect(new Set(asked.map(c => c.join(','))).size).toBe(asked.length);
    expect(filled).toBe(asked.length);

    const best = out.routes[0];
    expect(hasReplayedLegs(best.legs)).toBe(false);
    for (const r of out.byStops.values()) expect(hasReplayedLegs(r.legs)).toBe(false);
    expect(best.legs.every(l => l.maxELR > 0 && l.startTime! > 0)).toBe(true);

    const sub = submissionOf(best);
    expect(sub.legs.length).toBe(best.chain.length);
    expect(sub.legs.every(l => l.peakDeliveryQph === 3)).toBe(true);
    expect(sub.firstLegOtherHours).toBe(5);

    const csv = buildDeadlineCsv(out.routes, META, { deadline: SPEC.deadline, priced: out.priced });
    expect(csv).toMatch(
      /first leg \(best route\): fresh .*continuing without buying would have ended leg 1 .*5\.0 h later/
    );
    expect(csv).not.toContain('replayed from a saved checkpoint');
  });

  it('leaves the replayed legs when a fresh pricing disagrees, fails, or is not given', async () => {
    const out = await carriedOn();
    const before = out.routes.slice(0, 3).map(r => r.legs);
    const shifted = (c: number[]) => {
      const r = price(c);
      return { ...r, legs: r.legs.map(l => ({ ...l, endTime: l.endTime + 600 })) };
    };
    expect(await repriceReplayedRoutes(out.routes.slice(0, 1), async cs => cs.map(shifted))).toBe(0);
    expect(
      await repriceReplayedRoutes(out.routes.slice(1, 2), async () => {
        throw new Error('worker died');
      })
    ).toBe(0);
    expect(await repriceReplayedRoutes(out.routes.slice(2, 3), async () => [])).toBe(0);
    expect(out.routes.slice(0, 3).map(r => r.legs)).toEqual(before);
  });

  it('prices at most `limit` routes and none that a fresh session already priced', async () => {
    const out = await carriedOn();
    const asked: number[][] = [];
    await repriceReplayedRoutes(
      out.routes,
      async cs => {
        asked.push(...cs);
        return cs.map(price);
      },
      2
    );
    expect(asked.length).toBe(2);
    asked.length = 0;
    await repriceReplayedRoutes(out.routes.slice(0, 2), async cs => {
      asked.push(...cs);
      return cs.map(price);
    });
    expect(asked).toEqual([]);
  });
});
