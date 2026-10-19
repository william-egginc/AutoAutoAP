/**
 * "Check exactly": Joo's own simulator on ONE Find a run route, the way his Auto Planner's generate()
 * (auto/useAscensionGenerator.ts) runs it, so the row's estimate starts/ends can be replaced by his
 * exact ones, with the shift times.
 *
 * Why a mirror and not a call: generate() is tied to the page's Pinia stores (it rolls pending TE up
 * INTO them, sets the actions store's snapshot, and writes the plan into the Auto Planner store), so
 * calling it would replace the player's own Auto Planner plan; and a separate Pinia instance can't be
 * kept apart from the page's (his store reads go through the global active Pinia between his awaits).
 * Everything it SIMULATES is pure engine code with no store or page use, so `runExactCheck` repeats
 * his per-ascension loop with the same calls in the same order (runUntilShift to C3, runC3Variants,
 * runAscensionFromC3Variant per surviving variant, A1's Continue Current under the same rule,
 * pickVariant, deriveNextStartState) on inputs read from the stores the way generate() reads them
 * (exactInputs.ts), in a worker (exact.worker.ts). Left out: his store writes, and the 490 TE
 * ascension he silently adds after a last stop under 490 (it comes after the route ends, so it can't
 * move the route's times). A1 is pinned to the row's build as "Import into the planner" pins it
 * (simulatePlan.ts runPendingSimulate); A2 onwards are his pick (the fastest variant).
 *
 * KEEP IN STEP with generate(): if his loop changes, this must follow.
 *
 * Pure: no stores, no page; runs in the worker and in specs.
 */
import { computeSnapshot } from '@/engine/compute';
import { deriveNextStartState, runAscensionFromC3Variant, runContinueCurrent, runUntilShift } from '@/auto/ascension';
import { runC3Variants } from '@/auto/shifts/c3';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import type { EngineState, SimulationContext } from '@/engine/types';
import type { NextShift, PlanEntry, SavedAscension } from './plansOnDevice';
import type { AscensionTime } from './findRun';

/** generate()'s TIER_13_MIN_STARTING_TE. */
export const TIER_13_MIN_STARTING_TE = 190;

/** What the check runs on: read on the page (exactInputs.ts), plain data (it goes to the worker). */
export interface ExactInputs {
  /** The route's TE stops. */
  chain: number[];
  /** A1's build as the answer priced it ('2-sale', '1-sale-tier13', 'continue'; '' = his pick). */
  a1: string;
  /** Unix seconds the plan starts (generate()'s absStartTime: the form's start, whole minutes). */
  start: number;
  /** Unix seconds now (his "start more than an hour away: no Continue Current" rule). */
  now: number;
  /** getSimulationContext() as read on the page. */
  context: SimulationContext;
  /** createBaseEngineState(null) after rollUpPendingTE (his base for every ascension after A1, and,
   *  with the fresh-start fields set, for A1). */
  backupBase: EngineState;
  /** His Continue Current A1 state (farm, worn loadout), or null without a virtue farm. */
  continueState: EngineState | null;
  /** The plan's current TE (his `currentTE`: the effective snapshot's TE), for A1's tier-13 skip. */
  currentTE: number;
}

/** One shift inside an ascension: the egg shifted to and when (unix seconds). */
export type ShiftAt = NextShift;

export interface ExactAscension {
  to: number;
  start: number;
  end: number;
  /** The variant picked ('2-sale', 'continue', ...). */
  variant: string;
  endTE: number;
  shifts: ShiftAt[];
}

export interface ExactResult {
  ascensions: ExactAscension[];
  /** Unix seconds the check ran (its "now"). */
  checkedAt: number;
}

export interface ExactProgress {
  /** 1-based ascension being simulated. */
  ascension: number;
  of: number;
  /** "build phase", "build 2 of 4", "continue". */
  step: string;
}

const VARIANT = /^([123]-sale(-tier13)?|continue)$/;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * The shifts of a simulated ascension, timed as his AscensionOverview.vue times them: the ascension's
 * start plus every wait_ action's duration before each 'shift' action.
 */
export function shiftTimes(v: Pick<VariantResult, 'actions' | 'summary'>): ShiftAt[] {
  const out: ShiftAt[] = [];
  let t = v.summary.startTime;
  for (const a of v.actions as unknown as { type: string; totalTimeSeconds?: number; payload?: Record<string, unknown> }[]) {
    if (a.type === 'shift') {
      const egg = String(a.payload?.toEgg ?? '');
      if (egg) out.push({ egg: eggName(egg), at: t });
    } else if (a.type.startsWith('wait_')) {
      const p = a.payload ?? {};
      t += a.totalTimeSeconds || (p.totalTimeSeconds as number) || (p.timeSeconds as number) || 0;
    }
  }
  return out;
}

