import { describe, expect, it } from 'vitest';
import { nextBuyBefore, nextActionWords, type NextAction } from './nextAction';
import type { TrackerLine } from './buildUpTracker';

// M13 item 1 (12 Nov 2026, Jordan): on Curiosity the next step is the research buy in the sale (10:00 am), then the
// shift (2:26 pm). Next step names the buy first, from the tracker's lines still to do.
const NOW = Date.parse('2026-11-13T15:00:00Z') / 1000; // 7:00 am PST
const SALE = Date.parse('2026-11-13T18:00:00Z') / 1000; // 10:00 am PST
const SHIFT = Date.parse('2026-11-13T22:26:00Z') / 1000; // 2:26 pm PST

const line = (o: Partial<TrackerLine> & Pick<TrackerLine, 'key' | 'kind' | 'at'>): TrackerLine => ({
  time: '',
  text: '',
  tail: '',
  bold: false,
  granular: false,
  tickable: true,
  checkIn: 0,
  ...o,
});
const buy = line({ key: `${SALE}:0`, kind: 'research', at: SALE, text: 'buy Grav Plating (17 → 18)' });
const shiftLine = line({ key: `${SHIFT}:0`, kind: 'shift', at: SHIFT, bold: true });
const next: NextAction = { kind: 'shift', egg: 'humility', at: SHIFT };

describe('Next step names the research buy that comes before the shift', () => {
  it('the first buy still to do, before the shift: its time', () => {
    expect(nextBuyBefore(next, [buy, shiftLine], new Set())).toEqual({ at: SALE, until: SHIFT });
  });
  it('a buy already ticked is not it', () => {
    expect(nextBuyBefore(next, [buy, shiftLine], new Set([buy.key]))).toBeNull();
  });
  it('a buy after the shift is not it', () => {
    expect(nextBuyBefore(next, [{ ...buy, at: SHIFT + 60 }, shiftLine], new Set())).toBeNull();
  });
  it('only research counts (a hab or a sale line is not a buy)', () => {
    const hab = line({ key: 'h', kind: 'hab', at: SALE, bold: true });
    const sale = line({ key: 's', kind: 'saleStart', at: SALE, tickable: false });
    expect(nextBuyBefore(next, [sale, hab, shiftLine], new Set())).toBeNull();
  });
  it('no tracker lines: nothing', () => {
    expect(nextBuyBefore(next, null, new Set())).toBeNull();
    expect(nextBuyBefore(null, [buy], new Set())).toBeNull();
  });
  it('building up / keep building keep their own sentence', () => {
    expect(nextBuyBefore({ kind: 'build', until: SHIFT }, [buy], new Set())).toBeNull();
  });
  it('a buy already due is open', () => {
    expect(nextBuyBefore(next, [buy, shiftLine], new Set(), SALE + 60)).toMatchObject({ at: SALE, open: true });
    expect(nextBuyBefore(next, [buy, shiftLine], new Set(), SALE - 60)?.open).toBeUndefined();
  });
  it('the window ends at the sale\'s end when that comes before the step', () => {
    const start = line({ key: 'ss', kind: 'saleStart', at: SALE, tickable: false });
    const end = line({ key: 'se', kind: 'saleEnd', at: SALE + 3600, tickable: false });
    expect(nextBuyBefore(next, [start, buy, end, shiftLine], new Set())).toEqual({ at: SALE, until: SALE + 3600, sale: true });
    // A sale that ends after the step: the step ends the window.
    const late = line({ key: 'se2', kind: 'saleEnd', at: SHIFT + 7200, tickable: false });
    expect(nextBuyBefore(next, [start, buy, shiftLine, late], new Set())).toEqual({ at: SALE, until: SHIFT, sale: true });
  });
  it('the words: the window, the step itself left to Next shifts', () => {
    const when = (t: number) => `T${t - NOW}`;
    const fmt = { clock: (t: number) => `C${t - NOW}`, weekday: (t: number) => (t === SALE ? 'Friday' : 'Saturday'), day: () => 'Friday', sameDay: () => true };
    expect(nextActionWords(next, when, { at: SALE, until: SHIFT, sale: true }, fmt)).toBe(
      `Wait for Friday's research sale, then buy research from C${SALE - NOW} to C${SHIFT - NOW}`
    );
    expect(nextActionWords(next, when, { at: SALE, until: SHIFT }, { ...fmt, sameDay: () => false })).toBe(
      `Buy research from ${when(SALE)} to ${when(SHIFT)}`
    );
    // Another day than the start: both clocks carry their weekday (QA, 12 Nov 2026); the sale already on: Words' "now" sentence.
    expect(nextActionWords(next, when, { at: SALE, until: SHIFT, sale: true }, { ...fmt, sameDay: () => false })).toBe(
      `Wait for Friday's research sale, then buy research from Friday C${SALE - NOW} to Saturday C${SHIFT - NOW}`
    );
    expect(nextActionWords(next, when, { at: NOW, until: SHIFT, sale: true, open: true }, fmt)).toBe(`Buy research now, until C${SHIFT - NOW}`);
    expect(nextActionWords(next, when)).toBe(`Shift to Humility on ${when(SHIFT)}`);
  });
});
