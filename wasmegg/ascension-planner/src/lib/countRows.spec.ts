/**
 * Every number of ascensions, rows that open on tap (spec-slimcard; UX fluff review 5 Nov 2026, item 11; Joo's table):
 * the green box's row starts open, the others closed, and any row opens or closes on its own, so several may be open.
 */
import { describe, expect, it } from 'vitest';
import { countRowOpen, toggleCountRow } from './countRows';

describe('which count rows are open', () => {
  it('to start: the box’s row open, every other row closed', () => {
    const none = new Map<number, boolean>();
    expect(countRowOpen(none, 4, true)).toBe(true);
    expect(countRowOpen(none, 3, false)).toBe(false);
  });
  it('a tap opens a closed row and closes an open one, the box’s row too', () => {
    let m = toggleCountRow(new Map(), 3, false);
    expect(countRowOpen(m, 3, false)).toBe(true);
    m = toggleCountRow(m, 4, true);
    expect(countRowOpen(m, 4, true)).toBe(false);
    m = toggleCountRow(m, 3, false);
    expect(countRowOpen(m, 3, false)).toBe(false);
  });
  it('several rows open at once', () => {
    let m = new Map<number, boolean>();
    for (const k of [1, 2, 5]) m = toggleCountRow(m, k, false);
    expect([1, 2, 3, 4, 5, 6].filter(k => countRowOpen(m, k, k === 4))).toEqual([1, 2, 4, 5]);
  });
  it('a new map each tap (the card holds it in a ref); the old one unchanged', () => {
    const a = new Map<number, boolean>();
    const b = toggleCountRow(a, 2, false);
    expect(b).not.toBe(a);
    expect(a.size).toBe(0);
  });
  it('a row the player never touched follows the box: when Prefer fewer moves the box, its new row is open', () => {
    const m = toggleCountRow(new Map(), 2, false);
    expect(countRowOpen(m, 3, true)).toBe(true);
    expect(countRowOpen(m, 4, false)).toBe(false);
  });
});
