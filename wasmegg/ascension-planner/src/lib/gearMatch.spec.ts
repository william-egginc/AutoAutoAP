import { describe, expect, it } from 'vitest';
import { equippedName, sameSet, whichSet } from './gearMatch';
import type { EquippedArtifact } from './artifacts/types';

const a = (artifactId: string | null, ...stones: (string | null)[]): EquippedArtifact => ({ artifactId, stones });
const earnings = [
  a('book-of-basan-4-epic', 'prophecy-3', 'clarity-3'),
  a('ankh-4-legendary', 'quantum-3'),
  a('demeters-necklace-4-legendary'),
  a('tungsten-ankh-4-legendary'),
];
const production = [
  a('quantum-metronome-4-legendary', 'tachyon-3'),
  a('gusset-4-legendary', 'quantum-3'),
  a('demeters-necklace-4-legendary'),
  a('tachyon-deflector-4-legendary'),
];

describe('whichSet', () => {
  it('names the set equipped: earnings, production, both, a mix', () => {
    expect(whichSet(earnings, earnings, production)).toBe('earnings');
    expect(whichSet(production, earnings, production)).toBe('production');
    expect(whichSet(earnings, earnings, earnings)).toBe('both');
    expect(whichSet([...earnings.slice(0, 2), ...production.slice(2)], earnings, production)).toBe('mix');
  });

  it('ignores slot order, stone order and empty slots', () => {
    const shuffled = [
      earnings[3],
      a('ankh-4-legendary', null, 'quantum-3'),
      earnings[2],
      a('book-of-basan-4-epic', 'clarity-3', 'prophecy-3'),
      a(null),
    ];
    expect(sameSet(shuffled, earnings)).toBe(true);
    expect(whichSet(shuffled, earnings, production)).toBe('earnings');
    // Another stone is another set.
    expect(sameSet([a('book-of-basan-4-epic', 'prophecy-3', 'prophecy-3'), ...earnings.slice(1)], earnings)).toBe(
      false
    );
  });

  it("can't tell without the equipped set or both sets", () => {
    expect(whichSet(null, earnings, production)).toBeNull();
    expect(whichSet(earnings, null, null)).toBeNull();
    expect(whichSet(earnings, null, production)).toBe('mix');
  });

  it('the Gear row names it', () => {
    expect(equippedName('earnings')).toBe('Equipped now = your earnings set');
    expect(equippedName('production')).toBe('Equipped now = your delivery set');
    expect(equippedName('mix')).toBe('Equipped now = a mix');
    expect(equippedName(null)).toBe('Equipped now');
  });
});
