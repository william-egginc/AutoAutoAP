/**
 * By a date's Nearby routes with no instant answer for the player's TE (a low-TE player, TE ~78, 16 Oct
 * 2026): a fallback that does what the player would otherwise do by hand.
 *
 * WHY. Without an instant answer the boxes were centred on a guess fitted to the TE (the starting
 * route, else stops spread evenly), each early stop given ±3 TE or less. On that player's Fast run every
 * early stop of the best route sat on its box's low edge: the real best was outside every box.
 *
 * WHAT IT DOES.
 *   1. Quick scan. With no earlier By a date answer to centre on either (one for the same date, priced
 *      from a TE within 3 of the save's: `canCentreOn`), one coarse pass first: every
 *      set of early stops on a wide grid, 1 to 5 ascensions, the last stop bracketed to the exact TE
 *      (deadline.ts without boxes, its fine pass off). It is By a date's own coarse scan, the same idea
 *      as Fastest's "find a starting chain" (coarse.ts `findStartingChain`), which is not used here: that
 *      one ranks routes by the time to 490 and sizes its grid for a 490 target, while this needs the
 *      best route per ascension count by the date. Its best route for each count is that count's
 *      answer, and Nearby routes centres each box on it (deadlineSuggest.ts `suggestBase`, "answer").
 *   2. Nearby routes, in those boxes.
 *   3. Widening. While the best route sits on an edge of its box that can move (bandCheck.ts
 *      `findBandEdges`), that box is widened toward the edge (`widenEdges`, as the command line's
 *      `--widen` and the panel's Widen and run again) and run again: up to `AUTO_WIDEN_ROUNDS` rounds.
 *      Only that box is searched again (`roundChains`); every other count keeps its best route.
 *
 * HOW LONG. Measured 18 Oct 2026 on the alt's 10 Oct save lowered to TE 90, 100 and 115, for Egg Day
 * 2027 at 5 workers (a vitest run of this fallback with real worker threads): a priced leg is about 5
 * worker-seconds, so at 5 workers the minutes are about the legs / 60. Before these limits the scan
 * (250 sets) took 570-780 legs (10-13 min at 5 workers), Nearby routes 1,350-1,520 (22-25 min), and one
 * widening round re-ran every box with one grown to ~1,100 sets (several hours). So the whole fallback
 * is held to about `FALLBACK_BUDGET_SECONDS` on the player's own machine:
 *   - the scan at 100 sets (`QUICK_SCAN_SHAPES`): 470-570 legs, 8-10 min, and the same or a better
 *     best route than at 250 at all three TEs;
 *   - Nearby routes' boxes sized to what is left of the budget (`nearbyBudgetSeconds`);
 *   - a widening round only when it fits what is left (`roundFits`), and at most `WIDEN_MAX_SETS` sets
 *     of early stops (`budgetBands`). Widen and run again under the answer goes further by hand.
 *
 * Find on Nearby routes takes this path only once the instant answer has settled with none: while it is
 * still being worked out, Find waits for it (`awaitInstant`, at most 10 seconds, then goes on without).
 *
 * It ends with no edge, no room to widen, the last round, no time left, a stop, a failed run, or another
 * run going. Each round keeps the best route found so far: a round stopped by hand that has not caught
 * up with the round before gives way to it (`betterRoute`).
 *
 * Pure: the panel (DeadlinePanel.vue) runs the searches; this decides what comes next.
 */
import { findBandEdges, widenEdges, type BandEdge } from './bandCheck';
import { countShapes, parseChainText, stepForBudget, MAX_LAST_STOP } from './deadline';
import { formatBand } from './exhaustive';
import type { DeadlineFallback, DeadlineRunSpec } from './deadlineStore';

/** Widening rounds after the first Nearby routes run, at most. 0 turns automatic widening off: the
 *  answer's Widen and run again is still there. */
export const AUTO_WIDEN_ROUNDS = 1;
/** The quick scan's budget in sets of early stops (its grid widens until it fits). 250 until 18 Oct 2026: 100
 *  cost 15-40% fewer legs and found the same or a better route at TE 90, 100 and 115. */
export const QUICK_SCAN_SHAPES = 100;
/** The whole fallback (scan, Nearby routes, widening) on the player's machine, about. */
export const FALLBACK_BUDGET_SECONDS = 15 * 60;
/** Nearby routes always gets at least this long, even when the scan used up the budget (a slow
 *  machine): its boxes then shrink to about the scan's own routes. */
