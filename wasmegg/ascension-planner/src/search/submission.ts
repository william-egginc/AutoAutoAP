/**
 * Turning a finished run into something safe to share with other players.
 *
 * WHITELIST, NOT A SCRUBBER. The obvious design is "take the CSV and strip the identifying
 * bits", and it is the wrong one: a blacklist is only as good as the last thing someone
 * remembered to add to it, and it fails silently and invisibly when a new field appears
 * upstream. This builds a fresh object containing exactly the fields named below and nothing
 * else, so a field added to the CSV tomorrow cannot leak by default — it simply is not copied.
 *
 * WHAT IS NOT IN HERE, and was never in the CSV either: the player id. `buildChainsCsv` has no
 * `playerId` in its metadata and never printed one, so "strip the EID" is already true by
 * construction. `scrubIdentifiers` exists anyway, for the one path where a player pastes a file
 * from somewhere else — belt and braces on a door that is already shut.
 *
 * WHAT IS STILL IDENTIFYING, stated plainly because the consent has to be informed:
 *
 *   - The ARTIFACT INVENTORY is close to a fingerprint. Ten thousand items with exact counts
 *     is not anonymous among people who know each other. It is included because a chain's
 *     duration is meaningless without knowing what it was simulated with — a 740-day plan on a
 *     full T4L set is a different claim from the same plan on commons — so the trade is real and
 *     the UI says so before the button is pressed.
 *   - The TIMEZONE and the local plan start put the player in a region and a rough daily rhythm.
 *   - The AVAILABILITY WINDOW says when they are awake.
 *
 * The nickname is optional and free text; nothing is derived from the account.
 */
import type { SubmissionFlag } from './rules';
import type { InventoryCount, LoadoutSlot } from './csv';
import type { ColleggtibleSummary, EpicResearchSummary } from './progression';
import type { Availability } from './availability';
import { describeAvailability } from './availability';
import type { LegSummary } from './types';
import type { DeliveryScore } from './virtueScore';

/** Bumped when the shape changes, so a collector can reject or migrate old submissions rather
 *  than mis-reading them. Receivers should refuse anything they do not recognise.
 *
 *  2: `artifacts` became a list of labels, best-per-family, instead of `{label, count}` for every
 *     tier owned. The Worker must be redeployed with the matching SCHEMA at the same time -- it
 *     refuses a schema it does not know, so an app shipped ahead of the collector submits
 *     nothing.
 *  5: `proof`, the outcome side of an exhaustive run -- runners-up, the best at each ascension
 *     count, and the spread. Additive and Insane-only, like `space` in 4. Plus `seed`, the chain
 *     the run started from, which applies to a staged run and not to an exhaustive one.
 *  6: the variables a virtue run turns on that 5 left out -- `startWeekday`, `deliveryScore`,
 *     `clothedTE`, `teByEgg`, `backupAgeHours` -- plus `sweep`, `machine` and `source` for runs
 *     uploaded from files through the Chain Explorer. All additive and optional.
 *  7: what the leaderboard's race needs to judge a plan without guessing (2026-09-25):
 *     `startUtc`/`endUtc` (the plan start as an instant, so a start in the hour a clock change
 *     repeats is not read an hour off), `backupTE` (the save's own TE, so a plan typed in from a
 *     higher TE reads as the what-if it is), `build` (which planner priced it: a simulator change
 *     moves finishes by days), `rechecks` (the player's best earlier plans priced again from this
 *     save), and `backupAgeHours` now SIGNED and always sent, where 6 left it off when the plan
 *     started before the save -- which read the same as "not recorded". All optional; a collector
 *     that knows 7 still accepts 6. */
export const SUBMISSION_SCHEMA = 7;

/**
 * The artifact families a virtue ascension can actually equip.
 *
 * A full inventory is ten thousand items, most of them irrelevant: nobody's delivery rate turns
 * on how many T1 Aurelian brooches they are sitting on. Sharing the lot is both noise and a
 * sharper fingerprint than sharing the eight families that matter, so only these are sent.
 *
 * Derived from the two sets the simulator actually builds (`getOptimalELRSet` and
 * `getOptimalEarningsSet`, see search/leg.ts): metronome, compass, gusset and chalice on the
 * delivery side; necklace, cube, totem and ankh on the earnings side. Stones are kept wholesale
 * because they slot into all of the above.
 *
 * `the-chalice` is on this list although it was not in the original request for it. It carries
 * +40% internal hatchery rate and appears in the delivery set on the account this was specified
 * from, so dropping it would have removed a real input rather than noise.
 *
 * `ornate-gusset` is the game data's family id for the T1 gusset while `gusset` covers T2-T4 —
 * a quirk of the source data, not two different artifacts. Both are listed so a T1 is not
 * silently dropped.
 */
/**
 * The stones a virtue ascension actually socket.
 *
 * The other seven families -- life, shell, terra, dilithium, clarity, prophecy, soul -- do exist
 * in the virtue inventory and were being reported wholesale, which was a long list saying nothing:
 * none of them appear in either set the simulator builds. Tachyon and quantum drive the delivery
 * side, lunar the earnings side, and those are what a reader needs to judge whether a duration was
 * reachable on their own account.
 */
export const VIRTUE_STONE_FAMILIES: ReadonlySet<string> = new Set(['tachyon-stone', 'quantum-stone', 'lunar-stone']);

