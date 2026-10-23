/**
 * Which saved answer is "the" answer for the loaded save (fix 22, beta 16 Oct): ONE rule for My runs' Right now
 * card and its two tiles, so they cannot disagree. Jordan changed his hours (any hour -> 7 am to 1 am) between two
 * Check exactly runs of the same save: Right now showed the 11:59 pm plan (his hours, 6 ascensions) and the
 * Fastest tile the 11:51 pm one (any hour, 7 ascensions, sooner), and read it as "same save, two answers".
 *
 * The rule, in order:
 *   0. By a date (Egg Day too): only an answer whose last TE counts by the date (lib/eggDayRule.ts, Jordan 22 Oct
 *      2026); a late one is never the pick, whatever it reaches;
 *   1. an answer of the loaded save (or of one at most CURRENT_SAVE_SECONDS older, fix 21) before any other;
 *   2. an answer priced with the CURRENT setup (hours and time off as Your setup has them now) before one priced
 *      with other hours or with hours not recorded, EVEN IF that one finishes sooner;
 *   3. (current saves) checked or searched before the instant answer's table alone;
 *   4. the goal's quality: Fastest the soonest finish; By a date the most TE, then the most time to spare;
 *   5. on a tie, the plan Right now can show (a kept snapshot), then the stronger pricing, then the newest.
 * Answers from an older save rank by the setup, then the newest. An answer priced with other hours is shown only
 * as the SECONDARY line ("with any hour (before your hours changed)"), and only when it beats the lead.
 *
 * "Priced with the current setup", per source (lib/savedTiles.ts builds the candidates):
 *   snapshot under this save's key, last checked answer   yes: the key hashes the hours and time off
 *   snapshot from the index (another key)                 its `meta.setup` (written since fix 22), else unknown
 *   Check exactly's history                               the entry's `setup` (since fix 22), else unknown
 *   board row                                             its `window` and `timeOff` (no `window`: unknown)
 *   saved By a date answer                                its `result.settings`, else unknown
 * Hours are compared as describeAvailability words (the board's `window`), time off as the dates still to come
 * (as myRunsDashboard `hoursDiffer` does). Pure.
 */
import { describeAvailability, isConstrained, type Availability } from '@/search/availabilitySchedule';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import { hoursShort, pricedWithLine, timeOffWords } from './pricedWith';
import { parseWindow } from './planFilters';
import { finishesBefore } from './eggDayRule';
import type { NowPlan } from './nowPlan';
import type { Driving } from './searchPlan';

/** Two save times this close are the same save. */
export const SAME_SAVE_SECONDS = 10 * 60;
/** An answer from a save at most this much older than the loaded one is current (fix 21). */
export const CURRENT_SAVE_SECONDS = 2 * 3600;

/** The hours and time off an answer was priced with. */
export interface PricedSetup {
  availability: Availability | null;
  timeOff: TimeOffDates[];
}

export type SetupFit = 'current' | 'other' | 'unknown';

export interface SetupCheck {
  fit: SetupFit;
  /** The hours differ (fit 'other'). */
  hours: boolean;
  /** The time off still to come differs (fit 'other'). */
  timeOff: boolean;
  /** What it was priced with; null when not recorded. */
  recorded: PricedSetup | null;
}

