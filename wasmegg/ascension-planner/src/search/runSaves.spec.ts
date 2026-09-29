/**
 * The save a run was priced under, kept so an interrupted run carries on with exactly that farm.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchInputs } from './types';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => {
    // The real store JSON round-trips everything it writes.
    db.set(`${hash}/${key}`, JSON.parse(JSON.stringify(value)));
  }),
  loadMetadata: vi.fn(async (hash: string, key: string) => db.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

const { listRunSaves, loadRunInputs, pruneRunSaves, runSaveKey, saveRunInputs } = await import('./runSaves');

function inputs(over: { te?: number; eggs?: number; clock?: number; far?: number } = {}): SearchInputs {
  return {
    context: {
      rawBackup: { approxTime: 1_790_640_095, virtue: { eggsDelivered: [over.eggs ?? 5e9] } },
      ascensionStartTime: over.clock ?? 1_790_642_400,
      planStartOffset: over.clock ?? 1_790_642_400,
      someLimit: over.far ?? Infinity,
    },
    baseState: {},
    currentFarmState: null,
    planStart: 1_790_642_160,
    currentTE: over.te ?? 170,
    final: 490,
    forceContinue: true,
  } as unknown as SearchInputs;
}

describe('run saves', () => {
  beforeEach(() => db.clear());

  it('gives one save one key, whatever the clock stamped into the context at load', () => {
    expect(runSaveKey(inputs({ clock: 1 }))).toBe(runSaveKey(inputs({ clock: 2 })));
  });

  it('tells two saves at the same TE apart by their progress', () => {
    expect(runSaveKey(inputs({ eggs: 5e9 }))).not.toBe(runSaveKey(inputs({ eggs: 6e9 })));
  });

  it('stores once per save and brings back exactly what went in, Infinity included', async () => {
    const a = await saveRunInputs('P', inputs());
    const again = await saveRunInputs('P', inputs({ clock: 99 }));
    expect(again.key).toBe(a.key);
    expect(await listRunSaves('P')).toHaveLength(1);
    expect(a).toMatchObject({ te: 170, backupAt: 1_790_640_095 });

    const back = await loadRunInputs('P', a.key);
    expect((back?.context as unknown as { someLimit: number }).someLimit).toBe(Infinity);
    expect(runSaveKey(back!)).toBe(a.key);
  });

  it('keeps a save stored in the last quarter hour, for a run in another tab', async () => {
    const a = await saveRunInputs('P', inputs({ te: 147 }));
    await pruneRunSaves('P', new Set());
    expect((await listRunSaves('P')).map(s => s.key)).toEqual([a.key]);
  });

  it('drops every save nothing unfinished still needs', async () => {
    const a = await saveRunInputs('P', inputs({ te: 147 }));
    const b = await saveRunInputs('P', inputs({ te: 170 }));
    // An hour on: nothing is fresh enough to be kept for another tab's run.
    await pruneRunSaves('P', new Set([b.key]), Date.now() + 3600e3);
    expect((await listRunSaves('P')).map(s => s.key)).toEqual([b.key]);
    expect(await loadRunInputs('P', a.key)).toBeNull();
    expect(await loadRunInputs('P', b.key)).not.toBeNull();
  });
});
