/**
 * The loaded save's own start, kept apart from the shared stores (spec-manualleak, 28 Oct 2026).
 *
 * WHY. Opening or importing a Manual plan (stores/actions/io.ts `importPlanLogic` -> initialState `hydrate`)
 * fills the SAME stores the Auto Planner prices from with the plan's start: its TE, its eggs, its farm and a
 * redacted save with no time. That is right for the Manual Planner, which shows the plan from its own start.
 * But the Auto Planner read them too: Jordan's "to 218" library plan starts at 197 with every egg on its
 * threshold, and a search or the save-age line then priced from that start, not his save at 196 (an instant
 * 314 where his save gives 313, and a "24h 8m" save age from the plan's farm).
 *
 * So the Auto Planner keeps its own copy of what it prices from, taken whenever the stores are set up from
 * the save (stores/chainSearch.ts `keepSaveStart`), and reads THAT while the stores hold a Manual plan
 * (`saveStartFor`). Three belts on top, in our own code (Joo's io.ts and initialState are not touched):
 *   - App.vue `setUpForInstantAnswer` sets the save up again on the Auto Planner after a plan was opened
 *     (`needsSaveSetUp`), as My runs does;
 *   - no search starts while the stores hold a plan (chainSearch `saveNotReady`, `PLAN_NOT_SAVE`);
 *   - the instant answer already waits for the save (search/startProvenance.ts `startWaitOf`).
 *
 * Pure: the store hands its values in. The account is kept in memory only, never sent or shown.
 */
import { toRaw } from 'vue';
import type { SearchInputs } from './types';
import type { StartSource, StartWait } from './startProvenance';

/** What the Auto Planner prices from, as the save set it up. */
export interface SaveStart {
  /** The account the stores were set up for (initialState `playerId`). In memory only. */
  account: string;
  context: SearchInputs['context'];
  baseState: SearchInputs['baseState'];
  currentFarmState: SearchInputs['currentFarmState'];
  currentTE: number;
  /** The save-age line's inputs (chainSearch `saveAgeNote`): the save's approxTime and its silo research. */
  approxTime: number | null;
  siloLevel: number | undefined;
}

/** Where the stores stand, as the store reads them. */
export interface StoresNow {
  /** The player ID on screen (ui `screenPlayerId`). */
  screenPlayerId: string;
  /** How the stores were last set up (initialState `setupSource`). */
  source: StartSource | '';
  /** initialState `hasData`: false between a reset and the next load. */
  hasData: boolean;
}

/**
 * A deep copy of plain data, reading through Vue's proxies, so a later edit to the stores (a Manual plan's
 * own edits after it was opened) cannot reach the copy. The save itself (`context.rawBackup`) is kept by
 * reference: it is replaced whole, never edited, and it is megabytes.
 */
export function plainCopy<T>(x: T): T {
  const v = toRaw(x) as unknown;
  if (Array.isArray(v)) return v.map(plainCopy) as unknown as T;
  if (v && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v as T;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = plainCopy(val);
    return out as T;
  }
  return v as T;
}

/** The save's start, from the inputs `collectInputs` just built off stores set up from the save. */
export function keepSaveStart(
  inputs: Pick<SearchInputs, 'context' | 'baseState' | 'currentFarmState' | 'currentTE'>,
  account: string
): SaveStart {
  const ctx = inputs.context;
  const raw = toRaw(ctx.rawBackup) as { approxTime?: number | null } | undefined;
  const { rawBackup, ...rest } = ctx;
  return {
    account,
    context: { ...plainCopy(rest), rawBackup: toRaw(rawBackup) },
    baseState: plainCopy(inputs.baseState),
    currentFarmState: plainCopy(inputs.currentFarmState),
    currentTE: inputs.currentTE,
    approxTime: typeof raw?.approxTime === 'number' ? raw.approxTime : null,
    siloLevel: (ctx.epicResearchLevels as Record<string, number> | undefined)?.['silo_capacity'],
  };
}

/** A fresh copy of the kept start for one read of the inputs (the save by reference, as everywhere). */
export function startInputsOf(
  kept: SaveStart
): Pick<SearchInputs, 'context' | 'baseState' | 'currentFarmState' | 'currentTE'> {
  const { rawBackup, ...rest } = kept.context;
  return {
    context: { ...plainCopy(rest), rawBackup },
    baseState: plainCopy(kept.baseState),
    currentFarmState: plainCopy(kept.currentFarmState),
    currentTE: kept.currentTE,
  };
}

/** The stores hold a Manual plan's start (opened, imported or restored), not the save's. */
export function storesHoldPlan(s: Pick<StoresNow, 'source'>): boolean {
  return s.source === 'draft';
}

/**
 * The save's start to price from instead of the stores, or null to read the stores as they are: only while
 * they hold a Manual plan (or are between a reset and the next load), and only for the account on screen.
 */
export function saveStartFor(kept: SaveStart | null, now: StoresNow): SaveStart | null {
  if (!kept || !now.screenPlayerId || kept.account !== now.screenPlayerId) return null;
  return storesHoldPlan(now) || (now.source === '' && !now.hasData) ? kept : null;
}

/**
 * Whether the Auto Planner must set the save up again (App.vue `setUpForInstantAnswer`): the instant answer is
 * waiting on a restored draft, an account switch's quick load, another account's stores or a save loaded
 * underneath; or on a Manual plan opened from the library or a file, whose redacted save has no time
 * ('no-save' with the stores holding a plan; before this, nothing set the save up again then).
 */
export function needsSaveSetUp(wait: StartWait, source: StartSource | ''): boolean {
  if (wait === 'draft' || wait === 'switch' || wait === 'not-set-up' || wait === 'other-account') return true;
  return wait === 'no-save' && storesHoldPlan({ source });
}

/** Why no search starts while the stores hold a Manual plan (chainSearch `saveNotReady`).
 *  DRAFT wording (Words owns it). */
export const PLAN_NOT_SAVE =
  'The planner is holding a Manual plan’s start, not your save. Load your save, then try again.';