/** "2026-10-16" in `zone` (the planner's): time off before it no longer matters. */
export function todayIn(ms: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const windowOf = (a: Availability | null | undefined) => (isConstrained(a) ? describeAvailability(a) : null);
const offKey = (list: readonly TimeOffDates[] | null | undefined, today: string) =>
  usableTimeOff(list ? [...list] : [])
    .filter(w => w.to >= today)
    .map(w => `${w.from}..${w.to}`)
    .sort()
    .join(',');

/** An answer's recorded setup against Your setup now. */
export function setupCheck(recorded: PricedSetup | null | undefined, now: PricedSetup, today: string): SetupCheck {
  if (!recorded) return { fit: 'unknown', hours: false, timeOff: false, recorded: null };
  const hours = windowOf(recorded.availability) !== windowOf(now.availability);
  const timeOff = offKey(recorded.timeOff, today) !== offKey(now.timeOff, today);
  return { fit: hours || timeOff ? 'other' : 'current', hours, timeOff, recorded };
}

/** Priced with the current setup by construction (the instant answer's key holds it). */
export function currentSetup(now: PricedSetup): SetupCheck {
  return { fit: 'current', hours: false, timeOff: false, recorded: now };
}

/** A board row's recorded setup: its `window` (describeAvailability words, null for any hour) and time off.
 *  Null for a row sent before `window` was kept, or one whose words can't be read back. */
export function rowSetup(row: { window?: string | null; timeOff?: TimeOffDates[] }): PricedSetup | null {
  if (row.window === undefined) return null;
  if (row.window === null || row.window === '') return { availability: null, timeOff: row.timeOff ?? [] };
  const a = parseWindow(row.window);
  return a ? { availability: a, timeOff: row.timeOff ?? [] } : null;
}

/**
 * The secondary line's label for an answer priced with another setup: "with any hour (before your hours changed)",
 * "with 9 am–1 am (before your hours changed)", "with no time off (before your time off changed)", or "with other
 * hours" when what it was priced with was not recorded. '' for the current setup.
 */
export function otherSetupLabel(c: SetupCheck): string {
  if (c.fit === 'current') return '';
  const r = c.recorded;
  if (!r) return 'with other hours';
  if (c.hours)
    return `with ${hoursShort(r.availability)}${c.timeOff ? `, ${timeOffWords(r.timeOff)}` : ''} (before your hours changed)`;
  return `with ${timeOffWords(r.timeOff)} (before your time off changed)`;
}

/** Right now's header words: "priced with your hours 7 am to 1 am, no time off", "priced with other hours". */
export function pricedWithWords(c: SetupCheck): string {
  if (!c.recorded) return 'priced with other hours';
  const line = pricedWithLine(c.recorded);
  return line.charAt(0).toLowerCase() + line.slice(1);
}

/**
 * The secondary line, the same on the card and the tile: "With any hour (before your hours changed): 7 ascensions,
 * 490 TE on Sep 17, 2028" (Fastest) or "With other hours: 312 TE, 1.5 days spare" (By a date). `when` formats a unix
 * time (the caller's zone).
 */
export function secondaryLine(
  label: string,
  a: { goal: 'fastest' | 'date'; chain: readonly number[]; end: number; endTE: number; spareHours: number | null },
  when: (unix: number) => string
): string {
  const head = label.charAt(0).toUpperCase() + label.slice(1);
  if (a.goal === 'date') {
    const spare = a.spareHours == null ? '' : `, ${a.spareHours >= 48 ? `${(a.spareHours / 24).toFixed(1)} days` : `${a.spareHours.toFixed(1)} h`} spare`;
    return `${head}: ${a.endTE} TE${spare}`;
  }
  const n = a.chain.length;
  return `${head}: ${n} ascension${n === 1 ? '' : 's'}, ${a.endTE} TE on ${when(a.end)}`;
}

// ------------------------------------------------------------------------------------------- ranking

/** What the ranking reads of an answer (a tile's TileAnswer, a card's snapshot candidate). */
export interface Rankable {
  /** Of the loaded save, or of one at most CURRENT_SAVE_SECONDS older (or newer). */
  currentSave: boolean;
  fit: SetupFit;
  how: 'instant' | 'check' | 'search';
  /** Fastest: the finish; By a date: the last stop. Unix seconds. */
  end: number;
  endTE: number;
  spareHours: number | null;
  calculatedAt: number;
  /** A plan Right now can show (a kept snapshot): it leads a tie, so the card and the tile name the same one. */
  plan?: boolean;
}

/** Whether an answer's save is current against the loaded one (`ownKey`: under this save's own key). */
export function isCurrentSave(saveSeconds: number | null, loaded: number | null, ownKey = false): boolean {
  return ownKey || (loaded != null && saveSeconds != null && saveSeconds >= loaded - CURRENT_SAVE_SECONDS);
}

/** The goal's own measure only: negative when `a` is better. */
export function quality(goal: 'fastest' | 'date') {
  return (a: Rankable, b: Rankable) =>
    goal === 'date' ? b.endTE - a.endTE || (b.spareHours ?? 0) - (a.spareHours ?? 0) : a.end - b.end;
}

const strength = (a: Rankable) => (a.how === 'search' ? 2 : a.how === 'check' ? 1 : 0);

/** The whole rule (see the top): negative when `a` ranks first. */
export function compareAnswers(goal: 'fastest' | 'date') {
  const q = quality(goal);
  return (a: Rankable, b: Rankable): number => {
    if (a.currentSave !== b.currentSave) return a.currentSave ? -1 : 1;
    const fit = (x: Rankable) => (x.fit === 'current' ? 0 : 1);
    if (fit(a) !== fit(b)) return fit(a) - fit(b);
    if (!a.currentSave) return b.calculatedAt - a.calculatedAt;
    const priced = (x: Rankable) => (x.how === 'instant' ? 1 : 0);
    return (
      priced(a) - priced(b) ||
      q(a, b) ||
      (b.plan ? 1 : 0) - (a.plan ? 1 : 0) ||
      strength(b) - strength(a) ||
      b.calculatedAt - a.calculatedAt
    );
  };
}

/**
 * The lead answer and, when it is priced with the current setup, the best answer of a current save priced with
 * OTHER (or unrecorded) hours, as the secondary line, only when it beats the lead on the goal's own measure.
 */
export function pickAnswer<T extends Rankable>(list: readonly T[], goal: 'fastest' | 'date'): { lead: T | null; secondary: T | null } {
  const sorted = [...list].sort(compareAnswers(goal));
  const lead = sorted[0] ?? null;
  if (!lead || !lead.currentSave || lead.fit !== 'current') return { lead, secondary: null };
  const q = quality(goal);
  const secondary = sorted.find(a => a.currentSave && a.fit !== 'current' && a.how !== 'instant' && q(a, lead) < 0) ?? null;
  return { lead, secondary };
}

// ---------------------------------------------------------------------------------------- the card

/** A kept snapshot Right now could show. */
export interface CardCandidate {
  plan: NowPlan;
  /** Which goal it is for (its place in My runs' goal list): candidates of one goal are ranked together; across
   *  goals the place is only the last tie-break (`pickCardPlan`). */
  goalIndex: number;
  /** lib/planGoals.ts's key for the goal ('fastest-490', 'eggday-2027', 'date-<unix>'), when known. */
  goalKey?: string;
  /** Under this save's own key (this save, this setup). */
  ownKey: boolean;
  check: SetupCheck;
  /** The goal's instant plan and search result from the same snapshot, and which drives (lib/searchPlan.ts). */
  driving?: Driving;
}

export interface CardPick {
  candidate: CardCandidate;
  state: 'this-save' | 'setup-changed' | 'older-save';
  /** The same goal's better answer priced with other hours, for the secondary line. */
  secondary: CardCandidate | null;
}

const rankableOf = (c: CardCandidate, loaded: number): Rankable => ({
  currentSave: isCurrentSave(c.plan.meta?.backupTime ?? null, loaded, c.ownKey),
  fit: c.check.fit,
  how: c.plan.exact ? 'check' : 'instant',
  end: c.plan.end,
  endTE: c.plan.endTE,
  spareHours: c.plan.spareHours,
  calculatedAt: c.plan.calculatedAt,
  plan: true,
});

/** A candidate's tier: 0 current save and setup, 1 current save other setup, 2 and 3 the same for an older save. */
export function cardTier(c: CardCandidate, loadedSave: number): number {
  const r = rankableOf(c, loadedSave);
  return (r.currentSave ? 0 : 2) + (r.fit === 'current' ? 0 : 1);
}

/** What the goals are ordered by when nothing is chosen: the tier of the goal's lead (`cardTier`, 4 with no plan),
 *  then the goal checked LAST (`lastAt`, ms: its newest calculated time), then the goal's place in the list. */
export interface GoalOrder {
  tier: number;
  lastAt: number;
  order: number;
}

/** Negative when goal `a` is the default before `b` (Jordan, 16 Oct: the goal last checked, not a fixed order). */
export function compareGoals(a: GoalOrder, b: GoalOrder): number {
  return a.tier - b.tier || b.lastAt - a.lastAt || a.order - b.order;
}

/** The newest calculated time of a goal's plans of the loaded save (any save when it has none of it), ms. */
export function newestPlanAt(list: readonly CardCandidate[], loadedSave: number): number {
  const current = list.filter(c => rankableOf(c, loadedSave).currentSave);
  return Math.max(0, ...(current.length ? current : list).map(c => c.plan.calculatedAt));
}

/** When a plan's last TE counts: its time on the account when Check exactly found it late (`accountEnd`), else its end. */
export function planFinish(p: Pick<NowPlan, 'end' | 'accountEnd'>): number {
  return p.accountEnd ?? p.end;
}

/** A By a date plan that counts for its date (lib/eggDayRule.ts); a Fastest plan always does. */
export function planInTime(p: Pick<NowPlan, 'goal' | 'deadline' | 'end' | 'accountEnd'>): boolean {
  return p.goal !== 'date' || p.deadline == null || finishesBefore(planFinish(p), p.deadline);
}

/**
 * One goal's plan: the same rule as the tiles (`compareAnswers`), its state and its secondary line. By a date (Egg
 * Day too) only a plan in time can be the pick (lib/eggDayRule.ts): null when every plan lands late. `anyTime`: the
 * player's own followed route (lib/followPrice.ts), priced late or not and marked so on the card.
 */
export function pickGoalPlan(all: readonly CardCandidate[], loadedSave: number, opts: { anyTime?: boolean } = {}): CardPick | null {
  const list = opts.anyTime ? all : all.filter(c => planInTime(c.plan));
  if (!list.length) return null;
  const r = new Map(list.map(c => [c, rankableOf(c, loadedSave)]));
  const sorted = [...list].sort((a, b) => compareAnswers(a.plan.goal)(r.get(a)!, r.get(b)!));
  const lead = sorted[0];
  const bt = lead.plan.meta?.backupTime ?? null;
  const state = lead.ownKey
    ? 'this-save'
    : bt != null && Math.abs(bt - loadedSave) <= 60
      ? 'setup-changed'
      : bt != null && bt < loadedSave - 60
        ? 'older-save'
        : 'setup-changed';
  const { secondary } = pickAnswer(
    list.map(c => ({ ...r.get(c)!, c })),
    lead.plan.goal
  );
  return { candidate: lead, state, secondary: secondary && secondary.c !== lead ? secondary.c : null };
}

/**
 * Right now's default plan over every goal: each goal's lead by the same rule as the tiles (`pickGoalPlan`), then
 * the goals by the save tier and the setup of their lead (as before), then the goal the player checked LAST
 * (the newest calculated time of its plans), then the goal order. The fixed order Fastest 490 > own target > Egg
 * Day is now only the last tie-break. My runs lets the player pick another goal (lib/planGoals.ts).
 */
export function pickCardPlan(list: readonly CardCandidate[], loadedSave: number): CardPick | null {
  if (!list.length) return null;
  const groups = new Map<number, CardCandidate[]>();
  for (const c of list) groups.set(c.goalIndex, [...(groups.get(c.goalIndex) ?? []), c]);
  const goals = [...groups.entries()].flatMap(([order, g]) => {
    const pick = pickGoalPlan(g, loadedSave);
    return pick ? [{ pick, o: { tier: cardTier(pick.candidate, loadedSave), lastAt: newestPlanAt(g, loadedSave), order } }] : [];
  });
  if (!goals.length) return null;
  goals.sort((a, b) => compareGoals(a.o, b.o));
  return goals[0].pick;
}
