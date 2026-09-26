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
 * WHO COUNTS AS THE SAME PLAYER. Phase 1 had no owner code to go on, so it used what the rows carry:
 * a cleaned name label (the annotations people type into the name box are stripped, see
 * `nameLabel`), and for evidence that can show a plan behind or a what-if, also the same timezone
 * plus artifact set -- the proxy `explorer/analysis.ts` `accountKey` uses. Every one of those fields
 * is public, so one forged row could knock a real player's plan out.
 *
 * PHASE 2 (collector redeploy, 2026-09-25): a named row sent with an owner code carries `acct`, a
 * short HMAC of that code's hash (search/owner.ts). It is the player's identity, exactly: rows with
 * the same `acct` are one player whatever name they were sent under, and the line is called by the
 * newest name. What may judge a plan -- replace it, show the player behind it, make it a what-if --
 * is now narrowed to `mayJudge`: a row with the SAME `acct`, or, when NEITHER row has one (runs from
 * before owner codes, anonymous runs), the phase-1 rules above. A row with an `acct` never judges
 * one without, nor the other way round, so nobody can drop another player's result by sending rows
 * dressed as theirs. Rows sent under a name BEFORE the collector stamped rows (no `receivedAt`) still
 * sit on the line of the first owner code seen with that name (`fileRows`), so a player is one line,
 * not two; they are judged among themselves until they age out. A row sent under that name since,
 * without a code, is not theirs to inherit: anyone can send one, so it files under the name alone
 * (`playerKey`) and never stands for, names or badges the owner's line (`foldCopies`).
 *
 * RE-CHECKS. A schema-7 row carries `rechecks`: the player's best earlier plans priced again from
 * that run's save. Each one counts as a newer run of the plan it matches (`recheckLines`), so a plan
 * that has slipped is replaced without the player having to run it again.
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
/** A plan starting more than this before the save it was made from is a what-if (schema 7). The
 *  save age is rounded to a tenth of an hour, so anything closer is rounding. */
const BEFORE_SAVE_HOURS = 0.1;

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
  /** ISO 8601, stamped by the app when the submission was built. The sender's own clock. */
  submittedAt?: string;
  /** ISO 8601, stamped by the collector when the row arrived (phase 2). Unlike `submittedAt` the
   *  sender cannot set it, so it is what the what-if rule reads when present. */
  receivedAt?: string;
  /** Schema of the row as sent. */
  schema?: number;
  /** Schema 7: the plan start and end as instants, to the minute. */
  startUtc?: string;
  endUtc?: string;
  /** How stale the save was at plan start, in hours. Signed from schema 7: negative is a plan that
   *  starts before its save. */
  backupAgeHours?: number;
  /** Schema 7: the save's own TE. */
  backupTE?: number;
  /** Schema 7: which planner build priced it. */
  build?: string;
  /** Schema 7: the sender's best earlier plans priced again from this row's save and start. */
  rechecks?: { chain: number[]; days: number }[];
  /**
   * The player, exactly (phase 2): 12 hex characters of an HMAC of the sender's owner code. Only on
   * rows that carry a name AND were sent with a code, never on an anonymous row, so the board links
   * no anonymous run to anyone.
   */
  acct?: string;
  /** The first row with the same result found by a different search, from the same sender. */
  dupOf?: string;
  /** Only on rows from GET /mine: sent with the code this browser presented. */
  yours?: boolean;
  /** Why a row is on the flagged board. Such rows are never ranked. */
  flags?: string[];
  /** Set by this module on a line made from another row's `rechecks` entry: that row's id. */
  recheckOf?: string;
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

/**
 * When the plan starts, as an instant. A schema-7 row says so itself (`startUtc`); an older one is
 * read from its local start and zone, which is exact except in the hour a clock change repeats.
 */
export function startMs(row: Pick<BoardRow, 'startLocal' | 'timezone' | 'startUtc'>): number | null {
  if (typeof row.startUtc === 'string') {
    const t = Date.parse(row.startUtc);
    if (Number.isFinite(t)) return t;
  }
  return localToUtcMs(row.startLocal, row.timezone);
}

/**
 * When the plan reaches its target: its own start plus its length. Never read from `endLocal`,
 * which is a local wall-clock string that sorts wrong across zones and daylight saving.
 */
