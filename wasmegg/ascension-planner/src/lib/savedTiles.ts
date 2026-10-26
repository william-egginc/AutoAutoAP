/**
 * My runs' two saved-answer tiles (spec myruns-now v3, section 4): Fastest to 490 and Egg Day, each the best
 * answer already worked out for the loaded save, with when it was calculated, from which save, and How sure
 * (lib/howSure.ts). Nothing is worked out again: every answer comes from something this browser or the board
 * already holds:
 *
 *   snapshot     the instant answer kept after Check exactly (lib/nowPlan.ts `planFromSnapshot`), this save's key
 *   lastChecked  `aap-instant-answer:<key>`: the last exact-checked answer for this save's key
 *   history      Check exactly's history (IndexedDB, per account): any save, with its save time
 *   board        your runs on the board (searches: level, Exhaustive, the save they started from)
 *   saved        By a date answers saved on this device (with the save they were priced from)
 *
 * Which answer heads the tile (fix 21, after beta showed a 310 over a 311 for Egg Day):
 *
 *   An answer is CURRENT when it is of the loaded save, or of a save at most CURRENT_SAVE_SECONDS older (or any
 *   newer). Current answers always rank ahead of the rest. Among them, Egg Day: the most TE, then the most time to
 *   spare, then the stronger pricing, then the newest; Fastest: the soonest finish, then the stronger, then the
 *   newest. An instant answer (the table only) leads only when no current answer was checked or searched.
 *   With no current answer, the newest from an older save leads, flagged `olderSave` ("Older save than the one you
 *   loaded").
 *
 * Fix 22: the ranking is lib/currentAnswer.ts's, shared with Right now: after the save, an answer priced with Your
 * setup now (hours and time off) leads one priced with other hours even when that finishes sooner, and on a tie the
 * kept snapshot (Right now's plan) leads. A better answer priced with other hours is the tile's `secondary`.
 *
 * The Egg Day rule (lib/eggDayRule.ts, Jordan 22 Oct 2026): only an answer whose last TE counts before Egg Day starts
 * can head the Egg Day tile, whatever a later one reaches. Late answers (a board row past the date, a snapshot or a
 * Check exactly entry whose exact check found no route in time) are kept only for `Tile.late`: "No route finishes
 * before Egg Day starts. The nearest is N hours after."
 *
 * A board row's save time is worked out (its plan start less its rounded save age), and a run started from a save
 * a few minutes older than the one loaded used to fall outside the 10-minute "same save" window: the 311 lost to
 * the loaded save's 310. Such an answer now competes, and the tile says which save it was (`saveGapSeconds`:
 * "4 min older than the one loaded"). A board run sent from another browser says so too (`sourceWords`). Pure.
 */
import {
  deadlineAscendMs,
  deadlineSpare,
  finishMs,
  isDeadlineRow,
  sentMs,
  startMs,
  type BoardRow,
} from './leaderboardRank';
import { howSure, type SearchLevel, type Sure } from './howSure';
import type { NowPlan } from './nowPlan';
import {
  CURRENT_SAVE_SECONDS,
  SAME_SAVE_SECONDS,
  currentSetup,
  isCurrentSave,
  otherSetupLabel,
  pickAnswer,
  rowSetup,
  setupCheck,
  type PricedSetup,
  type SetupCheck,
} from './currentAnswer';
import type { CheckEntry } from '@/search/checkHistory';
import { lateRoutes, nearestLate, onTimeRoutes } from './eggDayRule';

/** Two save times this close are the same save (the agreeing search for How sure is looked for among these); an
 *  answer from a save at most CURRENT_SAVE_SECONDS older is current (fix 21). Both live in lib/currentAnswer.ts. */
export { SAME_SAVE_SECONDS, CURRENT_SAVE_SECONDS };
/** A save time further than this from the loaded save's is "another save" on the tile's words. */
export const SAVE_GAP_WORDS_SECONDS = 60;
/** Fastest: a search whose finish is within this of the answer's agrees with it. */
export const AGREE_FINISH_SECONDS = 3600;

