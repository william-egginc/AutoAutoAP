import { describe, expect, it } from 'vitest';
import { artifactOptions } from './artifacts/data';
import { gearWords } from './gearWords';

describe('gear in words', () => {
  it('counts rarities, most precious first, and stones', () => {
    const leg = artifactOptions.find(a => a.rarity === 3)!;
    const epic = artifactOptions.find(a => a.rarity === 2)!;
    const set = [
      { artifactId: leg.id, stones: ['s1', 's2', null] },
      { artifactId: epic.id, stones: ['s3'] },
      { artifactId: leg.id, stones: [] },
      { artifactId: null, stones: [] },
    ];
    expect(gearWords(set as never)).toBe('2 legendary, 1 epic · 3 stones');
    expect(gearWords([])).toBe('nothing equipped');
    expect(gearWords(null)).toBe('nothing equipped');
  });
});