/** Keep only the stones above; falls back to the label when a family did not resolve, the same
 *  way `keepVirtueArtifacts` does and for the same reason. */
export function keepVirtueStones(items: InventoryCount[]): InventoryCount[] {
  return items.filter(s => {
    if (s.familyId) return VIRTUE_STONE_FAMILIES.has(s.familyId);
    const l = s.label.toLowerCase();
    return l.includes('tachyon') || l.includes('quantum') || l.includes('lunar');
  });
}

export const VIRTUE_ARTIFACT_FAMILIES: ReadonlySet<string> = new Set([
  'quantum-metronome',
  'interstellar-compass',
  'gusset',
  'ornate-gusset',
  'the-chalice',
  'demeters-necklace',
  'puzzle-cube',
  'lunar-totem',
  'tungsten-ankh',
]);

/**
 * Keep only what a virtue ascension can wear.
 *
 * Falls back to matching the human label when `familyId` is absent, because an inventory parsed
 * by an older build carries no family and silently dropping everything would look like an empty
 * inventory rather than a missing field.
 */
export function keepVirtueArtifacts(items: InventoryCount[]): InventoryCount[] {
  return items.filter(a => {
    if (a.familyId) return VIRTUE_ARTIFACT_FAMILIES.has(a.familyId);
    const l = a.label.toLowerCase();
    return (
      l.includes('metronome') ||
      l.includes('compass') ||
      l.includes('gusset') ||
      l.includes('chalice') ||
      l.includes('necklace') ||
      l.includes('puzzle cube') ||
      l.includes('lunar totem') ||
      l.includes('tungsten ankh')
    );
  });
}

/**
 * The best piece the player owns in each family, and nothing else.
 *
 * A real inventory is a long tail of junk: the account this was built against holds 732 T1C
 * Demeters necklaces and exactly one T4L, and the simulator wears the T4L. Reporting all ninety
 * entries with exact counts described the hoard rather than the loadout, and a hoard with exact
 * counts is a much sharper fingerprint than the eight lines that actually determined the answer.
 *
 * Best means highest tier, then highest rarity -- decided on `tier`/`rarity` carried through from
 * the game data, not by parsing "T4L" back out of the label, which would quietly rank "T4L" under
 * "T4R" on a string compare.
 *
 * Counts are dropped here and kept for stones, which is not an inconsistency: an artifact slot
 * takes one artifact, so owning six changes nothing, while stones are consumed three at a time
 * per piece and how many you hold decides what can actually be socketed.
 */
/**
 * Families the game data splits in two that are really one artifact.
 *
 * `ornate-gusset` is the T1 gusset and `gusset` covers T2-T4 -- a quirk of the source data, not
 * two different items. Keying on the raw family id therefore gave every account a spurious second
 * gusset: "T1C Gusset" surviving alongside "T4L Gusset", because they were separate buckets. The
 * simulator has never treated them as different, so neither should this.
 */
const FAMILY_ALIASES: Record<string, string> = {
  'ornate-gusset': 'gusset',
};

export function bestPerFamily(items: InventoryCount[]): InventoryCount[] {
  const best = new Map<string, InventoryCount>();
  for (const item of items) {
    // No family means the game data did not resolve it; key on the label so it is kept rather
    // than silently collapsing every unresolved piece into one bucket.
    const raw = item.familyId ?? item.label;
    const key = FAMILY_ALIASES[raw] ?? raw;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, item);
      continue;
    }
    const rank = (x: InventoryCount) => (x.tier ?? 0) * 10 + (x.rarity ?? 0);
    if (rank(item) > rank(cur)) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export interface SubmissionLeg {
  /** Target TE this leg reaches. */
  te: number;
  /** Which sale strategy the simulator picked, e.g. `2-sale-tier13`. */
  strategy: string;
  days: number;
  /** Peak delivery rate in q/hr, the number that caps how fast the leg's last stretch earns. */
  peakDeliveryQph: number;
}

export interface Submission {
  schema: number;
  /** Free text, optional, supplied by the player. Never derived from the account. */
  nickname?: string;

  chain: number[];
  ascensions: number;
  durationDays: number;
  /** Local wall-clock, in `timezone`, to the minute. */
  startLocal: string;
  endLocal: string;
  timezone: string;
  /**
   * Schema 7: the same two moments as instants (ISO 8601, UTC), to the MINUTE.
   *
   * Until 6 these were deliberately left out on the grounds that a unix timestamp plus a duration
   * is a sharper fingerprint than a date. To the minute, though, they say nothing `startLocal` plus
   * `timezone` did not already say -- except in the one hour a year a clock change repeats, where
   * "01:30 in Chicago" is two different instants and the race had to guess which. The finish date is
   * what the race sorts on, so it stops guessing. Seconds are still never sent.
   */
  startUtc?: string;
  endUtc?: string;

  currentTE: number;
  finalTE: number;

  effort: string;
  /** Human-readable window, or null when the run was unconstrained. */
  window: string | null;
  holdShifts: boolean;
  /**
   * Whether leg 1 was pinned to finishing the current ascension rather than prestiging now. It
   * changes the answer, not just the display: measured on one account it moved the best 2-ascension
   * plan by 135 days. Optional because submissions before this field did not record it.
   */
  forceContinue?: boolean;
  /** Total time the plan spends waiting for the player: prestiges held plus shifts held. */
  waitingHours: number | null;

