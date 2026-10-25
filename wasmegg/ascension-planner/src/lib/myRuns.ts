/**
 * My runs (#/myruns, MyRunsList.vue): which of the viewer's own board runs to show, and in what order.
 *
 * The tab replaced Compare's My plans (15 Oct 2026), which listed only the runs to one target TE: a
 * tester who sent an Egg Day answer found nothing there. So everything shows by default, every kind
 * and target, and the filters only narrow it:
 *
 *   Kind        All / Egg Day / Race to a target TE (any, or one) / By a date (every other date)
 *   Awake hours either / any time of day / my awake hours (Compare's own: a row sent with a `window`
 *               was planned around awake hours)
 *   Ascensions  any / 1..12 (the route's length)
 *   Stops       "200 250": every number typed is a stop of the route
 *   Sort        best first / newest sent / fewest ascensions / finish date
 *
 * "Best" per kind: a date answer by the highest TE reached, then the most time to spare (the By a date
 * board's `deadlineOrder`); a race run by the earliest finish. Mixed kinds keep their own groups, Egg Day
 * first, then the other dates soonest first, then the races by target. Pure: the component only renders.
 */
import {
  accountKeyOf,
  deadlineAscendMs,
  deadlineOrder,
  finishMs,
  foldCopies,
  isDeadlineRow,
  madeDeadline,
  nameKey,
  sentMs,
  type BoardRow,
} from './leaderboardRank';

export type RunKind = 'eggday' | 'race' | 'dates';
export type KindFilter = 'all' | RunKind;
/** 'either', or Compare's two: 'any' (no awake hours set) and 'awake' (planned around them). */
export type HoursFilter = 'either' | 'any' | 'awake';
export type RunSort = 'best' | 'newest' | 'fewest' | 'finish';

export interface MyRunsFilters {
  kind: KindFilter;
  /** Race's target TE, null for any; read only when `kind` is 'race'. */
  target: number | null;
  hours: HoursFilter;
  /** Stops in the route, null for any. */
  ascensions: number | null;
  /** Stops the route must hold, as typed: "200 250". */
  stops: string;
  sort: RunSort;
}

export const DEFAULT_MY_RUNS_FILTERS: Readonly<MyRunsFilters> = {
  kind: 'all',
  target: null,
  hours: 'either',
  ascensions: null,
  stops: '',
  sort: 'best',
};

/** The Ascensions choices: any, or 1 to this many. */
export const MAX_ASCENSIONS_CHOICE = 12;

export const SORT_LABELS: Record<RunSort, string> = {
  best: 'Best first',
  newest: 'Newest',
  fewest: 'Fewest ascensions',
  finish: 'Finish date',
};

/**
 * Whether a board row is the viewer's: sent with this browser's code (`yours`, from GET /mine), or a
 * run that looks like it ("maybe you"), as My plans counted them, with the race's own limits on a
 * guess (lib/leaderboardRank.ts `viewerTag`): never one priced from a TE above the save's (a save was
 * never at a higher TE earlier). `viewerTE` 0: no save loaded, so no TE check.
 *
 * "Looks like it" is the account key (timezone + best artifact per family), and since 16 Oct 2026 (a
 * tester's newest runs were missing) any of the viewer's keys, not only the loaded save's: `keys` holds
 * the save's, the ones this browser remembered for the account (lib/myKeys.ts) and those of the runs
 * /mine returned, so a run sent before the gear or the timezone changed still matches.
 *
 * A row with an owner code (`acct`) that /mine did not return was sent from another browser or site
 * (codes are per browser and per site). It looks like the viewer's only when, besides the key, its name
 * is one this account sends under (`names`, `nameKey`'d): the race joins one player's browsers the same
 * way (`joinBrowsers`: same name, same key). Without a name to go on it stays out, as before. A row under
 * one of those names matches a NEAR key too (`missReasons`, `nearKey`).
 */
export function isMyRun(
  row: BoardRow,
  keys: string | null | ReadonlySet<string>,
  viewerTE: number,
  names: ReadonlySet<string> = NO_NAMES
): boolean {
  if (row.yours) return true;
  return missReasons(row, { keys: keySet(keys), names, viewerTE }).length === 0;
}

const NO_NAMES: ReadonlySet<string> = new Set();

