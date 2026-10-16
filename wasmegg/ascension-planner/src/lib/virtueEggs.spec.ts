import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eggIconPath as libEggIconPath, iconURL, ei } from 'lib';
import { VIRTUE_EGG_BY_TYPE, eggIconPath, virtueEggName, virtueEggOf, virtueEggType } from './virtueEggs';
import { virtueEggIconPath } from './missions';

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

describe('virtue egg pictures (fix 20: one helper for every egg picture on My runs)', () => {
  const FIVE = {
    50: ['curiosity', 'egginc/egg_curiosity.png'],
    51: ['integrity', 'egginc/egg_integrity.png'],
    52: ['humility', 'egginc/egg_humility.png'],
    53: ['resilience', 'egginc/egg_resilience.png'],
    54: ['kindness', 'egginc/egg_kindness.png'],
  } as const;

  it('all five, by name, as the app shows them elsewhere and as the shared lib names them', () => {
    for (const [n, [egg, path]] of Object.entries(FIVE)) {
      expect(eggIconPath(egg)).toBe(path);
      expect(eggIconPath(virtueEggOf(Number(n)))).toBe(path);
      // The shared lib (lib/eggs.ts eggIconPath) by the game's egg number (ei.Egg.CURIOSITY = 50 ...).
      expect(libEggIconPath(Number(n) as ei.Egg)).toBe(path);
      // The Manual planner's own helper (lib/missions.ts), and FloatingStats' expression.
      expect(virtueEggIconPath(egg)).toBe(path);
      expect(iconURL(eggIconPath(egg)!, 64)).toMatch(new RegExp(`/64/egginc/egg_${egg}\\.png$`));
    }
    expect(eggIconPath('edible')).toBeNull();
    expect(eggIconPath(null)).toBeNull();
  });

  it('FloatingStats (the Manual planner’s current egg) builds the same path from the egg’s name', () => {
    const src = readFileSync(new URL('../components/FloatingStats.vue', import.meta.url), 'utf8');
    expect(src).toContain('iconURL(`egginc/egg_${currentEgg}.png`, 64)');
  });

  it('every egg picture on My runs goes through eggIconPath', () => {
    for (const f of ['RightNowCard.vue', 'YourEggs.vue', 'SavedTile.vue', 'EventsTable.vue', 'TryNext.vue', 'GearBlock.vue']) {
      const src = readFileSync(new URL(`../components/myruns/${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/egginc\/egg_/);
    }
    const card = readFileSync(new URL('../components/myruns/RightNowCard.vue', import.meta.url), 'utf8');
    expect(card).toContain(':src="iconURL(eggPicture, 64)"');
    expect(card).toContain('const eggPicture = computed(() => eggIconPath(props.currentEgg));');
  });
});