  /**
   * The two sets the simulator actually wears, per slot, with the stones in each.
   *
   * More informative than the inventory and harder to misread. A virtue DELIVERY set uses its
   * fourth slot as a stone holder, so the solver picks a T3 legendary ankh over a T4 epic
   * chalice -- more sockets beats a better base effect -- and without seeing the stones in it,
   * that choice looks like a bug. The EARNINGS set does not depend on research, so it is the
   * same in every leg; the delivery set is leg 1's and later legs re-solve.
   *
   * Optional: a submission from an older build, or one whose backup could not be read, simply
   * has no loadouts rather than a wrong one.
   */
  delivery?: LoadoutSlot[];
  earnings?: LoadoutSlot[];

  /** Labels only, best per family. An artifact slot takes one artifact, so the count never
   *  mattered; see `bestPerFamily`. */
  artifacts: string[];
  /** Counted, because how many you hold decides what can be socketed. */
  stones: InventoryCount[];

  legs: SubmissionLeg[];
  chainsPriced: number;

  /**
   * What the run cost the machine that did it. Additive in schema 3.
   *
   * The panel's own time estimate is carried from one 20-core desktop ("~1 h 05 m on a 20-core
   * desktop at 12 jobs") and scaled by nothing, so it is wrong for everyone else and known to be.
   * Three numbers fix that, but only in aggregate: with enough submissions the board can fit
   * seconds-per-chain against worker count and stop quoting one machine's stopwatch at everybody.
   *
   * All optional. A submission from an older build, or one resumed from a checkpoint where the
   * elapsed time is not the time it took, simply has none rather than a misleading figure.
   */
  run?: RunCost;

  /**
   * Account-wide multipliers the simulator reads on every leg. Additive in schema 3.
   *
   * A duration means nothing without them: the same chain on an account with every colleggtible at
   * T4 is a different claim from the same chain with none, and the board already records the
   * artifact loadout for exactly that reason. Summarised rather than dumped, because a full
   * per-item level list is a sharp fingerprint and is mostly all-max or all-zero anyway.
   */
  epicResearch?: EpicResearchSummary;
  colleggtibles?: ColleggtibleSummary;

  /**
   * What space an exhaustive run actually covered. Added in schema 4, and only ever present on an
   * Insane-mode submission.
   *
   * Without it an exhaustive result is indistinguishable from a staged one on the board, which
   * throws away the only thing that makes it worth more: "proven optimum of 240-490 step 1 at two
   * ascensions" is a claim that can be checked and reproduced, while "735 days" is a number. It
   * also explains away differences that otherwise look like disagreement -- two runs finding
   * different winners are not in conflict when one searched a box the other never entered.
   */
  space?: SearchSpace;

  /**
   * What the exhaustive run FOUND, as opposed to what it looked at. Schema 5, Insane mode only.
   *
   * `space` makes the winner checkable in principle; this makes it readable in practice. A proven
   * optimum on its own is a single number, and a single number cannot answer the questions a
   * reader actually has -- is this a knife-edge or a plateau, what did it beat, does one more
   * ascension help or hurt. The run already knows all of it: every chain in the space was priced,
   * so the distribution is sitting in memory and is thrown away at submit time unless it is
   * summarised here.
   *
   * Summarised, not dumped. The full table is the CSV, which is an opt-in megabyte; this is a few
   * hundred bytes that make the row worth reading without downloading anything.
   */
  proof?: ExhaustiveProof;

  /**
   * The chain the search STARTED from, when it started from one.
   *
   * A staged run descends from a seed, so its answer is partly a fact about where it was pointed:
   * a result that moved a long way from its seed is evidence the search did real work, and one
   * that barely moved may just be a seed that was already good -- or a search that never escaped
   * it. Without this the board shows the destination and nothing about the journey.
   *
   * Absent on an exhaustive run, which has no seed to report: it enumerates a space rather than
   * improving on a guess, and printing the typed chain there would invent a starting point the
   * search never used.
   */
  seed?: number[];

  /**
   * Schema 6: the variables a result turns on that 5 did not record.
   *
   * `startWeekday` is derivable from `startLocal`, and sent anyway because the weekly Saturday sale
   * is a ~3-day sawtooth in every leg and grouping on it should not need a date library.
   * `deliveryScore` and `clothedTE` are the gear as two percent-of-perfect numbers (see
   * virtueScore.ts), so accounts can be compared on one axis. `teByEgg` is truth eggs per virtue egg
   * rather than the total, because the split decides which shifts a plan can take. `backupAgeHours`
   * is how stale the backup was at plan start: a plan from a day-old backup is a plan for a farm
   * that has moved on.
   */
  startWeekday?: string;
  deliveryScore?: DeliveryScore;
  clothedTE?: number;
  teByEgg?: number[];
  /**
   * Hours from the save to the plan start. SIGNED since schema 7: negative means the plan starts
   * before the save it was made from -- a what-if, which the race drops. Schema 6 left the field off
   * in exactly that case, so "absent" meant both "unknown" and "what-if"; now absent only means the
   * save time was not known. Held to a year either way, the collector's bound.
   */
  backupAgeHours?: number;
  /** Schema 7: the save's own TE. A `currentTE` above it was typed in: the plan starts from a TE the
   *  account does not have. */
  backupTE?: number;
  /** Schema 7: which build of the planner priced the run (`appBuildId`). Simulator changes move
   *  finishes by days, and without this two builds' numbers cannot be told apart. */
  build?: string;
  /**
   * Schema 7: the player's best current plans already on the board, cut to the checkpoints still
   * ahead and priced again from THIS run's save and start. Up to three.
   *
   * A plan on the board stands until the same player measures it again; a player who moves on to a
   * different route never does, so an optimistic old finish could stand for a month. Each new run
   * therefore re-measures the top three for free (from its own table when it priced them, or with a
   * few seconds of the run's workers), and the board treats each entry as a newer run of that plan.
   * Nothing here is new about the account: the routes are the player's own public rows, and the days
   * are what this save says about them.
   */
  rechecks?: Recheck[];
  /** Which sweep preset produced this run, e.g. `M2`, or `custom`. Set by the upload page. */
  sweep?: SweepTag;
  /** The machine the run was on. The browser cannot report RAM honestly, so the player types it. */
  machine?: MachineInfo;
  /** `upload` when the Chain Explorer built this from a CSV plus diagnostics; absent from the planner. */
  source?: 'upload';
  /** Why this run belongs on the flagged board (search/rules.ts). Absent means the main board. */
  flags?: SubmissionFlag[];
  /** How long a fresh ascension sat on its first Integrity shift, when that was measured. */
  integrityMinutes?: number;
  /** Time away from the virtue farm the plan was built around, as whole local dates. */
  timeOff?: { from: string; to: string }[];

