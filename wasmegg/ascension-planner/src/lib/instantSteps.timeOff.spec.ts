/**
 * What the instant estimate doesn't price (26 Oct 2026, Williamthe5thc: A1's prestige "Fri Oct 30 ~7:00 AM" sat inside his
 * time off Oct 29-30). Flags on the rows (lib/instantSteps.ts), the Next step (lib/nextAction.ts) and their words.
 */
import { describe, expect, it } from 'vitest';
import { instantSteps, timeOffDays, type StepLeg } from './instantSteps';
import { nextAction, nextActionWords, nextShiftWords, nextShifts } from './nextAction';
import { markPrestigeWaits, type PlanEvent } from './nowPlan';
import { timeOffWindows } from '@/search/timeOff';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from '@/components/myruns/AscensionList.vue';
import EventsTable from '@/components/myruns/EventsTable.vue';
import { ascensionSteps } from './instantSteps';

const ZONE = 'America/Denver';
const H = 3600;
const D = 86400;
const at = (iso: string) => Date.parse(iso) / 1000;
const away = timeOffWindows([{ from: '2026-10-29', to: '2026-10-30' }], ZONE); // Oct 29 00:00 to Oct 31 00:00 Denver
const noPrestige = timeOffWindows([{ from: '2026-10-27', to: '2026-10-27' }], ZONE);
const HOURS = { days: [], fromHour: 7, toHour: 23, timezone: ZONE };
const leg = (from: number, endTE: number, start: number, end: number): StepLeg => ({ from, to: endTE, endTE, start, end });
const T0 = at('2026-10-26T18:00:00Z'); // Oct 26, noon Denver

describe('time off and no-prestige days on the estimate rows', () => {
  it('two days of time off are one stretch, named "Oct 29–30"', () => {
    expect(away).toHaveLength(1);
    expect(away[0].to - away[0].from).toBe(2 * D);
    expect(timeOffDays(away[0], ZONE)).toBe('Oct 29–30');
    expect(timeOffDays({ from: at('2026-10-31T06:00:00Z'), to: at('2026-11-02T07:00:00Z') }, ZONE)).toBe('Oct 31 – Nov 1');
  });

  it("A1 running into the time off (Jordan's: ends Fri Oct 30 ~7 AM): cut; A2's prestige inside it: flagged", () => {
    const a1End = at('2026-10-30T13:00:00Z');
    const lines = instantSteps([leg(195, 197, T0, a1End), leg(197, 219, a1End, a1End + 5 * D)], HOURS, noPrestige, away);
    expect(lines[0].cutByTimeOff).toEqual(away[0]);
    expect(lines[1].prestigeInTimeOff).toEqual(away[0]);
    expect(lines[1].cutByTimeOff).toBeUndefined();
  });

  it('a prestige exactly at the time off\'s start is inside it; exactly at its end is not; after it, nothing', () => {
    const atStart = instantSteps([leg(195, 197, T0, away[0].from), leg(197, 219, away[0].from, away[0].from + 5 * D)], null, null, away);
    expect(atStart[0].cutByTimeOff).toBeUndefined(); // it ends as the time off starts
    expect(atStart[1].prestigeInTimeOff).toEqual(away[0]);
    const atEnd = instantSteps([leg(195, 197, T0, away[0].from - H), leg(197, 219, away[0].to, away[0].to + 5 * D)], null, null, away);
    expect(atEnd[1].prestigeInTimeOff).toBeUndefined();
    const after = instantSteps([leg(219, 247, away[0].to + D, away[0].to + 5 * D)], null, null, away);
    expect(after[0]).not.toHaveProperty('cutByTimeOff');
  });

  it('a prestige on a no-prestige day (Oct 27) is flagged, with hours and days together', () => {
    const p = at('2026-10-27T15:00:00Z'); // Oct 27, 9 AM Denver: inside the hours, on the no-prestige day
    const lines = instantSteps([leg(195, 196, T0, p), leg(196, 197, p, p + D)], HOURS, noPrestige, away);
    expect(lines[1].onNoPrestigeDay).toBe(true);
    const ok = instantSteps([leg(195, 196, T0, p), leg(196, 197, at('2026-10-28T13:00:00Z'), p + 2 * D)], HOURS, noPrestige, away);
    expect(ok[1].onNoPrestigeDay).toBeUndefined();
    expect(ok[1].wait).toBe('days');
  });

  it('a leg whose own times end it at the time off (the simulation) is not flagged again', () => {
    const lines = instantSteps([{ ...leg(195, 197, T0, away[0].to + 3 * D), timeOffKnown: true }], null, null, away);
    expect(lines[0].cutByTimeOff).toBeUndefined();
  });

  it('the events carry the flags (the prestige ending A1, and the one starting A2)', () => {
    const a1End = at('2026-10-30T13:00:00Z');
    const lines = instantSteps([leg(195, 197, T0, a1End), leg(197, 219, a1End, a1End + 5 * D)], HOURS, null, away);
    const ev: PlanEvent[] = [{ kind: 'prestige', at: a1End, asc: 1, te: 197, past: false, next: true }];
    expect(markPrestigeWaits(ev, lines)[0]).toMatchObject({ cutByTimeOff: away[0], prestigeInTimeOff: away[0] });
  });
});