export interface TileAnswer {
  chain: number[];
  /** Fastest: when it reaches the target. By a date: when the last stop is reached. Unix seconds. */
  end: number;
  /** By a date: when its last TE counts, for lib/eggDayRule.ts (the ascension at the last stop; its time on the
   *  account when Check exactly found it late; Infinity when it is known to miss, untimed). Absent: `end`. */
  finish?: number;
  endTE: number;
  /** By a date. */
  spareHours: number | null;
  /** When it was worked out, ms. */
  calculatedAt: number;
  /** The save it was worked out from (unix seconds), null when not known. */
  saveSeconds: number | null;
  /** The TE it started from, when known. */
  fromTE: number | null;
  source: 'snapshot' | 'lastChecked' | 'history' | 'board' | 'saved';
  how: 'instant' | 'check' | 'search';
  level?: SearchLevel | null;
  /** A snapshot's Fast, Exact or Custom result (lib/searchPlan.ts): the panel's own name for it. */
  found?: 'Fast' | 'Exact' | 'Custom';
  complete?: boolean;
  exactConfirmsTE?: boolean;
  runnerUpHours?: number | null;
  olderSimulator?: boolean;
  hoursChanged?: boolean;
  /** A board run this browser didn't send (not on /mine): a "looks like yours" row from another browser or site. */
  otherBrowser?: boolean;
  /** Its legs (each shift), when the source kept them: By a date's saved answers. */
  legs?: NowPlan['legs'];
  /** The hours and time off it was priced with against Your setup now (lib/currentAnswer.ts); absent: current. */
  setup?: SetupCheck;
  /** Under this save's own key (the snapshot and the last checked answer): this save, this setup. */
  ownKey?: boolean;
  /** A kept snapshot: the plan Right now shows (it leads a tie, so the card and the tile name the same one). */
  plan?: boolean;
  /** The next-best route, and whether it is the same answer exactly (How sure's "another route ties it exactly"). */
  runnerUpChain?: number[] | null;
  runnerUpSame?: boolean;
}

export interface Tile {
  goal: 'fastest' | 'date';
  answer: TileAnswer | null;
  /** The answer is from an older save than the one loaded (more than CURRENT_SAVE_SECONDS older). */
  olderSave: boolean;
  /** A current answer from another save than the one loaded: its save time less the loaded save's, seconds
   *  (negative: older). Null for the loaded save's own answers. */
  saveGapSeconds?: number | null;
  sure: Sure | null;
  /** A better answer of this save priced with other hours or time off than Your setup now, shown under the lead
   *  with `secondaryLabel` ("with any hour (before your hours changed)"); null when none beats the lead. */
  secondary?: TileAnswer | null;
  /** By a date (Egg Day too): no answer in time, but answers that land after the date are kept (lib/eggDayRule.ts).
   *  They are never the tile's answer: the tile says "No route finishes before Egg Day starts. The nearest is N hours
   *  after." with the nearest (`answer`, null when none is timed). Null otherwise. */
  late?: { answer: TileAnswer | null; seconds: number | null; count: number } | null;
}

/** When a tile answer's last TE counts (lib/eggDayRule.ts). */
export const answerFinish = (a: Pick<TileAnswer, 'end' | 'finish'>): number => a.finish ?? a.end;

/** "with any hour (before your hours changed)", "with other hours": the secondary answer's label. */
export function secondaryLabel(a: TileAnswer): string {
  return a.setup ? otherSetupLabel(a.setup) : '';
}

/** A By a date answer saved on this device, in the fields read here. */
export interface SavedDateAnswer {
  savedAt: number;
  deadline: number;
  te: number;
  saveSeconds: number | null;
  level?: string;
  simple?: boolean;
  /** The hours and time off it was priced with (`result.settings`), when recorded. */
  setup?: PricedSetup | null;
  route: { chain: number[]; reachAt: number; spare: number; legs?: NowPlan['legs'] } | null;
}

export interface TileInput {
  goal: 'fastest' | 'date';
  target: number;
  deadline: number | null;
  nowMs: number;
  /** The loaded save. */
  save: { seconds: number; te: number } | null;
  snapshot: NowPlan | null;
  lastChecked: { at: number; chain: number[]; end: number; endTE: number } | null;
  history: readonly CheckEntry[];
  /** Your board rows (null while loading or without the board). */
  board: readonly BoardRow[] | null;
  saved: readonly SavedDateAnswer[];
  /** Your setup now and today's date in the planner's zone: each answer's recorded hours and time off are compared
   *  with it (lib/currentAnswer.ts). Absent: every answer counts as priced with it. */
  setupNow?: { setup: PricedSetup; today: string } | null;
  /** Kept snapshots of this goal under OTHER keys (the same save with another setup, or an older save), each with
   *  the setup it recorded (SnapMeta `setup`, null before fix 22). */
  otherSnapshots?: readonly { plan: NowPlan; recorded: PricedSetup | null }[];
  /** Whether a board row was priced with other hours or time off than Your setup now (myRunsDashboard `hoursDiffer`). */
  hoursChanged?: (row: BoardRow) => boolean;
  /** Whether a board row was priced by an older simulator (myRunsDashboard `simulatorAge` === 'older'). */
  olderSimulator?: (row: BoardRow) => boolean;
}

