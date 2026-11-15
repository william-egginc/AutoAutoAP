/**
 * The Next shifts list as the calendar feed's lines, for a PRODUCING player (14 Nov 2026, Jordan's own test): nothing to buy, so the Build-up
 * tracker is `notBuilding` and has no lines, and the feed stayed empty. The shifts and the prestige are still known (lib/nextAction.ts
 * `nextShifts`: this ascension from the simulation, the later ones from the table), so they go up as stand-alone lines (`checkIn` -1,
 * tickable: lib/calendarFeedEvents.ts makes one event of each) and the feed carries them with its marker.
 *
 * Keys: `ns:shift:<egg>:<n>` (n counts that egg's shifts in the list) and `ns:prestige:<n>`, with no time in them, so a shift that moves
 * updates the same calendar entry. Only shifts and prestiges: building up, the goal, time off and back-online lines have no event here.
 * Not a result code hash input.
 */
import { virtueEggName } from './virtueEggs';
import type { CalLine } from './calendarFeedEvents';
import type { NextShiftLine } from './nextAction';

export function calLinesFromNextShifts(lines: readonly NextShiftLine[] | null | undefined): CalLine[] {
  const out: CalLine[] = [];
  const seen = new Map<string, number>();
  const nth = (k: string): number => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n;
  };
  for (const l of lines ?? []) {
    if (!Number.isFinite(l.at) || l.at <= 0) continue;
    if (l.kind === 'shift') {
      const egg = l.egg ?? 'egg';
      out.push({
        key: `ns:shift:${egg}:${nth(`s:${egg}`)}`,
        kind: 'shift',
        at: l.at,
        text: `shift to ${virtueEggName(l.egg)}`,
        tickable: true,
        checkIn: -1,
      });
    } else if (l.kind === 'prestige') {
      // A prestige due now has only the minute it was asked for: stamped at the start of the hour so the feed does not change every
      // minute (review U2: 60 writes an hour is the account's whole sync budget).
      out.push({
        key: `ns:prestige:${nth('p')}`,
        kind: 'prestige',
        at: l.due ? Math.floor(l.at / 3600) * 3600 : l.at,
        text: l.te ? `prestige at ${l.te} TE` : 'prestige',
        tickable: true,
        checkIn: -1,
      });
    }
  }
  return out;
}
