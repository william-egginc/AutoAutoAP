import { describe, expect, it } from 'vitest';
import {
  createPrestigeBy,
  PRESTIGE_BY_KEY,
  PRESTIGE_BY_RECORD_KEY,
  prestigeByFromUrl,
  recordsPrestigeBy,
} from './usePrestigeBy';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('the "Prestige by" flag', () => {
  it('is off for players by default', () => {
    const f = createPrestigeBy(mem(), '');
    expect(f.enabled.value).toBe(false);
    expect(f.record.value).toBe(false);
    expect(f.fromUrl).toBeNull();
    expect(createPrestigeBy(null, '').enabled.value).toBe(false);
  });

  it('turns on for one visit with ?prestigeBy=1, without storing it', () => {
    const st = mem();
    const f = createPrestigeBy(st, '?prestigeBy=1');
    expect(f.enabled.value).toBe(true);
    expect(f.stored.value).toBe(false);
    expect(st.map.has(PRESTIGE_BY_KEY)).toBe(false);
    expect(createPrestigeBy(st, '').enabled.value).toBe(false);
  });

  it('reads the address leniently', () => {
    for (const on of ['?prestigeBy', '?prestigeBy=1', '?prestigeBy=true', '?x=2&prestigeBy=on', '?prestigeBy=YES'])
      expect(prestigeByFromUrl(on)).toBe(true);
    for (const off of ['?prestigeBy=0', '?prestigeBy=false', '?prestigeBy=off', '?prestigeBy=no'])
      expect(prestigeByFromUrl(off)).toBe(false);
    for (const none of ['', '?playerId=x', '?prestigeBy=maybe']) expect(prestigeByFromUrl(none)).toBeNull();
  });

  it('remembers the Your setup box per browser, and the address overrides it for a visit', () => {
    const st = mem();
    createPrestigeBy(st, '').stored.value = true;
    expect(st.map.get(PRESTIGE_BY_KEY)).toBe('1');
    expect(createPrestigeBy(st, '').enabled.value).toBe(true);
    expect(createPrestigeBy(st, '?prestigeBy=0').enabled.value).toBe(false);
    const f = createPrestigeBy(st, '');
    f.stored.value = false;
    expect(f.enabled.value).toBe(false);
    expect(st.map.get(PRESTIGE_BY_KEY)).toBe('0');
  });

  it('remembers the record box separately', () => {
    const st = mem();
    createPrestigeBy(st, '').record.value = true;
    expect(st.map.get(PRESTIGE_BY_RECORD_KEY)).toBe('1');
    expect(createPrestigeBy(st, '').record.value).toBe(true);
    expect(createPrestigeBy(st, '').enabled.value).toBe(false);
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
    const f = createPrestigeBy(bad, '?prestigeBy=1');
    expect(f.enabled.value).toBe(true);
    f.stored.value = true;
    expect(f.stored.value).toBe(true);
  });

  it('records the prediction only with the flag on, its box ticked and the check shared', () => {
    expect(recordsPrestigeBy({ enabled: true, record: true }, true)).toBe(true);
    expect(recordsPrestigeBy({ enabled: true, record: true }, false)).toBe(false);
    expect(recordsPrestigeBy({ enabled: true, record: false }, true)).toBe(false);
    expect(recordsPrestigeBy({ enabled: false, record: true }, true)).toBe(false);
  });
});
