/**
 * Plan vs actual, the simple version (R6, ~/code/aaap-tools/specialists/ui-r6-plan.md): how many hours earlier
 * (ahead) or later (behind) than a plan the latest save reached the progress it shows. One module for every place
 * that says it: My runs' saved runs and saved answers (components/myruns/PaceBadge.vue) and Right now's chip
 * (lib/nowPlan.ts `onTrack` is a thin wrapper), so they can never disagree.
 *
 *   progressOf  the save's progress: TE per egg (pending counted) plus how far the egg the farm is on has got to its
 *               next TE, so the gap doesn't jump by a whole TE between thresholds.
 *   paceLine    the plan's TE line: shift by shift when the legs carry each shift's TE and each egg's start TE is
 *               known (`planTEAt`), else leg by leg ("rough").
 *   planPace    when the plan reaches that progress, against the save's time.
 *   paceWords   the badge, its "as of 3:42 pm" and the detail line.
 *
 * Pure: no Vue, no stores; `now` and the zone are always parameters.
 */
import type { LegSummary } from '@/search/types';
import { dateAt, eventWhen } from './eventWhen';
import { saveTEByEggOf } from './saveFreshness';
import { countTEThresholdsPassed, getThresholdForTE } from './truthEggs';
import { virtueEggOf } from './virtueEggs';

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
  /** Σ TE per egg (pending counted) + the fraction of the way to the next TE on the egg the farm is on. */
  progress: number;
  /** The save has a farm on a virtue egg (false: the maths is the same, the detail says so). */
  onVirtue: boolean;
}

interface RawVirtueSave {
  virtue?: { eggsDelivered?: (number | null)[] | null; eovEarned?: (number | null)[] | null } | null;
  farms?: ({ eggType?: number | null } | null)[] | null;
}

/**
 * The save's progress: `saveTEByEggOf` summed, plus `(delivered − thr(TE)) / (thr(TE+1) − thr(TE))` on the egg the
 * farm is on (its eggs delivered past its last threshold). That egg's TE must be its thresholds passed (a claimed TE
 * above it, or 98, adds nothing). Null without a save.
 */
export function progressOf(raw: unknown, seconds: number): SaveProgress | null {
  if (!raw || typeof raw !== 'object' || !(seconds > 0)) return null;
  const r = raw as RawVirtueSave;
  const te = saveTEByEggOf(raw);
  let progress = te.reduce((a, b) => a + b, 0);
  const farm = (r.farms ?? []).find(f => f && typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54);
  const egg = virtueEggOf(farm?.eggType);
  if (egg)
    progress += eggFraction(
      r.virtue?.eggsDelivered?.[SAVE_EGG_ORDER.indexOf(egg)] ?? 0,
      te[SAVE_EGG_ORDER.indexOf(egg)]
    );
  return { seconds, progress, onVirtue: !!egg };
}

/** How far `delivered` is from the egg's last threshold to its next, 0..1 (0 when its TE isn't its thresholds). */
export function eggFraction(delivered: number, te: number): number {
  const passed = countTEThresholdsPassed(delivered);
  if (passed !== te || passed >= 98) return 0;
  const lo = getThresholdForTE(passed);
  const hi = getThresholdForTE(passed + 1);
  if (!(hi > lo)) return 0;
  return Math.min(0.999, Math.max(0, (delivered - lo) / (hi - lo)));
}

// --------------------------------------------------------------------------------- the plan's line

/**
 * The plan's total TE at `t`: each egg's TE where the plan last left it, and the egg being laid moving in a
 * straight line from where it started to the TE it has when the farm next leaves it (a shift's `te`, or the leg's
 * `endEgg`). Null when the legs don't carry those TEs (priced before 15 Oct 2026).
 */
export function planTEAt(legs: readonly LegSummary[], startTE: readonly number[], t: number): number | null {
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
        te.set(left, from + (s.te - from) * f);
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
  /** The plan's TE at `t` (non-decreasing). */
  teAt: (t: number) => number;
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

/** Leg by leg: flat from the previous stop's TE until the build phase ends, then straight to the leg's end TE; flat
 *  across prestige waits and time off. */
function legLevelTE(legs: readonly PaceLeg[], startTE: number, t: number): number {
  let from = startTE;
  for (const l of legs) {
    if (t < l.end) {
      const b = Math.min(l.end, Math.max(l.start, l.buildEnd ?? l.start));
      if (t <= b) return from;
      return from + (l.endTE - from) * ((t - b) / Math.max(1, l.end - b));
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
  if (sims && byEgg && planTEAt(sims, byEgg, end) !== null) {
    const s = sims;
    return { ...common, startTE: planTEAt(s, byEgg, start) ?? 0, rough: false, teAt: t => planTEAt(s, byEgg, t) ?? 0 };
  }
  const startTE = fin(i.startTE) ? i.startTE : byEgg ? byEgg.reduce((a, b) => a + b, 0) : null;
  if (startTE === null) return 'no-te';
  const ls = legs;
  return { ...common, startTE, rough: true, teAt: t => legLevelTE(ls, startTE, t) };
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
  | { kind: 'cant'; why: 'not-started'; start: number };

/** Where the save stands against the plan's line. `save` null: no save loaded (or still loading). */
export function planPace(line: PaceLine | NoLine, save: SaveProgress | null): PaceState {
  if (!save) return { kind: 'no-save' };
  if (typeof line !== 'string' && line.planSave !== null) {
    if (Math.abs(save.seconds - line.planSave) < SAME_SAVE_SECONDS) return { kind: 'same-save' };
    if (save.seconds < line.planSave) return { kind: 'cant', why: 'older-save' };
  }
  if (typeof line === 'string') return { kind: 'cant', why: line };
  if (save.seconds < line.start) return { kind: 'cant', why: 'not-started', start: line.start };
  const P = save.progress;
  if (P >= line.goalTE)
    return { kind: 'done', goalTE: line.goalTE, saveTime: save.seconds, estimate: line.estimate, rough: line.rough };
  if (P < line.teAt(line.start) - 1e-9) return { kind: 'cant', why: 'below-start' };
  // When does the plan reach P? The earliest moment its (non-decreasing) line does: bisection over the plan.
  let lo = line.start;
  let hi = line.end;
  for (let k = 0; k < 60 && hi - lo > 1; k++) {
    const mid = (lo + hi) / 2;
    if (line.teAt(mid) >= P) hi = mid;
    else lo = mid;
  }
  const hours = (hi - save.seconds) / 3600;
  const ends = line.stops.map(s => s.at);
  const i = ends.findIndex(e => save.seconds < e);
  const common = {
    hours,
    saveTime: save.seconds,
    expected: line.teAt(Math.min(save.seconds, line.end)),
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

const te1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

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
          return out('', 'warn', 'Your TE is below where this plan starts');
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
        `Plan expected ${te1(s.expected)} TE by ${clockWords(s.saveTime, nowSeconds, zone)}; you had ${te1(s.actual)}.`,
        `Plan: ascension ${s.planAsc} of ${s.stops} by now · you: stop ${s.stopsReached} of ${s.stops} reached.`,
        s.rough ? 'Rough: compared leg by leg.' : '',
        s.estimate ? 'The plan is an instant answer, not checked exactly.' : '',
        s.onVirtue ? '' : 'Not on your virtue farm in this save.',
        s.startNote ? `This plan was set to start at ${clockWords(s.startNote, nowSeconds, zone)}.` : '',
        FORECAST_WORDS,
      ];
      return out(badge, s.kind === 'behind' ? 'bad' : 'ok', parts.filter(Boolean).join(' '), s.saveTime, s.estimate);
    }
  }
}