  submittedAt: string;
}

export interface SweepTag {
  preset: string;
  /** The bands as typed into per-checkpoint mode, e.g. `190-280:2; 270-372:2`. */
  bands?: string;
  minGap?: number;
}

export interface MachineInfo {
  cores?: number;
  ramGB?: number;
  workers?: number;
}

/** A chain and what it cost, as the proof block records it. */
export interface ProofChain {
  chain: number[];
  days: number;
}

/** One earlier plan priced again from this run's save: its remaining route, ending at the target,
 *  and its days from this run's start. */
export type Recheck = ProofChain;

/** How many earlier plans a submission re-measures. The collector refuses more. */
export const MAX_RECHECKS = 3;
/** The collector's ceilings, mirrored: a chain's length, a plan's days, a save's age in hours. */
const MAX_CHAIN = 64;
const MAX_DURATION_DAYS = 100000;
const MAX_BACKUP_AGE_HOURS = 24 * 365;
const MAX_BUILD = 40;

/**
 * Which build of the planner is running, for `build`. A commit id when the build was given one
 * (`VITE_BUILD_SHA`), else the build's own timestamp (`__BUILD_TIME__`, vite.config.ts). Empty in a
 * test run, where there is no build.
 */
export function appBuildId(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const sha = (env.VITE_BUILD_SHA ?? '').trim();
  if (sha) return sha.slice(0, MAX_BUILD);
  return (typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '').slice(0, MAX_BUILD);
}

/** A re-measured route the collector will take: positive whole TEs, strictly rising, ending at the
 *  target, no longer than a chain may be. */
export function isRecheckChain(chain: unknown, finalTE: number): chain is number[] {
  return (
    Array.isArray(chain) &&
    chain.length >= 1 &&
    chain.length <= MAX_CHAIN &&
    chain.every((v, k) => Number.isInteger(v) && v > 0 && (k === 0 || v > chain[k - 1])) &&
    chain[chain.length - 1] === finalTE
  );
}

/** Rechecks as sent: valid ones only, days to the collector's 1e-4, none repeating the winner or
 *  each other, at most `MAX_RECHECKS`. */
function cleanRechecks(
  list: readonly Recheck[] | null | undefined,
  winner: readonly number[],
  finalTE: number
): Recheck[] {
  const seen = new Set([winner.join(',')]);
  const out: Recheck[] = [];
  for (const r of list ?? []) {
    if (!isRecheckChain(r?.chain, finalTE)) continue;
    if (!Number.isFinite(r.days) || r.days <= 0 || r.days > MAX_DURATION_DAYS) continue;
    const key = r.chain.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ chain: [...r.chain], days: Number(r.days.toFixed(4)) });
    if (out.length >= MAX_RECHECKS) break;
  }
  return out;
}

/** The outcome side of an exhaustive run. Every field is derived from chains that were actually
 *  priced, so a run stopped early describes what it reached and claims nothing more. */
export interface ExhaustiveProof {
  /**
   * The next best chains after the winner, best first.
   *
   * The single most useful thing here. "948.41 days is optimal" and "948.41 days is optimal, and
   * the second best is 948.44" are very different claims: the first reads as a discovery, the
   * second says the whole neighbourhood is flat and the exact winner barely matters. Someone
   * copying a chain off the board should know which one they are looking at.
   */
  runnersUp: ProofChain[];
  /**
   * The best chain at each ascension count the space allowed, when it allowed more than one.
   *
   * This is the comparison the board exists to make, and it is the one an exhaustive run can make
   * properly: every 6-ascension chain and every 7-ascension chain in the space were both priced,
   * so "7 beats 6 by 40 days here" is measured rather than inferred from two people's runs on two
   * different accounts.
   */
  byAscensions: (ProofChain & { ascensions: number; priced: number })[];
  /** Duration spread over everything priced, in days. Says how much the choice of chain is worth
   *  at all -- a 5-day spread and a 500-day spread are different games. */
  spread: { best: number; median: number; worst: number };
}

