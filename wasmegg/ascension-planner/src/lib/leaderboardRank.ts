/**
 * Who reaches the target first, on the plan they are actually on.
 *
 * THE PROBLEM THIS SOLVES, in a player's words: "If I run my current best plan every single day for
 * a month, every day the new run shows up 1 day faster than the previous best. But it's the same
 * plan, just run a day later." A plan's length is counted from its own start, so any board sorted by
 * length rewards whoever submitted most recently. Days per TE drifts with the TE range and still
 * creeps down while you wait. The one number that does not move when the same plan is run again is
 * the date it finishes, so that is what the race sorts on.
 *
 * WHAT A "CURRENT PLAN" IS, per player (all rules are pure functions of the rows, no collector
 * change needed):
 *
 *   - it aims at the target TE;
 *   - it is not a what-if: its start is not more than 12 h after it was sent, and no later run of the
 *     same player started from a lower TE (which would mean this one was planned from a TE the
 *     account never had). A lower run only escapes that rule on a stronger signal that IT is the odd
 *     one out -- a bad sync or an old backup: its recorded save is older than a run before it, or
 *     higher runs sit on both sides of it (`judgeHistory`);
 *   - it has not been re-measured: a later run of the same player that prices the SAME plan (same
 *     target, schedule, held shifts, finish-the-current-ascension switch and time off, and the same
 *     route or what is left of it once passed checkpoints drop off) replaces it. The newest
 *     measurement stands whether it finishes earlier OR later, so re-running cannot fish for a lucky
 *     number. A re-run sent without a name from the same account still counts: it joins the named
 *     player's line rather than leaving the plan replaced by nothing;
 *   - the player is not behind it: a later run started at a TE 2 or more below where this plan said
 *     they would be by then (linear inside each leg; rows without legs skip this test);
 *   - it was planned within the last 30 days.
 *
 * WHO COUNTS AS THE SAME PLAYER. Phase 1 has no owner code to go on, so it uses what the rows carry:
 * a cleaned name label (the annotations people type into the name box are stripped, see
 * `nameLabel`), and for evidence that can show a plan behind or a what-if, also the same timezone
 * plus artifact set -- the proxy `explorer/analysis.ts` `accountKey` uses. Two players with
 * identical gear in one timezone could therefore mark each other's plans; that is a known limit of
 * phase 1. Only the player's own lines (plus unnamed re-runs of their plans) can replace a plan.
 *
 * EXACT COPIES FOLD FIRST. The same result sent twice -- a double-clicked Submit, an auto-send plus a
 * manual one, an anonymous send and then a named one -- is one row with a "sent xN" badge. Two rows
 * are copies when everything that decides the plan's finish matches (see `contentFingerprint`); the
 * name is deliberately NOT part of it, so an anonymous copy folds into the named one.
 *
 * Pure: no Vue, no stores, no fetch. `now` is always passed in so tests are deterministic.
 */

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** A start this far after the send is a what-if ("if I started on 23 Nov"). */
const WHAT_IF_LEAD_MS = 12 * HOUR_MS;
/** A later row has to start at least this much later to count as newer. */
const LATER_MS = HOUR_MS;
/** How far below the plan's own projection a later run has to be to call the plan "behind". */
const BEHIND_TE = 2;
/** Plans older than this need a re-plan. */
const MAX_AGE_MS = 30 * DAY_MS;
/** Two plans are "from the same save" when their save moments agree to this. */
const SAME_SAVE_MS = 10 * 60_000;
/** A re-measure whose finish moved less than this reads as "unchanged". */
const UNCHANGED_MS = HOUR_MS;

/** The collector's row shape. Loose on purpose: a public endpoint may be a version ahead or behind,
 *  and a missing field should render a dash, not throw. */
export interface BoardRow {
  id?: string;
  hasCsv?: boolean;
  nickname?: string;
  chain: number[];
  ascensions?: number;
  durationDays: number;
  startLocal?: string;
  endLocal?: string;
  timezone?: string;
  currentTE?: number;
  finalTE: number;
  window?: string | null;
  effort?: string;
  holdShifts?: boolean;
  forceContinue?: boolean;
  timeOff?: { from: string; to: string }[];
  waitingHours?: number | null;
  chainsPriced?: number;
  /** The chain the search descended from. Absent on an exhaustive run, which descends from none. */
  seed?: number[];
  /** ISO 8601, stamped by the app when the submission was built. */
  submittedAt?: string;
  /** How stale the save was at plan start, in hours. */
  backupAgeHours?: number;
  artifacts?: (string | { label: string; count: number })[];
  delivery?: { artifact: string; stones?: string[] }[];
  earnings?: { artifact: string; stones?: string[] }[];
  stones?: { label: string; count: number }[];
  legs?: { te: number; strategy?: string; days: number; peakDeliveryQph?: number }[];
  /** Insane mode only: the space the run enumerated to prove its answer. */
  space?: {
    mode: 'bands' | 'range';
    minGap: number;
    minAscensions: number;
    maxAscensions: number;
    chains: number;
    chainsPriced: number;
    stoppedEarly: boolean;
    range?: { lo: number; hi: number; step: number };
    bands?: number[][];
  };
  /** What that space turned out to contain. Rides with `space` and never without it. */
  proof?: {
    runnersUp: { chain: number[]; days: number }[];
    byAscensions: { ascensions: number; chain: number[]; days: number; priced: number }[];
    spread: { best: number; median: number; worst: number };
  };
}

// ---------------------------------------------------------------------------------------- time

const offsetFormatters = new Map<string, Intl.DateTimeFormat | null>();

function offsetFormatter(timezone: string): Intl.DateTimeFormat | null {
  if (!offsetFormatters.has(timezone)) {
    let f: Intl.DateTimeFormat | null;
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      // An unknown zone name throws RangeError. Remember that, so a bad row costs one throw.
      f = null;
    }
    offsetFormatters.set(timezone, f);
  }
  return offsetFormatters.get(timezone) ?? null;
}