const LEVELS: readonly SearchLevel[] = ['light', 'quick', 'normal', 'thorough', 'exhaustive'];
const asLevel = (v: unknown): SearchLevel | null => (LEVELS.includes(v as SearchLevel) ? (v as SearchLevel) : null);

/** The search panel's levels as the tile's (How sure reads these). */
const FOUND_LEVEL: Record<'Fast' | 'Exact' | 'Custom', SearchLevel> = { Fast: 'quick', Exact: 'normal', Custom: 'exhaustive' };

/** A board row's search level: Exhaustive for a space (Fastest) or By a date's 'advanced' mode, else its level. */
export function rowLevel(row: BoardRow): SearchLevel | null {
  if (row.space) return 'exhaustive';
  if ((row as { mode?: unknown }).mode === 'advanced') return 'exhaustive';
  return asLevel(row.level) ?? asLevel(row.effort);
}

/** When a board row's save was taken: its plan start less its save age; null without both. */
export function rowSaveSeconds(row: BoardRow): number | null {
  const s = startMs(row);
  return s != null && typeof row.backupAgeHours === 'number' ? s / 1000 - row.backupAgeHours * 3600 : null;
}

function candidates(i: TileInput): TileAnswer[] {
  const out: TileAnswer[] = [];
  const saveNow = i.save?.seconds ?? null;
  const goalOk = (deadline: number | undefined | null, target: number | undefined) =>
    i.goal === 'date' ? deadline === i.deadline : !deadline && target === i.target;
  // The snapshot and the last checked answer are under this save's own key.
  const now = i.setupNow ?? null;
  const ownSetup = now ? currentSetup(now.setup) : undefined;
  const checkOf = (recorded: PricedSetup | null | undefined): SetupCheck | undefined =>
    now ? setupCheck(recorded, now.setup, now.today) : undefined;
  const fromSnap = (s: NowPlan, own: boolean, setup: SetupCheck | undefined): TileAnswer => ({
    chain: s.chain,
    end: s.end,
    ...(s.accountEnd !== undefined ? { finish: s.accountEnd } : {}),
    endTE: s.endTE,
    spareHours: s.spareHours,
    calculatedAt: s.calculatedAt,
    saveSeconds: s.meta?.backupTime ?? (own ? saveNow : null),
    fromTE: own ? (i.save?.te ?? null) : null,
    source: 'snapshot',
    // A search's result kept with the snapshot (lib/searchPlan.ts) reads as that search; an older snapshot's exact
    // lead was Check exactly's.
    ...(s.from
      ? { how: 'search' as const, level: FOUND_LEVEL[s.from.level], found: s.from.level }
      : { how: s.exact ? ('check' as const) : ('instant' as const) }),
    exactConfirmsTE: i.goal === 'date' && s.exact && !s.from ? s.instantTE === s.endTE : undefined,
    runnerUpHours: s.runnerUpHours,
    runnerUpChain: s.runnerUp?.chain ?? null,
    runnerUpSame: !!s.runnerUp && s.runnerUp.end === s.end && s.runnerUp.endTE === s.endTE,
    plan: true,
    ownKey: own,
    setup: own ? ownSetup : setup,
    hoursChanged: setup?.fit === 'other',
  });
  const s = i.snapshot;
  if (s && s.goal === i.goal) out.push(fromSnap(s, true, ownSetup));
  for (const o of i.otherSnapshots ?? [])
    if (o.plan.goal === i.goal) out.push(fromSnap(o.plan, false, checkOf(o.recorded)));
  const c = i.lastChecked;
  if (c && Array.isArray(c.chain) && c.chain.length)
    out.push({
      chain: c.chain,
      end: c.end,
      endTE: c.endTE,
      spareHours: i.goal === 'date' && i.deadline ? (i.deadline - c.end) / 3600 : null,
      calculatedAt: c.at,
      saveSeconds: saveNow,
      fromTE: i.save?.te ?? null,
      source: 'lastChecked',
      how: 'check',
      ownKey: true,
      setup: ownSetup,
    });
  for (const e of i.history) {
    if (!goalOk(e.deadline, e.target) || (i.goal === 'date' ? e.mode !== 'date' : e.mode !== 'fastest')) continue;
    const a = e.exact ?? e.instant;
    out.push({
      chain: a.chain,
      end: a.end,
      // By a date a finished check with no exact answer found no route in time: the instant route misses (untimed).
      ...(i.goal === 'date' && !e.exact ? { finish: Infinity } : {}),
      endTE: a.endTE ?? a.chain[a.chain.length - 1],
      spareHours: typeof a.spareHours === 'number' ? a.spareHours : i.goal === 'date' && i.deadline ? (i.deadline - a.end) / 3600 : null,
      calculatedAt: e.at,
      saveSeconds: e.backupTime ?? null,
      fromTE: e.te,
      source: 'history',
      how: e.exact ? 'check' : 'instant',
      exactConfirmsTE: i.goal === 'date' && e.exact ? e.exact.endTE === e.instant.endTE : undefined,
      setup: checkOf(e.setup ?? null),
      hoursChanged: checkOf(e.setup ?? null)?.fit === 'other',
    });
  }
  for (const r of i.board ?? []) {
    if (r.hidden && !r.yours) continue;
    const isDate = isDeadlineRow(r);
    // A row that lands after its date stays a candidate: buildTile keeps it out of the pick (lib/eggDayRule.ts).
    if (i.goal === 'date' ? !isDate || r.deadline !== i.deadline : isDate || r.finalTE !== i.target) continue;
    const at = sentMs(r);
    const end = isDate ? (deadlineAscendMs(r) ?? 0) / 1000 : (finishMs(r) ?? 0) / 1000;
    if (!at || !end) continue;
    const level = rowLevel(r);
    out.push({
      chain: [...r.chain],
      end,
      endTE: r.finalTE,
      spareHours: isDate ? deadlineSpare(r) / 3600 : null,
      calculatedAt: at,
      saveSeconds: rowSaveSeconds(r),
      fromTE: r.backupTE ?? r.currentTE ?? null,
      source: 'board',
      how: level === 'light' ? 'check' : 'search',
      level,
      complete: level === 'exhaustive' && !r.provisional && !r.space?.stoppedEarly,
      olderSimulator: i.olderSimulator?.(r) ?? false,
      hoursChanged: i.hoursChanged?.(r) ?? false,
      otherBrowser: !r.yours,
      setup: checkOf(rowSetup(r)),
    });
  }
  if (i.goal === 'date')
    for (const a of i.saved) {
      if (a.deadline !== i.deadline || !a.route) continue;
      out.push({
        chain: a.route.chain,
        end: a.route.reachAt,
        // Its ascension at the last stop (`spare` is counted from it).
        finish: a.deadline - a.route.spare,
        endTE: a.route.chain[a.route.chain.length - 1],
        spareHours: a.route.spare / 3600,
        calculatedAt: a.savedAt,
        saveSeconds: a.saveSeconds,
        fromTE: a.te,
        source: 'saved',
        how: 'search',
        level: asLevel(a.level) ?? (a.simple ? 'quick' : 'exhaustive'),
        legs: a.route.legs ?? null,
        setup: checkOf(a.setup ?? null),
        hoursChanged: checkOf(a.setup ?? null)?.fit === 'other',
      });
    }
  return out.filter(a => Array.isArray(a.chain) && a.chain.length && Number.isFinite(a.end));
}