/** The box an exhaustive run proved its answer over. */
export interface SearchSpace {
  /** `range` is one pool shared by every checkpoint; `bands` is a separate range per checkpoint. */
  mode: 'range' | 'bands';
  /** Present when mode is `range`: the pool every checkpoint drew from. */
  range?: { lo: number; hi: number; step: number };
  /**
   * Present when mode is `bands`: the values allowed at each checkpoint, in order, as the panel
   * enumerated them. Stored as the values themselves rather than the typed `lo-hi:step` text so a
   * reader does not have to re-implement the parser to know what was searched.
   */
  bands?: number[][];
  /** Minimum TE between consecutive checkpoints. 0 means the enumeration was unconstrained. */
  minGap: number;
  /** Ascension bounds, inclusive, counting the final target. */
  minAscensions: number;
  maxAscensions: number;
  /** Chains the space contains, and how many were priced before the run ended. */
  chains: number;
  chainsPriced: number;
  /**
   * True when the operator stopped it. The winner is then the best of what was priced and NOT the
   * optimum of the space, which is the difference between a result and a proof.
   */
  stoppedEarly: boolean;
}

/** The cost side of a run, for calibrating the panel's estimates against real machines. */
export interface RunCost {
  /** Background workers the pool actually used. The tunable that matters most. */
  workers: number;
  /** Logical cores the browser reported, so workers can be read as a fraction of the machine. */
  cores: number | null;
  /** Wall-clock minutes of searching, excluding time the tab spent frozen. */
  minutes: number;
  /**
   * Seconds of wall clock per chain priced. Derivable from the two above, but recorded because the
   * run measures it directly and a resumed run's replayed chains would otherwise skew the ratio.
   */
  secondsPerChain: number;
  /**
   * Minutes the browser had this tab suspended or throttled, already excluded from `minutes`.
   *
   * A backgrounded tab is throttled hard, and a run left overnight can spend more time frozen than
   * working. Recorded rather than silently dropped so the board can tell a slow machine from an
   * interrupted one -- and so a run with a long freeze can be weighted down instead of taken at
   * face value. Absent on builds that did not measure it.
   */
  suspendedMinutes?: number;
  /** The single longest freeze, in minutes. Many short stalls read very differently from one long one. */
  longestStallMinutes?: number;
}

/**
 * Remove anything shaped like an Egg Inc player id from free text.
 *
 * Not load-bearing for our own submissions — the CSV never carried one — but a player pasting
 * someone else's file, or a nickname typed carelessly, should not become an account handout.
 * An id is a bearer token: the API will return the whole save to anyone holding it.
 */
export function scrubIdentifiers(text: string): string {
  return text.replace(/EI\d{16}/g, 'EI[redacted]');
}

/**
 * What to tell someone the collector turned away for submitting too often (HTTP 429).
 *
 * The collector allows a burst per connection per minute and says how long is left
 * (`retryAfter`, seconds). Re-sending with a name after sending anonymously is ordinary, and a bare
 * "429" read like the collector was broken, so this says what happened and what to do.
 */
/**
 * Resolve after the browser has painted at least one frame.
 *
 * Submitting builds the whole chain table first -- tens of megabytes of string work on a long run
 * -- and that blocks the page. Flipping the button to "Sending..." and then starting that work in
 * the same tick meant the flip was never drawn: the page froze on a button that still looked
 * clickable, and people clicked again. Await this between the flip and the work.
 */
export function afterPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function tooManySubmissionsMessage(retryAfter?: number): string {
  const wait = retryAfter && retryAfter > 0 ? `about ${retryAfter} second${retryAfter === 1 ? '' : 's'}` : 'a minute';
  return `too many submissions from your connection in the last minute. Nothing was lost - wait ${wait} and press Submit again.`;
}

/** What `duplicateMessage` can say about an exact copy beyond "it is already there". */
export interface DuplicateNote {
  /** When the stored copy arrived (the collector's clock). */
  firstAt?: string;
  /** The name the collector put on the stored row because it had none and this send did. */
  renamed?: string;
  /** The name this send carried; '' or absent for none. */
  sent?: string;
  /** The name the stored row is on the board under, as the collector said ('' for none); absent when
   *  an older collector did not say. */
  stored?: string;
  /** What happened to the table this send carried, when one went to the stored row: `new` (it had
   *  none, and now has this one) or `already` (it had one). `size` is the compressed size. */
  table?: { landed: 'new' | 'already'; size?: string };
}

/**
 * What to tell someone whose send the collector recognised (phase 2). Neutral on purpose: nothing
 * went wrong, and a red "error" for pressing Submit on a result that is already there taught people
 * to press it again.
 *
 *   - `exact`: the same result, from the same search, from the same sender, is already stored, so
 *     nothing new was -- except, maybe, the table the stored row was missing, or the name it lacked.
 *     A name that did NOT take is said too: otherwise "Already on the board" reads as if the board now
 *     shows the name just typed, and nothing would suggest "Put my name on it".
 *   - `result`: the same answer from a DIFFERENT search (a thorough run agreeing with a balanced one).
 *     Stored as its own row, so its table and run cost are kept. Worded as a send -- it IS one -- and
 *     starting with "sent", like every other success, so a table outcome reads on from it.
 */
