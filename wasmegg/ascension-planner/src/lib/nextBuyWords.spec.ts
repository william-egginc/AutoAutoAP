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
});
