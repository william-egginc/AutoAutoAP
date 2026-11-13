import type { ChainView } from './siteNav';

/**
 * Chain Finder's goal switch, "Target TE | By a date" (GoalSwitch.vue; spec-chainfinder, Jordan 12 Nov 2026: Joo's one
 * page with a switch, not two goal tabs). Each side is an address (#/auto/fastest, #/auto/by-date), set the way the
 * old goal tabs set it (App.vue onAutoTab).
 */
export const CHAIN_GOALS: ChainView[] = ['fastest', 'by-date'];

/** A radio group's keys: the arrows move to the next or previous goal (wrapping), Home and End to the first and last.
 *  Null for any other key (Tab leaves the group, Space and Enter press the focused radio as a button). */
export function goalAfterKey(current: ChainView, key: string): ChainView | null {
  const i = CHAIN_GOALS.indexOf(current);
  const n = CHAIN_GOALS.length;
  if (key === 'ArrowRight' || key === 'ArrowDown') return CHAIN_GOALS[(i + 1) % n];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return CHAIN_GOALS[(i - 1 + n) % n];
  if (key === 'Home') return CHAIN_GOALS[0];
  if (key === 'End') return CHAIN_GOALS[n - 1];
  return null;
}
