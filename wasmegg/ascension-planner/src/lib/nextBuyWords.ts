/**
 * NEXT STEP, THE RESEARCH BUY BEFORE THE NEXT SHIFT (M13, 12 Nov 2026; Jordan's wording): not "Buy research from Nov 13,
 * 2026 at 10:00 AM, then shift to Humility on …" (Next shifts, right below, lists the shift). It says to wait for the
 * sale and gives the window to buy in:
 *   "Wait for Friday's research sale, then buy research from 10:00 AM to 2:26 PM"
 * A *Words.ts file: wording only, never part of the result code hash (lib/resultCodeHash.ts `isWordingOnly`).
 *
 * The caller (lib/nextAction.ts `nextActionWords`, the game expert's) supplies the pieces, all as the app writes them
 * (lib/eventWhen.ts, "10:00 AM" style, the player's zone):
 *   `day`  the sale's weekday, "Friday" (the date too when it is a week or more away: "Friday, Nov 20");
 *   `from` when buying can start, "10:00 AM"; `to` when the window ends, "2:26 PM"; null when the end isn't known;
 *   `fromDay` / `toDay` the weekdays of `from` and `to`, given ONLY when the window ends on another day than it starts
 *          (a 24 h sale: "buy research from Friday 10:00 AM to Saturday 10:00 AM", not the odd "from 10:00 AM to
 *          10:00 AM Saturday"; QA, 12 Nov 2026); both or neither;
 *   `open` the sale is on now: no waiting, "Buy research now, until 2:26 PM" ("Buy research now" with no end).
 */
export function buyWindowWords(o: {
  day: string;
  from: string;
  to: string | null;
  open?: boolean;
  fromDay?: string;
  toDay?: string;
}): string {
  const days = !!o.fromDay && !!o.toDay;
  const to = o.to && days ? `${o.toDay} ${o.to}` : o.to;
  if (o.open) return to ? `Buy research now, until ${to}` : 'Buy research now';
  const lead = `Wait for ${o.day}'s research sale, then buy research from ${days ? `${o.fromDay} ` : ''}${o.from}`;
  return to ? `${lead} to ${to}` : lead;
}