export function buildTile(i: TileInput): Tile {
  const every = candidates(i);
  // By a date (Egg Day too) only answers in time compete (lib/eggDayRule.ts); late ones are only "the nearest".
  const deadline = i.goal === 'date' ? i.deadline : null;
  const all = deadline == null ? every : onTimeRoutes(every, answerFinish, deadline);
  const late = deadline == null ? [] : lateRoutes(every, answerFinish, deadline);
  const saveNow = i.save?.seconds ?? null;
  const ownKey = (a: TileAnswer) => !!a.ownKey;
  const sameSave = (a: TileAnswer) =>
    ownKey(a) || (saveNow != null && a.saveSeconds != null && Math.abs(a.saveSeconds - saveNow) <= SAME_SAVE_SECONDS);
  const current = (a: TileAnswer) => isCurrentSave(a.saveSeconds, saveNow, ownKey(a));
  const here = all.filter(sameSave);
  // One rule with Right now (lib/currentAnswer.ts): current save, then priced with Your setup now, then checked
  // or searched over the table alone, then the goal's measure; an answer priced with other hours only as the
  // secondary line.
  const { lead: pick, secondary } = pickAnswer(
    all.map(a => ({ ...rankOf(a, current(a)), a })),
    i.goal
  );
  if (!pick) {
    const near = late.length ? nearestLate(late, answerFinish, deadline as number) : null;
    return {
      goal: i.goal,
      answer: null,
      olderSave: false,
      saveGapSeconds: null,
      sure: null,
      ...(late.length ? { late: { answer: near?.item ?? null, seconds: near?.seconds ?? null, count: late.length } } : {}),
    };
  }
  return finish(i, pick.a, secondary?.a ?? null, { current, ownKey, here, saveNow });
}

