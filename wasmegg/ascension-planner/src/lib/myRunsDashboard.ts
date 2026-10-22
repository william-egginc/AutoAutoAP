/**
 * My runs' summary (#/myruns, 16 Oct 2026; plan: aaap-tools/specialists/ui-dashboard-plan.md): six cards
 * and a Next steps checklist above the three parts, from the board rows LeaderboardPanel already loaded
 * (mode "myruns") and what this browser keeps (saved runs and answers, results not sent, Your setup).
 * Nothing new is fetched or sent. Pure: the components only render (components/myruns/).
 *
 * THE CARDS: Egg Day (best TE and spare, else a saved answer), the race to 490 (earliest finish), the
 * soonest other date still ahead (best TE), Saved (answers and runs), Last run (newest sent, saved or
 * kept), Your hours (as remembered for the account, lib/setupMemory.ts).
 *
 * NEXT STEPS, each with one action:
 *   eggday     no Egg Day run sent, saved or waiting to send       -> By a date, Nearby routes, Egg Day
 *   hours      a goal's best run priced with other hours or time off than Your setup has now
 *   simulator  a goal's best run priced by an older simulator (no stamp and sent before 13 Oct: "likely")
 *   moved      the save moved on: TE now above the run's, or sent more than a week ago
 *              (those three: one item per goal, opening the goal's screen to run it again)
 *   exact      a race goal only ever run at Fast (Exact never), or a date only ever by Nearby routes
 *   unsent     results kept in this browser, not sent                -> scroll to Not sent yet
 *   hidden     runs hidden from the public (information)            -> scroll to the board list
 * Only goals still ahead are flagged (a race whose target the save has not reached, a date not passed).
 *
 * "LOOKS LIKE YOURS": a run matched by timezone and artifacts only (no copy came back from /mine, the
 * list's "maybe you") is shown on the cards, labelled, but never raises a step: it may be someone else's.
 * It does count as an Egg Day run, though, so the checklist never says "no Egg Day run" beside a card
 * that shows one.
 */
import {
  deadlineSpare,
  finishMs,
  foldCopies,
  formatDate,
  isDeadlineRow,
  madeDeadline,
  sentMs,
  type BoardRow,
} from './leaderboardRank';
import { compareBest, lastSentMs, runKind, type RunKind } from './myRuns';
import { parseWindow } from './planFilters';
import { hoursWords, timeOffWords } from './pricedWith';
import { SIM_VERSION } from '@/search/simVersion';
import type { AutoView, Depth } from './siteNav';
import type { SearchTabId } from './searchTab';
import type { ByDatePresetAsk } from './byDateForm';
import type { StrongerLevel } from '@/stores/stronger';
import { describeAvailability, isConstrained, type Availability } from '@/search/availabilitySchedule';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';

const DAY_MS = 86_400_000;
/** "Sent over a week ago": a run this old is run again to see whether the save has moved on. */
export const STALE_AFTER_MS = 7 * DAY_MS;
/** The simulator stamp rides on rows since this day (13 Oct 2026): an unstamped row sent before it was
 *  priced by an older simulator, likely; one sent after it is not judged. */
export const SIM_STAMPED_FROM_MS = Date.UTC(2026, 9, 13);
/** Next steps shown before "n more". */
export const STEPS_SHOWN = 5;

/** One result, its copies folded (lib/leaderboardRank.ts `foldCopies`, as MyRunsList shows it). */
export interface DashLine {
  row: BoardRow;
  copies: BoardRow[];
  /** No copy came back from /mine: matched by timezone and artifacts only ("looks like yours"). */
  maybe: boolean;
  /** Every copy is hidden from the public. */
  hidden: boolean;
}

export function dashLines(rows: readonly BoardRow[]): DashLine[] {
  return foldCopies(rows).map(f => ({
    row: f.row,
    copies: f.copies,
    maybe: !f.copies.some(c => c.yours),
    hidden: f.copies.every(c => !!c.hidden),
  }));
}

/** A goal: a race's target TE (`race:490`) or a date (`date:<unix seconds>`; Egg Day is one). */
export function goalKey(row: Pick<BoardRow, 'deadline' | 'finalTE'>): string {
  return isDeadlineRow(row) ? `date:${row.deadline}` : `race:${row.finalTE}`;
}

