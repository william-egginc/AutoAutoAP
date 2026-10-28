/**
 * "When each step happens" under the instant answer's green box (Jordan, 24 Oct 2026: after setting no-prestige days
 * "instant didn't change; I don't think it reveals when it will change or shift or prestige"). One line per
 * ascension from the route's legs (search/routeFinder.ts `RouteLeg`): when its prestige happens, when its stop is
 * reached, and whether the prestige WAITED, for the hours or for a no-prestige day. The instant answer's legs keep
 * no egg shift times (the table has none; tableV2 holds the opening's shifts inside the hours without recording
 * when), so the shifts are not listed here: Simulate this plan gives every one. Pure.
 * My runs' Full timeline (26 Oct 2026) adds each ascension's shifts where its legs carry them (`ascensionSteps`).
 */
import { nextAvailable } from '@/search/availability';
import { isConstrained, type Availability } from '@/search/availabilitySchedule';
import { nextPrestigeAt, noPrestigeAt, usableNoPrestige } from '@/search/noPrestige';
import type { TimeOffWindow } from '@/search/types';
import { buildUpLine, type BuildUpLeg } from './buildUpLine';
import { estimatedOpening } from './openingShifts';
import { virtueEggName } from './virtueEggs';

export interface StepLeg {
  from: number;
  to: number;
  endTE: number;
  /** Unix seconds: the prestige into this ascension (the first leg: now, or its held start). */
  start: number;
  /** Unix seconds: the stop is reached. */
  end: number;
  label?: string;
  heldOpening?: 'morning' | 'uncertain';
  wanted?: number;
  /** Its own times already end it at a time off (the simulated ascension, lib/followSim.ts): not flagged again. */
  timeOffKnown?: boolean;
}

/** A time-off stretch as the rows name it. */
export interface StepTimeOff {
  from: number;
  to: number;
}

/** Why a prestige waited: the player's hours, or a no-prestige day (which may also push it to the hours' next start). */
export type StepWait = 'hours' | 'days';

export interface StepLine {
  /** 1-based. */
  asc: number;
  /** TE the ascension is reached from (its stop's TE is `stopTE`). */
  fromTE: number;
  stopTE: number;
  /** The first ascension is the one the farm is in now: no prestige to time. */
  now: boolean;
  /** The prestige into it, unix seconds. */
  prestigeAt: number;
  /** When the prestige could have happened without the waiting (the last stop reached); null when it didn't wait. */
  readyAt: number | null;
  wait: StepWait | null;
  /** The stop is reached, unix seconds. */
  reachedAt: number;
  /**
   * TIME OFF THE ESTIMATE DOES NOT KNOW (26 Oct 2026, Williamthe5thc: A1's prestige "Fri Oct 30 ~7:00 AM" sat inside his
   * time off Oct 29-30). The instant answer's estimate prices no time off; going to the home farm is a prestige, so an
   * ascension running into a time off really ends when it starts (`cutByTimeOff`), and a prestige inside one can't
   * happen then (`prestigeInTimeOff`). The rows say so in amber and leave the numbers to Fast: the estimate can't know
   * the TE at that moment. `onNoPrestigeDay`: the prestige lands on a no-prestige day it should wait past.
   */
  cutByTimeOff?: StepTimeOff;
  prestigeInTimeOff?: StepTimeOff;
  onNoPrestigeDay?: boolean;
}

/** "Oct 29–30", "Oct 31 – Nov 1": a time-off stretch's days in `zone` (its end is the first moment back). */
export function timeOffDays(w: StepTimeOff, zone: string): string {
  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: zone, ...o }).format(new Date(t * 1000));
    } catch {
      return new Intl.DateTimeFormat('en-US', o).format(new Date(t * 1000));
    }
  };
  const last = w.to - 1;
  const a = fmt(w.from, { month: 'short', day: 'numeric' });
  const b = fmt(last, { month: 'short', day: 'numeric' });
  if (a === b) return a;
  return fmt(w.from, { month: 'short' }) === fmt(last, { month: 'short' }) ? `${a}–${fmt(last, { day: 'numeric' })}` : `${a} – ${b}`;
}

