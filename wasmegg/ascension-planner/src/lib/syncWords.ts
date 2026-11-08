/**
 * The words for saving the starting TE, the Build-up tracker's ticks and its kept plan online (Jordan approved the
 * design and wording on 7 Nov 2026: part of the existing "save online" setting, kept until deleted, one delete button
 * for everything saved online, the banner counting TE not yet claimed). Wording only (a *Words.ts file is out of the
 * result code hash, lib/resultCodeHash.ts `isWordingOnly`). UI imports these; the same words are in about.html #synced.
 * The facts: notes/sync-override-tracker-design-2026-11-07.md.
 */

/** One clause added to the line under the existing "save online" setting. */
export const SYNC_SETUP_CLAUSE =
  'Also saved online: the starting TE you typed, your Build-up tracker ticks and its plan (what to buy and when), so every device shows the same. Anyone who knows your player ID can see them.';
/** How long it is kept. */
export const SYNC_KEPT = 'Kept until you delete it.';

/**
 * The banner when the typed starting TE is lower than the save's TE (a notice, not an error). `saveTe` counts the TE
 * claimed plus the ones not yet claimed (`pending`).
 */
export function startTeBannerWords(typed: number, saveTe: number, pending: number): string {
  const counting = pending > 0 ? `, counting ${pending} not yet claimed` : '';
  return `Your typed starting TE (${typed}) is lower than your save's TE (${saveTe}${counting}), so the answers here start behind where you are.`;
}
/** The one-line form for a phone. */
export function startTeBannerShort(typed: number, saveTe: number, pending: number): string {
  const counting = pending > 0 ? `, counting ${pending} not yet claimed` : '';
  return `Your typed starting TE (${typed}) is lower than your save's (${saveTe}${counting}).`;
}
/** The banner's button. */
export const START_TE_USE_SAVE = "Use my save's TE";

/** The one delete button: everything saved online under the account's code. */
export const SYNC_DELETE_LABEL = 'Delete everything saved online for this account';
export const SYNC_DELETE_CONFIRM =
  "This deletes your followed routes, Setup and sharing choices, instant answers, starting TE, tracker ticks and plan from the planner's server. Your save and what is kept in this browser stay. It cannot be undone.";
export const SYNC_DELETE_YES = 'Delete';
export const SYNC_DELETE_NO = 'Keep it';
export const SYNC_DELETED = 'Deleted. Nothing is saved online for this account now.';
export const SYNC_DELETED_OTHER_DEVICES = 'Other devices will stop showing it once they reload.';