/** "kindness" -> "Kindness". */
export function eggName(egg: string): string {
  return egg ? egg[0].toUpperCase() + egg.slice(1) : egg;
}

/**
 * Joo's generate() loop on one route (see the file comment). `onProgress` is told before each costly
 * step; `pause` is awaited there too (the worker gives its queue a turn; a caller may throw to stop).
 */
export async function runExactCheck(
  inp: ExactInputs,
  onProgress?: (p: ExactProgress) => void,
  pause: () => Promise<void> = () => Promise.resolve()
): Promise<ExactResult> {
  const targets = inp.chain;
  if (!targets.length) throw new Error('no route to check');
  for (let i = 1; i < targets.length; i++)
    if (targets[i] <= targets[i - 1]) throw new Error(`stop ${i + 1} (${targets[i]}) is not above ${targets[i - 1]}`);
  const loops = targets.length;
  const overrideA1 = VARIANT.test(inp.a1) ? (inp.a1 as VariantKey) : undefined;

  // generate(): A1 starts from his base with the fresh-start fields set.
  let currentBaseState: EngineState = {
    ...clone(inp.backupBase),
    currentEgg: 'curiosity',
    population: 1,
    bankValue: 0,
    researchLevels: {},
  };
  let currentStartTime = inp.start;
  let endTE: number | null = null;
  const out: ExactAscension[] = [];

  for (let i = 0; i < loops; i++) {
    const stepTargetTE = targets[i];
    const ctx: SimulationContext = { ...inp.context, ascensionStartTime: currentStartTime, planStartOffset: 0 };

    onProgress?.({ ascension: i + 1, of: loops, step: 'build phase' });
    await pause();
    const precomputed = runUntilShift(currentBaseState, ctx, 'C3');
    const preC3 = { actions: precomputed.actions, state: precomputed.state, elapsedSeconds: precomputed.elapsedSeconds };
    const ascensionStartTE = endTE ?? inp.currentTE;
    const c3Variants = runC3Variants(precomputed.state, ctx, 3, ascensionStartTE < TIER_13_MIN_STARTING_TE);
    const surviving = c3Variants.filter(v => !v.impossible);

    const variants: Partial<Record<VariantKey, VariantResult>> = {};
    for (let vIdx = 0; vIdx < surviving.length; vIdx++) {
      const variant = surviving[vIdx];
      const key: VariantKey = variant.attemptTier13Unlock
        ? (`${variant.saleCount}-sale-tier13` as VariantKey)
        : (`${variant.saleCount}-sale` as VariantKey);
      onProgress?.({ ascension: i + 1, of: loops, step: `build ${vIdx + 1} of ${surviving.length}` });
      await pause();
      variants[key] = runAscensionFromC3Variant(currentBaseState, preC3, variant, ctx, currentStartTime, `asc_${i}`, stepTargetTE);
    }

    // generate(): A1's Continue Current, unless the start is over an hour away.
    if (i === 0 && inp.continueState && !(inp.start > inp.now + 3600)) {
      onProgress?.({ ascension: 1, of: loops, step: 'continue' });
      await pause();
      const continueContext: SimulationContext = { ...inp.context, ascensionStartTime: currentStartTime, planStartOffset: 0 };
      const continueState = clone(inp.continueState);
      const realELR = computeSnapshot(continueState, continueContext, { skipGrowth: true }).elr;
      if (realELR > 0) {
        variants.continue = runContinueCurrent(
          continueState, continueContext, currentStartTime, realELR, stepTargetTE, `asc_${i}_continue`
        );
      }
    }

    if (!Object.keys(variants).length) throw new Error(`no build reaches ${stepTargetTE} TE in ascension ${i + 1}`);
    const best = pickVariant(variants, i === 0 ? overrideA1 : undefined, false);
    const picked = (Object.entries(variants) as [string, VariantResult][]).find(([, v]) => v === best)?.[0] ?? '';
    const summary = best.summary;
    out.push({
      to: stepTargetTE,
      start: summary.startTime,
      end: summary.endTime,
      variant: picked,
      endTE: summary.endTE,
      shifts: shiftTimes(best),
    });
    endTE = summary.endTE;

    if (i < loops - 1) {
      currentBaseState = deriveNextStartState(summary, clone(inp.backupBase));
      currentStartTime = summary.endTime;
      if (targets[i + 1] <= summary.endTE)
        throw new Error(`ascension ${i + 1} already reaches ${summary.endTE} TE, past the next stop (${targets[i + 1]})`);
    }
  }
  return { ascensions: out, checkedAt: inp.now };
}