/** The best line per goal (My runs' "best first", `compareBest`), in goal order. */
export function bestPerGoal(lines: readonly DashLine[], eggDayAt: number): Map<string, DashLine> {
  const best = new Map<string, DashLine>();
  const sorted = [...lines].sort((a, b) => compareBest(a.row, b.row, eggDayAt));
  for (const l of sorted) {
    const k = goalKey(l.row);
    if (!best.has(k)) best.set(k, l);
  }
  return best;
}

/** A goal still to play for: a date not passed, a race whose target the save hasn't reached (no save: ahead). */
export function goalAhead(row: BoardRow, now: number, teNow: number): boolean {
  if (isDeadlineRow(row)) return (row.deadline as number) * 1000 > now;
  return !(teNow > 0 && teNow >= row.finalTE);
}

// ------------------------------------------------------------------------------------- inputs

/** What this browser keeps, in the few fields the summary reads. */
export interface DashLocal {
  /** Saved answers (By a date): their date and best route. */
  answers: { savedAt: number; deadline: number; chain: number[] | null; spare: number | null }[];
  /** Saved runs (Fastest). */
  runs: { savedAt: number }[];
  /** Results not sent yet; `deadline` for a By a date result. */
  pending: { createdAt: number; deadline: number | null }[];
}

/** Your setup now (store `availability`, `timeOff`) and when it was remembered (`setupRemembered.at`). */
export interface DashSetup {
  availability: Availability | null;
  timeOff: TimeOffDates[];
  rememberedAt: number | null;
}

export interface DashInput {
  /** The viewer's board rows; null while the board's first load is out. */
  rows: readonly BoardRow[] | null;
  now: number;
  eggDayAt: number;
  eggDayYear: number;
  /** The viewer's zone: every date shown is in it. */
  zone: string;
  /** The loaded save's TE, 0 without one. */
  teNow: number;
  setup: DashSetup;
  local: DashLocal;
  /** The simulator this page runs (search/simVersion.ts); a spec may pass another. */
  simVersion?: string;
}

// ------------------------------------------------------------------------------------ actions

/** Where a card's or a step's button goes. */
export type DashAction =
  /** By a date at this deadline (Egg Day: the screen's own Egg Day choice), on a tab, maybe at a level. */
  | { to: 'by-date'; deadline: number; eggDay: boolean; tab: 'nearby' | 'exhaustive'; level?: 'normal' }
  /** Fastest to this target, on a tab, maybe at a level. */
  | { to: 'fastest'; target: number; tab: 'nearby' | 'exhaustive'; level?: 'quick' | 'normal' | 'thorough' }
  | { to: 'unsent' }
  | { to: 'board' };

const LEVELS = ['quick', 'normal', 'thorough'] as const;
type Level = (typeof LEVELS)[number];
const isLevel = (e: unknown): e is Level => LEVELS.includes(e as Level);

/** Run this goal again: its screen, the tab it was found on, and (Fastest) the level it was run at. */
export function rerunAction(row: BoardRow, eggDayAt: number): DashAction {
  if (isDeadlineRow(row)) {
    const deadline = row.deadline as number;
    return {
      to: 'by-date',
      deadline,
      eggDay: deadline === eggDayAt,
      tab: searchMode(row) === 'advanced' ? 'exhaustive' : 'nearby',
    };
  }
  if (row.space) return { to: 'fastest', target: row.finalTE, tab: 'exhaustive' };
  return { to: 'fastest', target: row.finalTE, tab: 'nearby', ...(isLevel(row.effort) ? { level: row.effort } : {}) };
}

/** A By a date row's search, when it says (`mode`, since 9 Oct 2026): Nearby routes or Exhaustive. */
export function searchMode(row: BoardRow): 'simple' | 'advanced' | null {
  const m = (row as { mode?: unknown }).mode;
  return m === 'simple' || m === 'advanced' ? m : null;
}

// -------------------------------------------------------------------------------------- words

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1.5 d", "6.2 h", "40 min" (MyRunsList's own). */
export function spareText(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 3 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}

/** "Oct 14" (and the year when it isn't `now`'s). */
export function dayText(ms: number, zone: string, now: number): string {
  const y = formatDate(ms, zone, { year: 'numeric' });
  const m = Number(formatDate(ms, zone, { month: 'numeric' }));
  const d = formatDate(ms, zone, { day: 'numeric' });
  const sameYear = y === formatDate(now, zone, { year: 'numeric' });
  return `${MONTH[m - 1] ?? ''} ${d}${sameYear ? '' : `, ${y}`}`;
}