/** Wall clock minus UTC, in ms, for `timezone` at instant `utcMs`; null when the zone is unknown. */
function zoneOffsetMs(timezone: string, utcMs: number): number | null {
  const f = offsetFormatter(timezone);
  if (!f) return null;
  const parts = f.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const offset = wall - Math.floor(utcMs / 1000) * 1000;
  return Number.isFinite(offset) ? offset : null;
}

/**
 * `YYYY-MM-DD HH:MM` read in `timezone`, as an absolute instant in ms. Null (never NaN) when the text
 * or the zone cannot be read. Two passes, so a start on either side of a daylight-saving change
 * lands on the right hour.
 */
export function localToUtcMs(local: string | undefined, timezone: string | undefined): number | null {
  if (!local || !timezone) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = zoneOffsetMs(timezone, wall);
  if (first == null) return null;
  let utc = wall - first;
  const second = zoneOffsetMs(timezone, utc);
  if (second == null) return null;
  if (second !== first) utc = wall - second;
  return Number.isFinite(utc) ? utc : null;
}

/** When the plan starts, as an instant. */
export function startMs(row: Pick<BoardRow, 'startLocal' | 'timezone'>): number | null {
  return localToUtcMs(row.startLocal, row.timezone);
}

/**
 * When the plan reaches its target: its own start plus its length. Never read from `endLocal`,
 * which is a local wall-clock string that sorts wrong across zones and daylight saving.
 */
export function finishMs(row: Pick<BoardRow, 'startLocal' | 'timezone' | 'durationDays'>): number | null {
  const start = startMs(row);
  const days = row.durationDays;
  if (start == null || typeof days !== 'number' || !Number.isFinite(days)) return null;
  const f = start + days * DAY_MS;
  return Number.isFinite(f) ? f : null;
}

/** Days from `now` to the finish, the same clock for everybody. Null when there is no finish. */
export function daysLeft(row: Pick<BoardRow, 'startLocal' | 'timezone' | 'durationDays'>, now: number): number | null {
  const f = finishMs(row);
  return f == null ? null : (f - now) / DAY_MS;
}

/** When the row was sent, or null. */
export function submittedMs(row: Pick<BoardRow, 'submittedAt'>): number | null {
  if (!row.submittedAt) return null;
  const t = Date.parse(row.submittedAt);
  return Number.isFinite(t) ? t : null;
}

// ------------------------------------------------------------------------------------ identity

/** Artifact labels, tolerating schema-1 rows that stored `{label, count}`. */
export function artifactLabels(row: Pick<BoardRow, 'artifacts'>): string[] {
  return (row.artifacts ?? []).map(a => (typeof a === 'string' ? a : (a?.label ?? '')));
}

/**
 * "Probably the same account": timezone plus the sorted artifact set. Same string as
 * `explorer/analysis.ts` `accountKey` produces for any row that stores labels.
 */
export function accountKeyOf(row: Pick<BoardRow, 'timezone' | 'artifacts'>): string {
  return `${row.timezone ?? '?'}::${[...artifactLabels(row)].sort().join('|')}`;
}