function keySet(keys: string | null | ReadonlySet<string>): ReadonlySet<string> {
  if (keys == null) return new Set();
  return typeof keys === 'string' ? new Set([keys]) : keys;
}

/** What the "maybe you" match reads (see `isMyRun`). */
export interface LookAlike {
  keys: ReadonlySet<string>;
  names: ReadonlySet<string>;
  viewerTE: number;
}

export type MissReason = 'other-code' | 'key' | 'te';

/**
 * Why a row (not from /mine) does not look like the viewer's; empty when it does.
 *
 * The key: an exact match with one of the viewer's keys. A row sent under one of the account's own names (fix 20,
 * the main account's runs from the PC) also counts with a NEAR key (`nearKey`: the timezone differs, or one gear
 * item does), since the name already says whose it is and another browser's planner may have another timezone
 * or a save a step newer. A row without one of the account's names keeps the exact key: the board holds a dozen
 * names on one timezone and gear (maxed players look alike), so gear alone says little.
 */
export function missReasons(row: BoardRow, l: LookAlike): MissReason[] {
  const out: MissReason[] = [];
  const named = l.names.has(nameKey(row.nickname));
  if (row.acct && !named) out.push('other-code');
  const key = accountKeyOf(row);
  const keyOk = l.keys.size > 0 && (l.keys.has(key) || (named && [...l.keys].some(k => nearKey(key, k))));
  if (!keyOk) out.push('key');
  const te = row.backupTE ?? row.currentTE;
  if (l.viewerTE > 0 && typeof te === 'number' && te > l.viewerTE) out.push('te');
  return out;
}

/** The names an account sends under, as `nameKey` reads them: its own, the one typed, the ones on its runs. */
export function nameKeys(names: readonly (string | null | undefined)[]): Set<string> {
  return new Set(names.map(n => nameKey(n ?? '')).filter(Boolean));
}

/** A key's two halves (`accountKeyOf`: "timezone::label|label"). */
function splitKey(key: string): { zone: string; gear: string[] } {
  const at = key.indexOf('::');
  const zone = at < 0 ? key : key.slice(0, at);
  const rest = at < 0 ? '' : key.slice(at + 2);
  return { zone, gear: rest ? rest.split('|') : [] };
}

/**
 * Two keys one step apart: the same gear in another timezone, or the same timezone with one gear item changed
 * (one family's best moved up a tier, or one family more or less). Not both.
 */
export function nearKey(a: string, b: string): boolean {
  if (a === b) return true;
  const x = splitKey(a);
  const y = splitKey(b);
  const extra = x.gear.filter(g => !y.gear.includes(g)).length;
  const missing = y.gear.filter(g => !x.gear.includes(g)).length;
  const gearSteps = Math.max(extra, missing);
  if (!x.gear.length || !y.gear.length) return false;
  return x.zone === y.zone ? gearSteps <= 1 : gearSteps === 0;
}

/** Up to `n` items, then "and k more". */
function some(items: readonly string[], n = 4): string {
  return items.length > n ? `${items.slice(0, n).join(', ')} and ${items.length - n} more` : items.join(', ');
}

/**
 * My runs' "A run of yours isn't here?" (MyRunsMissing.vue): in plain words, why the run with this id
 * is or isn't listed. `row` null: no public row has that id. `saveKey` is the loaded save's own key
 * (null without a save), `hasCode` whether this site in this browser holds a code for the account.
 */