export function duplicateMessage(kind: 'exact' | 'result', note: DuplicateNote = {}, now = Date.now()): string {
  if (kind === 'result') return 'sent (the same answer as your earlier run, from another search)';
  const when = sentAtText(note.firstAt, now);
  const lead = `Already on the board${when ? ` (sent ${when})` : ''}`;
  const clauses: string[] = [];
  if (note.renamed) clauses.push(`your name is on it now (${note.renamed})`);
  if (note.table?.landed === 'new') {
    clauses.push(`its missing CSV was added${note.table.size ? ` (${note.table.size} compressed)` : ''}`);
  } else if (note.table?.landed === 'already') {
    clauses.push('its CSV was already there');
  } else if (!note.renamed) {
    clauses.push('nothing new stored');
  }
  let text = `${lead}${note.renamed || note.table ? '; ' : ', '}${clauses.join('; ')}`;
  const sent = note.sent?.trim() ?? '';
  if (sent && !note.renamed && note.stored !== sent) {
    if (note.stored === undefined) text += '; the name on it was not changed';
    else if (note.stored) text += `. It is on the board as ${note.stored}: press Put my name on it to make it ${sent}`;
    else text += `. It is on the board without a name: press Put my name on it to add ${sent}`;
  }
  return text;
}

/** `at 19:46` today, `on 24 Sep at 19:46` before, in this browser's own zone; '' when unreadable. */
function sentAtText(iso: string | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const day = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  if (day(t) === day(now)) return `at ${time}`;
  return `on ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(t)} at ${time}`;
}

/** `2026-09-09 19:04` in `timezone`, or '' for a missing instant. Never `1970-01-01`. */
function localStamp(unixSeconds: number, timezone: string): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSeconds * 1000));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

/** `2026-09-10T01:04:00.000Z`: the instant, cut to the minute `localStamp` shows. '' for a missing
 *  instant, never 1970. */
function utcStamp(unixSeconds: number): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  const d = new Date(Math.floor(unixSeconds / 60) * 60_000);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}

/** `Sat`, in the plan's own zone. */
export function weekdayIn(unixSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
    new Date(unixSeconds * 1000)
  );
}

export interface SubmissionInputs {
  nickname?: string;
  chain: number[];
  seconds: number;
  legs: LegSummary[];
  planStart: number;
  timezone: string;
  currentTE: number;
  finalTE: number;
  effort: string;
  availability: Availability | null;
  holdShifts: boolean;
  forceContinue?: boolean;
  artifacts: InventoryCount[];
  stones: InventoryCount[];
  /** Solved sets, already reduced to words by `describeLoadoutSlots`. */
  delivery?: LoadoutSlot[];
  earnings?: LoadoutSlot[];
  chainsPriced: number;
  /** Omitted when the run's cost is not known, e.g. a result replayed from a checkpoint. */
  /** Only set by Insane mode; a staged run has no stated space to prove anything over. */
  space?: SearchSpace;
  /** The outcome side of the same run. Null when there was nothing to summarise. */
  proof?: ExhaustiveProof | null;
  /** The seed the search descended from. Omitted by Insane mode, which descends from nothing. */
  seed?: number[] | null;
  run?: RunCost;
  /** Omitted when the backup could not be read; never guessed. */
  epicResearch?: EpicResearchSummary | null;
  colleggtibles?: ColleggtibleSummary | null;
  deliveryScore?: DeliveryScore | null;
  clothedTE?: number | null;
  teByEgg?: number[] | null;
  /** Unix seconds the backup was taken. */
  backupTime?: number | null;
  /** The save's own TE. Null when no save is loaded, never 0 for "unknown". */
  backupTE?: number | null;
  /** `appBuildId()` for a run priced in this tab. Omitted by the upload page: the files it sends
   *  were priced by whichever build the sweep ran on, not by the page doing the upload. */
  build?: string | null;
  /** Earlier plans priced again from this save; see `Submission.rechecks`. */
  rechecks?: Recheck[] | null;
  flags?: SubmissionFlag[];
  /** Seconds, from the run's integrity check. */
  integrityWaitSeconds?: number | null;
  timeOff?: { from: string; to: string }[];
  /** Injectable so tests are not clock-dependent. */
  now?: number;
}

/** Rounded before it leaves the browser: the extra precision is noise and a sharper fingerprint. */
function roundRunCost(r: RunCost): RunCost {
  return {
    workers: Math.max(0, Math.round(r.workers)),
    cores: r.cores === null || !Number.isFinite(r.cores) ? null : Math.max(0, Math.round(r.cores)),
    minutes: Number(r.minutes.toFixed(1)),
    secondsPerChain: Number(r.secondsPerChain.toFixed(2)),
    ...(r.suspendedMinutes !== undefined && Number.isFinite(r.suspendedMinutes)
      ? { suspendedMinutes: Number(r.suspendedMinutes.toFixed(1)) }
      : {}),
    ...(r.longestStallMinutes !== undefined && Number.isFinite(r.longestStallMinutes)
      ? { longestStallMinutes: Number(r.longestStallMinutes.toFixed(1)) }
      : {}),
  };
}

/** How many runners-up to carry. Enough to see whether the top is flat, short enough that the
 *  block stays a summary. */
export const PROOF_RUNNERS_UP = 8;

/**
 * Summarise the outcome of an exhaustive run.
 *
 * Takes every chain that was priced, not the shortlist: the shortlist is a VIEW, filtered and
 * sorted for a table the player is reading, and the median of a filtered set is the median of
 * nothing. Duplicates are collapsed by chain because the coarse cache and the driver cache can
 * both hold the same chain -- see `allEntries` -- and a duplicated winner would otherwise show up
 * as its own runner-up with a margin of zero.
 *
 * Returns null when there is nothing to describe. A run with one priced chain has no runners-up,
 * no spread worth the name, and no comparison to make; an empty block claiming otherwise is worse
 * than an absent one.
 */