/**
 * Characters that draw nothing on their own: control, format (zero-width joiners and spaces, the
 * byte-order mark, bidi marks) and private-use (game icons that only render in one font).
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\u200B-\u200D\u2060\uFEFF]/gu;

/** The name as typed, minus characters that draw nothing. */
export function visibleName(raw: string | undefined): string {
  return (raw ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/**
 * The part of a name that stays put between runs.
 *
 * People use the name box to label a run: `Williamthe5thc 2026-09-18 09:53`,
 * `Willsalt(2 ascent) 2026-09-20 12:02`, `Williamthe5thc (bad sync)`. The same stripping as
 * `analysis.ts` `accountLabel`: a trailing timestamp, then a trailing parenthetical (closed or not).
 */
export function nameLabel(raw: string | undefined): string {
  const visible = visibleName(raw);
  if (!visible) return '';
  const stripped = visible
    .replace(/\s*\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?.*$/, '')
    .replace(/\s*\([^)]*\)?\s*$/, '')
    .trim();
  return stripped || visible;
}

/** `America/Los_Angeles` -> `Los Angeles`. */
export function cityOf(timezone: string | undefined): string {
  if (!timezone) return 'unknown place';
  const last = timezone.split('/').pop() ?? timezone;
  return last.replace(/_/g, ' ');
}

/** True for a name that is only icons or invisible characters. */
export function isIconName(raw: string | undefined): boolean {
  return !!raw?.trim() && !/[\p{L}\p{N}]/u.test(visibleName(raw));
}

/** What to call a name on screen: its label, or "(icon) · <city>" for a name nobody can read. */
export function displayName(raw: string | undefined, timezone: string | undefined): string {
  if (isIconName(raw)) return `(icon) · ${cityOf(timezone)}`;
  return nameLabel(raw);
}

/** The grouping key for one name: case-folded label, or the raw icon text for an icon name. */
function nameKey(raw: string | undefined): string {
  if (!raw?.trim()) return '';
  if (isIconName(raw)) return `icon:${raw.trim()}`;
  return nameLabel(raw).toLocaleLowerCase();
}

/**
 * Group name variants onto one player.
 *
 * Beyond the stripping in `nameLabel`, people also bolt notes on without a separator:
 * `Williamthe5thc- 7 Ascen`, `WillsaltTestCOleegtible`. A label is folded onto a shorter label that
 * someone ALSO used on its own when it starts with it at a word boundary (the next character is not
 * a lowercase letter or digit, so `Will` does not swallow `Willsalt`) and the two names were sent
 * from the same account (timezone plus artifacts). The account test is what keeps an alt called
 * `Kenzie Alt` apart from `Kenzie`: a different account is a different TE history, and merging the
 * two would let one account's runs knock out the other's plans.
 */
export function nameRoots(rows: readonly BoardRow[]): Map<string, string> {
  const byKey = new Map<string, { label: string; accounts: Set<string> }>();
  for (const r of rows) {
    const key = nameKey(r.nickname);
    if (!key) continue;
    const held = byKey.get(key);
    if (held) held.accounts.add(accountKeyOf(r));
    else
      byKey.set(key, {
        label: key.startsWith('icon:') ? key : nameLabel(r.nickname),
        accounts: new Set([accountKeyOf(r)]),
      });
  }
  const keys = [...byKey.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const root = new Map<string, string>();
  for (const key of keys) {
    const me = byKey.get(key)!;
    let target = key;
    if (!key.startsWith('icon:')) {
      for (const shorter of keys) {
        if (shorter.length >= key.length) break;
        if (shorter.startsWith('icon:') || shorter.length < 3 || !key.startsWith(shorter)) continue;
        const next = me.label.charAt(shorter.length);
        if (/[\p{Ll}\p{Nd}]/u.test(next)) continue;
        const other = byKey.get(shorter)!;
        if (![...me.accounts].some(a => other.accounts.has(a))) continue;
        target = root.get(shorter) ?? shorter;
        break;
      }
    }
    root.set(key, target);
  }
  return root;
}

/** The player a name is filed under: its root from `nameRoots`, or '' for no name. */
function rootKey(roots: ReadonlyMap<string, string>, raw: string | undefined): string {
  const k = nameKey(raw);
  return k ? (roots.get(k) ?? k) : '';
}

// ---------------------------------------------------------------------------------- copies

/**
 * Everything that decides a plan's finish, and nothing about who sent it or how it was found.
 * Two rows with the same fingerprint are the same result sent twice. The name, the effort tier,
 * the searched space, the chains priced and the send time are deliberately left out: an anonymous
 * send and a named one of the same result fold, and so does a thorough search that agreed with a
 * balanced one. The finish-the-current-ascension switch IS in: it changes the answer.
 */
export function contentFingerprint(row: BoardRow): string {
  return JSON.stringify([
    row.finalTE,
    row.chain ?? [],
    (row.startLocal ?? '').trim().slice(0, 16),
    Number.isFinite(row.durationDays) ? Math.round(row.durationDays * 1e4) : null,
    row.timezone ?? '',
    [...artifactLabels(row)].sort(),
    row.currentTE ?? null,
    row.window || '',
    !!row.holdShifts,
    !!row.forceContinue,
    (row.timeOff ?? []).map(t => `${t.from}~${t.to}`),
  ]);
}

/** One line for the same result sent one or more times. */
export interface Folded<T extends BoardRow = BoardRow> {
  /** The copy that stands for the group, carrying the earliest named copy's name. */
  row: T;
  /** Every stored copy, earliest sent first. */
  copies: T[];
  /** How the copies were found: `exhaustive` or the effort tier, one each. */
  foundBy: string[];
}

function searchSize(row: BoardRow): number {
  return row.space?.chains || row.chainsPriced || 0;
}

/**
 * Fold exact copies. The row that stands for them is the biggest search (a thorough table beats a
 * balanced one), then one with a CSV, then the earliest; its name is the earliest named copy's,
 * so an anonymous copy never hides who sent the result.
 *
 * Two DIFFERENT players are never folded together, even on identical content: that is somebody
 * re-sending another player's result, and folding would hand one of them the other's line. Names
 * are compared the way the race files them (`nameRoots`), so `Williamthe5thc` and
 * `Williamthe5thc- 7 Ascen` from the same account are one player and their copies fold. Anonymous
 * copies join the earliest named copy.
 *
 * `roots` is the name filing to use; by default it is worked out from `rows` themselves.
 */
export function foldCopies<T extends BoardRow>(
  rows: readonly T[],
  roots: ReadonlyMap<string, string> = nameRoots(rows)
): Folded<T>[] {
  const sentAt = (r: T) => submittedMs(r) ?? Infinity;
  const who = (r: T) => rootKey(roots, r.nickname);
  const byContent = new Map<string, T[]>();
  for (const row of rows) {
    const key = contentFingerprint(row);
    const g = byContent.get(key);
    if (g) g.push(row);
    else byContent.set(key, [row]);
  }
  const groups: T[][] = [];
  for (const group of byContent.values()) {
    const sorted = [...group].sort((a, b) => sentAt(a) - sentAt(b));
    const byName = new Map<string, T[]>();
    for (const r of sorted) {
      const k = who(r);
      if (!k) continue;
      const g = byName.get(k);
      if (g) g.push(r);
      else byName.set(k, [r]);
    }
    if (byName.size <= 1) {
      groups.push(sorted);
      continue;
    }
    const split = [...byName.values()];
    split[0].push(...sorted.filter(r => !who(r)));
    groups.push(...split);
  }
  const out: Folded<T>[] = [];
  for (const group of groups) {
    const copies = [...group].sort((a, b) => sentAt(a) - sentAt(b));
    let rep = copies[0];
    for (const c of copies) {
      const d = searchSize(c) - searchSize(rep) || Number(!!c.hasCsv) - Number(!!rep.hasCsv);
      if (d > 0) rep = c;
    }
    const named = copies.find(c => c.nickname?.trim());
    const row = named && rep.nickname !== named.nickname ? { ...rep, nickname: named.nickname } : rep;
    const foundBy = [...new Set(copies.map(foundByText))].sort();
    out.push({ row, copies, foundBy });
  }
  return out;
}

// ----------------------------------------------------------------------------------- plans

/** The checkpoints still ahead of `te`, plus the target. */
export function remainingChain(chain: readonly number[], te: number): number[] {
  if (!chain.length) return [];
  return [...chain.slice(0, -1).filter(c => c > te), chain[chain.length - 1]];
}

function sameSettings(a: BoardRow, b: BoardRow): boolean {
  const off = (r: BoardRow) => (r.timeOff ?? []).map(t => `${t.from}~${t.to}`).join(',');
  return (
    a.finalTE === b.finalTE &&
    (a.window || '') === (b.window || '') &&
    !!a.holdShifts === !!b.holdShifts &&
    // Rows sent before the switch existed did not record it: unknown matches either answer.
    (a.forceContinue == null || b.forceContinue == null || a.forceContinue === b.forceContinue) &&
    off(a) === off(b)
  );
}

const sameChain = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Does `later` price the same plan as `earlier`? Same settings, and the same route -- or the route
 * with the checkpoints the player has since passed dropped off.
 */
export function samePlan(earlier: BoardRow, later: BoardRow): boolean {
  if (!sameSettings(earlier, later)) return false;
  const a = earlier.chain ?? [];
  const b = later.chain ?? [];
  if (sameChain(a, b)) return true;
  return typeof later.currentTE === 'number' && sameChain(remainingChain(a, later.currentTE), b);
}

/**
 * Where `plan` said the player would be at instant `at`: linear inside each leg, starting from the
 * plan's own TE. Null when the plan has no legs or no start.
 */
export function projectedTE(plan: BoardRow, at: number): number | null {
  const start = startMs(plan);
  const legs = plan.legs ?? [];
  if (start == null || !legs.length || typeof plan.currentTE !== 'number') return null;
  const elapsed = (at - start) / DAY_MS;
  if (elapsed <= 0) return plan.currentTE;
  let prev = plan.currentTE;
  let acc = 0;
  for (const leg of legs) {
    if (!Number.isFinite(leg.days) || !Number.isFinite(leg.te)) return null;
    if (elapsed <= acc + leg.days) {
      return leg.days > 0 ? prev + ((leg.te - prev) * (elapsed - acc)) / leg.days : leg.te;
    }
    acc += leg.days;
    prev = leg.te;
  }
  return plan.finalTE;
}

/** When the save the plan was made from was taken: its start minus how stale the save was. */
function saveMoment(row: BoardRow): number | null {
  const s = startMs(row);
  if (s == null) return null;
  const age = row.backupAgeHours;
  return typeof age === 'number' && Number.isFinite(age) ? s - age * HOUR_MS : s;
}

/** Made from the same save, so their finishes compare exactly. */
export function sameSave(a: BoardRow, b: BoardRow): boolean {
  if (accountKeyOf(a) !== accountKeyOf(b) || a.currentTE !== b.currentTE) return false;
  const x = saveMoment(a);
  const y = saveMoment(b);
  return x != null && y != null && Math.abs(x - y) <= SAME_SAVE_MS;
}

export type PlanState = 'current' | 'replaced' | 'behind' | 'what-if' | 'old-save' | 'old' | 'no-date';

export interface Plan<T extends BoardRow = BoardRow> {
  folded: Folded<T>;
  row: T;
  start: number | null;
  finish: number | null;
  state: PlanState;
  /** Why the plan was dropped, in player words. Empty for a current plan. */
  reason: string;
  /** The newer run that re-measured this plan, when `state` is `replaced`. */
  replacedBy?: Plan<T>;
  /** Earlier runs of this same plan that this one replaced, oldest first. */
  earlier: Plan<T>[];
  /** How many times the plan was measured, and how far the finish moved since the first. */
  recheck: { count: number; movedDays: number; unchanged: boolean } | null;
  /** The latest later run, and where this plan said the player would be by then. */
  progress: { te: number; projected: number; at: number } | null;
}

export interface RankOptions {
  target: number;
  now: number;
}

/** `23 Nov` for a reason line. */
function shortDate(ms: number, timezone: string | undefined): string {
  return formatDate(ms, timezone, { day: 'numeric', month: 'short' });
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** A date in the plan's own zone, falling back to UTC for an unknown zone. */
export function formatDate(ms: number | null, timezone: string | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const key = `${timezone || 'UTC'}|${JSON.stringify(opts)}`;
  let f = dateFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: timezone || 'UTC' });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' });
    }
    dateFormatters.set(key, f);
  }
  return f.format(new Date(ms));
}

