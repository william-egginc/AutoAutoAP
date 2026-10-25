/**
 * My runs' Next steps (#/myruns; reworked 24 Oct 2026, Jordan: "plans don't change that much", the old list repeated
 * Right now and nagged about things that don't move the answer). ONLY what changes what the player should do, each
 * with one action:
 *
 *   beaten    a route the player follows that a priced result of this save (Fast, Exact or Custom) beats by about a
 *             day or more (By a date: more TE, or the same TE about a day sooner)       -> Right now, on that goal
 *   prestige  time off or a no-prestige day that lands on a prestige of the followed route, by the route's priced
 *             times (the kept result, or Right now's estimate, lib/followEstimate.ts)  -> the goal's screen, Fast
 *   save      the save is more than about 3 days old                                     -> load a fresh one
 *   unsent    results kept in this browser, not sent                                     -> scroll to Not sent yet
 *
 * Gone (24 Oct 2026): "No Egg Day run yet", "priced by an older simulator", "priced with other hours / time off" (a
 * difference that may not move the answer: when it can't be told, no nag; time off that does land on the route is the
 * `prestige` item), "your save moved on", "only Fast so far", hidden runs, and the six cards above the list.
 * Pure: the components only render (components/myruns/DashboardGaps.vue).
 *
 * Also here: the words and checks other My runs parts share (a board row's goal and hours, `hoursDiffer`,
 * `simulatorAge`) and opening a screen (`openFor`).
 */
import { formatDate, isDeadlineRow, sentMs, type BoardRow } from './leaderboardRank';
import { runKind } from './myRuns';
import { parseWindow } from './planFilters';
import { hoursWords } from './pricedWith';
import { dateAt } from './eventWhen';
import { SIM_VERSION } from '@/search/simVersion';
import type { AutoView, Depth } from './siteNav';
import type { SearchTabId } from './searchTab';
import type { ByDatePresetAsk } from './byDateForm';
import type { StrongerLevel } from '@/stores/stronger';
import { describeAvailability, isConstrained, type Availability } from '@/search/availabilitySchedule';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';

const DAY = 86_400;
/** The simulator stamp rides on rows since this day (13 Oct 2026): an unstamped row sent before it was
 *  priced by an older simulator, likely; one sent after it is not judged. */
export const SIM_STAMPED_FROM_MS = Date.UTC(2026, 9, 13);
/** Next steps shown before "n more". */
export const STEPS_SHOWN = 5;
/** "About a day": a priced result that lands this much sooner than the followed route is worth switching to. */
export const BEATS_SECONDS = 20 * 3600;
/** "More than about 3 days old": a save this old is worth loading again. */
export const SAVE_OLD_SECONDS = 3 * DAY;

/** A goal: a race's target TE (`race:490`) or a date (`date:<unix seconds>`; Egg Day is one). */
export function goalKey(row: Pick<BoardRow, 'deadline' | 'finalTE'>): string {
  return isDeadlineRow(row) ? `date:${row.deadline}` : `race:${row.finalTE}`;
}

// ------------------------------------------------------------------------------------- inputs

/** Your setup now (store `availability`, `timeOff`) and when it was remembered (`setupRemembered.at`). */
export interface DashSetup {
  availability: Availability | null;
  timeOff: TimeOffDates[];
  rememberedAt: number | null;
}

// ------------------------------------------------------------------------------------ actions

/** Where a step's button goes. */
export type DashAction =
  /** By a date at this deadline (Egg Day: the screen's own Egg Day choice), on a tab, maybe at a level. */
  | { to: 'by-date'; deadline: number; eggDay: boolean; tab: 'nearby' | 'exhaustive'; level?: 'normal' }
  /** Fastest to this target, on a tab, maybe at a level. */
  | { to: 'fastest'; target: number; tab: 'nearby' | 'exhaustive'; level?: 'quick' | 'normal' | 'thorough' }
  /** Right now, on this goal (its key, lib/planGoals.ts). */
  | { to: 'right-now'; goalKey: string }
  /** Load a fresh save. */
  | { to: 'fresh' }
  | { to: 'unsent' };

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

// --------------------------------------------------------------------------------------- steps

export type StepKind = 'beaten' | 'prestige' | 'save' | 'unsent';

export interface DashStep {
  /** Stable per item. */
  id: string;
  kinds: StepKind[];
  /** The item: "Egg Day 2027: your Fast run beats the route you follow". */
  text: string;
  /** One line on why. */
  reason: string;
  /** Its one button. */
  button: string;
  action: DashAction;
}

export interface DashSteps {
  steps: DashStep[];
}

/** A finish: when the last stop is reached (unix seconds) and the TE then. */
export interface StepFinish {
  end: number;
  endTE: number;
}

