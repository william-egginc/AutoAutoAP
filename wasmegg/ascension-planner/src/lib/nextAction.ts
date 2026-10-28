/**
 * THE NEXT ACTION AND THE NEXT SHIFTS (26 Oct 2026, Jordan): Right now's Next step says what to do next from the
 * ascension the player is in as simulated on the live save (lib/followSim.ts), not the table's next prestige:
 *
 *   before the ascension starts      "Prestige at <time>" (a fresh start the simulation waits for)
 *   in the build-up                  "Building up until about <time>": the time before its first shift (a leg that
 *                                    continues the ascension as it is has no build-up)
 *   the save's build unfinished      "Keep building: vehicles and habs until about <time>": the build-up carried on
 *                                    from the save (27 Oct 2026, pieha), until its build phase ends; first in the
 *                                    Next shifts list too, then the shifts
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
import { buildLeftWords } from './saveBuild';

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
  /** The save's build isn't finished (lib/saveBuild.ts `buildLeft`: 'vehicles', 'habs') and this leg carries it on
   *  ('buildup'): "Keep building" until `buildEnd`. */
  building?: string[];
  /** The simulated ascension is cut by time off (lib/followSim.ts SimLeg.timeOff): it ends at `from` with `te` (the home
   *  farm is a prestige), and the rebuild starts at `to`. */
  timeOff?: { from: number; to: number; te: number; rebuildBuildEnd?: number };
}

/** The part of a time-off leg from `now` on: before the time off, the ascension you are in (its own shifts, no
 *  rebuild's); after it, the rebuild (a fresh start at `to`). The leg as it is without time off. */
function partAt(leg: ActionLeg, now: number): ActionLeg {
  const t = leg.timeOff;
  if (!t) return leg;
  if (now < t.from) return { ...leg, end: t.from, endTE: t.te, shifts: (leg.shifts ?? []).filter(s => s.at < t.from) };
  return {
    ...leg,
    start: t.to,
    live: false,
    building: undefined,
    timeOff: undefined,
    buildEnd: t.rebuildBuildEnd,
    shifts: (leg.shifts ?? []).filter(s => s.at >= t.to),
  };
}

/** A simulated leg's variant (search/types.ts LegSummary.key) carries on the farm in the save. */
export function continuesFarm(key: string | null | undefined): boolean {
  return key === 'continue' || key === 'buildup';
}

export type NextAction =
  | { kind: 'build'; until: number }
  /** The save's build carried on: what is left to buy, until the build phase ends. */
  | { kind: 'keepbuilding'; until: number; left: string[] }
  | { kind: 'shift'; egg: string; at: number }
  /** `inTimeOff`: it would fall in a time off (the estimate knows none): said in amber, never as a plain time. */
  | { kind: 'prestige'; at: number; te: number | null; inTimeOff?: { from: number; to: number } }
  | { kind: 'goal'; at: number; te: number }
  /** Time off starts: go to the home farm (a prestige), the ascension ending at `te`. */
  | { kind: 'timeoff'; at: number; te: number }
  /** In the time off: back at `at`, a prestige that starts the rebuild. */
  | { kind: 'back'; at: number };

const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Whether the leg builds up (it has a build phase that ends after it starts) and when that stretch ends: its
 *  first shift (or the build phase's end when it lists none). Null without one. */
function buildUntil(leg: ActionLeg): number | null {
  if (leg.live || !ok(leg.buildEnd) || !(leg.buildEnd > leg.start)) return null;
  const first = (leg.shifts ?? []).find(s => ok(s.at));
  return first ? first.at : leg.buildEnd;
}

/** The save's build carried on in this leg: until its build phase ends (null when not, or already past it). */
function keepBuildingUntil(leg: ActionLeg, now: number): number | null {
  if (!leg.building?.length || !ok(leg.buildEnd) || !(leg.buildEnd > leg.start) || !(now < leg.buildEnd)) return null;
  // Never a build that ends after the first shift ahead (28 Oct 2026, Jordan: "Keep building … until Nov 14" over
  // "Shift to Humility · Nov 13"): the build isn't what comes first, so no line; the shifts say it.
  const first = (leg.shifts ?? []).find(s => ok(s.at) && s.at > now);
  if (first && leg.buildEnd > first.at) return null;
  return leg.buildEnd;
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
  /** Time off as absolute stretches: a prestige inside one is flagged. */
  timeOff?: readonly { from: number; to: number }[] | null;
}): NextAction | null {
  const a = nextActionOf(o);
  if (a?.kind !== 'prestige') return a;
  const w = (o.timeOff ?? []).find(x => x.from <= a.at && a.at < x.to);
  return w ? { ...a, inTimeOff: { from: w.from, to: w.to } } : a;
}

function nextActionOf(o: {
  now: number;
  leg: ActionLeg | null | undefined;
  last: boolean;
  prestigeAt?: (t: number) => number;
}): NextAction | null {
  if (!o.leg || !ok(o.leg.start) || !ok(o.leg.end)) return null;
  const t = o.leg.timeOff;
  if (t && o.now >= t.from && o.now < t.to) return { kind: 'back', at: t.to };
  const leg = partAt(o.leg, o.now);
  if (o.now < leg.start) return { kind: 'prestige', at: leg.start, te: null };
  const keep = keepBuildingUntil(leg, o.now);
  if (keep !== null) return { kind: 'keepbuilding', until: keep, left: [...leg.building!] };
  const until = buildUntil(leg);
  if (until !== null && o.now < until) return { kind: 'build', until };
  const next = (leg.shifts ?? []).find(s => ok(s.at) && s.at > o.now);
  if (next) return { kind: 'shift', egg: next.egg, at: next.at };
  const te = ok(leg.endTE) ? leg.endTE : leg.to;
  if (t && o.now < t.from) return { kind: 'timeoff', at: t.from, te: t.te };
  if (o.last) return { kind: 'goal', at: leg.end, te };
  return { kind: 'prestige', at: o.prestigeAt ? o.prestigeAt(leg.end) : leg.end, te };
}