export const NEARBY_MIN_SECONDS = 60;
/**
 * A widening round's budget in sets of early stops. The 18 Oct Nearby routes runs priced 4.2-4.3 routes a
 * set and 1.3 legs a route, about 28 worker-seconds a set: 36 sets is about 150 routes, 3.4 min at 5
 * workers.
 */
export const WIDEN_MAX_SETS = 36;
/** Ascension counts the quick scan tries: Nearby routes' own, 1 to 5. */
export const QUICK_SCAN_MAX_STOPS = 5;

/** How far (in TE) the save's TE may have moved since an earlier By a date answer was priced for it to
 *  still centre the boxes: past that its routes start from somewhere else, and the quick scan goes. */
export const CENTRE_TE_SLACK = 3;

/** How long Nearby routes may take after a scan that took `elapsedSeconds`: what is left of the budget. */
export function nearbyBudgetSeconds(elapsedSeconds: number, budget = FALLBACK_BUDGET_SECONDS): number {
  const left = budget - Math.max(0, elapsedSeconds || 0);
  return Math.max(NEARBY_MIN_SECONDS, Math.floor(left));
}

/** Whether a widening round estimated at `roundSeconds` fits in what is left of the budget. */
export function roundFits(o: { elapsedSeconds: number; roundSeconds: number; budget?: number }): boolean {
  if (!(o.roundSeconds >= 0)) return false;
  return o.elapsedSeconds + o.roundSeconds <= (o.budget ?? FALLBACK_BUDGET_SECONDS);
}

/** An earlier By a date answer, as the fallback reads it (`SavedDeadlineResult`): the date it was for,
 *  the save TE it was priced from, and its best route for each count. */
export interface EarlierAnswer {
  deadline: number;
  te: number;
  chains: readonly (readonly number[])[];
}

/**
 * Whether an earlier answer can centre the boxes: for the same date, priced from a TE within
 * `CENTRE_TE_SLACK` of the TE now, with a route of 2 or more stops above the TE now.
 */
export function canCentreOn(o: {
  answer: EarlierAnswer | null | undefined;
  deadline: number;
  currentTE: number;
}): boolean {
  const a = o.answer;
  if (!a || a.deadline !== o.deadline) return false;
  if (!(Math.abs(a.te - o.currentTE) <= CENTRE_TE_SLACK)) return false;
  const te = Math.floor(o.currentTE);
  return a.chains.some(c => c.length >= 2 && c[0] > te);
}

/**
 * Whether the quick scan goes first: no instant answer, and no earlier By a date answer the boxes could
 * centre on instead (`canCentreOn`: same date, near this TE).
 */
export function needsQuickScan(o: {
  hadInstant: boolean;
  answer: EarlierAnswer | null | undefined;
  deadline: number;
  currentTE: number;
}): boolean {
  if (o.hadInstant) return false;
  return !canCentreOn(o);
}

/** How long Find waits for the instant answer to settle before going on without it. */
export const INSTANT_SETTLE_MS = 10_000;
/** How often the wait looks again. */
export const INSTANT_POLL_MS = 200;

/**
 * The instant answer as Find on Nearby routes sees it (InstantRoute.vue's `state` event, then the
 * panel's own check that it has a route to centre on): still being worked out, in with a route, or
 * settled with none (no instant answer for this TE, it failed, or it waits on another run).
 */
export type InstantState = 'loading' | 'answer' | 'none';

export type InstantDecision = { go: 'wait' } | { go: 'normal' } | { go: 'fallback'; timedOut: boolean };

/** What Find does now: the normal run around the instant answer, the fallback, or wait a little more. */
export function decideInstant(o: { state: InstantState; waitedMs: number; maxWaitMs?: number }): InstantDecision {
  if (o.state === 'answer') return { go: 'normal' };
  if (o.state === 'none') return { go: 'fallback', timedOut: false };
  if (o.waitedMs >= (o.maxWaitMs ?? INSTANT_SETTLE_MS)) return { go: 'fallback', timedOut: true };
  return { go: 'wait' };
}

/** Shown while Find waits for the instant answer, and when it gave up waiting. */
export const INSTANT_WAIT_STATUS = 'Checking for an instant answer…';
export const INSTANT_TIMEOUT_STATUS = `No instant answer after ${INSTANT_SETTLE_MS / 1000} seconds, so going on without one…`;

