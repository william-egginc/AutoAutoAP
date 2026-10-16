import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VIRTUE_EGG_BY_TYPE, virtueEggName, virtueEggOf, virtueEggType } from './virtueEggs';

describe('virtue eggs by number', () => {
  it('is the same map as search/leg.ts (read from its source: leg.ts keeps it private)', () => {
    const src = readFileSync(new URL('../search/leg.ts', import.meta.url), 'utf8');
    const block = src.match(/const VIRTUE_EGGS_MAP[^{]*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const fromLeg = Object.fromEntries(
      [...block![1].matchAll(/(\d+):\s*'(\w+)'/g)].map(m => [Number(m[1]), m[2]])
    );
    expect(fromLeg).toEqual(VIRTUE_EGG_BY_TYPE);
  });

  it('names an egg and finds its number', () => {
    expect(virtueEggOf(51)).toBe('integrity');
    expect(virtueEggOf(1)).toBeNull();
    expect(virtueEggOf(undefined)).toBeNull();
    expect(virtueEggName('humility')).toBe('Humility');
    expect(virtueEggName('')).toBe('');
    expect(virtueEggType('kindness')).toBe(54);
    expect(virtueEggType('edible')).toBeNull();
  });
});
