/**
 * Plan vs actual, the simple version (R6, ~/code/aaap-tools/specialists/ui-r6-plan.md): how many hours earlier
 * (ahead) or later (behind) than a plan the latest save reached the progress it shows. One module for every place
 * that says it: My runs' saved runs and saved answers (components/myruns/PaceBadge.vue) and Right now's chip
 * (lib/nowPlan.ts `onTrack` is a thin wrapper), so they can never disagree.
 *
 *   progressOf  the save's progress: its whole TE per egg (pending counted), summed, and the egg the farm is on.
 *   paceLine    the plan's line in whole TE: shift by shift when the legs carry each shift's TE and each egg's start
 *               TE is known (`planTEAt`), else leg by leg ("rough"); and the egg the plan is on at any moment.
 *   planPace    whole TE against whole TE at the save's time, and how many hours apart the plan and the save are.
 *
 * TE counts only whole, claimed TE (Jordan's My runs rule, 22 Oct 2026): no credit for the way to the next TE on
 * either side. The fraction once added on the save's side (and never on the plan's when it had left that egg) read
 * "3 days ahead" for a save 8 h behind (~/code/aaap-tools/notes/myruns-review-2026-10-22.md, bug 1). A save on another
 * egg than the plan is on at that moment can't be compared fairly: "Can't compare right now".
 *   paceWords   the badge, its "as of 3:42 pm" and the detail line.
 *
 * Pure: no Vue, no stores; `now` and the zone are always parameters.
 */
import type { LegSummary } from '@/search/types';
import { dateAt, eventWhen } from './eventWhen';
import { saveTEByEggOf } from './saveFreshness';
import { virtueEggName, virtueEggOf } from './virtueEggs';

/** The save's egg order, as SnapMeta `teByEgg` and `saveTEByEggOf` list it. */
export const SAVE_EGG_ORDER = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;

/** Within this many hours either way the save is "On schedule (within an hour)". */
export const ON_SCHEDULE_HOURS = 1;
/** A save within this many seconds of the plan's own save is that save: nothing to compare. */
export const SAME_SAVE_SECONDS = 600;
/** From this many hours the gap is said in days. */
export const DAYS_FROM_HOURS = 48;
/** The plan's start differs from its save's time by more than this: the detail says when it was set to start. */
const START_NOTE_SECONDS = 3600;

// ------------------------------------------------------------------------------------ the save

export interface SaveProgress {
  /** The save's time, unix seconds. */
  seconds: number;
  /** Σ whole TE per egg (pending counted): no fraction toward the next TE. */
  progress: number;
  /** The save has a farm on a virtue egg (false: the maths is the same, the detail says so). */
  onVirtue: boolean;
  /** The virtue egg the farm is on ('humility'…); null or absent: not known (the egg isn't checked). */
  egg?: string | null;
}

interface RawVirtueSave {
  virtue?: { eggsDelivered?: (number | null)[] | null; eovEarned?: (number | null)[] | null } | null;
  farms?: ({ eggType?: number | null } | null)[] | null;
}

/** The save's progress: `saveTEByEggOf` summed (whole TE, pending counted) and the egg the farm is on. Null
 *  without a save. */
export function progressOf(raw: unknown, seconds: number): SaveProgress | null {
  if (!raw || typeof raw !== 'object' || !(seconds > 0)) return null;
  const r = raw as RawVirtueSave;
  const progress = saveTEByEggOf(raw).reduce((a, b) => a + b, 0);
  const farm = (r.farms ?? []).find(f => f && typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54);
  const egg = virtueEggOf(farm?.eggType);
  return { seconds, progress, onVirtue: !!egg, egg: egg ?? null };
}

// --------------------------------------------------------------------------------- the plan's line

/**
 * The plan's total TE at `t`: each egg's TE where the plan last left it, and the egg being laid moving in a
 * straight line from where it started to the TE it has when the farm next leaves it (a shift's `te`, or the leg's
 * `endEgg`). `whole`: the egg being laid counts only the whole TE it has got to (the pace compares whole TE). Null
 * when the legs don't carry those TEs (priced before 15 Oct 2026).
 */