/**
 * Wait until the instant answer settles (or `maxWaitMs` passes), then say what Find does. `read` gives
 * the state now; `sleep` and `now` are the clock (injected for the specs). `cancelled` ends the wait
 * early (the panel went away): reads as settled with none, and the caller checks it itself.
 */
export async function awaitInstant(o: {
  read: () => InstantState;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
  pollMs?: number;
  onWait?: () => void;
  cancelled?: () => boolean;
}): Promise<Exclude<InstantDecision, { go: 'wait' }>> {
  const now = o.now ?? (() => Date.now());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const t0 = now();
  let told = false;
  for (;;) {
    const d = decideInstant({ state: o.read(), waitedMs: now() - t0, maxWaitMs: o.maxWaitMs });
    if (d.go !== 'wait') return d;
    if (o.cancelled?.()) return { go: 'fallback', timedOut: false };
    if (!told) {
      told = true;
      o.onWait?.();
    }
    await sleep(o.pollMs ?? INSTANT_POLL_MS);
  }
}

/** The highest early stop the quick scan's grid goes to: the boxes' own guess, never under TE + 150. */
export function scanLastHi(currentTE: number, guessHi: number): number {
  return Math.min(MAX_LAST_STOP, Math.max(Math.floor(guessHi) || 0, Math.floor(currentTE) + 150));
}

/** The quick scan's run, as the panel starts it. Counted as a Nearby routes run (`simple`). */
export function quickScanSpec(o: {
  currentTE: number;
  deadline: number;
  guessHi: number;
  ascendNeeded: boolean;
  level?: DeadlineRunSpec['level'];
}): DeadlineRunSpec {
  const lastHi = scanLastHi(o.currentTE, o.guessHi);
  const shape = {
    currentTE: o.currentTE,
    planStart: 0,
    deadline: o.deadline,
    minStops: 1,
    maxStops: QUICK_SCAN_MAX_STOPS,
    lastLo: Math.floor(o.currentTE) + 1,
    lastHi,
    step: 5,
    maxShapes: QUICK_SCAN_SHAPES,
  };
  const sets = countShapes(shape, stepForBudget(shape));
  return {
    deadline: o.deadline,
    minStops: 1,
    maxStops: QUICK_SCAN_MAX_STOPS,
    lastLo: Math.floor(o.currentTE) + 1,
    lastHi,
    step: 5,
    maxShapes: QUICK_SCAN_SHAPES,
    ascendNeeded: o.ascendNeeded,
    // About 4 routes a set: the last stop is narrowed down, not tried at every TE.
    estimate: sets * 4,
    sets,
    extend: true,
    refine: false,
    simple: true,
    ...(o.level ? { level: o.level } : {}),
    fallback: { scanned: true, widenRounds: 0 },
  };
}

/** What the panel knows after a run, for the next decision. */
export interface WidenState {
  /** The run had an instant answer to start from: never widened automatically. */
  hadInstant: boolean;
  /** The box (one value list per early stop) that holds the best route, or null (none, or no boxes). */
  bands: readonly (readonly number[])[] | null;
  /** The best route, its last stop included, or null. */
  chain: readonly number[] | null;
  /** The TE a run again would start from (DeadlinePanel's `edgeTE`). */
  currentTE: number;
  /** Stop pressed, the run stopped early, or it failed. */
  stopped: boolean;
  /** Another run is going (or getting ready). */
  busy: boolean;
}

export type WidenEnd = 'instant' | 'stopped' | 'busy' | 'rounds' | 'noEdge' | 'noRoom' | 'budget';

export type WidenDecision =
  | { next: true; round: number; edges: BandEdge[]; text: string; status: string }
  | { next: false; why: WidenEnd };

/**
 * A widened box held to `maxSets` sets of early stops (a round's budget, `WIDEN_MAX_SETS`): as widened
 * when it fits; else the stops that were not on an edge pinned to the best route's own; else the
 * widened stops thinned to every 2nd TE, then every 3rd..., counted from the best route's stop so it
 * stays in. `bands` is the box already widened (`widenEdges`), `chain` the best route it was widened
 * for, `edges` the stops it was widened at (1-based).
 */
