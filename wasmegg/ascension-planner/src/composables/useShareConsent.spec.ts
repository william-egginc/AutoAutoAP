/** The remembered "I acknowledge the following" box (useShareConsent.ts). */
import { describe, expect, it } from 'vitest';
import { CONSENT_KEY, createShareConsent } from './useShareConsent';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('createShareConsent', () => {
  it('starts unticked, writes 1 on tick (synchronously) and 0 on untick', () => {
    const st = fakeStorage();
    const agreed = createShareConsent(st);
    expect(agreed.value).toBe(false);
    expect(st.data.has(CONSENT_KEY)).toBe(false);
    agreed.value = true;
    expect(st.data.get(CONSENT_KEY)).toBe('1');
    agreed.value = false;
    expect(st.data.get(CONSENT_KEY)).toBe('0');
  });

  it('a new instance on the same storage starts ticked, until it was unticked', () => {
    const st = fakeStorage();
    createShareConsent(st).value = true;
    const again = createShareConsent(st);
    expect(again.value).toBe(true);
    again.value = false;
    expect(createShareConsent(st).value).toBe(false);
  });

  it('storage that throws does not throw and works in memory', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const agreed = createShareConsent(bad);
    expect(agreed.value).toBe(false);
    expect(() => (agreed.value = true)).not.toThrow();
    expect(agreed.value).toBe(true);
    agreed.value = false;
    expect(agreed.value).toBe(false);
  });

  it('null storage works in memory', () => {
    const agreed = createShareConsent(null);
    expect(agreed.value).toBe(false);
    agreed.value = true;
    expect(agreed.value).toBe(true);
  });
});
