/** "Missing for a perfect set" (lib/perfectSet.ts): the save's sets against T4 Legendary with tier-4 stones. */
import { describe, expect, it } from 'vitest';
import { artifactOptions } from './artifacts/data';
import type { EquippedArtifact } from './artifacts/types';
import { bestOfFamily, perfectSetGaps, setGaps, stoneOf } from './perfectSet';

const a = (artifactId: string | null, ...stones: (string | null)[]): EquippedArtifact => ({ artifactId, stones });

/** The maxed earnings set: four T4L, twelve T4 lunar stones (search/tableLabel.ts `maxedLabel`). */
const MAXED = [
  a('tungsten-ankh-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
  a('demeters-necklace-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
  a('puzzle-cube-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
  a('lunar-totem-4-3', 'lunar-stone-4', 'lunar-stone-4', 'lunar-stone-4'),
];
const PROD_MAXED = [
  a('quantum-metronome-4-3', 'tachyon-stone-4', 'tachyon-stone-4', 'tachyon-stone-4'),
  a('interstellar-compass-4-3', 'tachyon-stone-4', 'tachyon-stone-4'),
  a('gusset-4-3', 'quantum-stone-4', 'tachyon-stone-4', 'tachyon-stone-4'),
  a('tachyon-deflector-4-3', 'tachyon-stone-4', 'tachyon-stone-4'),
];

describe('the perfect bar', () => {
  it('every family the planner uses for virtue gear comes in T4 Legendary', () => {
    for (const f of [
      'tungsten-ankh',
      'demeters-necklace',
      'puzzle-cube',
      'lunar-totem',
      'quantum-metronome',
      'gusset',
      'interstellar-compass',
    ])
      expect(bestOfFamily(f)?.id).toBe(`${f}-4-3`);
    // A family that tops out lower is judged against its own best.
    const odd = artifactOptions.find(o => bestOfFamily(o.familyId)!.rarity < 3);
    if (odd) expect(bestOfFamily(odd.familyId)!.tier).toBeGreaterThan(0);
  });

  it('reads stone ids, the ones the planner leaves out too', () => {
    expect(stoneOf('quantum-stone-3')).toEqual({ tier: 3, name: 'Quantum stone' });
    expect(stoneOf('prophecy-stone-2')).toEqual({ tier: 2, name: 'Prophecy stone' });
    expect(stoneOf('nonsense')).toBeNull();
  });
});

describe('perfectSetGaps', () => {
  it('no gear (no save, or none in it): null, so the block says one plain line', () => {
    expect(perfectSetGaps({ equipped: null, earnings: null, production: null })).toBeNull();
    expect(perfectSetGaps({ equipped: [a(null)], earnings: [], production: null })).toBeNull();
  });

  it('all legendary already: one calm headline, every set empty of gaps', () => {
    const g = perfectSetGaps({ equipped: MAXED, earnings: MAXED, production: PROD_MAXED, match: 'earnings' })!;
    expect(g.perfect).toBe(true);
    expect(g.headline).toBe('Already perfect: every artifact T4 Legendary, every stone slot filled at tier 4.');
    expect(g.sets.map(s => [s.id, s.upgrades.length + s.missing.length + s.tiers.length])).toEqual([
      ['earnings', 0],
      ['production', 0],
      ['equipped', 0],
    ]);
    expect(g.sets[2].sameAs).toBe('Equipped now is your earnings set: the same gaps.');
  });

  it('mixed: per slot, what you have vs maxed, grouped, with the count on top', () => {
    const earnings = [
      a('tungsten-ankh-4-3', 'lunar-stone-4', 'lunar-stone-3', 'lunar-stone-3'),
      a('demeters-necklace-4-2', 'lunar-stone-4', 'lunar-stone-4'),
      a('puzzle-cube-3-1', 'quantum-stone-3'),
      a(null),
    ];
    const g = perfectSetGaps({ equipped: earnings, earnings, production: PROD_MAXED, match: 'earnings' })!;
    expect(g.perfect).toBe(false);
    expect(g.headline).toBe(
      '3 of 8 artifacts are not T4 Legendary; 3 stones are below tier 4; 3 stone slots are empty.'
    );
    const e = g.sets.find(s => s.id === 'earnings')!;
    expect(e.upgrades).toEqual([
      'Slot 2: T4 Epic Demeters necklace vs T4 Legendary',
      'Slot 3: T3 Rare Puzzle cube vs T4 Legendary',
      'Slot 4: empty vs a T4 Legendary artifact',
    ]);
    expect(e.missing).toEqual([
      'Slot 2, Demeters necklace: 1 stone missing (has 2, a T4 Legendary holds 3)',
      'Slot 3, Puzzle cube: 2 stones missing (has 1, a T4 Legendary holds 3)',
    ]);
    expect(e.tiers).toEqual([
      'Slot 1, Tungsten ankh: 2 × T3 Lunar stone vs T4',
      'Slot 3, Puzzle cube: T3 Quantum stone vs T4',
    ]);
    expect(g.sets.find(s => s.id === 'production')!.upgrades).toEqual([]);
  });

  it('an empty stone slot in a T4 Legendary counts, without the "holds" note', () => {
    const s = setGaps('earnings', 'Earnings set', [
      a('lunar-totem-4-3', 'lunar-stone-4', null, null),
      ...MAXED.slice(1),
    ]);
    expect(s.missing).toEqual(['Slot 1, Lunar totem: 2 stones missing (has 1)']);
    expect(s.notMaxed).toBe(0);
  });

  it('a mix equipped counts as a third set; identical earnings and production count once', () => {
    const mix = [...MAXED.slice(0, 2), a('puzzle-cube-4-2', 'lunar-stone-4', 'lunar-stone-4'), MAXED[3]];
    const m = perfectSetGaps({ equipped: mix, earnings: MAXED, production: PROD_MAXED, match: 'mix' })!;
    expect(m.headline).toMatch(
      /^1 of 12 artifacts is not T4 Legendary; 0 stones are below tier 4; 1 stone slot is empty\.$/
    );
    const same = perfectSetGaps({ equipped: MAXED, earnings: MAXED, production: MAXED, match: 'both' })!;
    expect(same.sets.find(s => s.id === 'production')!.sameAs).toBe('The same as your earnings set: the same gaps.');
    expect(same.perfect).toBe(true);
  });

  it('only an equipped set (no inventory sets): counted on its own', () => {
    const g = perfectSetGaps({
      equipped: [a('puzzle-cube-4-2', 'lunar-stone-4', 'lunar-stone-4')],
      earnings: null,
      production: null,
    })!;
    expect(g.headline).toBe('4 of 4 artifacts are not T4 Legendary; 0 stones are below tier 4; 1 stone slot is empty.');
  });
});