export function whyNotMine(
  row: BoardRow | null,
  l: LookAlike & { saveKey: string | null; hasCode: boolean }
): string[] {
  const noCode = l.hasCode
    ? []
    : [
        'This site in this browser has never sent a run for this account, so it holds no code to prove a run is yours: every run listed here is a look-alike. Each browser, and each site (the planner and its beta), keeps its own code.',
      ];
  if (!row)
    return [
      'No run on the public board has that id. A run hidden from the public is listed only for the browser that sent it.',
    ];
  if (row.yours) return ['It is listed: this browser sent it with its code.'];
  const reasons = missReasons(row, l);
  if (!reasons.length) return ['It is listed, tagged “maybe you”: its timezone and gear match yours.', ...noCode];
  const out: string[] = [];
  const named = l.names.has(nameKey(row.nickname));
  if (reasons.includes('other-code'))
    out.push(
      `It was sent ${row.nickname?.trim() ? `as “${row.nickname.trim()}” ` : ''}from another browser or site, with that browser's code, and that name isn't one this account uses here. A named run from another browser counts only when its name is yours too (your account's name or in-game name, or the name you credit runs to here): set the same “Credit me as” name in both browsers.`
    );
  if (reasons.includes('key')) {
    const theirs = splitKey(accountKeyOf(row));
    if (!l.saveKey) out.push('Load your save to compare its timezone and gear with yours.');
    else {
      const mine = splitKey(l.saveKey);
      const extra = theirs.gear.filter(g => !mine.gear.includes(g));
      const missing = mine.gear.filter(g => !theirs.gear.includes(g));
      // Without one of your names, only an exact timezone and gear match counts (`missReasons`).
      const nameHint = named
        ? ''
        : ' A run sent under your name counts with one difference (the timezone, or one item of gear); one without your name needs both to match.';
      if (theirs.zone !== mine.zone)
        out.push(`It was sent with the timezone ${theirs.zone}; your planner is set to ${mine.zone}.${extra.length || missing.length ? '' : nameHint}`);
      if (extra.length || missing.length)
        out.push(
          `Its gear differs from your save's${extra.length ? `: it has ${some(extra)}` : ''}${
            missing.length ? `${extra.length ? ';' : ':'} your save has ${some(missing)}` : ''
          }.${theirs.zone === mine.zone && Math.max(extra.length, missing.length) === 1 ? nameHint : ''}`
        );
      if (theirs.zone === mine.zone && !extra.length && !missing.length)
        out.push("Its timezone and gear match your save's, but not as this browser remembers them.");
    }
  }
  if (reasons.includes('te'))
    out.push(
      `It starts from TE ${row.backupTE ?? row.currentTE}, above your save's ${l.viewerTE}: a save is never at a higher TE earlier, so it can't be yours. If the other browser had a newer save than the one loaded here, load a fresh save.`
    );
  return [...out, ...noCode];
}