describe('the Next step and Next shifts never give a plain prestige time inside time off', () => {
  const a = { to: 197, endTE: 197, start: T0, end: at('2026-10-30T13:00:00Z'), shifts: [], simulated: true };
  it('flagged, and the words name the time off instead', () => {
    const n = nextAction({ now: T0 + H, leg: a, last: false, timeOff: away })!;
    expect(n).toMatchObject({ kind: 'prestige', inTimeOff: away[0] });
    expect(nextActionWords(n, t => `<${t}>`)).toBe(
      `Your time off starts <${away[0].from}>: this ascension ends there (going to your home farm is a prestige); Fast prices the rest`
    );
    expect(nextAction({ now: T0 + H, leg: { ...a, end: away[0].to + H }, last: false, timeOff: away })).not.toHaveProperty('inTimeOff');
    const lines = nextShifts({ now: T0 + H, legs: [a], more: true, timeOff: away });
    expect(lines).toEqual([{ kind: 'prestige', at: a.end, te: 197, exact: true, inTimeOff: true }]);
    expect(nextShiftWords(lines[0], () => 'x')).toBe('Prestige at 197 TE · about x, in your time off: Fast prices it');
  });
});

describe('rendered', () => {
  const a1End = at('2026-10-30T13:00:00Z');
  it('the Full timeline rows say it in amber, without a time for the prestige inside the time off', async () => {
    const lines = ascensionSteps([leg(195, 197, T0, a1End), leg(197, 219, a1End, a1End + 5 * D)], HOURS, noPrestige, away);
    const t = textOf(await renderHtml(AscensionList, { lines, zone: ZONE }));
    expect(t).toContain("Runs into your time off Oct 29–30: it ends when the time off starts (going to your home farm is a prestige) and is built again after it. The instant answer doesn't price time off: Fast prices it.");
    expect(t).toContain('A2 · prestige falls in your time off Oct 29–30: Fast prices it');
  });
  it('the table row too', async () => {
    const lines = instantSteps([leg(195, 197, T0, a1End), leg(197, 219, a1End, a1End + 5 * D)], HOURS, noPrestige, away);
    const events = markPrestigeWaits([{ kind: 'prestige', at: a1End, asc: 1, te: 197, past: false, next: true }], lines);
    const t = textOf(await renderHtml(EventsTable, { events, goal: 'date', goalName: 'Egg Day 2027', now: T0, zone: ZONE, saveWhen: 'x', calculatedWhen: 'y', rounded: true }));
    expect(t).toContain('Runs into your time off Oct 29–30: the ascension ends when it starts (going to your home farm is a prestige). Fast prices it.');
  });
});
