import { describe, expect, it } from 'vitest';
import { moveSlider, type SliderRow } from './deadlineSuggest';

const rows = (): SliderRow[] => [{ widthIx: 3, stepIx: 1 }, {}, { widthIx: 3, stepIx: 1, pm: 2 }];

describe('moveSlider', () => {
  it('is independent by default: a lower chain moves alone, the top one too', () => {
    const r = rows();
    expect(moveSlider(r, 2, 'widthIx', 5, false)).toEqual([2]);
    expect(r[0].widthIx).toBe(3);
    expect(r[1].widthIx).toBeUndefined();
    expect(r[2].widthIx).toBe(5);
    expect(r[2].pm).toBeUndefined();
    expect(moveSlider(r, 0, 'stepIx', 0, false)).toEqual([0]);
    expect(r[1].stepIx).toBeUndefined();
    expect(r[2].stepIx).toBe(1);
  });

  it('moves every chain together when linked, from a lower chain', () => {
    const r = rows();
    expect(moveSlider(r, 2, 'stepIx', 4, true)).toEqual([0, 1, 2]);
    expect(r.map(x => x.stepIx)).toEqual([4, 4, 4]);
    moveSlider(r, 1, 'widthIx', 6, true);
    expect(r.map(x => x.widthIx)).toEqual([6, 6, 6]);
  });
});