/** The rows whose id starts with what was typed (at least 6 characters, any case). */
export function rowsById(rows: readonly BoardRow[], typed: string): BoardRow[] {
  const q = typed.trim().toLowerCase();
  if (q.length < 6) return [];
  const seen = new Set<string>();
  return rows.filter(r => {
    const id = r.id?.toLowerCase();
    if (!id || !id.startsWith(q) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * How many runs the viewer has on the board: one per result, a result sent more than once counted once
 * (`foldCopies`, as the list shows them). My runs' header, its list and "Showing n of m" all count this.
 */
export function myRunsCount(rows: readonly BoardRow[]): number {
  return foldCopies(rows).length;
}

/** When a result was last sent: the newest of its copies (a re-send is a run too). */
export function lastSentMs(copies: readonly BoardRow[]): number | null {
  let best: number | null = null;
  for (const c of copies) {
    const t = sentMs(c);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

/** Which board a row belongs on: Egg Day's (its deadline is Egg Day's moment), By a date's, or a race. */
export function runKind(row: Pick<BoardRow, 'deadline'>, eggDayAt: number): RunKind {
  if (!isDeadlineRow(row)) return 'race';
  return row.deadline === eggDayAt ? 'eggday' : 'dates';
}

/** The whole numbers typed in the stops box, in order: "200, 250" and "200 250" are [200, 250]. */
export function parseStops(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number).filter(n => Number.isFinite(n) && n > 0);
}

/** Whether every stop asked for is a stop of the route (none asked: any route). */
export function hasStops(row: Pick<BoardRow, 'chain'>, stops: readonly number[]): boolean {
  return stops.every(s => row.chain.includes(s));
}

/** Whether a row is in the filters' categories (the sort is not a filter). */
export function inMyRunsFilters(row: BoardRow, f: MyRunsFilters, eggDayAt: number): boolean {
  const kind = runKind(row, eggDayAt);
  if (f.kind !== 'all' && kind !== f.kind) return false;
  if (f.kind === 'race' && f.target != null && row.finalTE !== f.target) return false;
  const awake = !!row.window;
  if (f.hours === 'awake' && !awake) return false;
  if (f.hours === 'any' && awake) return false;
  if (f.ascensions != null && row.chain.length !== f.ascensions) return false;
  return hasStops(row, parseStops(f.stops));
}

/**
 * The filters that narrow the list, in words, for the empty list ("None of your runs are in these
 * categories: Ascensions 5"), so a list narrowed to nothing says why.
 */
export function activeFilterWords(f: MyRunsFilters, eggDayYear: number): string[] {
  const out: string[] = [];
  if (f.kind === 'eggday') out.push(`Egg Day ${eggDayYear}`);
  else if (f.kind === 'dates') out.push('By a date');
  else if (f.kind === 'race') out.push(f.target != null ? `Fastest to ${f.target} TE` : 'Fastest to a target TE');
  if (f.hours === 'awake') out.push('planned around awake hours');
  else if (f.hours === 'any') out.push('any time of day');
  if (f.ascensions != null) out.push(`${f.ascensions} ${f.ascensions === 1 ? 'ascension' : 'ascensions'}`);
  const stops = parseStops(f.stops);
  if (stops.length) out.push(`stops ${stops.join(' ')}`);
  return out;
}

/** How many filters narrow the list, for "Filters (2 active)". The kind and its target count once. */
export function activeFilterCount(f: MyRunsFilters): number {
  return (
    Number(f.kind !== 'all') +
    Number(f.hours !== 'either') +
    Number(f.ascensions != null) +
    Number(parseStops(f.stops).length > 0)
  );
}

/** The race targets among the rows, lowest first, for the Target TE choice. */
export function raceTargets(rows: readonly Pick<BoardRow, 'deadline' | 'finalTE'>[]): number[] {
  const seen = new Set<number>();
  for (const r of rows) if (!isDeadlineRow(r) && Number.isFinite(r.finalTE)) seen.add(r.finalTE);
  return [...seen].sort((a, b) => a - b);
}

/** When the run gets there: a date answer's last ascension, a race run's finish. Null when unknown. */
export function finishOf(row: BoardRow): number | null {
  return isDeadlineRow(row) ? deadlineAscendMs(row) : finishMs(row);
}

const KIND_ORDER: Record<RunKind, number> = { eggday: 0, dates: 1, race: 2 };

/** Nulls last, else smaller first. */
function ascNull(a: number | null, b: number | null): number {
  if (a == null || b == null) return Number(a == null) - Number(b == null);
  return a - b;
}

/** Best first: by kind's group, then the group's own "best" (see the module comment). */
export function compareBest(a: BoardRow, b: BoardRow, eggDayAt: number): number {
  const ka = runKind(a, eggDayAt);
  const kb = runKind(b, eggDayAt);
  if (ka !== kb) return KIND_ORDER[ka] - KIND_ORDER[kb];
  if (ka === 'race') {
    return (
      a.finalTE - b.finalTE ||
      ascNull(finishMs(a), finishMs(b)) ||
      Number(!!a.provisional) - Number(!!b.provisional) ||
      (sentMs(b) ?? 0) - (sentMs(a) ?? 0)
    );
  }
  return (
    (a.deadline as number) - (b.deadline as number) ||
    // An answer whose last ascension misses its date is not an answer: after the ones that make it.
    Number(!madeDeadline(a)) - Number(!madeDeadline(b)) ||
    deadlineOrder(a, b)
  );
}

/** The items in the chosen order. `rowOf` reads an item's row (a folded line's best copy, or the row). */
export function sortMyRuns<T>(items: readonly T[], rowOf: (t: T) => BoardRow, sort: RunSort, eggDayAt: number): T[] {
  const best = (a: T, b: T) => compareBest(rowOf(a), rowOf(b), eggDayAt);
  const by: Record<RunSort, (a: T, b: T) => number> = {
    best,
    newest: (a, b) => (sentMs(rowOf(b)) ?? 0) - (sentMs(rowOf(a)) ?? 0) || best(a, b),
    fewest: (a, b) => rowOf(a).chain.length - rowOf(b).chain.length || best(a, b),
    finish: (a, b) => ascNull(finishOf(rowOf(a)), finishOf(rowOf(b))) || best(a, b),
  };
  return [...items].sort(by[sort]);
}