/** Start more than 12 h after the send: "what if I started on 23 Nov". */
function futureStart(row: BoardRow): boolean {
  const s = startMs(row);
  const sent = submittedMs(row);
  return s != null && sent != null && s > sent + WHAT_IF_LEAD_MS;
}

/** A run judged against the player's TE history. */
interface Evidence<T extends BoardRow> {
  f: Folded<T>;
  row: T;
  start: number;
  sent: number | null;
  /** When its save was taken (`saveMoment`). */
  save: number;
  te: number | null;
}

/** Lexical order by start, then by send time: "strictly before" for the old-save test. */
function earlierRun<T extends BoardRow>(a: Evidence<T>, b: Evidence<T>): boolean {
  if (a.start !== b.start) return a.start < b.start;
  return a.sent != null && b.sent != null && a.sent < b.sent;
}

/**
 * Can `e` show that `x` was planned from a TE the account did not have? Yes when it starts later,
 * however soon after (a what-if at 15:00 and the real run at 15:30), and yes when it starts at the
 * SAME minute: the plan start comes from the planner's schedule inputs, so two runs sharing it were
 * made from one save, and one save has one TE -- the higher of the two was typed in, whichever was
 * sent first. The send time alone is not enough: an old planner tab re-sent days later keeps its
 * old start and the TE it had then, which is history, not a contradiction.
 */
