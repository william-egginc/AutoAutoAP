/**
 * The words for saving the starting TE, the Build-up tracker's ticks and its kept plan online (Jordan approved the
 * design and wording on 7 Nov 2026: part of the existing "save online" setting, kept until deleted, one delete button
 * for everything saved online, the banner counting TE not yet claimed). Wording only (a *Words.ts file is out of the
 * result code hash, lib/resultCodeHash.ts `isWordingOnly`). UI imports these; the same words are in about.html #synced.
 * The facts: notes/sync-override-tracker-design-2026-11-07.md. The master switch is `SAVE_ONLINE_*` below. Where a line names the machine it says it with `thisDevice()` ("this computer", "this phone"), so those are functions.
 */
import { thisDevice } from '@/search/device';

/**
 * The master switch in Setup (Jordan, 7 Nov 2026): one "Save online" tick, on to start, for everything saved online
 * under the account's code: followed routes, Setup and sharing choices, saved answers, and the starting TE with the
 * tracker's ticks and plan. It is per device. Turning it off means this device neither saves nor loads anything online; what is already
 * saved stays until the delete button removes it. After the delete button it turns off on this device.
 */
export const SAVE_ONLINE_LABEL = 'Save online';
/** The line under the tick, on. */
export const SAVE_ONLINE_LINE_ON =
  'Saved online, under a code made from your player ID, so every device shows the same: your followed routes, Setup and sharing choices, saved answers, starting TE, and Build-up tracker ticks and plan. Anyone who knows your player ID can see them.';
/** The line under the tick, off. */
export const saveOnlineLineOff = (): string =>
  `Off: ${thisDevice()} does not save anything online, and shows nothing from online. What is already saved online stays until you delete it.`;
/** The note on a followed route's own "Save online" action while the switch is off (that action is disabled then). */
export const SAVE_ONLINE_FOLLOW_OFF = 'Save online is off in Setup, so this route is not saved online. Turn it on to save it.';
/** After the delete button, in place of the on line. */
export const saveOnlineOffAfterDelete = (): string => `Save online is off on ${thisDevice()}. Turn it on to start saving again.`;
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
/**
 * The confirm with the calendar links named (QA 14 Nov 2026, Words). `links` 0: the plain SYNC_DELETE_CONFIRM, byte for byte. A number: how many links are
 * live. null: a build with the calendar feed on, before the call, when the count is not known ("any calendar links").
 */
export function syncDeleteConfirm(links: number | null = 0): string {
  if (links === 0) return SYNC_DELETE_CONFIRM;
  const [head, tail] = SYNC_DELETE_CONFIRM.split(' Your save and what is kept') as [string, string];
  const also =
    links === null ? 'It also stops any calendar links working.' : links === 1 ? 'It also stops your calendar link working (1 link).' : `It also stops your calendar links working (${links} links).`;
  return `${head} ${also} Your save and what is kept${tail}`;
}
/** The result; with `links` > 0 it says how many calendar links stopped (Words, QA 14 Nov 2026). 0: the plain text. */
export const syncDeleted = (links = 0): string => {
  const base = `Deleted. Nothing is saved online for this account now, and Save online is off on ${thisDevice()}.`;
  if (links <= 0) return base;
  const stopped = links === 1 ? '1 calendar link stopped working.' : `${links} calendar links stopped working.`;
  return `${base} ${stopped} Your calendar may keep the events it already has until it next refreshes.`;
};
