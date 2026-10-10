import { describe, expect, it } from 'vitest';
import { gearChanges, type TableGear } from './tableGear';

const slot = (artifact: string, ...stones: string[]) => ({ artifact, stones });

function stamp(): TableGear {
  return {
    earnings: [
      slot('T4L Demeters necklace', 'T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'),
      slot('T4L Puzzle cube', 'T4 Lunar stone', 'T3 Lunar stone', 'T3 Lunar stone'),
      slot('T4L Tungsten ankh', 'T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'),
      slot('T4L Lunar totem', 'T4 Lunar stone', 'T3 Lunar stone', 'T4 Lunar stone'),
    ],
    deliveryBare: [
      slot('T4L Interstellar compass', 'T4 Quantum stone', 'T4 Quantum stone'),
      slot('T4L Puzzle cube', 'T4 Quantum stone', 'T4 Quantum stone', 'T4 Quantum stone'),
    ],
    deliveryFull: [
      slot('T4L Gusset', 'T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'),
      slot('T4E Quantum metronome', 'T4 Tachyon stone', 'T4 Tachyon stone'),
    ],
    research: { comfy_nests: 50 },
    epicResearch: { epic_multiplier: 100 },
    colleggtibles: { wood: 3 },
  };
}

describe('gearChanges', () => {
  it('matches the same stamp', () => {
    expect(gearChanges(stamp(), stamp())).toEqual([]);
  });

  it('ignores the order the same artifacts are worn in (the alt, 10 Oct)', () => {
    const mine = stamp();
    const [necklace, cube, ankh, totem] = mine.earnings;
    mine.earnings = [ankh, necklace, cube, totem];
    mine.deliveryBare.reverse();
    mine.deliveryFull.reverse();
    expect(gearChanges(stamp(), mine)).toEqual([]);
  });

  it('still sees a real swap: another artifact, or a stone moved to another artifact', () => {
    const swapped = stamp();
    swapped.earnings[3] = slot('T4L Lunar totem', 'T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone');
    expect(gearChanges(stamp(), swapped)).toEqual(['earnings set']);

    const moved = stamp();
    moved.earnings[0] = slot('T4L Demeters necklace', 'T4 Lunar stone', 'T4 Lunar stone', 'T3 Lunar stone');
    moved.earnings[1] = slot('T4L Puzzle cube', 'T4 Lunar stone', 'T4 Lunar stone', 'T3 Lunar stone');
    expect(gearChanges(stamp(), moved)).toEqual(['earnings set']);

    const delivery = stamp();
    delivery.deliveryFull[1] = slot('T4L Quantum metronome', 'T4 Tachyon stone', 'T4 Tachyon stone');
    expect(gearChanges(stamp(), delivery)).toEqual(['delivery set']);

    const fewer = stamp();
    fewer.earnings.pop();
    expect(gearChanges(stamp(), fewer)).toEqual(['earnings set']);
  });

  it('still sees epic research and colleggtibles', () => {
    const mine = stamp();
    mine.epicResearch = { epic_multiplier: 99 };
    mine.colleggtibles = { wood: 2 };
    expect(gearChanges(stamp(), mine)).toEqual(['epic research', 'colleggtibles']);
  });
});