function newerRun<T extends BoardRow>(e: Evidence<T>, x: Evidence<T>): boolean {
  return e !== x && e.start >= x.start;
}

/**
 * Which runs contradict the account's TE history, and how.
 *
 * An account's TE only goes up. The spec rule comes first: a run is a what-if when a newer run of
 * the same player (`newerRun`: a later or the same plan start) started more than 1 TE lower -- it
 * was planned from a TE the account did not have. Any number of what-ifs from a higher TE never
 * outvote one real run below them.
 *
 * The one exception is a run that is itself the odd one out, made from an older save (a bad sync,
 * a backup loaded by mistake). A lower run is only taken as that on a signal stronger than being
 * lower:
 *   - its save is older than the save of a run that started no later than it did, and that run
 *     already had a higher TE (the save age the app records says so directly); or
 *   - runs more than 1 TE higher sit on BOTH sides of it, and the ones after it agree with the ones
 *     before it (Williamthe5thc's 159 between runs at 180 and 181-182).
 * An old-save run is not evidence against anything. A lone lower run that is the newest therefore
 * still makes the higher runs before it what-ifs.
 *
 * Runs that carry no TE cannot contradict anything and are never flagged.
 */
function judgeHistory<T extends BoardRow>(
  evidence: readonly Evidence<T>[]
): { oldSave: Map<Evidence<T>, Evidence<T>>; whatIf: Map<Evidence<T>, Evidence<T>> } {
  const withTE = evidence.filter(e => e.te != null);
  const oldSave = new Map<Evidence<T>, Evidence<T>>();
  for (const x of withTE) {
    const te = x.te!;
    // A newer save, used by a run that started no later, with a higher TE.
    const fresher = withTE.filter(
      e => e !== x && e.te! > te + 1 && e.start <= x.start && e.save > x.save + SAME_SAVE_MS
    );
    if (fresher.length) {
      oldSave.set(
        x,
        fresher.reduce((a, b) => (b.te! > a.te! ? b : a))
      );
      continue;
    }
    const before = withTE.filter(e => e.te! > te + 1 && earlierRun(e, x));
    const after = withTE.filter(e => e.te! > te + 1 && earlierRun(x, e));
    if (!before.length || !after.length) continue;
    const topAfter = Math.max(...after.map(e => e.te!));
    const agreeing = before.filter(b => b.te! <= topAfter + 1);
    if (agreeing.length)
      oldSave.set(
        x,
        agreeing.reduce((a, b) => (b.te! > a.te! ? b : a))
      );
  }
  const whatIf = new Map<Evidence<T>, Evidence<T>>();
  const trusted = withTE.filter(e => !oldSave.has(e));
  for (const x of trusted) {
    const lower = trusted.filter(e => e.te! < x.te! - 1 && newerRun(e, x));
    if (lower.length)
      whatIf.set(
        x,
        lower.reduce((a, b) => (b.te! < a.te! ? b : a))
      );
  }
  return { oldSave, whatIf };
}

/**
 * Judge each plan at the target against the evidence in `peers` (the same player's other rows, any
 * target). `candidates` must be a subset of `peers`.
 *
 * Every peer counts as evidence for the TE history and for "behind", but only a candidate -- one of
 * the lines this call is judging -- can re-measure a plan. A newer run of the same plan that is not
 * one of these lines would leave the plan replaced by nothing.
 */
