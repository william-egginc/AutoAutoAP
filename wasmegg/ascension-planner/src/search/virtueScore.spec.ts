import { describe, expect, it } from 'vitest';
import {
  checkFinalLegRate,
  clothedTEFromLabels,
  deliveryScore,
  finalLegWork,
  rampShare,
  slotsFromLabels,
} from './virtueScore';

// Kenzie's leg-1 delivery set as stored by the collector: every slot T4L, all eleven sockets T4.
const PERFECT = [
  { artifact: 'T4L Quantum metronome', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
  { artifact: 'T4L Interstellar compass', stones: ['T4 Quantum stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Gusset', stones: ['T4 Quantum stone', 'T4 Tachyon stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Lunar totem', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
];

describe('deliveryScore', () => {
  it('scores the best set the game offers at exactly 1, whichever side the stones sit on', () => {
    expect(deliveryScore(slotsFromLabels(PERFECT))?.score).toBe(1);
  });

  it('counts an upgrade at about half once the stones can rebalance', () => {
    // T4L -> T4E compass: 1.50 -> 1.40 shipping, -6.7%; the score should drop by about half that.
    const epic = PERFECT.map((s, i) => (i === 1 ? { ...s, artifact: 'T4E Interstellar compass' } : s));
    expect(deliveryScore(slotsFromLabels(epic))!.score).toBeCloseTo(Math.sqrt(1.4 / 1.5), 4);
  });

  it('drops labels it does not know rather than guessing at them', () => {
    expect(slotsFromLabels([{ artifact: 'T9X Nonsense', stones: [] }])).toEqual([]);
    expect(deliveryScore([])).toBeNull();
  });
});

describe('rampShare / finalLegWork', () => {
  it('interpolates the measured ramp and refuses to extrapolate below it', () => {
    expect(rampShare(280)).toBe(1);
    expect(rampShare(350)).toBe(1);
    expect(rampShare(195)).toBeCloseTo(0.51, 5);
    expect(rampShare(169)).toBeNull();
  });

  it('matches a real final leg: rontimes, 337 -> 490 at 11.82 q/hr in 378.9 days', () => {
    expect(finalLegWork(337) / 11.82).toBeCloseTo(378.9, -1);
  });
});

describe('checkFinalLegRate', () => {
  it('passes a clean run and flags the delivery-set-for-earnings bug', () => {
    const clean = checkFinalLegRate([295, 490], [{ peakDeliveryQph: 11.59 }], PERFECT);
    expect(clean?.suspect).toBe(false);
    // 19ba79ab: last checkpoint 352, so the gear should be at full rate, and it peaked at 8.01.
    const bugged = checkFinalLegRate([352, 490], [{ peakDeliveryQph: 8.01 }], PERFECT);
    expect(bugged?.suspect).toBe(true);
  });

  it('declines to judge what it cannot', () => {
    expect(checkFinalLegRate([169, 490], [{ peakDeliveryQph: 3.68 }], PERFECT)).toBeNull();
    expect(checkFinalLegRate([300, 490], [{ peakDeliveryQph: 11 }], undefined)).toBeNull();
    expect(checkFinalLegRate([300, 490], [], PERFECT)).toBeNull();
    // Zen_Ferret a7d06bd8: 275 -> 300 is too short a leg to reach the rate; the ramp does not apply.
    expect(checkFinalLegRate([275, 300], [{ peakDeliveryQph: 7.38 }], PERFECT)).toBeNull();
  });
});

describe('clothedTEFromLabels', () => {
  const EARNINGS = [
    { artifact: 'T4L Demeters necklace', stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'] },
    { artifact: 'T4L Puzzle cube', stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'] },
    { artifact: 'T4L Tungsten ankh', stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'] },
    { artifact: 'T4L Lunar totem', stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'] },
  ];

  it('adds the set to the TE on a maxed account, and says nothing otherwise', () => {
    const cte = clothedTEFromLabels(178, EARNINGS, true)!;
    expect(cte).toBeGreaterThan(178);
    expect(clothedTEFromLabels(178, EARNINGS, false)).toBeNull();
    expect(clothedTEFromLabels(178, [], true)).toBeNull();
  });
});
