import { describe, expect, it } from 'vitest';
import { createInstantShare, INSTANT_SHARE_KEY } from './useInstantShare';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('keep sharing my checks (opt-in)', () => {
  it('is off by default', () => {
    expect(createInstantShare(mem()).on.value).toBe(false);
    expect(createInstantShare(null).on.value).toBe(false);
  });

  it('remembers a yes per browser', () => {
    const st = mem();
    const s = createInstantShare(st);
    s.on.value = true;
    expect(st.map.get(INSTANT_SHARE_KEY)).toBe('1');
    expect(createInstantShare(st).on.value).toBe(true);
  });

  it('unticking turns it off, remembered', () => {
    const st = mem({ [INSTANT_SHARE_KEY]: '1' });
    const s = createInstantShare(st);
    expect(s.on.value).toBe(true);
    s.on.value = false;
    expect(st.map.get(INSTANT_SHARE_KEY)).toBe('0');
    expect(createInstantShare(st).on.value).toBe(false);
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
    const s = createInstantShare(bad);
    expect(s.on.value).toBe(false);
    s.on.value = true;
    expect(s.on.value).toBe(true);
  });
});