export function assessPlans<T extends BoardRow>(
  candidates: readonly Folded<T>[],
  peers: readonly Folded<T>[],
  { target, now }: RankOptions
): Plan<T>[] {
  const evidence: Evidence<T>[] = [];
  for (const f of peers) {
    const start = startMs(f.row);
    if (start == null || futureStart(f.row)) continue;
    const te = f.row.currentTE;
    evidence.push({
      f,
      row: f.row,
      start,
      sent: submittedMs(f.row),
      save: saveMoment(f.row) ?? start,
      te: typeof te === 'number' && Number.isFinite(te) ? te : null,
    });
  }
  const { oldSave, whatIf } = judgeHistory(evidence);
  const byEvidence = new Map(evidence.map(e => [e.f, e]));

  /** Why a run's TE does not fit the account's history (a what-if or an old save), or null. */
  const offHistory = (f: Folded<T>, start: number | null): { state: PlanState; reason: string } | null => {
    const row = f.row;
    if (futureStart(row)) {
      return { state: 'what-if', reason: `what-if start (planned to start ${shortDate(start!, row.timezone)})` };
    }
    const e = byEvidence.get(f);
    if (!e) return null;
    const low = whatIf.get(e);
    if (low) {
      const which = low.start === e.start ? 'a run from the same plan start was at' : 'a later run started at';
      return { state: 'what-if', reason: `what-if: planned from TE ${e.te}, ${which} TE ${low.te}` };
    }
    const top = oldSave.get(e);
    if (top) {
      return {
        state: 'old-save',
        reason: `made from an old save: TE ${e.te}, but a run on ${shortDate(top.start, top.row.timezone)} already had TE ${top.te}`,
      };
    }
    return null;
  };
  // Only runs that fit the account's history can re-measure a plan or show the player behind it.
  const real = evidence.filter(e => !oldSave.has(e) && !whatIf.has(e)).sort((a, b) => a.start - b.start);

  const plans: Plan<T>[] = candidates
    .filter(f => f.row.finalTE === target)
    .map(f => ({
      folded: f,
      row: f.row,
      start: startMs(f.row),
      finish: finishMs(f.row),
      state: 'current' as PlanState,
      reason: '',
      earlier: [],
      recheck: null,
      progress: null,
    }));
  const byFolded = new Map(plans.map(p => [p.folded, p]));

  for (const p of plans) {
    if (p.start == null || p.finish == null) {
      p.state = 'no-date';
      p.reason = 'no finish date (the plan start or timezone is missing)';
      continue;
    }
    const off = offHistory(p.folded, p.start);
    if (off) {
      p.state = off.state;
      p.reason = off.reason;
      continue;
    }
    const later = real.filter(e => e.start > p.start! + LATER_MS && e.f !== p.folded);
    // A newer measurement of this plan, among the lines judged here, that has a finish of its own.
    const remeasure = later.find(e => {
      const line = byFolded.get(e.f);
      return !!line && line.finish != null && samePlan(p.row, e.row);
    });
    if (remeasure) {
      p.state = 'replaced';
      p.reason = `replaced by a newer run of the same plan (${shortDate(remeasure.start, remeasure.row.timezone)})`;
      p.replacedBy = byFolded.get(remeasure.f);
      continue;
    }
    let behind = '';
    let last: Plan<T>['progress'] = null;
    const newest = real.length ? real[real.length - 1] : null;
    for (const e of later) {
      const projected = projectedTE(p.row, e.start);
      if (projected == null || e.te == null) continue;
      last = { te: e.te, projected, at: e.start };
      // The newest run that shows it wins the wording: it is the closest to "where you are now".
      if (e.te <= projected - BEHIND_TE) {
        const when = e === newest ? 'now' : `on ${shortDate(e.start, e.row.timezone)}`;
        behind = `behind: at TE ${e.te} ${when}, the plan said ${projected.toFixed(1)}`;
      }
    }
    p.progress = last;
    if (behind) {
      p.state = 'behind';
      p.reason = behind;
      continue;
    }
    if (now - p.start > MAX_AGE_MS) {
      p.state = 'old';
      p.reason = 'older than 30 days';
    }
  }

  // Chain each re-measure onto the plan it led to, so "re-checked x30" lands on one line.
  const rootOf = (p: Plan<T>): Plan<T> => {
    let cur = p;
    const seen = new Set<Plan<T>>();
    while (cur.replacedBy && !seen.has(cur)) {
      seen.add(cur);
      cur = cur.replacedBy;
    }
    return cur;
  };
  for (const p of plans) {
    if (p.state !== 'replaced') continue;
    const root = rootOf(p);
    if (root !== p) root.earlier.push(p);
  }
  for (const p of plans) {
    if (!p.earlier.length) continue;
    p.earlier.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const first = p.earlier[0];
    const moved = p.finish != null && first.finish != null ? p.finish - first.finish : 0;
    p.recheck = {
      count: p.earlier.length + 1,
      movedDays: moved / DAY_MS,
      unchanged: Math.abs(moved) < UNCHANGED_MS,
    };
  }
  return plans;
}

/** Earliest finish first; a tie goes to the more recent start. */
function byFinish<T extends BoardRow>(a: Plan<T>, b: Plan<T>): number {
  return (a.finish ?? Infinity) - (b.finish ?? Infinity) || (b.start ?? 0) - (a.start ?? 0);
}

export interface PlayerPlans<T extends BoardRow = BoardRow> {
  /** Stable key: `name:<label>` or `account:<timezone::artifacts>` for anonymous rows. */
  key: string;
  /** What to call the player. */
  label: string;
  named: boolean;
  /** Every plan at the target, current and dropped. */
  plans: Plan<T>[];
  /** The earliest-finishing current plan, or null. */
  best: Plan<T> | null;
  /** Current plans other than `best`, earliest finish first. */
  others: Plan<T>[];
  /**
   * Dropped plans, newest first. A re-measured plan is not listed here: it lives in the `earlier`
   * of the line that re-measured it.
   */
  dropped: Plan<T>[];
  /** Re-measured plans, newest first. */
  replaced: Plan<T>[];
  /** Stored rows behind these plans, copies included. */
  sends: number;
  /** Distinct plans: re-measures and copies of one plan count once. */
  plansTried: number;
  /** Account keys this player's rows carry. */
  accounts: Set<string>;
}

function summarise<T extends BoardRow>(key: string, label: string, named: boolean, plans: Plan<T>[]): PlayerPlans<T> {
  const current = plans.filter(p => p.state === 'current').sort(byFinish);
  const newest = (a: Plan<T>, b: Plan<T>) => (b.start ?? 0) - (a.start ?? 0);
  // A line of its own: anything not folded into a newer run of the same plan.
  const ownLine = (p: Plan<T>) => p.state !== 'replaced' || !p.replacedBy;
  return {
    key,
    label,
    named,
    plans,
    best: current[0] ?? null,
    others: current.slice(1),
    dropped: plans.filter(p => p.state !== 'current' && ownLine(p)).sort(newest),
    replaced: plans.filter(p => p.state === 'replaced').sort(newest),
    sends: plans.reduce((n, p) => n + p.folded.copies.length, 0),
    plansTried: plans.filter(ownLine).length,
    accounts: new Set(plans.map(p => accountKeyOf(p.row))),
  };
}

/** The most common spelling of a player's label; the shortest breaks a tie. */
function pickLabel(rows: readonly BoardRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const l = displayName(r.nickname, r.timezone);
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let best = '';
  let n = -1;
  for (const [l, c] of counts) {
    if (c > n || (c === n && l.length < best.length)) {
      best = l;
      n = c;
    }
  }
  return best;
}