export function finishMs(row: Pick<BoardRow, 'startLocal' | 'timezone' | 'durationDays' | 'startUtc'>): number | null {
  const start = startMs(row);
  const days = row.durationDays;
  if (start == null || typeof days !== 'number' || !Number.isFinite(days)) return null;
  const f = start + days * DAY_MS;
  return Number.isFinite(f) ? f : null;
}

/** Days from `now` to the finish, the same clock for everybody. Null when there is no finish. */
export function daysLeft(
  row: Pick<BoardRow, 'startLocal' | 'timezone' | 'durationDays' | 'startUtc'>,
  now: number
): number | null {
  const f = finishMs(row);
  return f == null ? null : (f - now) / DAY_MS;
}

/** When the row was sent by the sender's own clock, or null. */
export function submittedMs(row: Pick<BoardRow, 'submittedAt'>): number | null {
  if (!row.submittedAt) return null;
  const t = Date.parse(row.submittedAt);
  return Number.isFinite(t) ? t : null;
}

/**
 * When the row was sent: the collector's own stamp when it has one (phase 2), else the sender's.
 * `submittedAt` is whatever the posting client wrote, so a what-if dressed with a send time next to
 * its start would pass for a real plan; `receivedAt` cannot be dressed.
 */
export function sentMs(row: Pick<BoardRow, 'submittedAt' | 'receivedAt'>): number | null {
  if (row.receivedAt) {
    const t = Date.parse(row.receivedAt);
    if (Number.isFinite(t)) return t;
  }
  return submittedMs(row);
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

/** How the rows on the board are filed into players. Worked out once over every row. */
export interface Filing {
  /** Name variants onto one name (`nameRoots`). */
  roots: ReadonlyMap<string, string>;
  /**
   * Name root -> the owner (`acct`) first seen sending under it. Rows sent under that name without an
   * owner BEFORE the collector stamped rows (`receivedAt`, phase 2) sit on that owner's line rather
   * than making a second line with the same name. Only those: nobody can add one now, where a
   * code-less row sent since could be anybody's (see `playerKey`). They are filed there for DISPLAY
   * only: `mayJudge` still never lets a row with an owner judge one without.
   */
  heirs: ReadonlyMap<string, string>;
}

export function fileRows(rows: readonly BoardRow[]): Filing {
  const roots = nameRoots(rows);
  const first = new Map<string, { acct: string; at: number }>();
  for (const r of rows) {
    if (!r.acct) continue;
    const k = rootKey(roots, r.nickname);
    if (!k) continue;
    const at = sentMs(r) ?? Infinity;
    const held = first.get(k);
    if (!held || at < held.at) first.set(k, { acct: r.acct, at });
  }
  return { roots, heirs: new Map([...first].map(([k, v]) => [k, v.acct])) };
}

/**
 * The player a row belongs to: `acct:<acct>` for a row with an owner (or a pre-stamp row under a name
 * an owner inherited), `name:<root>` for any other named row, '' for an anonymous row.
 *
 * The heir takes a name's rows only from before the collector stamped `receivedAt`. A code-less row
 * sent since under that name is not the owner's: filed on their line it would count as their own copy,
 * could stand for their result with a bigger search, carry their `acct`, and then judge their plans
 * -- a stranger re-posting Allan's row under his name, with no code and a `backupTE` of 0, knocked his
 * only plan out of the race as a "what-if" (review, 2026-09-26). It files as `name:<root>` instead: a
 * line of its own, judged only by rows without an owner.
 */
export function playerKey(filing: Filing, row: Pick<BoardRow, 'acct' | 'nickname' | 'receivedAt'>): string {
  if (row.acct) return `acct:${row.acct}`;
  const k = rootKey(filing.roots, row.nickname);
  if (!k) return '';
  const heir = row.receivedAt ? undefined : filing.heirs.get(k);
  return heir ? `acct:${heir}` : `name:${k}`;
}

/**
 * May `evidence` judge `plan` -- replace it, show the player behind it, make it a what-if? Only a row
 * from the same owner, or, when neither has one, a row the phase-1 rules tie to it: the same name
 * (as filed) or the same timezone and artifact set. See the module comment.
 */
export function mayJudge(filing: Filing, evidence: BoardRow, plan: BoardRow): boolean {
  if (evidence.acct || plan.acct) return !!evidence.acct && evidence.acct === plan.acct;
  if (accountKeyOf(evidence) === accountKeyOf(plan)) return true;
  const a = rootKey(filing.roots, evidence.nickname);
  return !!a && a === rootKey(filing.roots, plan.nickname);
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
  /**
   * The player the line was folded for (`playerKey` of its earliest filed copy), '' for all-anonymous
   * copies. The race files the line by this, not by its relabelled row: a row standing in for a name
   * or an owner must not move the line onto somebody else's.
   */
  player?: string;
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
 * re-sending another player's result, and folding would hand one of them the other's line. Players
 * are compared the way the race files them (`playerKey`): by owner where rows have one, else by name
 * (`nameRoots`), so `Williamthe5thc` and `Williamthe5thc- 7 Ascen` from the same account are one
 * player and their copies fold. Anonymous copies join the earliest named copy.
 *
 * THE LINE SPEAKS ONLY FOR ITS OWN PLAYER (`ownCopies`). A copy stands for the group only when the
 * group's player provably sent it: it carries their `acct` (or, for a line with no owner, it is
 * filed under their name), the collector tied it to one of those (`dupOf` runs within one sender),
 * or it predates the collector's stamp (`receivedAt`) and so the rules. Otherwise it is a stranger
 * re-posting a public result, and letting it be the representative would let them attach a bigger
 * search, an "exhaustive" badge, or their own schema-7 evidence (`backupTE`, `startUtc`, `rechecks`)
 * to someone else's line. It still counts as a copy. The line carries its player's `acct` whichever
 * of their copies stands for it, and never anyone else's.
 *
 * `filing` is how names and owners are filed; by default it is worked out from `rows` themselves.
 */
export function foldCopies<T extends BoardRow>(rows: readonly T[], filing: Filing = fileRows(rows)): Folded<T>[] {
  const sentAt = (r: T) => sentMs(r) ?? Infinity;
  const who = (r: T) => playerKey(filing, r);
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
    const key = copies.map(who).find(Boolean) ?? '';
    const own = ownCopies(copies, key, who);
    let rep = copies.find(c => own.has(c)) ?? copies[0];
    for (const c of copies) {
      if (!own.has(c)) continue;
      const d = searchSize(c) - searchSize(rep) || Number(!!c.hasCsv) - Number(!!rep.hasCsv);
      if (d > 0) rep = c;
    }
    const named = copies.find(c => c.nickname?.trim() && (!key || who(c) === key));
    // The line is the group's player: their `acct` when one of the copies was sent with their code
    // (every copy that may stand for it is theirs, or predates owner codes and so carries none of the
    // evidence a stranger could forge), and no `acct` otherwise -- a group of a name's pre-stamp rows
    // is filed on its heir's line but judged among its own kind (`mayJudge`).
    const owner = key.startsWith('acct:') ? key.slice('acct:'.length) : undefined;
    const acct = owner && copies.some(c => c.acct === owner) ? owner : undefined;
    let row = rep;
    if (named && rep.nickname !== named.nickname) row = { ...row, nickname: named.nickname };
    if (row.acct !== acct) {
      row = { ...row, acct };
      if (acct === undefined) delete row.acct;
    }
    const foundBy = [...new Set(copies.map(foundByText))].sort();
    out.push({ row, copies, foundBy, player: key });
  }
  return out;
}