function waitOf(
  readyAt: number,
  at: number,
  hours: Availability | null | undefined,
  windows: readonly TimeOffWindow[]
): StepWait | null {
  if (!(at - readyAt > 60)) return null;
  const h = isConstrained(hours) ? hours : null;
  // Where the hours alone would have put it: later than that, and a no-prestige day made it wait.
  const byHours = h ? nextAvailable(readyAt, h) : readyAt;
  const days = windows.length && nextPrestigeAt(readyAt, hours, windows) - byHours > 60;
  if (days) return 'days';
  return h && byHours - readyAt > 60 ? 'hours' : null;
}

export function instantSteps(
  legs: readonly StepLeg[] | null | undefined,
  hours: Availability | null | undefined,
  noPrestige: readonly TimeOffWindow[] | null | undefined,
  /** Time off as absolute stretches (search/timeOff.ts `timeOffWindows`); absent: none flagged. */
  timeOff?: readonly TimeOffWindow[] | null
): StepLine[] {
  const list = (legs ?? []).filter(l => l && Number.isFinite(l.start) && Number.isFinite(l.end));
  const windows = usableNoPrestige(noPrestige);
  const away = usableNoPrestige(timeOff);
  const inside = (t: number) => away.find(w => w.from <= t && t < w.to);
  return list.map((l, i) => {
    const prev = list[i - 1];
    // The first leg's prestige waited when it was held to the morning (`heldOpening`); the others from the last stop.
    const ready = prev ? prev.end : l.heldOpening === 'morning' && l.wanted ? l.wanted : null;
    const wait = ready !== null ? waitOf(ready, l.start, hours, windows) : null;
    const now = !prev && ready === null;
    const prestigeIn = now ? undefined : inside(l.start);
    // Running into a time off that starts after its own start (and before its stop, or with the stop inside it).
    const cut = l.timeOffKnown ? undefined : away.find(w => w.from > l.start && w.from < l.end);
    const flags = {
      ...(prestigeIn ? { prestigeInTimeOff: { from: prestigeIn.from, to: prestigeIn.to } } : {}),
      ...(cut && !prestigeIn ? { cutByTimeOff: { from: cut.from, to: cut.to } } : {}),
      ...(!now && windows.length && noPrestigeAt(l.start, windows) ? { onNoPrestigeDay: true } : {}),
    };
    return {
      ...flags,
      asc: i + 1,
      fromTE: l.from,
      stopTE: l.endTE,
      now,
      prestigeAt: l.start,
      readyAt: wait ? ready : null,
      wait,
      reachedAt: l.end,
    };
  });
}

/** One ascension's line (`instantSteps`) with its shifts in order: when, and the egg switched TO. */
export interface AscensionStep extends StepLine {
  shifts: { at: number; egg: string }[];
  /** The shifts are the current ascension's simulated on the live save (exact), not the table's (to the hour). */
  simulated: boolean;
  /** "You do the build-up for 2 sales, then start producing at …" (lib/buildUpLine.ts): absent for continue, the
   *  build-up of the save's farm, or a leg whose sale count is not known. */
  buildUp?: string;
  /** A fresh ascension whose listed shifts leave its opening out: the simulator's standard build-up shifts, estimated
   *  (lib/openingShifts.ts `estimatedOpening`, 6). Absent: none to add. */
  openingShifts?: number;
  /** Time off cuts it (the simulated ascension, lib/followSim.ts): to the home farm at `from` with `te`, built again
   *  from `to`. */
  timeOff?: { from: number; to: number; te: number };
  /** Its prestige follows the simulated ascension before it (`prestigeAfterSimulated`): to the minute, not the
   *  instant answer's hour. */
  prestigeExact?: boolean;
  /** The ascension you are in, simulated, with no shifts left (`withStayLine`): stay on `egg` until `at`, its prestige
   *  (or on the route's last ascension, its TE reached). */
  stay?: StayLine;
}

/** "No shifts left: stay on <egg> until you prestige at about <time>" (`stayWords`). */
export interface StayLine {
  egg: string | null;
  at: number;
  kind: 'prestige' | 'goal';
  te: number;
}

/**
 * EVERY ASCENSION AND ITS SHIFTS (26 Oct 2026, My runs' Full timeline for a route with no exact legs): `instantSteps`'
 * lines, each with the shifts its leg lists (the table's from H1 on, search/legShifts.ts; the current ascension's
 * from the simulation once it is in). A leg that lists none has an empty list. Each fresh ascension also says what
 * its build-up is (`buildUp`, from its variant and rate: lib/buildUpLine.ts), the opening the table's shifts leave out,
 * and how many shifts that opening makes when its list leaves them out (`openingShifts`, estimated: lib/openingShifts.ts).
 */
