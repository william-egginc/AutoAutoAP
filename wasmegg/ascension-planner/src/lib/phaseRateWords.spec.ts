import { describe, expect, it } from 'vitest';
import { phaseRateWords } from './phaseRateWords';

describe('phaseRateWords: the rate under the Building / Producing badge', () => {
  it('says which set the save wears, not just "from your save"', () => {
    expect(phaseRateWords({ phase: 'building', rate: '2.179q', from: 'save' })).toBe('2.179q/hr with your earnings set');
    expect(phaseRateWords({ phase: 'producing', rate: '4.293q', from: 'save' })).toBe('4.293q/hr with your delivery set');
  });
  it('names the swap when the other rate is known', () => {
    expect(phaseRateWords({ phase: 'building', rate: '2.179q', from: 'save', afterSwap: '4.293q' })).toBe(
      '2.179q/hr with your earnings set; about 4.293q/hr after the swap to the delivery set'
    );
  });
  it('keeps "projected" for a plan rate', () => {
    expect(phaseRateWords({ phase: 'producing', rate: '5.768q', from: 'projected' })).toBe('5.768q/hr · projected');
  });
});
