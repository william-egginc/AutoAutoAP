import { describe, expect, it } from 'vitest';
import { epicResearchDefs } from '@/lib/epicResearch';
import { deliveryLetters, earningsLetters, gearLabel, maxedLabel, stonesText } from './tableLabel';

const stones = (n: number, kind: string, tier = 4) => Array.from({ length: n }, () => `T${tier} ${kind} stone`);
const maxedDelivery = [
  { artifact: 'T4L Gusset', stones: [...stones(1, 'Quantum'), ...stones(2, 'Tachyon')] },
  { artifact: 'T4L Interstellar compass', stones: stones(2, 'Tachyon') },
  { artifact: 'T4L Quantum metronome', stones: stones(3, 'Tachyon') },
  { artifact: 'T4L Puzzle cube', stones: stones(3, 'Tachyon') },
];
const legendaryEarnings = ['Puzzle cube', 'Lunar totem', 'Demeters necklace', 'Tungsten ankh'].map(a => ({
  artifact: `T4L ${a}`,
  stones: stones(3, 'Lunar'),
}));
const maxedEpic = Object.fromEntries(epicResearchDefs.map(d => [d.id, d.maxLevel]));
const coll = { a: 3, b: 3 };
const MAXED = 'Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7';

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

  it('orders the earnings set ankh, necklace, cube, totem', () => {
    const set = [
      { artifact: 'T4L Lunar totem', stones: [] },
      { artifact: 'T4R Puzzle cube', stones: [] },
      { artifact: 'T4E Demeters necklace', stones: [] },
      { artifact: 'T3L Tungsten ankh', stones: [] },
    ];
    expect(earningsLetters(set)).toBe('3L E R L');
    expect(earningsLetters(set.slice(0, 3))).toBe('-ERL');
  });

  it('shows tiers below T4 and empty slots', () => {
    const set = [
      { artifact: 'T3E Quantum metronome', stones: [] },
      { artifact: 'T4C Gusset', stones: [] },
      { artifact: 'T4C Interstellar compass', stones: [] },
    ];
    expect(deliveryLetters(set)).toBe('3E C C -');
  });

  it('groups stones by count, tier and type: quantum, tachyon, lunar, higher tier first', () => {
    expect(stonesText(maxedDelivery, legendaryEarnings)).toBe('1T4Q 10T4T 12T4L');
    const mixed = [{ artifact: 'T4L Gusset', stones: ['T3 Tachyon stone', 'T4 Tachyon stone', ...stones(9, 'Quantum')] }];
    expect(stonesText(mixed)).toBe('9T4Q 1T4T 1T3T');
    expect(stonesText([{ artifact: 'T4C Gusset', stones: [] }])).toBe('no stones');
  });

  it('labels a maxed-gear table without the extras', () => {
    const label = gearLabel(
      { deliveryFull: maxedDelivery, earnings: legendaryEarnings, epicResearch: maxedEpic, colleggtibles: coll },
      128.71
    );
    expect(label).toBe(MAXED);
    expect(maxedLabel(maxedDelivery, 128.71)).toBe(`${MAXED} · maxed reference`);
  });

  it('ignores epic research the simulator does not read, flags what it does', () => {
    const base = { deliveryFull: maxedDelivery, earnings: legendaryEarnings, colleggtibles: coll };
    expect(gearLabel({ ...base, epicResearch: { ...maxedEpic, warp_shift: 0, epic_silo_quality: 0 } }, 128.71)).toBe(MAXED);
    expect(gearLabel({ ...base, epicResearch: { ...maxedEpic, soul_eggs: 100 } }, 128.71)).toContain(
      `epic research ${epicResearchDefs.length - 1}/${epicResearchDefs.length}`
    );
  });

  it('shows a weaker earnings set and flags colleggtibles below the top tier', () => {
    const earnings = [...legendaryEarnings.slice(0, 3), { artifact: 'T3L Tungsten ankh', stones: [] }];
    const label = gearLabel(
      { deliveryFull: maxedDelivery, earnings, epicResearch: maxedEpic, colleggtibles: { a: 3, b: 2 } },
      120
    );
    expect(label).toBe('Delivery LLLL · Earnings 3L L L L · 1T4Q 10T4T 9T4L · bonus 120.0 · colleggtibles 1/2');
  });
});
