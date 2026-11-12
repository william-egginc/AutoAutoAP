import { describe, expect, it } from 'vitest';
import { buyWindowWords } from './nextBuyWords';

describe("Next step's research buy window", () => {
  it("waits for the sale, then gives the window; no shift in it", () => {
    const t = buyWindowWords({ day: 'Friday', from: '10:00 AM', to: '2:26 PM' });
    expect(t).toBe("Wait for Friday's research sale, then buy research from 10:00 AM to 2:26 PM");
    expect(t).not.toMatch(/shift/i);
  });
  it('without the end: only the start; sale open now: no waiting', () => {
    expect(buyWindowWords({ day: 'Friday', from: '10:00 AM', to: null })).toBe("Wait for Friday's research sale, then buy research from 10:00 AM");
    expect(buyWindowWords({ day: 'Friday', from: '10:00 AM', to: '2:26 PM', open: true })).toBe('Buy research now, until 2:26 PM');
    expect(buyWindowWords({ day: 'Friday', from: '10:00 AM', to: null, open: true })).toBe('Buy research now');
  });
  it('a window that ends on another day names both days (QA, 12 Nov 2026)', () => {
    const o = { day: 'Friday', from: '10:00 AM', to: '10:00 AM', fromDay: 'Friday', toDay: 'Saturday' };
    expect(buyWindowWords(o)).toBe("Wait for Friday's research sale, then buy research from Friday 10:00 AM to Saturday 10:00 AM");
    expect(buyWindowWords({ ...o, open: true })).toBe('Buy research now, until Saturday 10:00 AM');
  });
});
