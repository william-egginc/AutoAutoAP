import { describe, expect, it } from 'vitest';
import { epicResearchDefs } from '@/lib/epicResearch';
import { deliveryLetters, gearLabel, maxedLabel, stonesText } from './tableLabel';

const T4 = (n: number, kind = 'Tachyon') => Array.from({ length: n }, () => `T4 ${kind} stone`);
const maxedDelivery = [
  { artifact: 'T4L Gusset', stones: [...T4(1, 'Quantum'), ...T4(2)] },
  { artifact: 'T4L Interstellar compass', stones: T4(2) },
  { artifact: 'T4L Quantum metronome', stones: T4(3) },
  { artifact: 'T4L Puzzle cube', stones: T4(3) },
];
const legendaryEarnings = ['Demeters necklace', 'Lunar totem', 'Puzzle cube', 'Tungsten ankh'].map(a => ({
  artifact: `T4L ${a}`,
  stones: T4(3, 'Lunar'),
}));
const maxedEpic = Object.fromEntries(epicResearchDefs.map(d => [d.id, d.maxLevel]));
const coll = { a: 3, b: 3 };

describe('tableLabel', () => {
  it('orders the delivery set metronome, compass, gusset, stone holder whatever the slot order', () => {
    const set = [
      { artifact: 'T4E Quantum metronome', stones: [] },
      { artifact: 'T4L Puzzle cube', stones: [] },
      { artifact: 'T4R Gusset', stones: [] },
      { artifact: 'T4L Interstellar compass', stones: [] },
    ];
    expect(deliveryLetters(set)).toBe('ELRL');
    expect(deliveryLetters([...set].reverse())).toBe('ELRL');
  });

  it('shows tiers below T4 and empty slots', () => {
    const set = [
      { artifact: 'T3E Quantum metronome', stones: [] },
      { artifact: 'T4C Gusset', stones: [] },
      { artifact: 'T4C Interstellar compass', stones: [] },
    ];
    expect(deliveryLetters(set)).toBe('3E C C -');
  });

  it('counts stones by tier', () => {
    expect(stonesText(maxedDelivery)).toBe('11 T4 stones');
    expect(stonesText([{ artifact: 'T4L Gusset', stones: ['T3 Tachyon stone', 'T4 Tachyon stone'] }])).toBe(
      '1 T4 + 1 T3 stones'
    );
    expect(stonesText([{ artifact: 'T4C Gusset', stones: [] }])).toBe('no stones');
  });

  it('labels a maxed-gear table without the extras', () => {
    const label = gearLabel(
      { deliveryFull: maxedDelivery, earnings: legendaryEarnings, epicResearch: maxedEpic, colleggtibles: coll },
      128.71
    );
    expect(label).toBe('LLLL · 11 T4 stones · bonus 128.7');
    expect(maxedLabel(maxedDelivery, 128.71)).toBe('LLLL · 11 T4 stones · bonus 128.7 · maxed reference');
  });

  it('ignores epic research the simulator does not read, flags what it does', () => {
    const base = { deliveryFull: maxedDelivery, earnings: legendaryEarnings, colleggtibles: coll };
    expect(gearLabel({ ...base, epicResearch: { ...maxedEpic, warp_shift: 0, epic_silo_quality: 0 } }, 128.71)).toBe(
      'LLLL · 11 T4 stones · bonus 128.7'
    );
    expect(gearLabel({ ...base, epicResearch: { ...maxedEpic, soul_eggs: 100 } }, 128.71)).toContain(
      `epic research ${epicResearchDefs.length - 1}/${epicResearchDefs.length}`
    );
  });

  it('flags a weaker earnings set and colleggtibles below the top tier', () => {
    const earnings = [...legendaryEarnings.slice(0, 3), { artifact: 'T3L Tungsten ankh', stones: [] }];
    const label = gearLabel(
      { deliveryFull: maxedDelivery, earnings, epicResearch: maxedEpic, colleggtibles: { a: 3, b: 2 } },
      120
    );
    expect(label).toBe('LLLL · 11 T4 stones · bonus 120.0 · earnings L L L 3L · colleggtibles 1/2');
  });
});
