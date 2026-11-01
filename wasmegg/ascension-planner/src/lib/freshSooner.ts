/**
 * STARTING FRESH WOULD BE SOONER (spec-r7verify, 1 Nov 2026; Release 7 verify item 3). "Continue my build-up" (Your
 * setup's First ascension, or My runs' unfinished build: the build-up side of the A1 choice) never compares the
 * ascension you are in with a fresh start: search/leg.ts runLeg takes the build-up and stops. On a mid-build save that
 * waits for the next research sale, prestiging now ended the ascension 6.5 to 29 days sooner (the verify's synthetic
 * mid-build saves), while Fastest already picks the fresh start. So:
 *
 *   - THE FRESH END: once the forced build-up's simulation is on Right now, My runs prices a fresh start in a second
 *     simulation of its own (composables/useNowPage.ts `freshSim`, setup `FRESH_PRICE_SETUP`): lazily, so Right now's
 *     first answer never waits for it. The ascension followed is unchanged.
 *   - THE LINE shows only when the simulation followed is the forced build-up (or the "just laying" it falls back to)
 *     and the fresh start ends more than `FRESH_SOONER_SECONDS` sooner (`freshSooner`). Never under Fastest, Prestige
 *     now or Finish without buying (those are no forced build-up), never for a route with exact legs.
 *   - THE BUTTON ("Switch to Fastest") keeps an override for this account and ascension in this browser
 *     (`aap.firstasc.<account>.<stop>` = 'auto'; <stop>: the stop the ascension you are in heads to on the followed
 *     route, as the A1 choice keys its pick, lib/a1Choice.ts). With it the simulation is asked as Fastest (`firstAscension
 *     'auto'`, the unfinished-build path and the A1 choice left out) under its own setup key (`FASTEST_SETUP`). Your
 *     setup's saved value is never changed. "Undo" removes the override.
 *
 * Pure apart from the storage it is handed; every read and write in try/catch. Words: lib/freshSoonerWords.ts (DRAFT).
 */

/** The fresh start must end more than this much sooner than the build-up followed before the line shows (1 hour: the
 *  fresh start is priced on the hour, so an hour or less is noise). */
export const FRESH_SOONER_SECONDS = 3600;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface FreshSooner {
  /** When the fresh start would end this ascension, unix seconds. */
  freshEnd: number;
  /** When the build-up followed ends it. */
  legEnd: number;
  /** How much sooner, seconds (> FRESH_SOONER_SECONDS). */
  seconds: number;
}

/**
 * The fresh start against the simulated ascension followed: null unless the leg is the build-up (or continue, the
 * forced build-up's "just laying") and carries a fresh end more than `FRESH_SOONER_SECONDS` sooner.
 */
export function freshSooner(
  leg: { key: string; endTime: number; firstLegEnds?: Partial<Record<'continue' | 'buildup' | 'fresh', number>> } | null | undefined
): FreshSooner | null {
  if (!leg || (leg.key !== 'buildup' && leg.key !== 'continue')) return null;
  const f = leg.firstLegEnds?.fresh;
  if (!finite(f) || !finite(leg.endTime)) return null;
  const seconds = leg.endTime - f;
  return seconds > FRESH_SOONER_SECONDS ? { freshEnd: f, legEnd: leg.endTime, seconds } : null;
}

/**
 * Right now's decision (composables/useNowPage.ts `freshLine`): the line shows only for the forced build-up followed by
 * the simulation (`building`: the unfinished-build path, whose followed side is `side`; else Your setup's `setting`),
 * never with exact legs (`trackerOnly`: the plan's own A1 holds) or while Fastest is followed (`fastest`).
 */
export function freshLineFor(o: {
  trackerOnly: boolean;
  fastest: boolean;
  building: boolean;
  side: 'buildup' | 'continue' | null;
  setting: string;
  leg: Parameters<typeof freshSooner>[0];
}): FreshSooner | null {
  return forcesBuildUp(o) ? freshSooner(o.leg) : null;
}

/** `freshLineFor`'s first half: the simulation followed is a forced build-up (or its "just laying") worth pricing a fresh
 *  start beside. */
export function forcesBuildUp(o: {
  trackerOnly: boolean;
  fastest: boolean;
  building: boolean;
  side: 'buildup' | 'continue' | null;
  setting: string;
  leg: { key: string } | null | undefined;
}): boolean {
  if (o.trackerOnly || o.fastest || !o.leg || (o.leg.key !== 'buildup' && o.leg.key !== 'continue')) return false;
  return o.building ? o.side === 'buildup' : o.setting === 'buildup';
}

/** The simulation's setup key part (lib/followSim.ts `simSetupKey`'s first ascension) while Fastest is followed for this
 *  ascension: its records kept apart from Your setup's own 'auto'. */
export const FASTEST_SETUP = 'auto, fastest for this ascension';
/** The setup key part of the fresh start priced beside a forced build-up (composables/useNowPage.ts `freshSim`): a record
 *  of its own, never read as the ascension followed. */
export const FRESH_PRICE_SETUP = 'fresh, priced beside the build-up';

// ------------------------------------------------------------------------------------------------ the kept override

export const FASTEST_PICK_PREFIX = 'aap.firstasc.';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The override's key: the account (a hash, never the player id) and the stop the ascension you are in heads to. */
export function fastestPickKey(account: string, stop: number): string {
  return `${FASTEST_PICK_PREFIX}${account}.${stop}`;
}

export function readFastestPick(account: string, stop: number, st: Store | null = storage()): boolean {
  if (!st) return false;
  try {
    return st.getItem(fastestPickKey(account, stop)) === 'auto';
  } catch {
    return false;
  }
}

/** Keep (on) or remove (off) the override; false when storage refused (it still holds on the page). */
export function writeFastestPick(account: string, stop: number, on: boolean, st: Store | null = storage()): boolean {
  if (!st) return false;
  try {
    if (on) st.setItem(fastestPickKey(account, stop), 'auto');
    else st.removeItem(fastestPickKey(account, stop));
    return true;
  } catch {
    return false;
  }
}