/* ---------- The check's states (the pure part of the button) ---------- */

export type CheckState =
  | { kind: 'idle' }
  | { kind: 'running'; startedMs: number; progress: ExactProgress | null }
  | { kind: 'done'; result: ExactResult; ms: number }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

export type CheckEvent =
  | { kind: 'start'; atMs: number }
  | { kind: 'progress'; progress: ExactProgress }
  | { kind: 'done'; result: ExactResult; atMs: number }
  | { kind: 'error'; message: string }
  | { kind: 'cancel' };

/** The next state. A start while running, and progress or a result when not running, are ignored. */
export function nextCheckState(s: CheckState, e: CheckEvent): CheckState {
  switch (e.kind) {
    case 'start':
      return s.kind === 'running' ? s : { kind: 'running', startedMs: e.atMs, progress: null };
    case 'progress':
      return s.kind === 'running' ? { ...s, progress: e.progress } : s;
    case 'done':
      return s.kind === 'running' ? { kind: 'done', result: e.result, ms: e.atMs - s.startedMs } : s;
    case 'error':
      return s.kind === 'running' ? { kind: 'error', message: e.message } : s;
    case 'cancel':
      return s.kind === 'running' ? { kind: 'cancelled' } : s;
  }
}

/** "1:05" from milliseconds. */
export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The progress line under the button while it runs. */
export function runningText(s: Extract<CheckState, { kind: 'running' }>, nowMs: number): string {
  const p = s.progress;
  const where = p ? ` · ascension ${p.ascension} of ${p.of} (${p.step})` : '';
  return `${elapsedText(nowMs - s.startedMs)} so far${where}`;
}

/**
 * The check must start where the instant answer started: its starting TE (backupBase.te: the TE
 * claimed plus the pending TE, once) equal to the TE the answer used for the row (the save's eggs
 * delivered, instantAnswer.ts saveStart). Otherwise the "exact" times would be for another save, so
 * the check stops before running with this message (nothing is shown or saved as exact).
 */
export function startMismatch(checkTE: number, answerTE: number | undefined): string | null {
  if (answerTE === undefined || !Number.isFinite(answerTE)) return null;
  if (Math.abs(checkTE - answerTE) <= 0.01) return null;
  const n = (x: number) => String(Math.round(x * 100) / 100);
  return `The check starts from TE ${n(checkTE)} but the instant answer used TE ${n(answerTE)}: nothing was shown as exact.`;
}

/** The line shown on an error. */
export function errorText(message: string): string {
  // A message that is already a whole sentence about the check (startMismatch) is said as it is.
  if (/^The check /.test(message)) return message;
  return `The check couldn’t finish: ${message}`;
}

/** Longest error said on the page (the full error goes to the console). */
export const ERROR_MAX = 300;

function cut(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > ERROR_MAX ? `${one.slice(0, ERROR_MAX - 1)}…` : one;
}

/**
 * Any thrown thing as the words after "couldn't finish:": its name and message ("DataCloneError:
 * Failed to execute 'postMessage' …"), never a stock phrase. A DataCloneError says so in plain words.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error || (err && typeof err === 'object' && 'message' in err)) {
    const e = err as { name?: unknown; message?: unknown };
    const name = typeof e.name === 'string' && e.name ? e.name : 'Error';
    const msg = typeof e.message === 'string' ? e.message : String(e.message ?? '');
    const why = name === 'DataCloneError' ? ' (the route couldn’t be copied to the simulator)' : '';
    // Our own plain errors (thrown with `new Error('…')`) read as they are; others keep their name.
    return cut(name === 'Error' && msg ? msg : `${name}: ${msg || '(no message)'}${why}`);
  }
  if (err === undefined || err === null || err === '') return 'an unknown error (nothing was thrown with it)';
  return cut(String(err));
}

/**
 * A worker 'error' event (the worker's script failed to load or threw outside the check) as words:
 * the message and where (file:line:column). The event can come with no message at all (a script
 * that would not load: a 404 page or the wrong type served for it): then it says that.
 */