export function ascensionSteps(
  legs:
    | readonly (StepLeg & {
        shifts?: { at: number; egg: string }[];
        simulated?: boolean;
        timeOff?: { from: number; to: number; te: number };
      } & BuildUpLeg)[]
    | null
    | undefined,
  hours: Availability | null | undefined,
  noPrestige: readonly TimeOffWindow[] | null | undefined,
  timeOff?: readonly TimeOffWindow[] | null
): AscensionStep[] {
  const list = (legs ?? [])
    .filter(l => l && Number.isFinite(l.start) && Number.isFinite(l.end))
    .map(l => (l.timeOff ? { ...l, timeOffKnown: true } : l));
  return instantSteps(list, hours, noPrestige, timeOff).map((line, i) => {
    const buildUp = buildUpLine(list[i]);
    const opening = estimatedOpening(list[i]);
    return {
      ...line,
      shifts: (list[i].shifts ?? []).filter(s => Number.isFinite(s.at)).map(s => ({ at: s.at, egg: s.egg })),
      simulated: !!list[i].simulated,
      ...(list[i - 1]?.simulated ? { prestigeExact: true } : {}),
      ...(buildUp ? { buildUp } : {}),
      ...(opening > 0 ? { openingShifts: opening } : {}),
      ...(list[i].timeOff ? { timeOff: { from: list[i].timeOff!.from, to: list[i].timeOff!.to, te: list[i].timeOff!.te } } : {}),
    };
  });
}

/**
 * THE SIMULATED ASCENSION'S PRESTIGE, TO THE MINUTE (27 Oct 2026, Jordan: the Full timeline's times were off from hour
 * rounding). The ascension after a simulated one (lib/followSim.ts) starts at that one's simulated end, held by
 * `prestigeAt` (the hours and no-prestige days, search/noPrestige.ts `nextPrestigeAt`), not at the instant answer's
 * start (the table's end of it, to the hour), as Next shifts already time it (lib/nextAction.ts). The legs as they are
 * otherwise.
 */
export function prestigeAfterSimulated<L extends { start: number; end: number; simulated?: boolean }>(
  legs: readonly L[],
  prestigeAt: (t: number) => number
): L[] {
  return legs.map((l, i) => {
    const prev = legs[i - 1];
    if (!prev?.simulated || !Number.isFinite(prev.end)) return l;
    const at = prestigeAt(prev.end);
    return Number.isFinite(at) ? { ...l, start: at } : l;
  });
}

/**
 * NO SHIFTS LEFT (27 Oct 2026, Jordan): the ascension you are in (A1, simulated on the save) with no shift after `now`
 * says what to do instead of an empty line: stay on the egg of its last shift (else the egg the save is on, `egg`)
 * until its prestige, the next ascension's start; on the route's last ascension, until its TE is reached. Nothing for
 * an ascension from the instant answer (its shifts aren't known), one not started yet, or one cut by time off.
 */
export function withStayLine(steps: readonly AscensionStep[], now: number, egg: string | null | undefined): AscensionStep[] {
  const first = steps[0];
  if (!first?.simulated || first.timeOff || now < first.prestigeAt) return [...steps];
  if (first.shifts.some(s => s.at > now)) return [...steps];
  const last = first.shifts.filter(s => s.at <= now).pop();
  const next = steps[1];
  const stay: StayLine = next
    ? { egg: last?.egg ?? egg ?? null, at: next.prestigeAt, kind: 'prestige', te: first.stopTE }
    : { egg: last?.egg ?? egg ?? null, at: first.reachedAt, kind: 'goal', te: first.stopTE };
  if (!(now < stay.at)) return [...steps];
  return [{ ...first, stay }, ...steps.slice(1)];
}

/** "No shifts left: stay on Kindness until you prestige at about <when>", "… until you reach 226 TE at about <when>". */
export function stayWords(s: StayLine, when: (t: number) => string): string {
  const on = s.egg ? `stay on ${virtueEggName(s.egg)}` : 'stay on the egg you are on';
  return s.kind === 'prestige'
    ? `No shifts left: ${on} until you prestige at about ${when(s.at)}`
    : `No shifts left: ${on} until you reach ${s.te} TE at about ${when(s.at)}`;
}
