/**
 * The prestige-window hint (R10, 21 Nov 2026; game expert's notes/wait-and-prestige-window-2026-11-21.md, part 3): on a short
 * ascension at TE 240 and up, "start before <the window's end> Pacific", by TE band and the build's sale count.
 * Off by default, this browser's own box in Setup's More options. Never "wait for Friday".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRESTIGE_HINT_KEY,
  PRESTIGE_HINT_MAX_GAIN,
  PRESTIGE_HINT_MIN_TE,
  prestigeWindow,
  prestigeHintStored,
} from './prestigeWindow';

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;
// Thu 3 Dec 2026 12:00 PM PST = 20:00 UTC (Thu 9 PM PST = 05:00 UTC Fri). Pacific is UTC-8 in December.
const THU_NOON = utc(2026, 12, 3, 20);
const SAT_12AM = utc(2026, 12, 5, 8);
const SAT_8AM = utc(2026, 12, 5, 16);
const leg = (
  o: Partial<{ fromTE: number; stopTE: number; prestigeAt: number; now: boolean; sales: number }> = {}
) => ({ fromTE: 300, stopTE: 310, prestigeAt: THU_NOON, now: false, sales: 1, ...o });

describe('prestigeWindow (part 3 of the game expert\'s note, 21 Nov 2026)', () => {
  it('no hint below TE 240', () => {
    expect(PRESTIGE_HINT_MIN_TE).toBe(240);
    expect(prestigeWindow(leg({ fromTE: 239, stopTE: 245 }))).toBeNull();
    expect(prestigeWindow(leg({ fromTE: 240, stopTE: 250 }))).not.toBeNull();
  });
  it('TE 240 to 319: a 1-sale leg ends Saturday 12 AM (at Saturday 8 AM it is 1.68 times slower), a 2- or 3-sale leg Saturday 8 AM', () => {
    for (const fromTE of [240, 319]) {
      expect(prestigeWindow(leg({ fromTE, stopTE: fromTE + 10, sales: 1 }))!.deadline, `${fromTE} 1`).toBe(SAT_12AM);
      expect(prestigeWindow(leg({ fromTE, stopTE: fromTE + 10, sales: 2 }))!.deadline, `${fromTE} 2`).toBe(SAT_8AM);
      expect(prestigeWindow(leg({ fromTE, stopTE: fromTE + 10, sales: 3 }))!.deadline, `${fromTE} 3`).toBe(SAT_8AM);
    }
  });
  it('TE 320 and up: a 1-sale leg ends Saturday 12 AM, a 2- or 3-sale leg Saturday 8 AM; never past Saturday 9 AM', () => {
    for (const fromTE of [320, 400]) {
      expect(prestigeWindow(leg({ fromTE, stopTE: fromTE + 10, sales: 1 }))!.deadline, `${fromTE} 1`).toBe(SAT_12AM);
      for (const sales of [2, 3]) {
        const w = prestigeWindow(leg({ fromTE, stopTE: fromTE + 10, sales }))!;
        expect(w.deadline, `${fromTE} ${sales}`).toBe(SAT_8AM);
        expect(w.deadline).toBeLessThan(utc(2026, 12, 5, 17));
      }
    }
  });
  it('the window opens Thursday 9 PM Pacific whatever the end', () => {
    expect(prestigeWindow(leg({ sales: 2 }))!.opens).toBe(utc(2026, 12, 4, 5));
    expect(prestigeWindow(leg({ sales: 1 }))!.opens).toBe(utc(2026, 12, 4, 5));
  });
  it('a build whose sales are not known is read as the careful 1-sale build', () => {
    expect(prestigeWindow({ fromTE: 300, stopTE: 310, prestigeAt: THU_NOON, now: false })!.deadline).toBe(SAT_12AM);
  });
  it('a prestige past the deadline is shown the next one, a week on', () => {
    expect(prestigeWindow(leg({ prestigeAt: SAT_12AM }))!.deadline).toBe(SAT_12AM + 7 * 86400);
    expect(prestigeWindow(leg({ prestigeAt: SAT_12AM - 1 }))!.deadline).toBe(SAT_12AM);
  });
  it('only short ascensions (25 TE or less)', () => {
    expect(PRESTIGE_HINT_MAX_GAIN).toBe(25);
    expect(prestigeWindow(leg({ fromTE: 300, stopTE: 325 }))).not.toBeNull();
    expect(prestigeWindow(leg({ fromTE: 300, stopTE: 326 }))).toBeNull();
  });
  it('never for the ascension the farm is in (no prestige to time)', () => {
    expect(prestigeWindow(leg({ now: true }))).toBeNull();
  });
});

describe('the box is off by default and remembered in this browser', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
  });
  it('off with nothing stored, on when stored', () => {
    expect(PRESTIGE_HINT_KEY).toBe('aap.prestigeHint');
    expect(prestigeHintStored()).toBe(false);
    mem.set(PRESTIGE_HINT_KEY, '1');
    expect(prestigeHintStored()).toBe(true);
    mem.set(PRESTIGE_HINT_KEY, '0');
    expect(prestigeHintStored()).toBe(false);
  });
});
