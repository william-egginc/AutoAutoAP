/**
 * MY RUNS' A1 CHOICE (spec-a1choice, 1 Nov 2026; Jordan's decision via the orchestrator). When the save's build isn't
 * finished, My runs simulates the ascension you are in as the build-up carried on (composables/useNowPage.ts, the
 * unfinished-build path), and a build-up that buys wins there even when it ends LATER than finishing without buying
 * (pieha's 27 Oct decision: a player mid build-up wants to see the build go on). Now Right now offers both when that
 * happens, and follows the sooner (finish without buying) until the player picks:
 *
 *   - THE TWO CANDIDATES come from one simulation: search/leg.ts `runLeg` records when each kind would have ended
 *     (`firstLegEnds`) and how many things the build-up's build buys (`buildUpBuys`), whichever kind won; My runs keeps
 *     both on its simulated leg (lib/followSim.ts `SimLeg`). The side the player follows is then simulated under its
 *     own setup key (`A1_SETUP`), so its Next step, Next shifts and Build-up tracker are its own.
 *   - THE CHOICE shows only when the build-up buys something (N > 0) and ends strictly later than continue. A tie shows
 *     no choice and goes to continue, unless the player's kept pick says Keep building; a sooner build-up shows no
 *     choice and is followed as before; a build-up that buys nothing is no build-up (spec-noemptybuild).
 *   - THE DEFAULT is the sooner side (continue). Your setup's First ascension, when set to "Continue my build-up" or
 *     "Finish without buying" (not Fastest), makes that side the default instead. The player's pick outranks both.
 *   - THE PICK is kept per account and ascension in this browser (`aap.a1choice.<account>.<stop>`: the stop the
 *     ascension you are in heads to on the followed route), an override over Your setup's value, which it never
 *     changes. Every read and write in try/catch.
 *
 * Pure apart from the storage it is handed. Player words are DRAFT (Words).
 */
import type { FirstAscension } from '@/search/firstAscension';
import { CONTINUE_MAX_SECONDS } from '@/search/rules';
import { dateAt } from './eventWhen';

/** Which way the ascension you are in goes: carry on the build ('buildup') or finish without buying ('continue'). */
export type A1Side = 'buildup' | 'continue';

export interface A1Candidates {
  /** When the build-up would end the ascension, unix seconds. */
  buildEnd: number;
  /** When finishing without buying would, unix seconds. */
  contEnd: number;
  /** How many things the build-up's build buys (> 0). */
  buys: number;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The two candidates a simulated A1 carries; null when it doesn't carry both (no build-up, nothing bought, no
 *  continue simulated, a record kept before spec-a1choice). */
export function a1Candidates(
  leg: { firstLegEnds?: Partial<Record<'continue' | 'buildup' | 'fresh', number>>; buildUpBuys?: number } | null | undefined
): A1Candidates | null {
  const b = leg?.firstLegEnds?.buildup;
  const c = leg?.firstLegEnds?.continue;
  const n = leg?.buildUpBuys;
  if (!finite(b) || !finite(c) || !Number.isInteger(n) || (n as number) <= 0) return null;
  return { buildEnd: b, contEnd: c, buys: n as number };
}

export interface A1Decision {
  /** The choice is on screen: the build-up buys and ends strictly later than continue. */
  show: boolean;
  /** The side followed. */
  side: A1Side;
  /** How the build-up's end compares: 'none' (no candidates), 'sooner', 'tie' or 'later'. */
  why: 'none' | 'sooner' | 'tie' | 'later';
  /** The side is the player's own pick (not the default). */
  picked: boolean;
}

/**
 * The side followed. `pick`: the player's kept pick for this ascension; `setting`: Your setup's First ascension. No
 * candidates: the build-up path as it always was ('buildup': the simulation's own answer, continue when nothing is
 * left to buy).
 */
