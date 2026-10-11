/**
 * The save a run was priced under, kept so an interrupted run carries on with exactly that farm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { holdRunSave, listRunSaves, liveRunSaveKeys, loadRunInputs, pruneRunSaves, runSaveKey, saveRunInputs } =
  await import('./runSaves');

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

/**
 * A browser's Web Locks, shared by every tab of the site: what lets a prune in one tab see a run
 * in another. Shared locks are granted at once; an exclusive one waits for the one before it.
 */
function fakeLocks() {
  const held: { name: string; mode: string }[] = [];
  const tails = new Map<string, Promise<unknown>>();
  return {
    held,
    async request(name: string, a: unknown, b?: unknown) {
      const opts = (typeof a === 'function' ? {} : a) as { mode?: string };
      const cb = (typeof a === 'function' ? a : b) as () => Promise<unknown>;
      const mode = opts.mode ?? 'exclusive';
      const run = async () => {
        const lock = { name, mode };
        held.push(lock);
        try {
          return await cb();
        } finally {
          held.splice(held.indexOf(lock), 1);
        }
      };
      if (mode === 'shared') return run();
      const result = (tails.get(name) ?? Promise.resolve()).then(run, run);
      tails.set(
        name,
        result.catch(() => {})
      );
      return result;
    },
    async query() {
      return { held: [...held], pending: [] };
    },
  };
}

describe('pruning sees runs in other tabs', () => {
  let locks: ReturnType<typeof fakeLocks>;
  beforeEach(() => {
    db.clear();
    locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a save another tab's run is using, however old, until that run lets go", async () => {
    const a = await saveRunInputs('P', inputs({ te: 147 }));
    const b = await saveRunInputs('P', inputs({ te: 170 }));
    // The other tab's run: nothing in storage names its save yet (no checkpoint written), and
    // this tab's keep-list knows only its own run (b). An hour on, past the quarter-hour window.
    const release = holdRunSave('P', a.key);
    await Promise.resolve();
    expect(await liveRunSaveKeys('P')).toEqual(new Set([a.key]));
    await pruneRunSaves('P', new Set([b.key]), Date.now() + 3600e3);
    expect((await listRunSaves('P')).map(s => s.key).sort()).toEqual([a.key, b.key].sort());
    expect(await loadRunInputs('P', a.key)).not.toBeNull();

    // The run ends (or its tab closes): the next prune drops it.
    release();
    await new Promise(r => setTimeout(r, 0));
    expect(await liveRunSaveKeys('P')).toEqual(new Set());
    await pruneRunSaves('P', new Set([b.key]), Date.now() + 3600e3);
    expect((await listRunSaves('P')).map(s => s.key)).toEqual([b.key]);
    expect(await loadRunInputs('P', a.key)).toBeNull();
  });

  it("does not let one player's held save keep another player's", async () => {
    const a = await saveRunInputs('P', inputs({ te: 147 }));
    const release = holdRunSave('Q', a.key);
    await pruneRunSaves('P', new Set(), Date.now() + 3600e3);
    expect(await listRunSaves('P')).toEqual([]);
    release();
  });

  it('two tabs storing and pruning at once do not undo each other', async () => {
    const old = await saveRunInputs('P', inputs({ te: 140 }));
    // Tab 1 prunes (keeping nothing) while tab 2 stores a new save for its run.
    const later = Date.now() + 3600e3;
    const [, b] = await Promise.all([pruneRunSaves('P', new Set(), later), saveRunInputs('P', inputs({ te: 171 }))]);
    const keys = (await listRunSaves('P')).map(s => s.key);
    expect(keys).toContain(b.key);
    expect(keys).not.toContain(old.key);
    expect(await loadRunInputs('P', b.key)).not.toBeNull();
  });
});