/** A goal's followed route, as Next steps reads it (composables/useNowPage.ts `followsForSteps`). */
export interface FollowedForSteps {
  goalKey: string;
  /** "Race to 490", "Egg Day 2027", "By Feb 10, 2027". */
  name: string;
  goal: 'fastest' | 'date';
  target: number;
  deadline: number | null;
  eggDay: boolean;
  chain: number[];
  /** Its priced finish; null when it has none (then nothing is said about it beating or being beaten). */
  finish: StepFinish | null;
  /** Its prestiges still ahead, by its priced times (unix seconds) and the TE of each. */
  prestiges: { at: number; te: number }[];
  /** This save's Fast, Exact or Custom result for the goal, when it is another route. */
  result: (StepFinish & { level: 'Fast' | 'Exact' | 'Custom'; chain: number[] }) | null;
}

/** A stretch the player can't prestige in (time off, a no-prestige day), absolute, with its words. */
export interface StepWindow {
  from: number;
  to: number;
  /** "your time off Oct 26–27", "your no-prestige days Nov 2–3". */
  words: string;
  kind: 'time off' | 'no-prestige day';
}

export interface StepsInput {
  /** Unix seconds. */
  now: number;
  zone: string;
  /** Results kept in this browser, not sent. */
  pending: number;
  /** The loaded save's time, unix seconds (0: none). */
  saveSeconds: number;
  follows: readonly FollowedForSteps[];
  windows: readonly StepWindow[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "20 h", "1.5 days": how much sooner. */
function soonerWords(seconds: number): string {
  return seconds < 2 * DAY ? `${Math.round(seconds / 3600)} h` : `${(seconds / DAY).toFixed(1)} days`;
}

/**
 * Whether a priced result beats the followed route by enough to change what to do: Fastest, it lands about a day
 * (`BEATS_SECONDS`) or more sooner; By a date, it reaches more TE, or the same TE about a day sooner.
 */
export function beatsFollowed(goal: 'fastest' | 'date', result: StepFinish, followed: StepFinish): boolean {
  if (goal === 'date' && result.endTE !== followed.endTE) return result.endTE > followed.endTE;
  return followed.end - result.end >= BEATS_SECONDS;
}

/** The goal's screen at Fast (a race) or Nearby routes (a date): a route worked out around the days. */
function goalAction(f: FollowedForSteps): DashAction {
  if (f.goal === 'date' && f.deadline) return { to: 'by-date', deadline: f.deadline, eggDay: f.eggDay, tab: 'nearby' };
  return { to: 'fastest', target: f.target, tab: 'nearby', level: 'quick' };
}

export function buildSteps(i: StepsInput): DashSteps {
  const steps: DashStep[] = [];
  const when = (t: number) => dateAt(t, i.now, i.zone);

  for (const f of i.follows) {
    // 1. A priced result of this save beats the followed route by about a day or more.
    const r = f.result;
    if (r && f.finish && r.chain.join(',') !== f.chain.join(',') && beatsFollowed(f.goal, r, f.finish)) {
      const sooner = soonerWords(Math.max(0, f.finish.end - r.end));
      steps.push({
        id: `beaten:${f.goalKey}`,
        kinds: ['beaten'],
        text: `${f.name}: your ${r.level} run beats the route you follow`,
        reason:
          f.goal === 'date' && r.endTE !== f.finish.endTE
            ? `It reaches ${r.endTE} TE by the date (${r.chain.join(' ')}); the route you follow, ${f.finish.endTE} TE.`
            : `It gets there ${sooner} sooner (${r.chain.join(' ')}, ${when(r.end)}) than the route you follow.`,
        button: 'Show me',
        action: { to: 'right-now', goalKey: f.goalKey },
      });
    }
    // 2. Time off or a no-prestige day on one of its prestiges (its priced times): the first one.
    for (const p of f.prestiges) {
      if (p.at <= i.now) continue;
      const w = i.windows.find(x => p.at >= x.from && p.at < x.to);
      if (!w) continue;
      steps.push({
        id: `prestige:${f.goalKey}`,
        kinds: ['prestige'],
        text: `${f.name}: a prestige of your route lands ${w.kind === 'time off' ? 'in your time off' : 'on a no-prestige day'}`,
        reason: `It prestiges at ${p.te} TE ${when(p.at)}, inside ${w.words}. Run Fast for a route that works around it.`,
        button: 'Run Fast',
        action: goalAction(f),
      });
      break;
    }
  }

  // 3. The save is more than about 3 days old.
  const age = i.saveSeconds > 0 ? i.now - i.saveSeconds : 0;
  if (age > SAVE_OLD_SECONDS)
    steps.push({
      id: 'save',
      kinds: ['save'],
      text: `Your save is ${plural(Math.floor(age / DAY), 'day')} old`,
      reason: 'Every plan on this page starts from it. Load a fresh one so your next step starts from where you are.',
      button: 'Load a fresh one',
      action: { to: 'fresh' },
    });

  // 4. Results kept, not sent.
  if (i.pending > 0)
    steps.push({
      id: 'unsent',
      kinds: ['unsent'],
      text: `${plural(i.pending, 'result')} not sent`,
      reason: 'Kept in this browser; send each one so it counts on the board.',
      button: 'Show me',
      action: { to: 'unsent' },
    });

  return { steps };
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