/** The Next step's words: "Shift to Humility at Oct 28, 2026, 3:12 PM", "Building up until about …", "Prestige at …",
 *  "Reach 490 TE at …". `when` formats a moment (lib/displayTime.ts `showDateTime`). */
export function nextActionWords(a: NextAction, when: (t: number) => string): string {
  if (a.kind === 'build') return `Building up until about ${when(a.until)}`;
  if (a.kind === 'keepbuilding') return `Keep building: ${buildLeftWords(a.left)} until about ${when(a.until)}`;
  if (a.kind === 'shift') return `Shift to ${virtueEggName(a.egg)} at ${when(a.at)}`;
  if (a.kind === 'goal') return `Reach ${a.te} TE at ${when(a.at)}`;
  if (a.kind === 'timeoff') return `Your time off starts ${when(a.at)}: go to your home farm (this ascension ends at ${a.te} TE)`;
  if (a.kind === 'back') return `Back from your time off: prestige at ${when(a.at)} to build again`;
  if (a.inTimeOff)
    return `Your time off starts ${when(a.inTimeOff.from)}: this ascension ends there (going to your home farm is a prestige); Fast prices the rest`;
  return `Prestige at ${when(a.at)}`;
}

/** One line of the Next shifts list. */
export interface NextShiftLine {
  kind: 'build' | 'keepbuilding' | 'shift' | 'prestige' | 'goal' | 'timeoff' | 'back';
  /** The shift's egg (switched TO). */
  egg?: string;
  /** The moment: the shift, the prestige, the goal reached, or the build-up's end. */
  at: number;
  /** The prestige's or the goal's TE. */
  te?: number;
  /** From the simulation (exact), else the table (to the hour). */
  exact: boolean;
  /** A prestige that would fall in a time off (the estimate knows none). */
  inTimeOff?: boolean;
  /** 'keepbuilding': what the save's build still has to buy. */
  left?: string[];
}

/**
 * The next shifts after `now`, at least `min` when the route has them and at most `max`, in time order: the current
 * ascension's (`legs[0]`, simulated, with a "building up" line first while in its build-up), then the later ones' from
 * the table. Each prestige between ascensions is a line; the list ends with one when it already holds `min` shifts,
 * and with the goal when it gets there. Prestige times: the next ascension's start (the table's, held already), or for
 * the simulated one `prestigeAt` of its end.
 */
export function nextShifts(
  o: Parameters<typeof shiftLines>[0] & { timeOff?: readonly { from: number; to: number }[] | null }
): NextShiftLine[] {
  const away = o.timeOff ?? [];
  // Never two lines in a row that say the same thing at the same minute.
  return shiftLines(o)
    .filter((l, i, all) => {
      const p = all[i - 1];
      return !p || !(p.kind === l.kind && p.egg === l.egg && Math.floor(p.at / 60) === Math.floor(l.at / 60));
    })
    .map(l => (l.kind === 'prestige' && away.some(w => w.from <= l.at && l.at < w.to) ? { ...l, inTimeOff: true } : l));
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
    // Time off inside the ascension you are in: its end at the time off's start, and the rebuild from its end.
    const t = leg.timeOff;
    if (t) {
      const before = partAt(leg, o.now);
      if (o.now < t.from) {
        for (const s of before.shifts ?? []) {
          if (!ok(s.at) || s.at <= o.now) continue;
          out.push({ kind: 'shift', egg: s.egg, at: s.at, exact });
          if (++shifts >= max) return out;
        }
        out.push({ kind: 'timeoff', at: t.from, te: t.te, exact });
      }
      if (t.to > o.now) out.push({ kind: 'back', at: t.to, exact });
      for (const s of leg.shifts ?? []) {
        if (!ok(s.at) || s.at < t.to || s.at <= o.now) continue;
        out.push({ kind: 'shift', egg: s.egg, at: s.at, exact });
        if (++shifts >= max) return out;
      }
    } else if (i === 0 && leg.simulated && keepBuildingUntil(leg, o.now) !== null) {
      // The save's build carried on: said first, then every shift (those made while building too).
      out.push({ kind: 'keepbuilding', at: leg.buildEnd!, left: [...leg.building!], exact });
    } else if (i === 0 && leg.simulated) {
      const until = buildUntil(leg);
      // Not when its first shift is at the same moment (the minute shown): two lines with one time.
      const first = (leg.shifts ?? []).find(s => ok(s.at) && s.at > o.now);
      if (until !== null && o.now < until && !(first && Math.abs(first.at - until) < 60)) out.push({ kind: 'build', at: until, exact });
    }
    for (const s of t ? [] : (leg.shifts ?? [])) {
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
  if (l.kind === 'keepbuilding') return `Keep building: ${buildLeftWords(l.left ?? [])} until ${t}`;
  if (l.kind === 'shift') return `Shift to ${virtueEggName(l.egg)} · ${t}`;
  if (l.kind === 'goal') return `${l.te} TE reached · ${t}`;
  if (l.kind === 'timeoff') return `Time off: to your home farm at ${l.te} TE · ${t}`;
  if (l.kind === 'back') return `Back: prestige to build again · ${t}`;
  if (l.inTimeOff) return `Prestige at ${l.te} TE · ${t}, in your time off: Fast prices it`;
  return `Prestige at ${l.te} TE · ${t}`;
}
