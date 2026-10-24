import { describe, expect, it } from 'vitest';
import { createInstantDuringSearch, INSTANT_DURING_SEARCH_KEY } from './useInstantDuringSearch';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('instant answer during a search', () => {
  it('defaults to unticked (ask)', () => {
    expect(createInstantDuringSearch(mem()).value).toBe(false);
    expect(createInstantDuringSearch(null).value).toBe(false);
  });

  it('remembers a tick per browser and an untick after it', () => {
    const st = mem();
    createInstantDuringSearch(st).value = true;
    expect(st.map.get(INSTANT_DURING_SEARCH_KEY)).toBe('1');
    const b = createInstantDuringSearch(st);
    expect(b.value).toBe(true);
    b.value = false;
    expect(st.map.get(INSTANT_DURING_SEARCH_KEY)).toBe('0');
    expect(createInstantDuringSearch(st).value).toBe(false);
  });

  it('treats an unreadable stored value as unticked', () => {
    expect(createInstantDuringSearch(mem({ [INSTANT_DURING_SEARCH_KEY]: 'banana' })).value).toBe(false);
  });

  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const x = createInstantDuringSearch(bad);
    expect(x.value).toBe(false);
    x.value = true;
    expect(x.value).toBe(true);
  });
});
