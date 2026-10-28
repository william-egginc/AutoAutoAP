/**
 * The one line that says how this account shares (ux29 #11, 27 Oct 2026: "Submit anonymously" and "Credit me as" were
 * separate choices in five places). Every place that used to show its own radios now shows this line and one Change
 * (components/SharingSummary.vue), and Change opens the one setting (components/SharingChoices.vue). The folded
 * Before you send (FindBar.vue) says the same words. Pure, so the specs read it without rendering.
 */
import type { InjectionKey } from 'vue';

/** The collector keeps 40 characters of a name. */
export const SHARING_NAME_MAX = 40;

/** "credited as Williamthe5thc", or "anonymous" (picked, or "Credit me as" with no name typed: a name is never made up). */
export function creditWords(anonymous: boolean, nickname: string, max: number = SHARING_NAME_MAX): string {
  const name = nickname.trim().slice(0, max).trim();
  return anonymous || !name ? 'anonymous' : `credited as ${name}`;
}

/** "Sharing: on · credited as <name>", "Sharing: on · anonymous" or "Sharing: off". */
export function sharingLine(on: boolean, anonymous: boolean, nickname: string, max: number = SHARING_NAME_MAX): string {
  return on ? `Sharing: on · ${creditWords(anonymous, nickname, max)}` : 'Sharing: off';
}

/** Share this result's "open the setting on Credit me as" (ShareResult.vue provides it), for Put my name on it on a
 *  row sent anonymously (BoardSubmitButtons.vue, in Share this result's slot). */
export const OPEN_SHARING_FOR_NAME: InjectionKey<() => void> = Symbol('openSharingForName');
