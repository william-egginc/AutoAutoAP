import { describe, expect, it } from 'vitest';
import { describeGear, isMaxed, pickBracket, type TableEntry } from './tableBracket';

const maxed: TableEntry = { file: 'table.bin', bonus: 128.71, k: 1, from: 120 };
const zen: TableEntry = { file: 'gear-zen.bin', bonus: 115.28, k: 0.709, from: 120 };
const mid: TableEntry = { file: 'gear-mid.bin', bonus: 126.0, k: 0.94, from: 120 };
const mixed: TableEntry = { file: 'gear-mixed.bin', bonus: 128.71, k: 0.8, from: 120 };
const all = [maxed, zen, mid, mixed];

describe('pickBracket', () => {
  it('the nearest stronger and weaker tables on both numbers', () => {
    expect(pickBracket(all, { bonus: 124, k: 0.9 })).toEqual({ above: mid, below: zen });
  });

  it('skips a table stronger on one number and weaker on the other', () => {
    // bonus 127, k 0.85: `mixed` (128.71 / 0.80) is stronger on bonus, weaker on delivery.
    expect(pickBracket(all, { bonus: 127, k: 0.85 })).toEqual({ above: maxed, below: zen });
  });

  it('falls back to the maxed table above, and none below when nothing is weaker', () => {
    expect(pickBracket(all, { bonus: 110, k: 0.6 })).toEqual({ above: zen, below: null });
    expect(pickBracket([zen], { bonus: 127.5, k: 0.99 })).toEqual({ above: null, below: zen });
    expect(pickBracket([maxed], { bonus: 127.5, k: 0.99 })).toEqual({ above: maxed, below: null });
  });

  it('a table of exactly the player’s gear is above, not also below', () => {
    expect(pickBracket(all, { bonus: 126.0, k: 0.94 })).toEqual({ above: mid, below: zen });
  });
});

describe('isMaxed and describeGear', () => {
  it('maxed only at the top of both numbers', () => {
    expect(isMaxed({ bonus: 128.71, k: 1 })).toBe(true);
    expect(isMaxed({ bonus: 128.71, k: 0.99 })).toBe(false);
    expect(isMaxed({ bonus: 127.9, k: 1 })).toBe(false);
  });

  it('names a table by its gear only', () => {
    expect(describeGear(mid)).toBe('a table built for gear like 126.0 bonus / 0.94 delivery');
  });
});