export function planTEAt(legs: readonly LegSummary[], startTE: readonly number[], t: number, whole = false): number | null {
  const te = new Map<string, number>(SAVE_EGG_ORDER.map((e, i) => [e, startTE[i] ?? 0]));
  for (const leg of legs) {
    const shifts = leg.shifts ?? [];
    let onEgg = shifts[0]?.fromEgg ?? leg.endEgg?.egg ?? '';
    let since = leg.startTime ?? leg.endTime - leg.durationSeconds;
    if (!onEgg) return null;
    const stops = [
      ...shifts.map(s => ({ at: s.at, left: s.fromEgg || '', te: s.te, to: s.egg })),
      { at: leg.endTime, left: leg.endEgg?.egg ?? '', te: leg.endEgg?.te, to: '' },
    ];
    for (const s of stops) {
      const left = s.left || onEgg;
      if (typeof s.te !== 'number' || !Number.isFinite(s.te)) return null;
      const from = te.get(left) ?? 0;
      if (t < s.at) {
        if (t <= since) return sum(te);
        const f = (t - since) / Math.max(1, s.at - since);
        const x = from + (s.te - from) * f;
        te.set(left, whole ? Math.max(from, Math.floor(x + 1e-9)) : x);
        return sum(te);
      }
      te.set(left, Math.max(from, s.te));
      onEgg = s.to;
      since = s.at;
    }
  }
  return sum(te);
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/**
 * The egg the plan's farm is on at `t`: each leg starts on its first shift's `fromEgg` (else its `endEgg`), moves to
 * each shift's egg at its time, and stays on its `endEgg` through the wait after it. Null when the legs don't say.
 */
export function planEggAt(legs: readonly LegSummary[], t: number): string | null {
  let egg: string | null = null;
  for (const leg of legs) {
    const shifts = leg.shifts ?? [];
    const start = leg.startTime ?? leg.endTime - leg.durationSeconds;
    const first = shifts[0]?.fromEgg || leg.endEgg?.egg || null;
    if (t < start) return egg ?? first;
    egg = first;
    for (const s of shifts) {
      if (t < s.at) return egg;
      egg = s.egg || egg;
    }
    if (t < leg.endTime) return egg;
    egg = leg.endEgg?.egg || egg;
  }
  return egg;
}

/** One leg as the leg-level line reads it: a LegSummary, or an instant answer's table leg ({start, end, endTE}). */
export interface PaceLeg {
  start: number;
  end: number;
  endTE: number;
  /** When the build phase ends (the line is flat before it). */
  buildEnd?: number;
}

export interface PaceLine {
  /** The plan's start (its times are from it), unix seconds. */
  start: number;
  /** When the last stop is reached. */
  end: number;
  /** The plan's TE at its start and at its last stop. */
  startTE: number;
  goalTE: number;
  /** Each stop: its TE and when the plan reaches it (the leg's end). */
  stops: { te: number; at: number }[];
  /** Compared leg by leg (no shift TEs, or no TE per egg at the start). */
  rough: boolean;
  /** The plan is an instant answer (no simulation): "(estimate)". */
  estimate: boolean;
  /** The save the plan was priced from, unix seconds; null when unknown. */
  planSave: number | null;
  /** The plan's whole TE at `t` (non-decreasing). */
  teAt: (t: number) => number;
  /** The egg the plan is on at `t`; absent when the legs don't say (an instant answer's table legs). */
  eggAt?: (t: number) => string | null;
}

/** Why there is no line. */
export type NoLine = 'no-timeline' | 'no-te';

export interface PaceLineInput {
  /** The simulated legs (LegSummary), or table legs already as PaceLeg. */
  legs?: readonly LegSummary[] | null;
  tableLegs?: readonly PaceLeg[] | null;
  /** The plan's start; else leg 1's start. */
  planStart?: number | null;
  /** Each egg's TE at the plan's start (SAVE_EGG_ORDER): shift by shift needs it. */
  startTEByEgg?: readonly number[] | null;
  /** The total TE at the plan's start, for the leg-level line when the per-egg TEs aren't known. */
  startTE?: number | null;
  planSave?: number | null;
  estimate?: boolean;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** LegSummary → PaceLeg; null for a leg without its times (`replayed`, or no `endTime`). */
function paceLegOf(l: LegSummary): PaceLeg | null {
  if (!fin(l.endTime) || l.replayed) return null;
  const start = fin(l.startTime) ? l.startTime : fin(l.durationSeconds) ? l.endTime - l.durationSeconds : null;
  if (start === null || !fin(l.endTE)) return null;
  return {
    start,
    end: l.endTime,
    endTE: l.endTE,
    ...(fin(l.buildPhaseEndTime) ? { buildEnd: l.buildPhaseEndTime } : {}),
  };
}

/** Leg by leg: flat from the previous stop's TE until the build phase ends, then straight to the leg's end TE
 *  (whole TE only); flat across prestige waits and time off. */
function legLevelTE(legs: readonly PaceLeg[], startTE: number, t: number): number {
  let from = startTE;
  for (const l of legs) {
    if (t < l.end) {
      const b = Math.min(l.end, Math.max(l.start, l.buildEnd ?? l.start));
      if (t <= b) return from;
      return Math.max(from, Math.floor(from + (l.endTE - from) * ((t - b) / Math.max(1, l.end - b)) + 1e-9));
    }
    from = Math.max(from, l.endTE);
  }
  return from;
}

/**
 * The plan's TE line, or why there is none. Shift by shift when every leg carries its shifts' TEs and each egg's
 * start TE is known; else leg by leg ("rough") from the total start TE; the table's legs (an instant answer without
 * Check exactly) are always leg by leg.
 */
export function paceLine(i: PaceLineInput): PaceLine | NoLine {
  const sims = i.legs ?? null;
  let legs: PaceLeg[] | null = null;
  if (sims && sims.length) {
    const ls = sims.map(paceLegOf);
    if (ls.every((l): l is PaceLeg => !!l)) legs = ls;
  } else if (i.tableLegs && i.tableLegs.length && i.tableLegs.every(l => fin(l.start) && fin(l.end) && fin(l.endTE))) {
    legs = [...i.tableLegs];
  }
  if (!legs) return 'no-timeline';
  const start = fin(i.planStart) && i.planStart > 0 ? i.planStart : legs[0].start;
  const end = legs[legs.length - 1].end;
  const stops = legs.map(l => ({ te: l.endTE, at: l.end }));
  const goalTE = legs[legs.length - 1].endTE;
  const common = {
    start,
    end,
    goalTE,
    stops,
    estimate: !!i.estimate,
    planSave: fin(i.planSave) && i.planSave > 0 ? i.planSave : null,
  };
  const byEgg = i.startTEByEgg && i.startTEByEgg.length === 5 ? i.startTEByEgg : null;
  // The simulated legs say which egg the plan is on, shift TEs or not.
  const eggs = sims && sims.length && planEggAt(sims, start) ? { eggAt: (t: number) => planEggAt(sims, t) } : {};
  if (sims && byEgg && planTEAt(sims, byEgg, end) !== null) {
    const s = sims;
    return {
      ...common,
      ...eggs,
      startTE: planTEAt(s, byEgg, start, true) ?? 0,
      rough: false,
      teAt: t => planTEAt(s, byEgg, t, true) ?? 0,
    };
  }
  const startTE = fin(i.startTE) ? Math.floor(i.startTE) : byEgg ? byEgg.reduce((a, b) => a + b, 0) : null;
  if (startTE === null) return 'no-te';
  const ls = legs;
  return { ...common, ...eggs, startTE, rough: true, teAt: t => legLevelTE(ls, startTE, t) };
}

// ------------------------------------------------------------------------------------- the pace

export type PaceState =
  | {
      kind: 'ahead' | 'behind' | 'on-schedule';
      /** Hours: positive ahead, negative behind. */
      hours: number;
      saveTime: number;
      /** What the plan expected at the save's time, and what the save has. */
      expected: number;
      actual: number;
      /** The plan's ascension at the save's time (1-based, the last after its end) and the stops the save has reached. */
      planAsc: number;
      stopsReached: number;
      stops: number;
      rough: boolean;
      estimate: boolean;
      onVirtue: boolean;
      /** The plan's start, when it differs from its save's time by more than an hour (else null). */
      startNote: number | null;
    }
  | { kind: 'done'; goalTE: number; saveTime: number; estimate: boolean; rough: boolean }
  | { kind: 'same-save' }
  | { kind: 'no-save' }
  | { kind: 'cant'; why: NoLine | 'older-save' | 'below-start' }
  | { kind: 'cant'; why: 'not-started'; start: number }
  /** The save's farm is on another egg than the plan's at the save's time: no fair comparison. */
  | { kind: 'cant'; why: 'other-egg'; saveEgg: string; planEgg: string; saveTime: number };

/** Where the save stands against the plan's line. `save` null: no save loaded (or still loading). */
export function planPace(line: PaceLine | NoLine, save: SaveProgress | null): PaceState {
  if (!save) return { kind: 'no-save' };
  if (typeof line !== 'string' && line.planSave !== null) {
    if (Math.abs(save.seconds - line.planSave) < SAME_SAVE_SECONDS) return { kind: 'same-save' };
    if (save.seconds < line.planSave) return { kind: 'cant', why: 'older-save' };
  }
  if (typeof line === 'string') return { kind: 'cant', why: line };
  if (save.seconds < line.start) return { kind: 'cant', why: 'not-started', start: line.start };
  const W = Math.floor(save.progress + 1e-9);
  if (W >= line.goalTE)
    return { kind: 'done', goalTE: line.goalTE, saveTime: save.seconds, estimate: line.estimate, rough: line.rough };
  if (W < line.teAt(line.start)) return { kind: 'cant', why: 'below-start' };
  // Another egg than the plan's at that moment (the plan has shifted on, or not yet): its TE there can't be read
  // against the plan's, so no guess. After the plan's end there is no egg to be on.
  const planEgg = save.egg && line.eggAt && save.seconds < line.end ? line.eggAt(save.seconds) : null;
  if (save.egg && planEgg && planEgg !== save.egg)
    return { kind: 'cant', why: 'other-egg', saveEgg: save.egg, planEgg, saveTime: save.seconds };
  // When does the plan first have X whole TE? Bisection over its (non-decreasing) line.
  const reach = (X: number) => {
    let lo = line.start;
    let hi = line.end;
    for (let k = 0; k < 60 && hi - lo > 1; k++) {
      const mid = (lo + hi) / 2;
      if (line.teAt(mid) >= X) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // Ahead: the plan only gets the save's TE later. Behind: the plan already had the save's next TE that long before
  // the save. The same whole TE as the plan expects: on schedule.
  const expected = line.teAt(Math.min(save.seconds, line.end));
  const hours = W > expected ? (reach(W) - save.seconds) / 3600 : W < expected ? (reach(W + 1) - save.seconds) / 3600 : 0;
  const P = W;
  const ends = line.stops.map(s => s.at);
  const i = ends.findIndex(e => save.seconds < e);
  const common = {
    hours,
    saveTime: save.seconds,
    expected,
    actual: P,
    planAsc: i < 0 ? ends.length : i + 1,
    stopsReached: line.stops.filter(s => P >= s.te).length,
    stops: line.stops.length,
    rough: line.rough,
    estimate: line.estimate,
    onVirtue: save.onVirtue,
    startNote: line.planSave !== null && Math.abs(line.start - line.planSave) > START_NOTE_SECONDS ? line.start : null,
  };
  if (Math.abs(hours) < ON_SCHEDULE_HOURS) return { kind: 'on-schedule', ...common };
  return { kind: hours > 0 ? 'ahead' : 'behind', ...common };
}

// ------------------------------------------------------------------------------------- the words

export type PaceTone = 'ok' | 'bad' | 'warn' | 'plain';

export interface PaceWords {
  /** The pill: "3 hours behind", "On schedule (within an hour)", "Done: you reached 490"…; '' when hidden. */
  badge: string;
  /** "as of 3:42 pm" ("as of Oct 20 at 3:42 pm" when not today); '' when the state has no time. */
  asOf: string;
  /** The badge and its time as one line (Right now's chip): "3 hours behind, as of 3:42 pm". */
  text: string;
  /** The one detail line under it. */
  detail: string;
  tone: PaceTone;
  /** Not the route followed for its goal: shown greyed. */
  greyed: boolean;
}

export const NO_SAVE_WORDS = 'Load your save to see how you are doing';
export const FORECAST_WORDS =
  'A plan is a forecast: an hour or two either way is normal. Most accurate right after a shift.';
export const NOT_FOLLOWED_WORDS = 'not the route you follow';

/** "1 hour", "3 hours"; "2 days" from 48 hours. */
export function gapWords(hours: number): string {
  const h = Math.round(Math.abs(hours));
  if (h >= DAYS_FROM_HOURS) {
    const d = Math.round(Math.abs(hours) / 24);
    return `${d} days`;
  }
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** "3:42 pm" today in `zone`, else "Oct 20 at 3:42 pm" (the year when not this year's). */
export function clockWords(at: number, nowSeconds: number, zone: string): string {
  const w = eventWhen(at, nowSeconds, zone);
  if (w && w.day === 'today') return w.clock;
  return dateAt(at, nowSeconds, zone);
}

export const OTHER_EGG_WORDS = "Can't compare right now: your save is on a different egg than the plan expects.";

/** The words for a state. `followed: false`: another route is followed for this plan's goal (greyed). */
export function paceWords(s: PaceState, nowSeconds: number, zone: string, o: { followed?: boolean } = {}): PaceWords {
  const greyed = o.followed === false;
  const out = (
    badge: string,
    tone: PaceTone,
    detail: string,
    asOfAt: number | null = null,
    estimate = false
  ): PaceWords => {
    const b = badge && estimate ? `${badge} (estimate)` : badge;
    const asOf = asOfAt ? `as of ${clockWords(asOfAt, nowSeconds, zone)}` : '';
    const d = greyed ? [`This is ${NOT_FOLLOWED_WORDS} for its goal.`, detail].filter(Boolean).join(' ') : detail;
    return { badge: b, asOf, text: [b, asOf].filter(Boolean).join(', '), detail: d, tone, greyed };
  };
  switch (s.kind) {
    case 'no-save':
      return out(NO_SAVE_WORDS, 'plain', '');
    case 'same-save':
      return out('Made from your latest save', 'plain', 'Load a newer save later to see how you are doing against it.');
    case 'cant':
      switch (s.why) {
        case 'older-save':
          return out('Your loaded save is older than this plan', 'warn', 'Load your latest save to compare.');
        case 'not-started':
          return out(`Starts ${dateAt(s.start, nowSeconds, zone)}: nothing to compare yet`, 'plain', '');
        case 'below-start':
          return out('', 'warn', 'Your TE is below where this plan starts.');
        case 'other-egg':
          return out(
            OTHER_EGG_WORDS,
            'warn',
            `Your save is on ${virtueEggName(s.saveEgg)}; at ${clockWords(s.saveTime, nowSeconds, zone)} the plan has you on ${virtueEggName(s.planEgg)}.`
          );
        case 'no-te':
          return out("Can't tell: saved without each egg's TE", 'warn', '');
        default:
          return out("Can't tell: saved without its timeline", 'warn', '');
      }
    case 'done':
      return out(`Done: you reached ${s.goalTE}`, 'ok', '', s.saveTime, s.estimate);
    default: {
      const badge =
        s.kind === 'on-schedule'
          ? 'On schedule (within an hour)'
          : `${gapWords(s.hours)} ${s.kind === 'ahead' ? 'ahead' : 'behind'}`;
      const parts = [
        `Plan expected ${s.expected} TE by ${clockWords(s.saveTime, nowSeconds, zone)}; you had ${s.actual}.`,
        `Plan: ascension ${s.planAsc} of ${s.stops} by then · you: ascension ${s.stopsReached} of ${s.stops}.`,
        s.rough ? 'Rough: compared ascension by ascension.' : '',
        s.estimate ? 'The plan is an instant answer, an estimate not simulated on your account.' : '',
        s.onVirtue ? '' : 'Not on your virtue farm in this save.',
        s.startNote ? `This plan was set to start ${clockWords(s.startNote, nowSeconds, zone)}.` : '',
        FORECAST_WORDS,
      ];
      return out(badge, s.kind === 'behind' ? 'bad' : 'ok', parts.filter(Boolean).join(' '), s.saveTime, s.estimate);
    }
  }
}
