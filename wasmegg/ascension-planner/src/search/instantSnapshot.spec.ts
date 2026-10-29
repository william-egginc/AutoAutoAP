import { describe, expect, it } from 'vitest';
import {
  MAX_AGE_MS,
  MAX_SNAPSHOTS,
  readSnapshot,
  recallShown,
  rememberShown,
  removeSnapshot,
  snapshotUsable,
  writeSnapshot,
  type StorageLike,
} from './instantSnapshot';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  };
}

describe('instant answer snapshots', () => {
  it('round-trips an answer by key and ignores other keys', () => {
    const st = mem();
    expect(writeSnapshot('a', { at: 1000, x: 1 } as { at: number }, st)).toBe(true);
    expect(readSnapshot<{ at: number; x: number }>('a', 2000, st)?.x).toBe(1);
    expect(readSnapshot('b', 2000, st)).toBeNull();
  });

  it('keeps at most ten, dropping the oldest', () => {
    const st = mem();
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) writeSnapshot('k' + i, { at: 1000 + i }, st);
    expect(readSnapshot('k0', 5000, st)).toBeNull();
    expect(readSnapshot('k2', 5000, st)).toBeNull();
    expect(readSnapshot('k3', 5000, st)).not.toBeNull();
    expect(readSnapshot('k12', 5000, st)).not.toBeNull();
    expect([...st.map.keys()].filter(k => k.startsWith('aap-instant-snap:')).length).toBe(MAX_SNAPSHOTS);
  });

  it('forgets an answer that is too old, and one removed', () => {
    const st = mem();
    writeSnapshot('a', { at: 1000 }, st);
    expect(readSnapshot('a', 1000 + MAX_AGE_MS + 1, st)).toBeNull();
    removeSnapshot('a', st);
    expect(readSnapshot('a', 2000, st)).toBeNull();
  });

  it('never throws on blocked or full storage', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(writeSnapshot('a', { at: 1 }, broken)).toBe(false);
    expect(readSnapshot('a', 2, broken)).toBeNull();
  });
});

describe('snapshotUsable', () => {
  it('shows a saved answer with no gear note, whatever rule it was saved under', () => {
    expect(snapshotUsable({ ownChanged: '' }, 3)).toBe(true);
    expect(snapshotUsable({ ownChanged: '', gearRule: 2 }, 3)).toBe(true);
  });
  it('works one out again whose gear note came from an older rule (the alt, 10 Oct)', () => {
    // Saved before the gear rule stopped minding stone placement: "(earnings set)" for the same gear.
    expect(snapshotUsable({ ownChanged: 'earnings set' }, 3)).toBe(false);
    expect(snapshotUsable({ ownChanged: 'earnings set', gearRule: 2 }, 3)).toBe(false);
    expect(snapshotUsable({ ownChanged: 'earnings set', gearRule: 3 }, 3)).toBe(true);
  });
  it('works one out again that was read from the version 1 maxed table (table.bin, before table-v2.bin)', () => {
    for (const url of [
      '/ascension-planner/precompute/table.bin',
      'gearshift:/ascension-planner/precompute/table.bin|1,2,3,4',
      '/ascension-planner/precompute/gear-ab.bin|/ascension-planner/precompute/table.bin|340|0.9',
    ])
      expect(snapshotUsable({ ownChanged: '', tableUrl: url }, 3), url).toBe(false);
    for (const url of [
      '/ascension-planner/precompute/table-v2.bin',
      'gearshift:/ascension-planner/precompute/table-v2.bin|1,2,3,4',
      '/ascension-planner/precompute/acct-ab.bin',
    ])
      expect(snapshotUsable({ ownChanged: '', tableUrl: url }, 3), url).toBe(true);
  });
  it('has nothing to show for no snapshot', () => {
    expect(snapshotUsable(null, 3)).toBe(false);
  });
});

describe('rememberShown', () => {
  it('gives back the last answer shown for the same key only', () => {
    rememberShown('k1', { at: 1 });
    expect(recallShown<{ at: number }>('k1')).toEqual({ at: 1 });
    expect(recallShown('k2')).toBeNull();
    expect(recallShown(null)).toBeNull();
    rememberShown('k2', { at: 2 });
    expect(recallShown('k1')).toBeNull();
  });
});