/** "9:12 pm", 12-hour. */
export function clockText(ms: number, zone: string): string {
  return formatDate(ms, zone, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** "Race to 490", "Egg Day 2027", "By Nov 1". */
export function goalName(row: BoardRow, eggDayAt: number, eggDayYear: number, zone: string, now: number): string {
  const kind = runKind(row, eggDayAt);
  if (kind === 'eggday') return `Egg Day ${eggDayYear}`;
  if (kind === 'dates') return `By ${dayText((row.deadline as number) * 1000, zone, now)}`;
  return `Race to ${row.finalTE}`;
}

/** A row's hours as Your setup words them: "your hours 9 am to 1 am", "any hour". Null: not said. */
export function rowHoursWords(row: BoardRow): string | null {
  if (row.window === undefined) return null;
  if (!row.window) return 'any hour';
  const a = parseWindow(row.window);
  return a ? hoursWords({ ...a, timezone: a.timezone }) : row.window;
}

// ------------------------------------------------------------------------- hours and simulator

/** Today's date (YYYY-MM-DD) in `zone`, for time off that has ended. */
function ymd(ms: number, zone: string): string {
  const y = formatDate(ms, zone, { year: 'numeric' });
  const m = formatDate(ms, zone, { month: '2-digit' });
  const d = formatDate(ms, zone, { day: '2-digit' });
  return `${y}-${m}-${d}`;
}

/** Time off still to come, as a comparable key. */
function offKey(list: readonly TimeOffDates[] | null | undefined, today: string): string {
  return usableTimeOff(list ? [...list] : [])
    .filter(w => w.to >= today)
    .map(w => `${w.from}..${w.to}`)
    .sort()
    .join(',');
}

/**
 * Whether a run was priced with other hours or time off than Your setup has now: its `window`
 * (describeAvailability of the run's hours, null for any hour) against the same words for now, and the
 * time off still to come. A row that predates `window` is not judged on hours.
 */
export function hoursDiffer(
  row: BoardRow,
  setup: Pick<DashSetup, 'availability' | 'timeOff'>,
  now: number,
  zone: string
): { hours: boolean; timeOff: boolean } {
  const nowWindow = isConstrained(setup.availability) ? describeAvailability(setup.availability) : null;
  const hours = row.window !== undefined && (row.window || null) !== nowWindow;
  const today = ymd(now, zone);
  const timeOff = offKey(row.timeOff, today) !== offKey(setup.timeOff, today);
  return { hours, timeOff };
}

/** 'older': stamped by another simulator; 'likely': no stamp, sent before stamps; null: current or unknown. */
export function simulatorAge(row: BoardRow, current: string = SIM_VERSION): 'older' | 'likely' | null {
  if (typeof row.simVersion === 'string' && row.simVersion) return row.simVersion === current ? null : 'older';
  const at = sentMs(row);
  return at != null && at < SIM_STAMPED_FROM_MS ? 'likely' : null;
}

// --------------------------------------------------------------------------------------- cards

export type CardId = 'eggday' | 'race' | 'date' | 'saved' | 'last' | 'hours';

export interface DashCard {
  id: CardId;
  title: string;
  /** The headline figure, or what to do when there is none. */
  main: string;
  lines: string[];
  /** Shown from a run matched only by timezone and artifacts. */
  maybe?: boolean;
  /** Nothing to show yet. */
  empty?: boolean;
  /** An empty card's button: the same as its Next step. */
  action?: { label: string; to: DashAction };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sentLine(l: DashLine, zone: string, now: number): string {
  const t = sentMs(l.row);
  return t != null ? `sent ${dayText(t, zone, now)}` : 'sent';
}

/** The line that stands for a goal on its card: the best (`compareBest`), sure or not. */
function cardLine(lines: DashLine[], eggDayAt: number): DashLine | null {
  const sorted = [...lines].sort((a, b) => compareBest(a.row, b.row, eggDayAt));
  return sorted[0] ?? null;
}

export function buildCards(input: DashInput): DashCard[] {
  const { now, eggDayAt, eggDayYear, zone } = input;
  const lines = dashLines(input.rows ?? []);
  const kindOf = (l: DashLine): RunKind => runKind(l.row, eggDayAt);
  const loading = input.rows == null;
  const cards: DashCard[] = [];

  // Egg Day: the best sent answer (one that makes the date first), else the best saved one.
  const egg = cardLine(
    lines.filter(l => kindOf(l) === 'eggday'),
    eggDayAt
  );
  const eggTitle = `Egg Day ${eggDayYear}`;
  if (egg) {
    const made = madeDeadline(egg.row);
    cards.push({
      id: 'eggday',
      title: eggTitle,
      main: made ? `${egg.row.finalTE} TE` : `${egg.row.finalTE} TE, misses the date`,
      lines: [
        ...(made ? [`${spareText(deadlineSpare(egg.row))} spare`] : []),
        egg.row.chain.join(' '),
        sentLine(egg, zone, now),
      ],
      ...(egg.maybe ? { maybe: true } : {}),
    });
  } else {
    const saved = input.local.answers
      .filter(a => a.deadline === eggDayAt && a.chain?.length)
      .sort((a, b) => last(b.chain) - last(a.chain) || (b.spare ?? 0) - (a.spare ?? 0))[0];
    if (saved?.chain)
      cards.push({
        id: 'eggday',
        title: eggTitle,
        main: `${last(saved.chain)} TE`,
        lines: [
          ...(saved.spare != null ? [`${spareText(saved.spare)} spare`] : []),
          saved.chain.join(' '),
          'saved, not sent',
        ],
      });
    else
      cards.push({
        id: 'eggday',
        title: eggTitle,
        main: loading ? 'Loading…' : 'None yet',
        lines: [],
        empty: true,
        ...(loading ? {} : { action: { label: 'Find it', to: eggDayAction(eggDayAt) } }),
      });
  }

  // The race to 490: the earliest finish.
  const race = cardLine(
    lines.filter(l => kindOf(l) === 'race' && l.row.finalTE === 490),
    eggDayAt
  );
  if (race) {
    cards.push({
      id: 'race',
      title: 'Race to 490',
      main: (() => {
        const f = finishMs(race.row);
        return f != null ? dayText(f, zone, now) : '—';
      })(),
      lines: [plural(race.row.chain.length, 'ascension'), race.row.chain.join(' '), sentLine(race, zone, now)],
      ...(race.maybe ? { maybe: true } : {}),
    });
  } else {
    cards.push({
      id: 'race',
      title: 'Race to 490',
      main: loading ? 'Loading…' : 'None yet',
      lines: [],
      empty: true,
      ...(loading ? {} : { action: { label: 'Find it', to: { to: 'fastest', target: 490, tab: 'nearby' } } }),
    });
  }

  // The soonest other date still ahead: its best answer.
  const ahead = lines.filter(l => kindOf(l) === 'dates' && (l.row.deadline as number) * 1000 > now);
  const soonest = ahead.length ? Math.min(...ahead.map(l => l.row.deadline as number)) : null;
  const date =
    soonest != null
      ? cardLine(
          ahead.filter(l => l.row.deadline === soonest),
          eggDayAt
        )
      : null;
  if (date) {
    cards.push({
      id: 'date',
      title: goalName(date.row, eggDayAt, eggDayYear, zone, now),
      main: madeDeadline(date.row) ? `${date.row.finalTE} TE` : `${date.row.finalTE} TE, misses the date`,
      lines: [
        ...(madeDeadline(date.row) ? [`${spareText(deadlineSpare(date.row))} spare`] : []),
        date.row.chain.join(' '),
        sentLine(date, zone, now),
      ],
      ...(date.maybe ? { maybe: true } : {}),
    });
  } else {
    cards.push({
      id: 'date',
      title: 'By a date',
      main: loading ? 'Loading…' : 'No other date ahead',
      lines: [],
      empty: true,
    });
  }

  // Saved on this computer.
  const { answers, runs, pending } = input.local;
  cards.push({
    id: 'saved',
    title: 'Saved',
    main: `${plural(answers.length, 'answer')}, ${plural(runs.length, 'run')}`,
    lines: pending.length ? [`${plural(pending.length, 'result')} not sent`] : [],
    ...(answers.length + runs.length ? {} : { empty: true }),
  });

  // The newest of sent, saved and kept.
  const events: { at: number; what: string; maybe?: boolean }[] = [
    // The newest copy's send, not the line's: a result sent again (the same route from the same start) is
    // a run too, and the line stands on its biggest search, which may be an older copy.
    ...lines.flatMap(l => {
      const t = lastSentMs(l.copies);
      return t != null ? [{ at: t, what: 'sent', maybe: l.maybe }] : [];
    }),
    ...answers.map(a => ({ at: a.savedAt, what: 'answer saved' })),
    ...runs.map(r => ({ at: r.savedAt, what: 'run saved' })),
    ...pending.map(p => ({ at: p.createdAt, what: 'not sent yet' })),
  ].filter(e => Number.isFinite(e.at) && e.at > 0);
  const newest = events.sort((a, b) => b.at - a.at)[0];
  cards.push(
    newest
      ? {
          id: 'last',
          title: 'Last run',
          main: dayText(newest.at, zone, now),
          lines: [clockText(newest.at, zone), newest.what],
          ...(newest.maybe ? { maybe: true } : {}),
        }
      : { id: 'last', title: 'Last run', main: loading ? 'Loading…' : 'None yet', lines: [], empty: true }
  );

  // Your hours, as Your setup has them now.
  const words = hoursWords(input.setup.availability);
  const at = input.setup.rememberedAt;
  cards.push({
    id: 'hours',
    title: 'Your hours',
    main: words === 'any hour' ? 'Any hour' : capital(words.replace(/^your hours /, '')),
    lines: [timeOffWords(input.setup.timeOff), ...(at ? [`remembered ${dayText(at, zone, now)}`] : [])],
  });

  return cards;
}

const last = (c: number[] | null): number => (c?.length ? c[c.length - 1] : 0);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function eggDayAction(eggDayAt: number): DashAction {
  return { to: 'by-date', deadline: eggDayAt, eggDay: true, tab: 'nearby' };
}

// --------------------------------------------------------------------------------------- steps

export type StepKind = 'eggday' | 'hours' | 'simulator' | 'moved' | 'exact' | 'unsent' | 'hidden';

export interface DashStep {
  /** Stable per item (a goal's steps share their goal). */
  id: string;
  /** What raised it; a goal's "run again" item can have several. */
  kinds: StepKind[];
  /** The item: "Race to 490 was priced with any hour". */
  text: string;
  /** One line on why. */
  reason: string;
  /** Its one button. */
  button: string;
  action: DashAction;
  /** Information rather than something to fix (hidden runs). */
  info?: boolean;
}

export interface DashSteps {
  /** The board's first load is still out: board-based steps wait. */
  loading: boolean;
  /** Nothing on the board, saved or kept at all. */
  noRuns: boolean;
  steps: DashStep[];
}

export function buildSteps(input: DashInput): DashSteps {
  const { now, eggDayAt, eggDayYear, zone, teNow, setup } = input;
  const current = input.simVersion ?? SIM_VERSION;
  const loading = input.rows == null;
  const lines = dashLines(input.rows ?? []);
  const { answers, runs, pending } = input.local;
  const noRuns = !loading && !lines.length && !answers.length && !runs.length && !pending.length;
  const steps: DashStep[] = [];

  // 1. No Egg Day run: none on the board (sure or not), saved or waiting to send.
  if (!loading) {
    const hasEgg =
      lines.some(l => runKind(l.row, eggDayAt) === 'eggday') ||
      answers.some(a => a.deadline === eggDayAt) ||
      pending.some(p => p.deadline === eggDayAt);
    if (!hasEgg)
      steps.push({
        id: 'eggday',
        kinds: ['eggday'],
        text: `No Egg Day ${eggDayYear} run yet`,
        reason: 'Nothing sent, saved or waiting to send for 14 July, 9 am Pacific.',
        button: 'Find my Egg Day answer',
        action: eggDayAction(eggDayAt),
      });
  }

  // 2-4. Per goal still ahead, on its best SURE run: run it again.
  const sure = lines.filter(l => !l.maybe);
  const best = bestPerGoal(sure, eggDayAt);
  const rerun: DashStep[] = [];
  const exact: DashStep[] = [];
  for (const [key, l] of best) {
    const row = l.row;
    if (!goalAhead(row, now, teNow)) continue;
    const name = goalName(row, eggDayAt, eggDayYear, zone, now);
    const kinds: StepKind[] = [];
    const why: string[] = [];
    let text = '';

    const sim = simulatorAge(row, current);
    if (sim) {
      kinds.push('simulator');
      text ||= `${name}: ${sim === 'older' ? 'priced by an older simulator' : 'likely priced by an older simulator'}`;
      why.push(
        sim === 'older'
          ? 'The simulator has changed since; its numbers may move.'
          : 'Sent before 13 Oct, when the simulator last changed.'
      );
    }

    const diff = hoursDiffer(row, setup, now, zone);
    if (diff.hours || diff.timeOff) {
      kinds.push('hours');
      const was = rowHoursWords(row) ?? 'other hours';
      const nowWords = hoursWords(setup.availability);
      text ||= diff.hours ? `${name} was priced with ${was}` : `${name} was priced with other time off`;
      why.push(
        diff.hours
          ? `Your setup has ${nowWords === 'any hour' ? 'any hour' : nowWords} now.`
          : `Your setup has ${timeOffWords(setup.timeOff)} now.`
      );
    }

    const te = row.backupTE ?? row.currentTE;
    const sent = sentMs(row);
    const teMoved = teNow > 0 && typeof te === 'number' && teNow > te;
    const old = sent != null && now - sent > STALE_AFTER_MS;
    if (teMoved || old) {
      kinds.push('moved');
      if (teMoved) {
        text ||= `${name}: your save moved on`;
        why.push(`Your TE went ${te} → ${teNow} since this run.`);
      } else {
        text ||= `${name}: sent ${Math.floor((now - (sent as number)) / DAY_MS)} days ago`;
        why.push('Your save has moved on since; run it again from where you are.');
      }
    }

    if (kinds.length)
      rerun.push({
        id: `rerun:${key}`,
        kinds,
        text,
        reason: why.join(' '),
        button: kinds.includes('hours') ? 'Rerun with my hours' : 'Run again',
        action: rerunAction(row, eggDayAt),
      });

    // 6. Never at Exact (a race), never Exhaustive (a date), over every sure run to the goal.
    const goalLines = sure.filter(x => goalKey(x.row) === key);
    if (!isDeadlineRow(row)) {
      if (goalLines.every(x => !x.copies.some(c => c.space) && x.copies.every(c => c.effort === 'quick')))
        exact.push({
          id: `exact:${key}`,
          kinds: ['exact'],
          text: `${name}: only Fast so far, never Exact`,
          reason: 'Exact also moves neighbouring stops in pairs and tries one ascension more or fewer.',
          button: 'Run at Exact',
          action: { to: 'fastest', target: row.finalTE, tab: 'nearby', level: 'normal' },
        });
    } else if (goalLines.every(x => x.copies.every(c => searchMode(c) === 'simple'))) {
      exact.push({
        id: `exact:${key}`,
        kinds: ['exact'],
        text: `${name}: Nearby routes only, never Exhaustive`,
        reason: 'Exhaustive prices every route in the boxes you set, not only those near the instant answer.',
        button: 'Try Exhaustive',
        action: {
          to: 'by-date',
          deadline: row.deadline as number,
          eggDay: row.deadline === eggDayAt,
          tab: 'exhaustive',
        },
      });
    }
  }
  steps.push(...rerun, ...exact);

  // 7. Results kept, not sent.
  if (pending.length)
    steps.push({
      id: 'unsent',
      kinds: ['unsent'],
      text: `${plural(pending.length, 'result')} not sent`,
      reason: 'Kept in this browser; send each one so it counts on the board.',
      button: 'Show me',
      action: { to: 'unsent' },
    });

  // 8. Hidden from the public: information.
  const hidden = lines.filter(l => l.hidden).length;
  if (hidden)
    steps.push({
      id: 'hidden',
      kinds: ['hidden'],
      text: `${plural(hidden, 'run')} hidden from the public`,
      reason: 'Only you and the planner’s maintainer see them. Open one to show it again.',
      button: 'See them',
      action: { to: 'board' },
      info: true,
    });

  return { loading, noRuns, steps };
}

// ------------------------------------------------------------------------- opening a screen

/** What My runs asks App.vue (`openFromMyRuns`) to open: the Auto Planner screen, and for a Next step its
 *  setup: the search tab, the Stronger check level, Fastest's target, By a date's deadline (lib/byDateForm.ts). */
export interface MyRunsOpen {
  auto: AutoView;
  depth?: Depth;
  tab?: SearchTabId;
  level?: StrongerLevel;
  target?: number;
  byDate?: ByDatePresetAsk;
}

/** A screen action as App opens it. `zone`: the planner's, for a date other than Egg Day. */
export function openFor(a: Extract<DashAction, { to: 'by-date' | 'fastest' }>, zone: string): MyRunsOpen {
  if (a.to === 'by-date')
    return {
      auto: 'by-date',
      tab: a.tab,
      byDate: a.eggDay ? { eggDay: true } : { deadline: a.deadline, zone },
      ...(a.level ? { level: a.level } : {}),
    };
  return {
    auto: 'fastest',
    depth: a.tab === 'exhaustive' ? 'full' : 'smart',
    tab: a.tab,
    target: a.target,
    ...(a.level ? { level: a.level } : {}),
  };
}