export function summariseProof(priced: ProofChain[], winner: number[]): ExhaustiveProof | null {
  const byKey = new Map<string, ProofChain>();
  for (const c of priced) {
    if (!Number.isFinite(c.days) || c.days <= 0 || !c.chain.length) continue;
    const key = c.chain.join(',');
    const prev = byKey.get(key);
    if (!prev || c.days < prev.days) byKey.set(key, c);
  }
  const all = [...byKey.values()].sort((a, b) => a.days - b.days);
  if (all.length < 2) return null;

  const round = (c: ProofChain): ProofChain => ({ chain: [...c.chain], days: Number(c.days.toFixed(4)) });
  const winnerKey = winner.join(',');

  // Skipped by KEY rather than by position. The submitted winner comes from the run's own
  // `noteBest` and is normally `all[0]`, but a run resumed from a checkpoint can carry a winner the
  // current cache does not hold -- dropping `all[0]` blindly would then delete a real chain from
  // the list and quietly promote the second best into the top slot.
  const runnersUp = all
    .filter(c => c.chain.join(',') !== winnerKey)
    .slice(0, PROOF_RUNNERS_UP)
    .map(round);

  const groups = new Map<number, { best: ProofChain; priced: number }>();
  for (const c of all) {
    const n = c.chain.length;
    const g = groups.get(n);
    if (!g) groups.set(n, { best: c, priced: 1 });
    else {
      g.priced++;
      if (c.days < g.best.days) g.best = c;
    }
  }
  const byAscensions = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ascensions, g]) => ({ ascensions, priced: g.priced, ...round(g.best) }));

  return {
    runnersUp,
    // Only when there is a comparison to make. One ascension count means this repeats the winner
    // and the spread in a third place, which is noise dressed as data.
    byAscensions: byAscensions.length > 1 ? byAscensions : [],
    spread: {
      best: Number(all[0].days.toFixed(4)),
      median: Number(all[Math.floor(all.length / 2)].days.toFixed(4)),
      worst: Number(all[all.length - 1].days.toFixed(4)),
    },
  };
}

export function buildSubmission(i: SubmissionInputs): Submission {
  const tz = i.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Null, not zero, when no legs were kept: a chain replayed from a checkpoint has an UNKNOWN
  // waiting cost, and publishing "0" would be a claim nobody measured.
  const waiting = i.legs.length
    ? i.legs.reduce((n, l) => n + (l.sleepDelaySeconds ?? 0) + (l.shiftDelaySeconds ?? 0), 0) / 3600
    : null;

  const nickname = i.nickname?.trim() ? scrubIdentifiers(i.nickname.trim()).slice(0, 40) : undefined;

  const startUtc = utcStamp(i.planStart);
  const endUtc = utcStamp(i.planStart + i.seconds);
  // Signed: see `Submission.backupAgeHours`. Out of the collector's year either way, it would be
  // dropped there, so it is dropped here and "exactly what is sent" stays exactly what is stored.
  const age =
    i.backupTime && Number.isFinite(i.backupTime) && Number.isFinite(i.planStart)
      ? Number(((i.planStart - i.backupTime) / 3600).toFixed(1))
      : null;
  const rechecks = cleanRechecks(i.rechecks, i.chain, i.finalTE);
  const build = i.build?.trim().slice(0, MAX_BUILD);

  return {
    schema: SUBMISSION_SCHEMA,
    ...(nickname ? { nickname } : {}),
    chain: [...i.chain],
    ascensions: i.chain.length,
    durationDays: Number((i.seconds / 86400).toFixed(4)),
    startLocal: localStamp(i.planStart, tz),
    endLocal: localStamp(i.planStart + i.seconds, tz),
    timezone: tz,
    ...(startUtc ? { startUtc } : {}),
    ...(endUtc ? { endUtc } : {}),
    currentTE: i.currentTE,
    finalTE: i.finalTE,
    effort: i.effort,
    window: i.availability ? describeAvailability(i.availability) : null,
    holdShifts: i.holdShifts,
    ...(i.forceContinue === undefined ? {} : { forceContinue: i.forceContinue }),
    waitingHours: waiting === null ? null : Number(waiting.toFixed(2)),
    // Stones are kept wholesale -- they slot into every family above -- while artifacts are
    // narrowed to what a virtue ascension can equip. See VIRTUE_ARTIFACT_FAMILIES.
    ...(i.delivery?.length ? { delivery: i.delivery } : {}),
    ...(i.earnings?.length ? { earnings: i.earnings } : {}),
    artifacts: bestPerFamily(keepVirtueArtifacts(i.artifacts)).map(a => a.label),
    stones: keepVirtueStones(i.stones).map(a => ({ label: a.label, count: a.count })),
    legs: i.legs.map(l => ({
      te: l.endTE,
      strategy: l.key,
      days: Number((l.durationSeconds / 86400).toFixed(3)),
      peakDeliveryQph: Number(((l.maxELR * 3600) / 1e15).toFixed(3)),
    })),
    chainsPriced: i.chainsPriced,
    // Spread so an absent run cost leaves the key off entirely. `run: undefined` would serialise
    // to nothing anyway, but the collector distinguishes "absent" from "present and empty".
    ...(i.run ? { run: roundRunCost(i.run) } : {}),
    ...(i.space ? { space: i.space } : {}),
    ...(i.proof ? { proof: i.proof } : {}),
    ...(i.seed?.length ? { seed: [...i.seed] } : {}),
    ...(i.epicResearch ? { epicResearch: i.epicResearch } : {}),
    ...(i.colleggtibles ? { colleggtibles: i.colleggtibles } : {}),
    startWeekday: weekdayIn(i.planStart, tz),
    ...(i.deliveryScore ? { deliveryScore: i.deliveryScore } : {}),
    ...(i.clothedTE !== null && i.clothedTE !== undefined && Number.isFinite(i.clothedTE)
      ? { clothedTE: Number(i.clothedTE.toFixed(2)) }
      : {}),
    ...(i.teByEgg?.length ? { teByEgg: i.teByEgg.map(v => Math.max(0, Math.round(v))) } : {}),
    // Whenever the save time is known, negative included (schema 7). Schema 6 left it off when the
    // plan started before the save, so a what-if start read exactly like "not recorded"; the race
    // needs to tell the two apart. `+ 0` turns a rounded -0 into 0.
    ...(age !== null && Math.abs(age) <= MAX_BACKUP_AGE_HOURS ? { backupAgeHours: age + 0 } : {}),
    ...(i.backupTE !== null && i.backupTE !== undefined && Number.isFinite(i.backupTE) && i.backupTE >= 0
      ? { backupTE: Number(i.backupTE.toFixed(2)) }
      : {}),
    ...(build ? { build } : {}),
    ...(rechecks.length ? { rechecks } : {}),
    ...(i.flags?.length ? { flags: [...i.flags] } : {}),
    ...(i.integrityWaitSeconds !== null &&
    i.integrityWaitSeconds !== undefined &&
    Number.isFinite(i.integrityWaitSeconds)
      ? { integrityMinutes: Math.round(i.integrityWaitSeconds / 60) }
      : {}),
    ...(i.timeOff?.length ? { timeOff: i.timeOff.map(w => ({ ...w })) } : {}),
    submittedAt: new Date(i.now ?? Date.now()).toISOString(),
  };
}