/**
 * The copies the group's own player can be taken to have sent (see `foldCopies`): the ones that prove
 * it -- their `acct` for an owner's group, their name for a group with no owner -- and the ones the
 * collector tied to those, plus rows from before the collector's stamp.
 */
function ownCopies<T extends BoardRow>(copies: readonly T[], key: string, who: (r: T) => string): Set<T> {
  if (!key) return new Set(copies);
  const acct = key.startsWith('acct:') ? key.slice('acct:'.length) : null;
  // Filed under the owner is not enough: `heirs` files a name's old rows there for display.
  const linked = new Set(copies.filter(c => (acct ? c.acct === acct : who(c) === key)));
  // `dupOf` points at the first row of a result, and only between rows of one sender -- in either
  // direction. Anchored only on copies that PROVE the sender: a pre-stamp row proves nothing about who
  // sent a later copy pointing at it (the collector's code-less rule is "same nickname", and a legacy
  // anonymous row's nickname is everybody's).
  for (let grew = true; grew; ) {
    grew = false;
    const held = new Set([...linked].map(c => c.id).filter(Boolean));
    const pointedAt = new Set([...linked].map(c => c.dupOf).filter(Boolean));
    for (const c of copies) {
      if (linked.has(c)) continue;
      if ((c.dupOf && held.has(c.dupOf)) || (c.id && pointedAt.has(c.id))) {
        linked.add(c);
        grew = true;
      }
    }
  }
  for (const c of copies) if (!c.receivedAt) linked.add(c);
  return linked;
}