export function a1Decision(o: { cand: A1Candidates | null; pick: A1Side | null; setting: FirstAscension }): A1Decision {
  const c = o.cand;
  if (!c) return { show: false, side: 'buildup', why: 'none', picked: false };
  if (c.buildEnd < c.contEnd) return { show: false, side: 'buildup', why: 'sooner', picked: false };
  if (c.buildEnd === c.contEnd)
    return o.pick === 'buildup'
      ? { show: false, side: 'buildup', why: 'tie', picked: true }
      : { show: false, side: 'continue', why: 'tie', picked: o.pick === 'continue' };
  if (o.pick) return { show: true, side: o.pick, why: 'later', picked: true };
  return { show: true, side: o.setting === 'buildup' ? 'buildup' : 'continue', why: 'later', picked: false };
}

/** The side asked for before any candidates are known (the first visit of a save): the kept pick, else an explicit
 *  "Finish without buying" setting, else the build-up (whose run says whether there is a choice at all). */
export function a1FirstAsk(pick: A1Side | null, setting: FirstAscension): A1Side {
  return pick ?? (setting === 'continue' ? 'continue' : 'buildup');
}

/** Each side's first-ascension part of the simulation's setup key (lib/followSim.ts `simSetupKey`): records of the two
 *  sides are kept apart, and a pick that changes the side asks for (or reads) the other side's record. 'buildup' is the
 *  unfinished-build key as it was. */
export const A1_SETUP: Readonly<Record<A1Side, string>> = {
  buildup: 'buildup, build unfinished',
  continue: 'continue, build unfinished',
};

/** What each side puts in the simulation's inputs: the build carried on with continue left out (as before), or
 *  continue pinned (finish without buying even past a week, never a fresh start; continue past six months is no
 *  candidate anywhere, search/rules.ts). */
export function a1Inputs(side: A1Side): { firstAscension: 'buildup' | 'continue'; continueMaxSeconds?: number; continuePinSeconds?: number } {
  return side === 'buildup'
    ? { firstAscension: 'buildup', continueMaxSeconds: 0 }
    : { firstAscension: 'continue', continuePinSeconds: CONTINUE_MAX_SECONDS };
}

// ------------------------------------------------------------------------------------------------ the kept pick

export const A1_PICK_PREFIX = 'aap.a1choice.';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The kept pick's key: the account (a hash, never the player id) and the stop the ascension you are in heads to. */
export function a1PickKey(account: string, stop: number): string {
  return `${A1_PICK_PREFIX}${account}.${stop}`;
}

export function readA1Pick(account: string, stop: number, st: Store | null = storage()): A1Side | null {
  if (!st) return null;
  try {
    const v = st.getItem(a1PickKey(account, stop));
    return v === 'buildup' || v === 'continue' ? v : null;
  } catch {
    return null;
  }
}

/** Keep the pick; false when it could not be kept (it still holds on this page). */
export function writeA1Pick(account: string, stop: number, side: A1Side, st: Store | null = storage()): boolean {
  if (!st) return false;
  try {
    st.setItem(a1PickKey(account, stop), side);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ words (DRAFT)

/** The two options' labels (DRAFT): "Keep building (buys 3 things, ends Dec 13 at 10:50 AM)" and "Finish without
 *  buying (ends Dec 12 at 10:50 AM)", in the player's zone, 12-hour clock as the shared formatter writes it (lib/eventWhen.ts `dateAt`). */
export function a1ChoiceWords(c: A1Candidates, nowSeconds: number, zone: string): { keep: string; finish: string; legend: string } {
  const things = `${c.buys} thing${c.buys === 1 ? '' : 's'}`;
  return {
    legend: 'Keep building ends this ascension later. Pick one:',
    keep: `Keep building (buys ${things}, ends ${dateAt(c.buildEnd, nowSeconds, zone)})`,
    finish: `Finish without buying (ends ${dateAt(c.contEnd, nowSeconds, zone)})`,
  };
}

/** The Build-up tracker's line when the side followed is finishing without buying and a build-up exists (DRAFT). */
export function a1TrackerWords(picked: boolean): string {
  return picked
    ? 'You chose to finish without buying: nothing to buy until your next prestige. Pick Keep building on Right now to see the build-up list.'
    : 'Finishing without buying ends this ascension no later than building on, so Right now follows it: nothing to buy until your next prestige. Pick Keep building on Right now to see the build-up list.';
}