/** Suggested filename for the offline path. Dated so two submissions do not collide. */
export function submissionFilename(s: Submission): string {
  const stamp = s.submittedAt.slice(0, 16).replace(/[:T]/g, '-');
  return `chain-submission-${s.finalTE}te-${stamp}.json`;
}

/**
 * Everything a receiving collector needs to validate a submission before storing it.
 *
 * Exported so the Worker and the app agree on the rules rather than each inventing their own.
 * Returns the problems; an empty array means acceptable.
 */
export function validateSubmission(value: unknown): string[] {
  const problems: string[] = [];
  const s = value as Partial<Submission> | null;
  if (!s || typeof s !== 'object') return ['not an object'];
  if (s.schema !== SUBMISSION_SCHEMA) problems.push(`unknown schema ${String(s.schema)}`);
  if (!Array.isArray(s.chain) || s.chain.length < 2) problems.push('chain must have at least two entries');
  else {
    if (!s.chain.every(v => Number.isInteger(v) && v > 0)) problems.push('chain must be positive integers');
    if (!s.chain.every((v, k) => k === 0 || v > s.chain![k - 1])) problems.push('chain must strictly increase');
  }
  if (typeof s.durationDays !== 'number' || !(s.durationDays > 0)) problems.push('durationDays must be positive');
  if (typeof s.finalTE !== 'number' || !(s.finalTE > 0)) problems.push('finalTE must be positive');
  if (s.nickname !== undefined && (typeof s.nickname !== 'string' || s.nickname.length > 40)) {
    problems.push('nickname must be a string of at most 40 characters');
  }
  // Schema 7. Optional, so absent is fine; present and malformed is a client bug worth saying.
  if (s.rechecks !== undefined) {
    if (!Array.isArray(s.rechecks) || s.rechecks.length > MAX_RECHECKS) {
      problems.push(`rechecks must be an array of at most ${MAX_RECHECKS} entries`);
    } else if (
      !s.rechecks.every(
        r =>
          isRecheckChain(r?.chain, s.finalTE as number) &&
          Number.isFinite(r.days) &&
          r.days > 0 &&
          r.days <= MAX_DURATION_DAYS
      )
    ) {
      problems.push('each recheck must be a rising chain ending at finalTE, with positive days');
    }
  }
  if (
    s.backupAgeHours !== undefined &&
    !(Number.isFinite(s.backupAgeHours) && Math.abs(s.backupAgeHours) <= MAX_BACKUP_AGE_HOURS)
  ) {
    problems.push(`backupAgeHours must be within ${MAX_BACKUP_AGE_HOURS} hours either way`);
  }
  if (s.backupTE !== undefined && !(Number.isFinite(s.backupTE) && s.backupTE >= 0)) {
    problems.push('backupTE must be a number');
  }
  if (s.build !== undefined && (typeof s.build !== 'string' || s.build.length > MAX_BUILD)) {
    problems.push(`build must be a string of at most ${MAX_BUILD} characters`);
  }
  for (const field of ['startUtc', 'endUtc'] as const) {
    const v = s[field];
    if (v !== undefined && (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))) {
      problems.push(`${field} must be an ISO date`);
    }
  }
  if (typeof JSON.stringify(s) === 'string' && JSON.stringify(s).length > 200_000) {
    problems.push('submission is implausibly large');
  }
  return problems;
}
