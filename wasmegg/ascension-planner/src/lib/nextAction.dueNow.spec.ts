/**
 * Review U2 (15 Nov 2026): an unstarted "Prestige now" was stamped with the current minute, so the page read
 * "Prestige on <this minute>" and the calendar feed changed every minute (60 PUTs an hour: the account's whole sync budget).
 * A prestige that is due now says so, and the calendar stamps it once an hour at most.
 */
import { describe, expect, it } from 'vitest';
import { nextAction, nextActionWords, nextShiftWords, nextShifts, type ActionLeg } from './nextAction';
import { calLinesFromNextShifts } from './calendarNextShifts';

const NOW = 1_800_000_000 - (1_800_000_000 % 3600) + 40 * 60; // 40 minutes past an hour
const H = 3600;
const leg: ActionLeg = {
  to: 151,
  endTE: 151,
  start: NOW - 60,
  end: NOW + 100 * H,
  buildEnd: NOW + 7 * 24 * H,
  shifts: [{ at: NOW + 29 * 60, egg: 'kindness' }],
  simulated: true,
  unstarted: { te: 147 },
};

describe('a prestige that is due now', () => {
  it('is marked due, and the page says "Prestige now" rather than a time', () => {
    const a = nextAction({ now: NOW, leg, last: false })!;
    expect(a).toMatchObject({ kind: 'prestige', due: true });
    expect(nextActionWords(a, t => `T${t}`)).toBe('Prestige now');
    const l = nextShifts({ now: NOW, legs: [leg], more: true })[0];
    expect(l).toMatchObject({ kind: 'prestige', te: 147, due: true });
    expect(nextShiftWords(l, t => `T${t}`)).toBe('Prestige at 147 TE · now');
  });
  it('a prestige the hours hold to a later time is not due: it keeps its time', () => {
    const a = nextAction({ now: NOW, leg, last: false, prestigeAt: t => t + 2 * H })!;
    expect(a).toEqual({ kind: 'prestige', at: NOW + 2 * H, te: null });
    expect(nextActionWords(a, t => `T${t}`)).toBe(`Prestige on T${NOW + 2 * H}`);
  });
  it('the calendar stamps a due prestige at the start of the hour, so a minute passing changes nothing', () => {
    const at = (now: number) => calLinesFromNextShifts(nextShifts({ now, legs: [leg], more: true })).find(l => l.kind === 'prestige')!.at;
    expect(at(NOW)).toBe(at(NOW + 60));
    expect(at(NOW)).toBe(NOW - 40 * 60);
  });
  it('a prestige held to a real later time is stamped exactly', () => {
    const lines = nextShifts({ now: NOW, legs: [leg], prestigeAt: t => t + 2 * H, more: true });
    expect(calLinesFromNextShifts(lines).find(l => l.kind === 'prestige')!.at).toBe(NOW + 2 * H);
  });
});
