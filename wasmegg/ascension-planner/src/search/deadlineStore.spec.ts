/**
 * Carrying on a deadline search after an interruption: replaying what was priced must land on
 * exactly the answer an uninterrupted run gives, and never price a route twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainResult } from './types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => {
    db.set(`${hash}/${key}`, JSON.parse(JSON.stringify(value)));
  }),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
}));

const { runDeadlineSearch } = await import('./deadline');
const {
  replayingEvaluator,
  saveDeadlineCheckpoint,
  loadDeadlineCheckpoint,
  saveDeadlineResult,
  loadDeadlineResult,
  rowSettingsFor,
} = await import('./deadlineStore');

const DAY = 86400;
const START = 1_790_000_000;
function price(chain: number[]): ChainResult {
  let te = 100;
  let seconds = 0;
  const legs = [];
  for (const c of chain) {
    seconds += DAY + (c - te) * DAY * (150 / (te + 20));
    legs.push({ key: 'x', endTE: c, endTime: START + seconds, durationSeconds: 1, maxELR: 1, tier13Unlocked: false });
    te = c;
  }
  return { chain: [...chain], seconds, legs } as ChainResult;
}
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

describe('carrying on a deadline search', () => {
  beforeEach(() => db.clear());

  it('reaches the same answer as an uninterrupted run, without pricing anything twice', async () => {
    let freshWhole = 0;
    const whole = await runDeadlineSearch(SPEC, {
      evaluate: async c => {
        freshWhole += c.length;
        return c.map(price);
      },
    });

    // Interrupted after a few batches...
    let batches = 0;
    const first = replayingEvaluator(async c => c.map(price));
    const stopped = await runDeadlineSearch(SPEC, { evaluate: first.evaluate, shouldStop: () => ++batches > 4 });
    expect(stopped.stoppedEarly).toBe(true);
    await saveDeadlineCheckpoint('P', {
      spec: { deadline: SPEC.deadline, minStops: 1, maxStops: 3, lastHi: 170, step: 10, ascendNeeded: false },
      inputsKey: 'k',
      planStart: START,
      te: 100,
      entries: first.entries(),
      updatedAt: 0,
    });

    // ...then carried on from what was saved.
    const cp = await loadDeadlineCheckpoint('P');
    let freshAfter = 0;
    const second = replayingEvaluator(async c => {
      freshAfter += c.length;
      return c.map(price);
    }, cp!.entries);
    const carried = await runDeadlineSearch(SPEC, { evaluate: second.evaluate });

    expect(carried.routes[0].chain).toEqual(whole.routes[0].chain);
    expect(carried.routes.map(r => r.chain.join(' '))).toEqual(whole.routes.map(r => r.chain.join(' ')));
    expect(second.replayed()).toBe(cp!.entries.length);
    expect(cp!.entries.length + freshAfter).toBe(freshWhole);
  });

  it('keeps routes that could not be priced as such, so they are not tried again', async () => {
    const r = replayingEvaluator(async c => c.filter(x => x[0] !== 120).map(price));
    await r.evaluate([
      [120, 150],
      [130, 150],
    ]);
    const again = replayingEvaluator(async () => {
      throw new Error('should not be asked');
    }, r.entries());
    const out = await again.evaluate([
      [120, 150],
      [130, 150],
    ]);
    expect(out.map(x => x.chain.join(' '))).toEqual(['130 150']);
  });

  it('saves and brings back a finished result', async () => {
    const result = {
      routes: [],
      byStops: [],
      deadline: 1,
      planStart: 0,
      te: 137,
      step: 20,
      shapes: 5,
      priced: 9,
      stoppedEarly: false,
      ascendNeeded: false,
      lastHi: 300,
      at: 5,
    };
    await saveDeadlineResult('P', result);
    expect(await loadDeadlineResult('P')).toEqual(result);
  });
});

describe('the chain rows kept in a deadline checkpoint', () => {
  beforeEach(() => db.clear());
  const base = { deadline: 1, minStops: 2, maxStops: 3, lastHi: 300, step: 1, ascendNeeded: false };
  const cp = (spec: object) => ({
    spec: spec as never,
    inputsKey: 'k',
    planStart: 1,
    te: 100,
    entries: [],
    updatedAt: 5,
  });

  it("round-trips each row's sliders, auto flag, start time and set count", async () => {
    const rows = [
      { widthIx: 2, stepIx: 0, auto: true },
      { widthIx: 5, stepIx: 3, auto: false },
    ];
    await saveDeadlineCheckpoint('h', cp({ ...base, bandSets: [[[1]], [[2]]], rows, startedAt: 111, sets: 8632 }));
    const back = await loadDeadlineCheckpoint('h');
    expect(back?.spec.rows).toEqual(rows);
    expect(back?.spec.startedAt).toBe(111);
    expect(back?.spec.sets).toBe(8632);
    expect(rowSettingsFor(back!.spec, 0)).toEqual(rows[0]);
    expect(rowSettingsFor(back!.spec, 1)).toEqual(rows[1]);
  });

  it('still loads a checkpoint saved before the rows were kept, with no settings for any row', async () => {
    await saveDeadlineCheckpoint('h', cp({ ...base, bandSets: [[[1]]] }));
    const back = await loadDeadlineCheckpoint('h');
    expect(back).not.toBeNull();
    expect(rowSettingsFor(back!.spec, 0)).toBeNull();
  });

  it('ignores a malformed or missing row', () => {
    const spec = { ...base, rows: [{ widthIx: 'x', stepIx: 1, auto: true }] } as never;
    expect(rowSettingsFor(spec, 0)).toBeNull();
    expect(rowSettingsFor(spec, 3)).toBeNull();
  });
});
