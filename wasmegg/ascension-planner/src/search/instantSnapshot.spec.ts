import { describe, expect, it } from 'vitest';
import { MAX_AGE_MS, MAX_SNAPSHOTS, readSnapshot, removeSnapshot, writeSnapshot, type StorageLike } from './instantSnapshot';

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
