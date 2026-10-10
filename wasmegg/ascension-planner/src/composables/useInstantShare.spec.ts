import { describe, expect, it } from 'vitest';
import { createInstantShare, declineInstantShare, INSTANT_SHARE_KEY } from './useInstantShare';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('sharing instant answers (opt-in)', () => {
  it('is off and not yet asked by default', () => {
    const s = createInstantShare(mem());
    expect(s.on.value).toBe(false);
    expect(s.asked.value).toBe(false);
    expect(createInstantShare(null).on.value).toBe(false);
  });

  it('remembers a yes per browser', () => {
    const st = mem();
    const s = createInstantShare(st);
    s.on.value = true;
    expect(st.map.get(INSTANT_SHARE_KEY)).toBe('1');
    expect(s.asked.value).toBe(true);
    const again = createInstantShare(st);
    expect(again.on.value).toBe(true);
    expect(again.asked.value).toBe(true);
  });

  it('remembers a no, so the inline offer is not shown again', () => {
    const st = mem();
    const s = createInstantShare(st);
    declineInstantShare(s, st);
    expect(st.map.get(INSTANT_SHARE_KEY)).toBe('0');
    const again = createInstantShare(st);
    expect(again.on.value).toBe(false);
    expect(again.asked.value).toBe(true);
  });

  it('unticking turns it off', () => {
    const st = mem({ [INSTANT_SHARE_KEY]: '1' });
    const s = createInstantShare(st);
    declineInstantShare(s, st);
    expect(st.map.get(INSTANT_SHARE_KEY)).toBe('0');
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
