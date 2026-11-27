/**
 * The instant answer's first-legs request, built in one place for the page (components/auto/
 * InstantRoute.vue) and the CLI (scripts/precompute.ts), so the two can never offer different first
 * ascensions: continue current ascension, Continue my build-up (search/leg.ts `buildUpTailParams`),
 * or a fresh build from the table (routeFinder.ts `firstLegOptions`).
 *
 * 'auto' and 'buildup' with a farm in the save include the build-up's tails; 'continue' and 'fresh'
 * never simulate them.
 *
 * BUILD-UP MISSING (6 Nov 2026, Jordan's phone): the page's worker failed, the store handed back [] without a word
 * and kept it, and with only fresh and continue to price the answer said "prestige now and reach 220" mid build-up
 * (Continue my build-up reached it 4 days 19 h sooner). Now the request says when the setting builds up, the save has
 * a farm and working the build-up out FAILED (`buildUpMissing`), so the page can say so and never keep that answer.
 * An empty build-up that did not fail (nothing left to buy) is right, and is not flagged.
 */
import { continueTailParams } from './leg';
import { nextHour } from './routeFinder';
import { readFirstAscension } from './firstAscension';
import { EGG_ORDER, type BuildParams } from './precomputedLeg';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS } from './rules';
import type { FirstLegOptions } from './routeFinder';
import type { SearchInputs } from './types';

/** The backup's egg numbers (50-54) in EGG_ORDER, as search/leg.ts `continueState` maps them. */
const SAVE_EGG_INDEX: Record<number, number> = { 50: 0, 54: 1, 51: 2, 53: 3, 52: 4 };

/**
 * The build-up's tails as the page's worker answers (store `buildUpTails`): `failed` when they could not be worked
 * out (the worker threw or was lost), with `reason` for the log, never for the player. A bare array is the same with
 * `failed` false (the CLI and specs).
 */
export interface BuildUpTailsResult {
  tails: BuildParams[];
  failed?: boolean;
  reason?: string;
}

/** Whether the first ascension's build-up could be worked out (`instantFirstLegsBase`). */
export interface BuildUpFlags {
  /**
   * True only when the setting builds up (auto or buildup), the save has a farm (and the caller did not leave the
   * build-up out), and working the build-up out FAILED (store `buildUpTails` `failed`: the worker threw, was lost or
   * stalled). The answer's first ascension was then priced from fresh and continue only: the page says so and never
   * keeps that answer (InstantRoute.vue `saveSnapshot`, search/instantTables.ts `savedAnswerFits`), so a reload or the
   * next visit works it out again. Absent otherwise, an empty build-up included (nothing left to buy: that is right).
   */
  buildUpMissing?: true;
}

/** `firstLegOptions` without the table and the delivery scale (which the caller's table decides). */
export type InstantFirstLegsBase = Omit<FirstLegOptions, 'table' | 'deliveryScale'> & BuildUpFlags;

export interface InstantFirstLegsParams {
  startTE: number;
  final: number;
  /** Unix seconds; default the save's plan start. */
  start?: number;
  /** The eggs delivered at the start (EGG_ORDER); default the save's own. */
  delivered?: number[];
  /** False: a canonical start with no farm of its own (no continue, no build-up). Default true. */
  save?: boolean;
  /** False: leave the build-up out, for a caller that cannot tell its legs from a fresh one's. */
  buildUp?: boolean;
  /**
   * The build-up's tails timed from `start`: the page asks a background worker (store
   * `buildUpTails`), the CLI simulates in place (`buildUpTailParams`). Only called when the setting
   * builds up and the save has a farm. The page's says when it failed (`BuildUpTailsResult`).
   */
  buildUpTails: (start: number) => Promise<BuildParams[] | BuildUpTailsResult> | BuildParams[] | BuildUpTailsResult;
  /** The table has no row for `startTE` (the player is above its top): the fresh first build simulated
   *  live instead (search/liveCell.ts), from `start` (the next whole hour). The page asks a background
   *  worker (store `liveFreshBuilds`), the CLI simulates in place. */
  liveFresh?: (te: number, start: number) => Promise<BuildParams[]> | BuildParams[];
}

function buildsUpFirst(inputs: SearchInputs): boolean {
  const mode = readFirstAscension(inputs);
  return (mode === 'auto' || mode === 'buildup') && !!inputs.currentFarmState;
}

export async function instantFirstLegsBase(
  inputs: SearchInputs,
  p: InstantFirstLegsParams
): Promise<InstantFirstLegsBase> {
  const start = p.start ?? inputs.planStart;
  const withSave = p.save !== false;
  // The egg the save's farm is on (EGG_ORDER), for continue's holds (routeFinder.ts `firstLegOptions`).
  const contEgg = SAVE_EGG_INDEX[inputs.currentFarmState?.eggType as number] ?? 0;
  const asked = withSave && p.buildUp !== false && buildsUpFirst(inputs);
  const got: BuildUpTailsResult = asked ? readTails(await p.buildUpTails(start)) : { tails: [] };
  const buildUp = got.tails;
  return {
    startTE: p.startTE,
    start,
    final: p.final,
    delivered: p.delivered ?? EGG_ORDER.map(e => inputs.baseState.eggsDelivered?.[e] || 0),
    // Plain copies: the page hands them to workers, which get structured-cloned data, never a
    // reactive proxy.
    cont: withSave ? JSON.parse(JSON.stringify(continueTailParams(inputs, start))) : null,
    buildUp: JSON.parse(JSON.stringify(buildUp)) as BuildParams[],
    ...(p.liveFresh
      ? { freshLive: JSON.parse(JSON.stringify(await p.liveFresh(p.startTE, nextHour(start)))) as BuildParams[] }
      : {}),
    ...(withSave && contEgg >= 0 ? { contEgg } : {}),
    firstAscension: readFirstAscension(inputs),
    pinSeconds: inputs.continuePinSeconds ?? CONTINUE_PIN_MAX_SECONDS,
    maxContinueSeconds: inputs.continueMaxSeconds ?? CONTINUE_MAX_SECONDS,
    ...(asked && got.failed ? { buildUpMissing: true as const } : {}),
  };
}

function readTails(r: BuildParams[] | BuildUpTailsResult): BuildUpTailsResult {
  return Array.isArray(r) ? { tails: r } : { ...r, tails: r.tails ?? [] };
}