/** Group folded rows into players and judge each one's plans. */
export function groupPlayers<T extends BoardRow>(rows: readonly T[], opts: RankOptions): PlayerPlans<T>[] {
  // One name filing for everything below, worked out over every row sent (copies included), so the
  // copy fold and the player groups agree on who is who.
  const roots = nameRoots(rows);
  const folded = foldCopies(rows, roots);
  const keyOf = (f: Folded<T>) => {
    const k = rootKey(roots, f.row.nickname);
    return k ? `name:${k}` : `account:${accountKeyOf(f.row)}`;
  };
  const groups = new Map<string, Folded<T>[]>();
  for (const f of folded) {
    const k = keyOf(f);
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }
  const byAccount = new Map<string, Folded<T>[]>();
  for (const f of folded) {
    const k = accountKeyOf(f.row);
    const g = byAccount.get(k);
    if (g) g.push(f);
    else byAccount.set(k, [f]);
  }

  const out: PlayerPlans<T>[] = [];
  for (const [key, group] of groups) {
    // Evidence: this player's rows, plus any row from the same timezone and artifact set.
    const peers = new Set(group);
    for (const f of group) for (const x of byAccount.get(accountKeyOf(f.row)) ?? []) peers.add(x);
    const named = key.startsWith('name:');
    const candidates = named ? withUnnamedRechecks(group, peers, opts.target) : group;
    const plans = assessPlans(candidates, [...peers], opts);
    const label = named ? pickLabel(group.map(f => f.row)) : `anonymous · ${cityOf(group[0].row.timezone)}`;
    out.push(summarise(key, label, named, plans));
  }
  return out;
}

/**
 * A named player's lines plus every UNNAMED run from the same account that re-measures one of
 * their plans later on.
 *
 * The Submit panel starts every visit on "anonymous", so a plan sent with a name on day 1 is often
 * re-run without one on day 2. That re-run is the newest measurement of the player's plan, and
 * leaving it out would either keep an out-of-date finish or -- worse -- let it replace the named
 * plan with nothing standing in its place. Taking it into the player's lines keeps one line with
 * "re-checked x2". A run under a DIFFERENT name is never taken: that name is somebody's own line.
 */
function withUnnamedRechecks<T extends BoardRow>(
  group: readonly Folded<T>[],
  peers: ReadonlySet<Folded<T>>,
  target: number
): Folded<T>[] {
  const lines = new Set(group);
  const pool = [...peers].filter(x => !lines.has(x) && !x.row.nickname?.trim() && x.row.finalTE === target);
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of pool) {
      if (lines.has(x)) continue;
      const xs = startMs(x.row);
      if (xs == null) continue;
      const rechecks = [...lines].some(c => {
        const cs = startMs(c.row);
        return (
          cs != null &&
          c.row.finalTE === target &&
          accountKeyOf(c.row) === accountKeyOf(x.row) &&
          xs > cs + LATER_MS &&
          samePlan(c.row, x.row)
        );
      });
      if (rechecks) {
        lines.add(x);
        grew = true;
      }
    }
  }
  return [...lines];
}

export interface RaceEntry<T extends BoardRow = BoardRow> extends PlayerPlans<T> {
  rank: number;
  best: Plan<T>;
}

export interface Race<T extends BoardRow = BoardRow> {
  entries: RaceEntry<T>[];
  /** Named players with plans at the target but none current, and why. */
  waiting: PlayerPlans<T>[];
}

/**
 * The race: one line per NAMED player, ranked by the earliest finish among their current plans.
 * Anonymous rows are not ranked -- a name is how you join -- but still count as evidence against
 * plans from the same account, and still show in All runs.
 */
export function buildRace<T extends BoardRow>(rows: readonly T[], opts: RankOptions): Race<T> {
  const players = groupPlayers(rows, opts).filter(p => p.named && p.plans.length);
  const ranked = players
    .filter((p): p is PlayerPlans<T> & { best: Plan<T> } => p.best != null)
    .sort((a, b) => byFinish(a.best, b.best) || a.label.localeCompare(b.label))
    .map((p, i) => ({ ...p, rank: i + 1 }));
  const waiting = players.filter(p => !p.best).sort((a, b) => a.label.localeCompare(b.label));
  return { entries: ranked, waiting };
}

/**
 * Where a finish would sit in the race: one more than the number of other players who finish
 * sooner. `selfKey` leaves the viewer's own line out when they are already in it. Null for no finish.
 */
export function placeFor<T extends BoardRow>(race: Race<T>, finish: number | null, selfKey?: string): number | null {
  if (finish == null || !Number.isFinite(finish)) return null;
  return 1 + race.entries.filter(e => e.key !== selfKey && e.best.finish != null && e.best.finish < finish).length;
}

/**
 * The viewer's own plans: every row whose timezone and artifact set match the loaded save. Returns
 * null when nothing matches. Evidence also includes rows filed under the same names.
 */
export function buildMyPlans<T extends BoardRow>(
  rows: readonly T[],
  accountKey: string,
  opts: RankOptions
): PlayerPlans<T> | null {
  const roots = nameRoots(rows);
  const folded = foldCopies(rows, roots);
  const mine = folded.filter(f => accountKeyOf(f.row) === accountKey);
  if (!mine.some(f => f.row.finalTE === opts.target)) return null;
  const names = new Set(mine.map(f => rootKey(roots, f.row.nickname)).filter(Boolean));
  const peers = folded.filter(f => accountKeyOf(f.row) === accountKey || names.has(rootKey(roots, f.row.nickname)));
  const plans = assessPlans(mine, peers, opts);
  const named = mine.map(f => f.row).filter(r => r.nickname?.trim());
  return summarise(`account:${accountKey}`, named.length ? pickLabel(named) : 'you', named.length > 0, plans);
}

/**
 * Days between `plan` and `best`, only when both came from the same save -- the one comparison
 * where the gap is the plans and not the time between them. Null otherwise.
 */
export function gapToBest<T extends BoardRow>(plan: Plan<T>, best: Plan<T>): number | null {
  if (plan === best || plan.finish == null || best.finish == null) return null;
  return sameSave(plan.row, best.row) ? (plan.finish - best.finish) / DAY_MS : null;
}

// ------------------------------------------------------------------------------------- words

/** The viewer's own timezone, or UTC when the browser will not say. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * `19 Jul 2028` in `timezone`. The board shows every finish in the VIEWER's zone, so a list sorted
 * by finish reads in date order and "days left" counts the same calendar days as the date beside it.
 */
