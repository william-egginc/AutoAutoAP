/**
 * The prestige-window hint (R10, 21 Nov 2026; game expert's notes/wait-and-prestige-window-2026-11-21.md, 2b): on a short
 * ascension at TE 200 and up, "start before Saturday 9:00 AM Pacific" (the sale's end), about 36 hours wide, 30 for 3 TE.
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
// Thu 3 Dec 2026 12:00 PM PST = 20:00 UTC. Sat 5 Dec 9:00 AM PST = 17:00 UTC.
const THU_NOON = utc(2026, 12, 3, 20);
const SAT_9 = utc(2026, 12, 5, 17);
const leg = (o: Partial<{ fromTE: number; stopTE: number; prestigeAt: number; now: boolean }> = {}) => ({
  fromTE: 300,
  stopTE: 310,
  prestigeAt: THU_NOON,
  now: false,
  ...o,
});

describe('prestigeWindow', () => {
  it('names the Saturday 9:00 AM Pacific that follows the planned prestige, and the window before it', () => {
    const w = prestigeWindow(leg())!;
    expect(w.deadline).toBe(SAT_9);
    expect(w.hours).toBe(36);
    expect(w.opens).toBe(SAT_9 - 36 * 3600);
  });
  it('3-TE ascensions get 30 hours', () => {
    expect(prestigeWindow(leg({ fromTE: 300, stopTE: 303 }))!.hours).toBe(30);
    expect(prestigeWindow(leg({ fromTE: 300, stopTE: 304 }))!.hours).toBe(36);
    expect(prestigeWindow(leg({ fromTE: 300, stopTE: 301 }))!.hours).toBe(30);
  });
  it('a prestige after Saturday 9:00 AM, even the minute of it, is shown the next Saturday', () => {
    expect(prestigeWindow(leg({ prestigeAt: SAT_9 }))!.deadline).toBe(SAT_9 + 7 * 86400);
    expect(prestigeWindow(leg({ prestigeAt: SAT_9 + 3600 }))!.deadline).toBe(SAT_9 + 7 * 86400);
    expect(prestigeWindow(leg({ prestigeAt: SAT_9 - 1 }))!.deadline).toBe(SAT_9);
  });
  it('only short ascensions (25 TE or less) from TE 200 and up', () => {
    expect(PRESTIGE_HINT_MIN_TE).toBe(200);
    expect(PRESTIGE_HINT_MAX_GAIN).toBe(25);
    expect(prestigeWindow(leg({ fromTE: 199, stopTE: 205 }))).toBeNull();
    expect(prestigeWindow(leg({ fromTE: 200, stopTE: 225 }))).not.toBeNull();
    expect(prestigeWindow(leg({ fromTE: 200, stopTE: 226 }))).toBeNull();
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