const rankOf = (a: TileAnswer, currentSave: boolean) => ({
  currentSave,
  fit: a.setup?.fit ?? ('current' as const),
  how: a.how,
  end: a.end,
  endTE: a.endTE,
  spareHours: a.spareHours,
  calculatedAt: a.calculatedAt,
  plan: a.plan,
});

function finish(
  i: TileInput,
  pick: TileAnswer,
  secondary: TileAnswer | null,
  c: { current: (a: TileAnswer) => boolean; ownKey: (a: TileAnswer) => boolean; here: TileAnswer[]; saveNow: number | null }
): Tile {
  const { current, ownKey, here, saveNow } = c;
  const olderSave = !current(pick) && pick.saveSeconds != null && saveNow != null && pick.saveSeconds < saveNow - CURRENT_SAVE_SECONDS;
  const gap = !ownKey(pick) && current(pick) && saveNow != null && pick.saveSeconds != null ? pick.saveSeconds - saveNow : null;
  const saveGapSeconds = gap != null && Math.abs(gap) > SAVE_GAP_WORDS_SECONDS ? gap : null;
  // The strongest search of the same save that agrees with the headline.
  const agreeing = here
    .filter(a => a !== pick && a.how === 'search' && a.level)
    .filter(a => (i.goal === 'date' ? a.endTE === pick.endTE : Math.abs(a.end - pick.end) <= AGREE_FINISH_SECONDS))
    .map(a => a.level!)
    .sort((a, b) => LEVELS.indexOf(b) - LEVELS.indexOf(a))[0];
  const ageMs = Math.max(i.nowMs - pick.calculatedAt, pick.saveSeconds ? i.nowMs - pick.saveSeconds * 1000 : 0);
  const sure = howSure({
    goal: i.goal,
    how: pick.how,
    level: pick.level ?? null,
    exhaustiveComplete: pick.complete,
    exactConfirmsTE: pick.exactConfirmsTE,
    agreeing: agreeing ?? null,
    spareHours: pick.spareHours,
    runnerUpHours: pick.runnerUpHours ?? null,
    ageDays: ageMs / 86_400_000,
    olderSimulator: pick.olderSimulator,
    hoursChanged: pick.hoursChanged,
    teMoved: i.save != null && pick.fromTE != null && Math.floor(pick.fromTE) !== Math.floor(i.save.te),
    te: pick.endTE,
    runnerUpChain: pick.runnerUpChain ?? null,
    runnerUpSame: pick.runnerUpSame,
  });
  return { goal: i.goal, answer: pick, olderSave, saveGapSeconds, sure, secondary };
}

/** "4 min older than the one loaded", "1 h 20 min newer than the one loaded" (`Tile.saveGapSeconds`). */
export function saveGapWords(gapSeconds: number): string {
  const m = Math.max(1, Math.round(Math.abs(gapSeconds) / 60));
  const span = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${span} ${gapSeconds < 0 ? 'older' : 'newer'} than the one loaded`;
}

/** Where a board answer came from, for the tile ('' for the rest): said plainly, as the board's own runs are
 *  guessed from another browser ("looks like yours"). */
export function sourceWords(a: TileAnswer): string {
  if (a.source !== 'board') return '';
  return a.otherBrowser ? 'from your Leaderboard run sent from another browser' : 'from your Leaderboard run';
}

/** "Snapshot" etc. in player words, for the tile's calculated line: "(Check exactly)", "(Exhaustive)". */
export function howWords(a: TileAnswer): string {
  if (a.found) return a.found;
  if (a.how === 'instant') return 'instant answer';
  if (a.how === 'check') return a.level === 'light' ? 'Checked at once' : 'simulator check';
  const w: Record<SearchLevel, string> = { light: 'Checked at once', quick: 'Fast', normal: 'Exact', thorough: 'Exact (wider)', exhaustive: 'Custom' };
  return a.level ? w[a.level] : 'a search';
}
