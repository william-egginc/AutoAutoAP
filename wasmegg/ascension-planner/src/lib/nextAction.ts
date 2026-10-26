/**
 * THE NEXT ACTION AND THE NEXT SHIFTS (26 Oct 2026, Jordan): Right now's Next step says what to do next from the
 * ascension the player is in as simulated on the live save (lib/followSim.ts), not the table's next prestige:
 *
 *   before the ascension starts      "Prestige at <time>" (a fresh start the simulation waits for)
 *   in the build-up                  "Building up until about <time>": the time before its first shift (a leg that
 *                                    continues the ascension as it is has no build-up)
 *   between shifts                   "Shift to <egg> at <time>"
 *   after the last shift             "Prestige at <time>" (held for the hours and no-prestige days), or on the
 *                                    route's last ascension "Reach <TE> TE at <time>"
 *   nothing known                    null: Right now keeps its line from the table
 *
 * No purchases: shifts, the build-up as one stretch, and prestiges only. `nextShifts` is the short list under it: the
 * next 3 to 5 shifts, the current ascension's from the simulation and the later ones' from the table, ending with a
 * prestige that falls inside the list.
 *
 * Pure: `now` and the prestige rule are parameters.
 */
import { virtueEggName } from './virtueEggs';

/** One ascension as these read it: the simulated one (`simulated`) or the table's. */
export interface ActionLeg {
  /** The stop it ends at, and the TE it reaches. */
  to: number;
  endTE?: number;
  start: number;
  end: number;
  shifts?: { at: number; egg: string }[];
  /** Simulated on the live save: exact times. */
  simulated?: boolean;
  /** search/types.ts LegSummary.buildPhaseEndTime: when its build phase ends; at its start (or absent) for a leg
   *  that continues the ascension as it is. */
  buildEnd?: number;
  /** It carries on the farm in the save ('continue' or 'buildup': the farm is already laying), never a fresh start:
   *  never "Building up" (26 Oct 2026, a producing farm on Curiosity read "Building up until …"). */
  live?: boolean;
}

/** A simulated leg's variant (search/types.ts LegSummary.key) carries on the farm in the save. */
export function continuesFarm(key: string | null | undefined): boolean {
  return key === 'continue' || key === 'buildup';
}

export type NextAction =
  | { kind: 'build'; until: number }
  | { kind: 'shift'; egg: string; at: number }
  | { kind: 'prestige'; at: number; te: number | null }
  | { kind: 'goal'; at: number; te: number };