export function budgetBands(
  bands: readonly (readonly number[])[],
  chain: readonly number[],
  edges: readonly Pick<BandEdge, 'band'>[],
  maxSets = WIDEN_MAX_SETS
): number[][] {
  const size = (b: readonly (readonly number[])[]) => b.reduce((n, x) => n * Math.max(1, x.length), 1);
  const out = bands.map(b => [...b]);
  if (size(out) <= maxSets) return out;
  const widened = new Set(edges.map(e => e.band - 1));
  const pinned = out.map((b, i) => (widened.has(i) || !b.includes(chain[i]) ? b : [chain[i]]));
  if (size(pinned) <= maxSets) return pinned;
  let thinned = pinned;
  for (let step = 2; step <= 50; step++) {
    thinned = pinned.map((b, i) => (widened.has(i) ? b.filter(v => (v - chain[i]) % step === 0) : b));
    if (size(thinned) <= maxSets) break;
  }
  return thinned;
}

/**
 * The boxes a widening round runs: the widened one (`text`, in row `row`), and every other count as just
 * its best route from the run before (`byStops`), so its answer stays on screen at about one set
 * each. A count with no route there is left out.
 */
export function roundChains(o: {
  chains: readonly { asc: number; text: string }[];
  row: number;
  text: string;
  byStops: readonly (readonly number[])[];
}): { asc: number; text: string }[] {
  const out: { asc: number; text: string }[] = [];
  o.chains.forEach((r, k) => {
    if (k === o.row) return out.push({ asc: r.asc, text: o.text });
    if (r.asc <= 1) return out.push({ asc: r.asc, text: '' });
    const route = o.byStops.find(c => c.length === r.asc);
    if (route) out.push({ asc: r.asc, text: route.slice(0, -1).map(v => formatBand([v])).join('; ') });
  });
  return out;
}

/** Whether to widen and run again after `roundsDone` rounds, and how. */
export function nextWidenRound(
  s: WidenState & { roundsDone: number; maxRounds?: number; maxSets?: number }
): WidenDecision {
  const max = s.maxRounds ?? AUTO_WIDEN_ROUNDS;
  if (s.hadInstant) return { next: false, why: 'instant' };
  if (s.stopped) return { next: false, why: 'stopped' };
  if (s.roundsDone >= max) return { next: false, why: 'rounds' };
  if (s.busy) return { next: false, why: 'busy' };
  if (!s.bands?.length || !s.chain || s.chain.length !== s.bands.length + 1) return { next: false, why: 'noEdge' };
  const final = s.chain[s.chain.length - 1];
  const edges = findBandEdges(s.bands, s.chain, { currentTE: s.currentTE, finalTE: final });
  if (!edges.length) return { next: false, why: 'noEdge' };
  // As the panel's Widen and run again: up to just under 490, since the last stop may go past its box.
  const wide = widenEdges(s.bands, edges, { currentTE: s.currentTE, finalTE: MAX_LAST_STOP });
  if (!wide) return { next: false, why: 'noRoom' };
  // Held to the round's budget (`budgetBands`).
  const text = budgetBands(parseChainText(wide), s.chain, edges, s.maxSets ?? WIDEN_MAX_SETS)
    .map(b => formatBand(b))
    .join('; ');
  const round = s.roundsDone + 1;
  return { next: true, round, edges, text, status: widenStatus(round, max, edges) };
}

const ORDINAL = ['1st', '2nd', '3rd'];
const nth = (n: number) => ORDINAL[n - 1] ?? `${n}th`;

/** "Round 2 of up to 3: widening the 2nd stop below 94 and the 3rd stop below 119…" ("Widening ..., one
 *  small round…" when there is only one). */
export function widenStatus(round: number, max: number, edges: readonly BandEdge[]): string {
  const what = edges.map(e => `the ${nth(e.band)} stop ${e.side === 'low' ? 'below' : 'above'} ${e.value}`);
  const list = what.length < 2 ? what.join('') : `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}`;
  if (max <= 1) return `Widening ${list}, one small round…`;
  return `Round ${round} of up to ${max}: widening ${list}…`;
}

/** Shown while the quick scan goes, and while Nearby routes runs in the boxes it placed. */
export const QUICK_SCAN_STATUS =
  'Quick scan: no instant answer for your TE yet, so a rough first look at each number of ascensions places the boxes…';
