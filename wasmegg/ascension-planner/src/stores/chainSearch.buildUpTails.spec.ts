/**
 * BUILD-UP MISSING (6 Nov 2026, Jordan's phone): the store's `buildUpTails` returned [] on any failure, silently, and
 * kept it for the save, TE and plan start, so the instant answer said "prestige now" mid build-up for as long as the
 * page stayed open. Now a failure says so (`failed`, with the reason), is logged, and is never kept: the next call asks
 * the worker again. A result that came back is still kept (the instant answer asks once).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { BuildParams } from '@/search/precomputedLeg';

vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async () => {}),
  loadMetadata: vi.fn(async () => null),
  hashID: vi.fn(async (id: string) => id),
}));

const tail: BuildParams = { sales: 2, tier13: false, waitStart: 0, saleEnd: 0, peakELR: 9, delivered: [] };
/** What the worker does next: answer with tails, or throw. */
let answers: (BuildParams[] | Error)[] = [];
const asked = vi.fn();
const terminated = vi.fn();
vi.mock('@/search/pool', async () => {
  const real = await vi.importActual<typeof import('@/search/pool')>('@/search/pool');
  return {
    WorkerLostError: real.WorkerLostError,
    createChainSearchPool: vi.fn(async () => ({
      size: 1,
      terminate: terminated,
      buildUpTails: async () => {
        asked();
        const a = answers.shift() ?? [];
        if (a instanceof Error) throw a;
        return a;
      },
    })),
  };
});

const { useChainSearchStore } = await import('./chainSearch');
const { useInitialStateStore } = await import('./initialState');

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
  setActivePinia(createPinia());
  const init = useInitialStateStore();
  init.rawBackup = { approxTime: 1_790_000_000, farms: [], game: {} } as never;
  init.currentFarmState = { eggType: 50 } as never;
  answers = [];
  asked.mockClear();
  terminated.mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllGlobals();
});

describe('buildUpTails', () => {
  it('a failure says so, is logged, and is not kept: the next call asks again', async () => {
    answers = [new Error('worker 0 (build-up tails) was lost'), [tail]];
    const store = useChainSearchStore();
    const first = await store.buildUpTails();
    expect(first).toEqual({ tails: [], failed: true, reason: 'worker 0 (build-up tails) was lost' });
    expect(warn).toHaveBeenCalled();
    expect(terminated).toHaveBeenCalledTimes(1);
    const second = await store.buildUpTails();
    expect(asked).toHaveBeenCalledTimes(2);
    expect(second).toEqual({ tails: [tail] });
    expect(second.failed).toBeFalsy();
  });

  it('tails that came back are kept for the same save, TE and plan start (control)', async () => {
    answers = [[tail]];
    const store = useChainSearchStore();
    expect(await store.buildUpTails()).toEqual({ tails: [tail] });
    expect(await store.buildUpTails()).toEqual({ tails: [tail] });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('an empty build-up is not a failure (nothing left to buy)', async () => {
    answers = [[]];
    const store = useChainSearchStore();
    const r = await store.buildUpTails();
    expect(r.tails).toEqual([]);
    expect(r.failed).toBeFalsy();
  });

  it('never asks the worker without a farm in the save', async () => {
    useInitialStateStore().currentFarmState = null;
    const store = useChainSearchStore();
    expect(await store.buildUpTails()).toEqual({ tails: [] });
    expect(asked).not.toHaveBeenCalled();
  });
});