const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Whether the leg builds up (it has a build phase that ends after it starts) and when that stretch ends: its
 *  first shift (or the build phase's end when it lists none). Null without one. */
function buildUntil(leg: ActionLeg): number | null {
  if (leg.live || !ok(leg.buildEnd) || !(leg.buildEnd > leg.start)) return null;
  const first = (leg.shifts ?? []).find(s => ok(s.at));
  return first ? first.at : leg.buildEnd;
}

/**
 * The next action in the ascension the player is in (`leg`, simulated). `last`: it is the route's last ascension
 * (its end is the goal, no prestige). `prestigeAt`: when a prestige may happen from a moment (the player's hours and
 * no-prestige days, search/noPrestige.ts `nextPrestigeAt`); absent, at once. Null when nothing is known.
 */
export function nextAction(o: {
  now: number;
  leg: ActionLeg | null | undefined;
  last: boolean;
  prestigeAt?: (t: number) => number;
}): NextAction | null {
  const leg = o.leg;
  if (!leg || !ok(leg.start) || !ok(leg.end)) return null;
  if (o.now < leg.start) return { kind: 'prestige', at: leg.start, te: null };
  const until = buildUntil(leg);
  if (until !== null && o.now < until) return { kind: 'build', until };
  const next = (leg.shifts ?? []).find(s => ok(s.at) && s.at > o.now);
  if (next) return { kind: 'shift', egg: next.egg, at: next.at };
  const te = ok(leg.endTE) ? leg.endTE : leg.to;
  if (o.last) return { kind: 'goal', at: leg.end, te };
  return { kind: 'prestige', at: o.prestigeAt ? o.prestigeAt(leg.end) : leg.end, te };
}

/** The Next step's words: "Shift to Humility at Oct 28, 2026, 3:12 PM", "Building up until about …", "Prestige at …",
 *  "Reach 490 TE at …". `when` formats a moment (lib/displayTime.ts `showDateTime`). */
export function nextActionWords(a: NextAction, when: (t: number) => string): string {
  if (a.kind === 'build') return `Building up until about ${when(a.until)}`;
  if (a.kind === 'shift') return `Shift to ${virtueEggName(a.egg)} at ${when(a.at)}`;
  if (a.kind === 'goal') return `Reach ${a.te} TE at ${when(a.at)}`;
  return `Prestige at ${when(a.at)}`;
}

/** One line of the Next shifts list. */
export interface NextShiftLine {
  kind: 'build' | 'shift' | 'prestige' | 'goal';
  /** The shift's egg (switched TO). */
  egg?: string;
  /** The moment: the shift, the prestige, the goal reached, or the build-up's end. */
  at: number;
  /** The prestige's or the goal's TE. */
  te?: number;
  /** From the simulation (exact), else the table (to the hour). */
  exact: boolean;
}

/**
 * The next shifts after `now`, at least `min` when the route has them and at most `max`, in time order: the current
 * ascension's (`legs[0]`, simulated, with a "building up" line first while in its build-up), then the later ones' from
 * the table. Each prestige between ascensions is a line; the list ends with one when it already holds `min` shifts,
 * and with the goal when it gets there. Prestige times: the next ascension's start (the table's, held already), or for
 * the simulated one `prestigeAt` of its end.
 */
export function nextShifts(o: Parameters<typeof shiftLines>[0]): NextShiftLine[] {
  // Never two lines in a row that say the same thing at the same minute.
  return shiftLines(o).filter((l, i, all) => {
    const p = all[i - 1];
    return !p || !(p.kind === l.kind && p.egg === l.egg && Math.floor(p.at / 60) === Math.floor(l.at / 60));
  });
}

function shiftLines(o: {
  now: number;
  legs: readonly ActionLeg[];
  prestigeAt?: (t: number) => number;
  min?: number;
  max?: number;
  /** The route goes on past the legs given (only the ascension you are in is known): it ends with that prestige, not
   *  the goal. */
  more?: boolean;
}): NextShiftLine[] {
  const min = o.min ?? 3;
  const max = o.max ?? 5;
  const out: NextShiftLine[] = [];
  let shifts = 0;
  const legs = o.legs.filter(l => ok(l.start) && ok(l.end));
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const exact = !!leg.simulated;
    if (i === 0 && leg.simulated) {
      const until = buildUntil(leg);
      // Not when its first shift is at the same moment (the minute shown): two lines with one time.
      const first = (leg.shifts ?? []).find(s => ok(s.at) && s.at > o.now);
      if (until !== null && o.now < until && !(first && Math.abs(first.at - until) < 60)) out.push({ kind: 'build', at: until, exact });
    }
    for (const s of leg.shifts ?? []) {
      if (!ok(s.at) || s.at <= o.now) continue;
      out.push({ kind: 'shift', egg: s.egg, at: s.at, exact });
      if (++shifts >= max) return out;
    }
    const te = ok(leg.endTE) ? leg.endTE : leg.to;
    const next = legs[i + 1];
    if (!next) {
      if (o.more) {
        const at = o.prestigeAt ? o.prestigeAt(leg.end) : leg.end;
        if (at > o.now) out.push({ kind: 'prestige', at, te, exact });
      } else if (leg.end > o.now) out.push({ kind: 'goal', at: leg.end, te, exact });
      return out;
    }
    const at = exact ? (o.prestigeAt ? o.prestigeAt(leg.end) : leg.end) : next.start;
    if (at > o.now) {
      out.push({ kind: 'prestige', at, te, exact });
      if (shifts >= min) return out;
    }
  }
  return out;
}

/** A line's words: "Shift to Humility · about Oct 28, 2026, 3:00 PM", "Building up until about …",
 *  "Prestige at 277 TE · about …", "490 TE reached · about …". `when` formats a moment. */
export function nextShiftWords(l: NextShiftLine, when: (t: number, exact: boolean) => string): string {
  const t = `about ${when(l.at, l.exact)}`;
  if (l.kind === 'build') return `Building up until ${t}`;
  if (l.kind === 'shift') return `Shift to ${virtueEggName(l.egg)} · ${t}`;
  if (l.kind === 'goal') return `${l.te} TE reached · ${t}`;
  return `Prestige at ${l.te} TE · ${t}`;
}
