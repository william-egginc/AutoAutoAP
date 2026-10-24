/**
 * Parted checkpoints (search/deadlineStore.ts `appendDeadlineCheckpoint`): each write holds only the
 * routes priced since the last, a carry-on replays them all, and a checkpoint written whole by the
 * previous build (version 1) still carries on and is migrated by its first new write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainResult } from './types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { runDeadlineSearch } = await import('./deadline');
const { saveMetadata } = await import('@/lib/storage/db');
const store = await import('./deadlineStore');

const DAY = 86400;
const START = 1_790_000_000;
function price(chain: number[]): ChainResult {
  let te = 100;
  let seconds = 0;
  const legs = [];
  for (const c of chain) {
    seconds += DAY + (c - te) * DAY * (150 / (te + 20));
    legs.push({
      key: c % 2 ? '2-sale-tier13' : 'continue',
      endTE: c,
      endTime: START + seconds,
      durationSeconds: seconds,
      maxELR: 1,
      tier13Unlocked: c % 2 === 1,
    });
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
const RUN_SPEC = { deadline: SPEC.deadline, minStops: 1, maxStops: 3, lastHi: 170, step: 10, ascendNeeded: false };
const header = (count: number) => ({
  spec: RUN_SPEC,
  inputsKey: 'k',
  planStart: START,
  te: 100,
  count,
  updatedAt: 1,
});
const answer = (out: Awaited<ReturnType<typeof runDeadlineSearch>>) => out.routes.map(r => r.chain.join(' '));

beforeEach(() => db.clear());

describe('a parted checkpoint', () => {
  it('appends only what is new, and carries on to the same answer without pricing anything twice', async () => {
    let freshWhole = 0;
    const whole = await runDeadlineSearch(SPEC, {
      evaluate: async c => {
        freshWhole += c.length;
        return c.map(price);
      },
    });

    // Interrupted, checkpointing after every batch.
    const w = store.checkpointWriter(null);
    const first = store.replayingEvaluator(async c => c.map(price));
    const parts: number[] = [];
    let batches = 0;
    await runDeadlineSearch(SPEC, {
      evaluate: async c => {
        const r = await first.evaluate(c);
        const part = first.drain();
        parts.push(part.k.length);
        await store.appendDeadlineCheckpoint('P', w, header(first.count()), part);
        return r;
      },
      shouldStop: () => ++batches > 5,
    });
    // Each part holds that batch's routes only; nothing is written twice.
    expect(parts.reduce((a, b) => a + b, 0)).toBe(first.count());
    expect(first.drain().k).toHaveLength(0);

    const head = await store.loadDeadlineCheckpointHeader('P');
    expect(head?.count).toBe(first.count());
    const cp = (await store.loadDeadlineCheckpoint('P'))!;
    expect(store.checkpointCount(cp)).toBe(first.count());
    expect(cp.entries).toHaveLength(0);

    let freshAfter = 0;
    const second = store.replayingEvaluator(
      async c => {
        freshAfter += c.length;
        return c.map(price);
      },
      cp.entries,
      undefined,
      { parts: cp.parts, seedSaved: true }
    );
    const carried = await runDeadlineSearch(SPEC, { evaluate: second.evaluate });
    expect(answer(carried)).toEqual(answer(whole));
    expect(store.checkpointCount(cp) + freshAfter).toBe(freshWhole);
    // A parted checkpoint's own routes are not written again by the carry-on.
    expect(second.drain().k).toHaveLength(freshAfter);
    // Replayed legs come back with their strategy, end and tier-13 flag.
    const back = carried.routes[0].legs;
    const real = price(carried.routes[0].chain).legs;
    expect(back.map(l => [l.key, l.endTE, l.endTime, l.durationSeconds])).toEqual(
      real.map(l => [l.key, l.endTE, l.endTime, l.durationSeconds])
    );
  });

  it("a fresh run's first write deletes an older run's parts; a write that fails keeps its routes", async () => {
    const old = store.checkpointWriter(null);
    await store.appendDeadlineCheckpoint(
      'P',
      old,
      header(2),
      store.toPart([
        ['120,150', 5, []],
        ['130,150', 6, []],
      ])
    );
    const fresh = store.checkpointWriter(null);
    expect(fresh.fresh).toBe(true);
    await store.appendDeadlineCheckpoint('P', fresh, header(1), store.toPart([['140,150', 7, []]]));
    const cp = (await store.loadDeadlineCheckpoint('P'))!;
    expect(cp.parts!.flatMap(p => p.k)).toEqual(['140,150']);
    expect([...db.keys()].filter(k => k.includes(':part:'))).toHaveLength(1);

    const r = store.replayingEvaluator(async c => c.map(price));
    await r.evaluate([[120, 150]]);
    const part = r.drain();
    r.undrain(part);
    expect(r.drain().k).toEqual(['120,150']);
  });

  it('clears every part with the header', async () => {
    const w = store.checkpointWriter(null);
    await store.appendDeadlineCheckpoint('P', w, header(1), store.toPart([['120,150', 5, []]]));
    await store.appendDeadlineCheckpoint('P', w, header(2), store.toPart([['130,150', 6, []]]));
    await store.clearDeadlineCheckpoint('P');
    expect(await store.loadDeadlineCheckpoint('P')).toBeNull();
    expect([...db.keys()]).toHaveLength(0);
  });

  it('packs legs into a string and back', () => {
    const legs = [
      { endTE: 141, endTime: 1790012345.25, durationSeconds: 86400.5, key: '2-sale-tier13' as const },
      { endTE: 166, endTime: 1790099999, durationSeconds: 3, key: 'continue' as const },
    ];
    expect(store.unpackLegs(store.packLegs(legs))).toEqual(legs);
    expect(store.unpackLegs('')).toEqual([]);
  });
});

describe('a checkpoint saved by the previous build (one record, version 1)', () => {
  it('still carries on, to the same answer, and its first new write migrates it to parts', async () => {
    const whole = await runDeadlineSearch(SPEC, { evaluate: async c => c.map(price) });

    // What the previous build wrote: every route in `entries`, version 1, one record.
    const before = store.replayingEvaluator(async c => c.map(price));
    let batches = 0;
    await runDeadlineSearch(SPEC, { evaluate: before.evaluate, shouldStop: () => ++batches > 4 });
    const entries = before.entries();
    await saveMetadata('P', 'chainSearchDeadlineRun', { ...header(0), entries, version: 1 });

    const head = await store.loadDeadlineCheckpointHeader('P');
    expect(head?.count).toBe(entries.length);
    const cp = (await store.loadDeadlineCheckpoint('P'))!;
    expect(cp.version).toBe(1);
    expect(cp.entries).toHaveLength(entries.length);

    // The carry-on: a fresh writer (the record is not parted), the seed handed to its first write.
    const w = store.checkpointWriter(cp);
    expect(w.fresh).toBe(true);
    const carry = store.replayingEvaluator(async c => c.map(price), cp.entries, undefined, {
      parts: cp.parts,
      seedSaved: !w.fresh,
    });
    let wrote = false;
    const carried = await runDeadlineSearch(SPEC, {
      evaluate: async c => {
        const r = await carry.evaluate(c);
        if (!wrote) {
          wrote = true;
          await store.appendDeadlineCheckpoint('P', w, header(carry.count()), carry.drain());
        }
        return r;
      },
    });
    expect(answer(carried)).toEqual(answer(whole));
    expect(carry.replayed()).toBe(entries.length);

    // Migrated: version 2 now, holding the old routes (and what the first batch added).
    const after = (await store.loadDeadlineCheckpoint('P'))!;
    expect(after.version).toBe(2);
    const keys = new Set(after.parts!.flatMap(p => p.k));
    for (const e of entries) expect(keys.has(e[0])).toBe(true);
  });
});

describe('a finished run leaves no "unfinished" behind', () => {
  const cp = { inputsKey: 'k', planStart: START, updatedAt: 100, spec: RUN_SPEC };
  const result = { inputsKey: 'k', planStart: START, at: 200, stoppedEarly: false, deadline: SPEC.deadline };
  it('knows a checkpoint its saved result has finished', () => {
    expect(store.checkpointFinished(cp, result)).toBe(true);
  });
  it('but not a stopped result, an older one, or another run', () => {
    expect(store.checkpointFinished(cp, { ...result, stoppedEarly: true })).toBe(false);
    expect(store.checkpointFinished(cp, { ...result, at: 50 })).toBe(false);
    expect(store.checkpointFinished(cp, { ...result, inputsKey: 'other' })).toBe(false);
    expect(store.checkpointFinished(cp, { ...result, deadline: 1 })).toBe(false);
    expect(store.checkpointFinished(cp, null)).toBe(false);
  });
});