export function workerErrorText(e: { message?: string; filename?: string; lineno?: number; colno?: number; error?: unknown }): string {
  const where = e.filename ? ` (${e.filename.replace(/^[a-z]+:\/\/[^/]+/i, '')}${e.lineno ? `:${e.lineno}` : ''}${e.colno ? `:${e.colno}` : ''})` : '';
  if (e.error !== undefined && e.error !== null) return cut(`the simulator stopped: ${describeError(e.error)}${where}`);
  if (e.message) return cut(`the simulator stopped: ${e.message}${where}`);
  return cut(
    `the simulator didn’t start: its script failed to load or run${where || ' (no file or line was given)'}; reloading the page usually fixes this`
  );
}

/** The worker's reply couldn't be read (a 'messageerror' event). */
export const MESSAGE_ERROR_TEXT = 'the simulator’s answer couldn’t be read back (messageerror: it could not be copied to the page)';

/* ---------- Merging the exact times into the row and the saved entry ---------- */

/** The opened row's table rows from the exact check. */
export function exactTimes(r: ExactResult): AscensionTime[] {
  return r.ascensions.map((a, i) => ({ n: i + 1, to: a.to, start: a.start, end: a.end }));
}

/** When the exact route finishes (its last ascension's end). */
export function exactFinish(r: ExactResult): number {
  return r.ascensions[r.ascensions.length - 1]?.end ?? 0;
}

/** "3 hours later", "2 days earlier", "the same": the exact finish against the instant estimate. */
export function diffText(estimate: number, exact: number): string {
  const d = exact - estimate;
  const s = Math.abs(d);
  if (s < 60 * 30) return 'about the same';
  const unit =
    s < 86400 * 2
      ? (() => {
          const h = Math.round(s / 3600);
          return `${h} ${h === 1 ? 'hour' : 'hours'}`;
        })()
      : (() => {
          const days = Math.round((s / 86400) * 10) / 10;
          return `${days} days`;
        })();
  return `${unit} ${d > 0 ? 'later' : 'earlier'}`;
}

/** The first shift of the CURRENT (first) ascension still ahead of `nowSeconds`, or undefined. */
export function nextShift(r: ExactResult, nowSeconds: number): ShiftAt | undefined {
  return r.ascensions[0]?.shifts.find(s => s.at > nowSeconds);
}

/** The current ascension's shifts still ahead (the only ones offered for a calendar). */
export function futureShifts(shifts: readonly ShiftAt[] | undefined, nowSeconds: number): ShiftAt[] {
  return (shifts ?? []).filter(s => s.at > nowSeconds);
}

/**
 * A saved entry with the exact check's times: every ascension's start, end and shifts marked exact,
 * the finish (and, by a date, the TE) from the check, and the next shift of the current ascension.
 */
export function withExact(entry: PlanEntry, r: ExactResult, nowSeconds: number, saveTime?: number): PlanEntry {
  const ascensions: SavedAscension[] = r.ascensions.map(a => ({
    to: a.to,
    start: a.start,
    end: a.end,
    kind: 'exact',
    shifts: a.shifts.map(s => ({ ...s })),
  }));
  const next = nextShift(r, nowSeconds);
  const finish = exactFinish(r);
  const { next: _old, ...rest } = entry;
  return {
    ...rest,
    ascensions,
    start: r.ascensions[0]?.start ?? entry.start,
    ...(finish ? { finishAt: finish } : {}),
    ...(!entry.dated && finish ? { days: (finish - (r.ascensions[0]?.start ?? entry.start)) / 86400 } : {}),
    ...(entry.dated && r.ascensions.length ? { te: r.ascensions[r.ascensions.length - 1].endTE } : {}),
    ...(saveTime ? { saveTime } : {}),
    ...(next ? { next: { egg: next.egg, at: next.at } } : {}),
  };
}

/** An entry's exact result back (for the calendar and the row), or null when it has no exact times. */
export function exactOfEntry(entry: PlanEntry): ExactResult | null {
  if (!entry.ascensions.length || !entry.ascensions.every(a => a.kind === 'exact')) return null;
  return {
    checkedAt: entry.savedAt / 1000,
    ascensions: entry.ascensions.map(a => ({
      to: a.to,
      start: a.start,
      end: a.end,
      variant: '',
      endTE: a.to,
      shifts: a.shifts ?? [],
    })),
  };
}

/** What a check is kept under in memory: the save, the goal, the route and its first build. */
export function checkKey(o: { saveTime: number; goal: string; chain: readonly number[]; a1: string }): string {
  return `${o.saveTime}|${o.goal}|${o.chain.join(' ')}|${o.a1}`;
}