export const AFTER_SCAN_STATUS = "Checking the routes near the quick scan's best…";
/** The same, with how long its boxes were sized to take (`nearbyBudgetSeconds`). */
export function afterScanStatus(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  const all = Math.round(FALLBACK_BUDGET_SECONDS / 60);
  return (
    `Checking the routes near the quick scan's best, in boxes sized to take about ${min} min so the whole ` +
    `search stays near ${all} min. Stop keeps the best route so far…`
  );
}

/** The route a run found against the one before it: true when `a` is at least as good (a higher last
 *  stop, or the same one with as much time to spare or more). A missing route is never better. */
export function betterRoute(
  a: { chain: readonly number[]; spare: number } | null | undefined,
  b: { chain: readonly number[]; spare: number } | null | undefined
): boolean {
  if (!a?.chain.length) return false;
  if (!b?.chain.length) return true;
  const d = a.chain[a.chain.length - 1] - b.chain[b.chain.length - 1];
  return d > 0 || (d === 0 && a.spare >= b.spare);
}

/**
 * Where the instant answer would be, with none for the player's TE (components/auto/NoInstantAnswer.vue;
 * Jordan, 18 Oct 2026): one button that runs this whole fallback, the same as Find on Nearby routes with
 * no instant answer (DeadlinePanel.vue `start`, then `findWithoutInstant`).
 */
export const QUICK_ESTIMATE_LABEL = 'Get a quick estimate (about 10-15 min)';

/** The card's heading: below the table's lowest TE (`tableFrom`, the table header's `from`), or no table
 *  for another reason (null). */
export function noInstantHeading(tableFrom: number | null): string {
  return tableFrom !== null && tableFrom > 0
    ? `No instant answer below TE ${tableFrom}.`
    : 'No instant answer for your TE yet.';
}

/** The Instant answer section's folded summary when it settled with none (it said "working out…"). */
export const NO_INSTANT_SUMMARY = 'none for your TE';

/** Why Get a quick estimate is greyed out, or '' when it can start. In this order: Your setup still
 *  loading, another run (or Find waiting on the instant answer), a save problem, then whatever Nearby
 *  routes' own Find would refuse (`aroundIssue`, or no date yet). */
export function quickEstimateIssue(o: {
  setupLoaded: boolean;
  busy: boolean;
  blocked: boolean;
  canStart: boolean;
  issue: string;
}): string {
  if (!o.setupLoaded) return 'Waiting for your setup to load…';
  if (o.busy) return 'Another search is running; this can start once it ends.';
  if (o.blocked) return 'Your save needs a look first (see the note above).';
  if (!o.canStart) return o.issue || 'Pick a date and time first.';
  return '';
}

/** Under the quick estimate's best route: it was a quick look, and what looks further. */
export function quickEstimateNote(canWiden: boolean): string {
  return canWiden
    ? 'This is a quick estimate: Widen and run again looks further.'
    : 'This is a quick estimate: Exhaustive looks further, in boxes you set.';
}

/** The plain note beside an answer the fallback found (`SavedDeadlineResult.fallback`). */
export function autoFallbackNote(f: DeadlineFallback): string {
  const from = f.scanned ? 'started from a quick scan' : 'started from your last answer';
  return `No instant answer for your TE yet: ${from}${f.widenRounds > 0 ? ' and widened automatically' : ''}.`;
}

/**
 * The widening rounds, one after another: `read` says where things stand after a run, `runRound` runs
 * the next (the box widened to `d.text`). Never starts a round while another run goes, after a stop,
 * or when `fits` says it would run past the budget.
 */
export async function runAutoWiden(o: {
  read: () => WidenState;
  runRound: (d: Extract<WidenDecision, { next: true }>) => Promise<void>;
  onStatus?: (text: string) => void;
  maxRounds?: number;
  maxSets?: number;
  /** Whether this round fits what is left of the time (`roundFits`); no round starts when it says no. */
  fits?: (d: Extract<WidenDecision, { next: true }>) => boolean;
}): Promise<{ rounds: number; why: WidenEnd }> {
  let rounds = 0;
  for (;;) {
    const d = nextWidenRound({ ...o.read(), roundsDone: rounds, maxRounds: o.maxRounds, maxSets: o.maxSets });
    if (!d.next) return { rounds, why: d.why };
    if (o.fits && !o.fits(d)) return { rounds, why: 'budget' };
    rounds = d.round;
    o.onStatus?.(d.status);
    await o.runRound(d);
  }
}