// ----------------------------------------------------------------------------------- plans

/** The checkpoints still ahead of `te`, plus the target. */
export function remainingChain(chain: readonly number[], te: number): number[] {
  if (!chain.length) return [];
  return [...chain.slice(0, -1).filter(c => c > te), chain[chain.length - 1]];
}

/** Same target, schedule, held shifts, finish-the-current-ascension switch and time off: the
 *  settings under which two routes are the same plan. */
export function samePlanSettings(
  a: Pick<BoardRow, 'finalTE' | 'window' | 'holdShifts' | 'forceContinue' | 'timeOff'>,
  b: Pick<BoardRow, 'finalTE' | 'window' | 'holdShifts' | 'forceContinue' | 'timeOff'>
): boolean {
  return sameSettings(a, b);
}

function sameSettings(
  a: Pick<BoardRow, 'finalTE' | 'window' | 'holdShifts' | 'forceContinue' | 'timeOff'>,
  b: Pick<BoardRow, 'finalTE' | 'window' | 'holdShifts' | 'forceContinue' | 'timeOff'>
): boolean {
  const off = (r: Pick<BoardRow, 'timeOff'>) => (r.timeOff ?? []).map(t => `${t.from}~${t.to}`).join(',');
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

/** Start more than 12 h after the send: "what if I started on 23 Nov". The send is the collector's
 *  stamp when there is one (`sentMs`). */
function futureStart(row: BoardRow): boolean {
  const s = startMs(row);
  const sent = sentMs(row);
  return s != null && sent != null && s > sent + WHAT_IF_LEAD_MS;
}

/**
 * A schema-7 row that says of itself it was not planned from the account as it was: it starts before
 * the save it was made from, or from a TE above the save's own (typed in, or planned part-way through
 * another plan). The reason, or '' for a row that says neither.
 */
function selfWhatIf(row: BoardRow): string {
  const age = row.backupAgeHours;
  if (typeof age === 'number' && Number.isFinite(age) && age < -BEFORE_SAVE_HOURS) {
    const h = -age;
    const gap = h >= 48 ? `${Math.round(h / 24)} days` : `${h.toFixed(h < 10 ? 1 : 0)} h`;
    return `what-if: planned to start ${gap} before the save it was made from`;
  }
  const te = row.currentTE;
  const saved = row.backupTE;
  if (
    typeof te === 'number' &&
    typeof saved === 'number' &&
    Number.isFinite(te) &&
    Number.isFinite(saved) &&
    te > saved + 0.5
  ) {
    return `what-if: planned from TE ${te}, the save it was made from is at TE ${saved}`;
  }
  return '';
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
    if (start == null || futureStart(f.row) || selfWhatIf(f.row)) continue;
    const te = f.row.currentTE;
    evidence.push({
      f,
      row: f.row,
      start,
      sent: sentMs(f.row),
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
    const own = selfWhatIf(row);
    if (own) return { state: 'what-if', reason: own };
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
      const when = shortDate(remeasure.start, remeasure.row.timezone);
      p.reason = remeasure.row.recheckOf
        ? `re-checked by a newer run (${when}), which priced it again from its own save`
        : `replaced by a newer run of the same plan (${when})`;
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

/** Rows that can be ranked: on the main board, with a route. A flagged run (it can only arrive
 *  through GET /mine) is evidence about an account the planner cannot help yet, not a plan. */
function rankable<T extends BoardRow>(rows: readonly T[]): T[] {
  return rows.filter(r => r && Array.isArray(r.chain) && !r.flags?.length);
}

/** Group folded rows into players and judge each one's plans. */
export function groupPlayers<T extends BoardRow>(rows: readonly T[], opts: RankOptions): PlayerPlans<T>[] {
  rows = rankable(rows);
  // One filing for everything below, worked out over every row sent (copies included), so the copy
  // fold and the player groups agree on who is who.
  const filing = fileRows(rows);
  const folded = foldCopies(rows, filing);
  const keyOf = (f: Folded<T>) => (f.player ?? playerKey(filing, f.row)) || `account:${accountKeyOf(f.row)}`;
  const groups = new Map<string, Folded<T>[]>();
  for (const f of folded) {
    const k = keyOf(f);
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }

  const out: PlayerPlans<T>[] = [];
  for (const [key, group] of groups) {
    const named = !key.startsWith('account:');
    const plans = assessPlayer(group, folded, filing, opts, named);
    let label = named ? playerLabel(group, filing) : `anonymous · ${cityOf(group[0].row.timezone)}`;
    // A name an owner code already sends under, used since without one: a second line with the same
    // name that may be anybody's (a re-post of the owner's public row, a browser that lost its code).
    // Said on the line, so the two never read as one player listed twice.
    if (key.startsWith('name:') && filing.heirs.has(key.slice('name:'.length))) label = `${label} (no code)`;
    out.push(summarise(key, label, named, plans));
  }
  return out;
}

/**
 * What a player's line is called. An owner's line takes the name they sent most recently ("the code's
 * newest name"), in its most common spelling, so a rename moves the line to the new name and a note
 * bolted onto one run does not. A line from before owner codes takes its most common spelling.
 */
function playerLabel<T extends BoardRow>(group: readonly Folded<T>[], filing: Filing): string {
  const rows = group.flatMap(f => (f.copies.length ? f.copies : [f.row])).filter(r => r.nickname?.trim());
  const owned = rows.filter(r => r.acct);
  if (!owned.length) return pickLabel(rows.length ? rows : group.map(f => f.row));
  const newest = owned.reduce((a, b) => ((sentMs(b) ?? -Infinity) > (sentMs(a) ?? -Infinity) ? b : a));
  const root = rootKey(filing.roots, newest.nickname);
  return pickLabel(owned.filter(r => rootKey(filing.roots, r.nickname) === root));
}

/**
 * Judge one player's lines, each against only the rows allowed to judge it (`mayJudge`).
 *
 * The lines are split by owner: each `acct` is judged against rows with that `acct` alone, and the
 * lines with none (runs from before owner codes, anonymous runs) against the other rows with none that
 * the phase-1 rules tie to them -- the same name, or the same timezone and artifact set. `named` adds
 * the unnamed re-runs of a named player's older plans (`withUnnamedRechecks`), phase 1's rule, which
 * applies only where neither side has an owner.
 */
function assessPlayer<T extends BoardRow>(
  group: readonly Folded<T>[],
  universe: readonly Folded<T>[],
  filing: Filing,
  opts: RankOptions,
  named: boolean
): Plan<T>[] {
  const byOwner = new Map<string, Folded<T>[]>();
  for (const f of group) {
    const k = f.row.acct ?? '';
    const g = byOwner.get(k);
    if (g) g.push(f);
    else byOwner.set(k, [f]);
  }
  const plans: Plan<T>[] = [];
  for (const [acct, lines] of byOwner) {
    const peers = new Set(
      acct
        ? universe.filter(x => x.row.acct === acct)
        : universe.filter(x => !x.row.acct && lines.some(l => mayJudge(filing, x.row, l.row)))
    );
    for (const l of lines) peers.add(l);
    const candidates = !acct && named ? withUnnamedRechecks(lines, peers, opts.target) : [...lines];
    const extra = recheckLines(candidates, opts.target);
    plans.push(...assessPlans([...candidates, ...extra], [...peers, ...extra], opts));
  }
  return plans;
}

/**
 * Lines made from `rechecks`: each entry of a row is that row's run pricing an older plan again, from
 * its own start and save, under its own settings -- a newer run of that plan in all but name. Made
 * only for an entry that re-measures one of `lines` (an older line at the target that `samePlan`
 * matches); an entry that matches nothing has nothing to say, and becomes nothing. The lines carry
 * no copies, so they add no sends; the plan they replace is still counted once.
 */
function recheckLines<T extends BoardRow>(lines: readonly Folded<T>[], target: number): Folded<T>[] {
  const out: Folded<T>[] = [];
  for (const src of lines) {
    // The line's own row, or a copy from the same owner. Never any copy: a stranger can re-post a
    // player's result anonymously with made-up rechecks, and those must not re-measure their plans.
    const list = src.row.rechecks?.length
      ? src.row.rechecks
      : src.copies.find(c => c.rechecks?.length && !!c.acct && c.acct === src.row.acct)?.rechecks;
    if (!list?.length || src.row.finalTE !== target) continue;
    const start = startMs(src.row);
    if (start == null) continue;
    const seen = new Set([(src.row.chain ?? []).join(',')]);
    list.forEach((rc, i) => {
      const chain = Array.isArray(rc?.chain) ? rc.chain : [];
      const key = chain.join(',');
      if (!chain.length || chain[chain.length - 1] !== target || seen.has(key)) return;
      if (!chain.every((v, k) => Number.isFinite(v) && (k === 0 || v > chain[k - 1]))) return;
      if (!Number.isFinite(rc.days) || rc.days <= 0) return;
      seen.add(key);
      const row = {
        ...src.row,
        id: `${src.row.id ?? 'row'}~recheck${i}`,
        recheckOf: src.row.id ?? '',
        chain: [...chain],
        ascensions: chain.length,
        durationDays: rc.days,
        legs: [],
        hasCsv: false,
        waitingHours: null,
      } as T;
      // Nothing about how the source run searched carries over: this route was priced once, from
      // that run's save, not found by its search. `effort` goes too, or a line re-checked by a sweep
      // would read "balanced" (`foundByText` says "re-check" instead).
      for (const k of [
        'rechecks',
        'space',
        'proof',
        'seed',
        'chainsPriced',
        'effort',
        'dupOf',
        'endLocal',
        'endUtc',
      ] as const) {
        delete row[k];
      }
      const replaces = lines.some(p => {
        const ps = startMs(p.row);
        return (
          p !== src &&
          !p.row.recheckOf &&
          p.row.finalTE === target &&
          ps != null &&
          start > ps + LATER_MS &&
          samePlan(p.row, row)
        );
      });
      if (replaces) out.push({ row, copies: [], foundBy: [foundByText(row)] });
    });
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
 *
 * PHASE 2: only between rows with no owner on either side (`assessPlayer`). An unnamed row carries
 * no `acct`, so anyone could send one dressed as a player's; it no longer replaces an owner's plan.
 * The owner's way to have an anonymous re-run count is to put their name on it (POST /claim), or to
 * send it named, which the collector folds into the anonymous copy.
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
 * The viewer's own plans: every row the collector confirmed as theirs (`yours`, from GET /mine), plus,
 * as in phase 1, every row whose timezone and artifact set match the loaded save (`accountKey`; null
 * when no save is loaded). Returns null when nothing is theirs at the target.
 *
 * The confirmed rows are ONE player, named or not: /mine answers for the code this browser sent them
 * with, so an anonymous re-run of a named plan re-checks it here even though the public race cannot
 * know the two are the same sender. They are judged as one owner; the phase-1 matches keep their own
 * rules (`assessPlayer`), so a look-alike row from somebody else's browser is listed but never judges.
 */
export function buildMyPlans<T extends BoardRow>(
  rows: readonly T[],
  accountKey: string | null,
  opts: RankOptions
): PlayerPlans<T> | null {
  const usable = rankable(rows);
  // One identity for every confirmed row: the owner's `acct` where a named one shows it, else a
  // stand-in no real `acct` can equal (those are hex).
  const me = usable.find(r => r.yours && r.acct)?.acct ?? 'you';
  const normalised = usable.map(r => (r.yours && r.acct !== me ? { ...r, acct: me } : r));
  const filing = fileRows(normalised);
  const folded = foldCopies(normalised, filing);
  const mine = folded.filter(
    f => f.copies.some(c => c.yours) || (accountKey != null && accountKeyOf(f.row) === accountKey)
  );
  if (!mine.some(f => f.row.finalTE === opts.target)) return null;
  const plans = assessPlayer(mine, folded, filing, opts, false);
  const named = mine.map(f => f.row).filter(r => r.nickname?.trim());
  const key = accountKey != null ? `account:${accountKey}` : `acct:${me}`;
  return summarise(key, named.length ? pickLabel(named) : 'you', named.length > 0, plans);
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
  const sent = sentMs(plan.row);
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

/** What one copy of a result was found with: `exhaustive`, `partial`, the effort tier, or `re-check`
 *  for a line made from a later run's `rechecks` (that run priced the route; it did not search). */
export function foundByText(row: Pick<BoardRow, 'space' | 'effort' | 'recheckOf'>): string {
  if (row.recheckOf != null) return 're-check';
  if (row.space) return row.space.stoppedEarly ? 'partial' : 'exhaustive';
  return row.effort || 'unknown';
}

/** Who sent a run, as All runs shows it: the name as typed minus invisible characters. */
export function whoText(row: Pick<BoardRow, 'nickname' | 'timezone'>): string {
  if (isIconName(row.nickname)) return displayName(row.nickname, row.timezone);
  return visibleName(row.nickname);
}