export function finishDateText(finish: number | null, timezone: string | undefined): string {
  return formatDate(finish, timezone, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The full local finish and its zone, for a tooltip. */
export function finishTitle(finish: number | null, timezone: string | undefined): string {
  const text = formatDate(finish, timezone, { dateStyle: 'medium', timeStyle: 'short' });
  return text === '—' ? 'No finish date: the plan start or timezone is missing' : `${text}, ${timezone || 'UTC'} time`;
}

/** The calendar day `ms` falls on in `timezone` (UTC for an unknown zone), as a day count. */
function calendarDay(ms: number, timezone: string | undefined): number {
  const offset = zoneOffsetMs(timezone || 'UTC', ms) ?? 0;
  return Math.floor((ms + offset) / DAY_MS);
}

/**
 * Whole calendar days from today to the finish date, both read in `timezone`: `663`. Counted on
 * the calendar, not rounded from the exact moment, so two plans showing the same date always show
 * the same number and a later date never shows a smaller one. `reached` once the finish has passed.
 */
export function calendarDaysLeft(finish: number | null, now: number, timezone: string | undefined): number | null {
  if (finish == null || !Number.isFinite(finish) || !Number.isFinite(now)) return null;
  return calendarDay(finish, timezone) - calendarDay(now, timezone);
}

/** The Days left column: `663`, `0` on the day itself, `reached` once the finish has passed. */
export function daysLeftText(finish: number | null, now: number, timezone: string | undefined): string {
  const d = calendarDaysLeft(finish, now, timezone);
  if (d == null) return '—';
  return finish! < now ? 'reached' : String(d);
}

/** The same count as a phrase for running text: `663 days left`, `1 day left`, `today`, `date passed`. */
export function daysLeftPhrase(finish: number | null, now: number, timezone: string | undefined): string {
  const d = calendarDaysLeft(finish, now, timezone);
  if (d == null) return '';
  if (finish! < now) return 'date passed';
  if (d === 0) return 'today';
  return d === 1 ? '1 day left' : `${d} days left`;
}

/** `+0.39 d`, with two decimals under a day and one above. */
export function signedDays(days: number): string {
  const abs = Math.abs(days);
  return `${days < 0 ? '−' : '+'}${abs < 1 ? abs.toFixed(2) : abs.toFixed(1)} d`;
}

/**
 * When the plan was made, and what has been learned since: `24 Sep`,
 * `25 Sep · re-checked ×2, finish unchanged`, `17 Sep · on track (TE 182, plan said 182.8)`.
 */
export function plannedText(plan: Plan): string {
  const tz = plan.row.timezone;
  const sent = submittedMs(plan.row);
  // A what-if start is not when the plan was made: say both, so "23 Nov" is not read as a date
  // that has already happened.
  const first =
    plan.start == null
      ? '—'
      : futureStart(plan.row) && sent != null
        ? `${shortDate(sent, tz)}, to start ${shortDate(plan.start, tz)}`
        : shortDate(plan.start, tz);
  const parts = [first];
  if (plan.recheck) {
    const moved = plan.recheck.unchanged ? 'finish unchanged' : `finish moved ${signedDays(plan.recheck.movedDays)}`;
    parts.push(`re-checked ×${plan.recheck.count}, ${moved}`);
  }
  if (plan.state === 'current' && plan.progress) {
    parts.push(`on track (TE ${plan.progress.te}, plan said ${plan.progress.projected.toFixed(1)})`);
  }
  return parts.join(' · ');
}

/** The short tag a dropped plan carries next to its route. */
export function stateTag(state: PlanState): string {
  switch (state) {
    case 'what-if':
      return 'what-if';
    case 'behind':
      return 'behind';
    case 'replaced':
      return 'replaced';
    case 'old-save':
      return 'old save';
    case 'old':
      return 'over 30 days';
    case 'no-date':
      return 'no date';
    default:
      return '';
  }
}

/**
 * Words for the settings that tell look-alike lines apart. Two lines with the same target, route and
 * start (Halceyx's two 277 490 plans) can still differ in whether the first ascension finishes the
 * current run or in held shifts, and nothing else on the line would show it. Only rows that have
 * such a look-alike in `rows` get an entry; the rest read fine as they are.
 */
export function settingTags<T extends BoardRow>(rows: readonly T[]): Map<T, string[]> {
  const look = (r: T) =>
    JSON.stringify([r.finalTE, r.chain ?? [], (r.startLocal ?? '').trim().slice(0, 16), r.timezone ?? '']);
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = look(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out = new Map<T, string[]>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const differs = (f: (r: T) => unknown) => new Set(g.map(f)).size > 1;
    const first = differs(r => r.forceContinue ?? null);
    const held = differs(r => !!r.holdShifts);
    for (const r of g) {
      const tags: string[] = [];
      if (first && r.forceContinue != null) tags.push(r.forceContinue ? 'finishes current run first' : 'prestiges now');
      if (held) tags.push(r.holdShifts ? 'shifts held' : 'shifts not held');
      if (tags.length) out.set(r, tags);
    }
  }
  return out;
}

/** What one copy of a result was found with: `exhaustive`, `partial`, or the effort tier. */
export function foundByText(row: Pick<BoardRow, 'space' | 'effort'>): string {
  if (row.space) return row.space.stoppedEarly ? 'partial' : 'exhaustive';
  return row.effort || 'unknown';
}

/** Who sent a run, as All runs shows it: the name as typed minus invisible characters. */
export function whoText(row: Pick<BoardRow, 'nickname' | 'timezone'>): string {
  if (isIconName(row.nickname)) return displayName(row.nickname, row.timezone);
  return visibleName(row.nickname);
}
