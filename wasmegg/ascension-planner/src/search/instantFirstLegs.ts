/**
 * The instant answer's first-legs request, built in one place for the page (components/auto/
 * InstantRoute.vue) and the CLI (scripts/precompute.ts), so the two can never offer different first
 * ascensions: continue current ascension, Continue my build-up (search/leg.ts `buildUpTailParams`),
 * or a fresh build from the table (routeFinder.ts `firstLegOptions`).
 *
 * 'auto' and 'buildup' with a farm in the save include the build-up's tails; 'continue' and 'fresh'
 * never simulate them.
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

/** `firstLegOptions` without the table and the delivery scale (which the caller's table decides). */
export type InstantFirstLegsBase = Omit<FirstLegOptions, 'table' | 'deliveryScale'>;

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
   * builds up and the save has a farm.
   */
  buildUpTails: (start: number) => Promise<BuildParams[]> | BuildParams[];
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
  const buildUp = withSave && p.buildUp !== false && buildsUpFirst(inputs) ? await p.buildUpTails(start) : [];
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
  };
}
