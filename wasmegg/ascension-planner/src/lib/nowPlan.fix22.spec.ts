/**
 * Fix 22: two shifts at the same minute are one row (Joo's H1 step shifts to Humility for the production set, then
 * K3 shifts straight on to Kindness; both are charged). Pure.
 */
import { describe, expect, it } from 'vitest';
import { mergeSimultaneousShifts, shiftTitle, type PlanEvent } from './nowPlan';
import { eventTitle, nextStepText } from './nowWords';
import { planCalEvent } from './calendarEvents';
import { virtueEggName } from './virtueEggs';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 16, 20, 0) / 1000; // Fri Oct 16, 2:00 PM Denver
const T = Date.UTC(2026, 9, 17, 10, 16) / 1000; // Sat Oct 17, 4:16 AM Denver
const ev = (kind: PlanEvent['kind'], at: number, egg?: string, te?: number): PlanEvent => ({
  kind,
  at,
  asc: 1,
  egg,
  te,
  past: at <= NOW,
  next: false,
});
const flag = (list: PlanEvent[]) => {
  const i = list.findIndex(e => !e.past);
  return list.map((e, k) => ({ ...e, next: k === i }));
};

describe('mergeSimultaneousShifts', () => {
  it('two shifts at the same minute: one row, the H1 step named', () => {
    const out = mergeSimultaneousShifts(flag([ev('shift', T, 'humility'), ev('shift', T + 20, 'kindness'), ev('prestige', T + 9 * 3600, undefined, 197)]), ZONE);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'shift', at: T, eggs: ['humility', 'kindness'], egg: 'kindness', next: true });
    expect(eventTitle(out[0], 'fastest')).toBe("Shift to Humility (Joo's H1 step: artifact swap), then straight to Kindness");
    expect(out[1].kind).toBe('prestige');
  });

  it('three at once: "Shift to A, then straight to B, then straight to C", no H1 note', () => {
    const out = mergeSimultaneousShifts([ev('shift', T, 'integrity'), ev('shift', T, 'humility'), ev('shift', T + 59 - (T % 60), 'kindness')], ZONE);
    expect(out).toHaveLength(1);
    expect(shiftTitle(out[0], virtueEggName)).toBe('Shift to Integrity, then straight to Humility, then straight to Kindness');
    // Another pair: the generic words.
    expect(shiftTitle({ eggs: ['integrity', 'resilience'] }, virtueEggName)).toBe('Shift to Integrity, then straight to Resilience');
    expect(shiftTitle({ egg: 'humility' }, virtueEggName)).toBe('Shift to Humility');
  });

  it('different minutes stay apart, also across a day boundary', () => {
    expect(mergeSimultaneousShifts([ev('shift', T, 'humility'), ev('shift', T + 60, 'kindness')], ZONE)).toHaveLength(2);
    const midnight = Date.UTC(2026, 9, 18, 6, 0) / 1000; // Oct 18, 12:00 AM Denver
    expect(mergeSimultaneousShifts([ev('shift', midnight - 10, 'humility'), ev('shift', midnight + 10, 'kindness')], ZONE)).toHaveLength(2);
    // The same minute just after midnight merges.
    expect(mergeSimultaneousShifts([ev('shift', midnight + 5, 'humility'), ev('shift', midnight + 50, 'kindness')], ZONE)).toHaveLength(1);
  });

  it('a prestige (or the goal) at the same minute is never merged', () => {
    const out = mergeSimultaneousShifts([ev('shift', T, 'humility'), ev('prestige', T, undefined, 197), ev('shift', T, 'kindness'), ev('goal', T, undefined, 490)], ZONE);
    expect(out.map(e => e.kind)).toEqual(['shift', 'prestige', 'shift', 'goal']);
  });

  it('Next step and the calendar event use the same words, one event for the pair', () => {
    const out = mergeSimultaneousShifts(flag([ev('shift', T, 'humility'), ev('shift', T, 'kindness'), ev('prestige', T + 9 * 3600, undefined, 197)]), ZONE);
    expect(nextStepText(out, 'fastest', NOW, ZONE)).toBe(
      "Shift to Humility (Joo's H1 step: artifact swap), then straight to Kindness tomorrow at 4:16 AM (in 14h 16m), then prestige at 197 TE tomorrow at 1:16 PM"
    );
    const cal = planCalEvent(out[0], { eggName: virtueEggName, saveWhen: 'Oct 16 at 1:00 PM', calculatedWhen: 'Oct 16 at 1:30 PM' });
    expect(cal.title).toBe("Shift to Humility (Joo's H1 step: artifact swap), then straight to Kindness (Egg, Inc.)");
    expect(cal.at).toBe(T);
  });
});
