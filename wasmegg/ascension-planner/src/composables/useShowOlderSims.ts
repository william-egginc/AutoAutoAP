/**
 * "Show runs from older simulators" on the Leaderboard tab (lib/simLabel.ts): on by default, kept per
 * browser. One ref for the whole page, so the board's views and Insights agree. Storage can throw
 * (private mode, blocked site data): then it is simply not remembered.
 */
import { ref, watch } from 'vue';
import { SIM_VERSION } from '@/search/simVersion';
import { simLabel } from '@/lib/simLabel';

export const SHOW_OLDER_KEY = 'aap.simlabel.older';

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_OLDER_KEY) !== '0';
  } catch {
    return true;
  }
}

const showOlder = ref(read());
watch(showOlder, v => {
  try {
    globalThis.localStorage?.setItem(SHOW_OLDER_KEY, v ? '1' : '0');
  } catch {
    /* not remembered */
  }
});

/** Is this run priced by this site's own simulator? */
export function isCurrentSim(row: { simVersion?: unknown }): boolean {
  return simLabel(row.simVersion, SIM_VERSION).kind === 'current';
}

/** The rows to show: all of them, or only this simulator's when the toggle is off. */
export function bySimToggle<T extends { simVersion?: unknown }>(rows: T[], show: boolean): T[] {
  return show ? rows : rows.filter(isCurrentSim);
}

/** "12 runs from older simulators are hidden", or '' when none are. */
export function hiddenSimText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '1 run from an older simulator is hidden' : `${n} runs from older simulators are hidden`;
}

/** Every one of `total` runs is hidden by the toggle (`shown` of them left): what Insights says instead of an
 *  empty board (prelive, 21 Oct 2026). '' when some are shown, or there are none at all. */
export function allHiddenSimText(total: number, shown: number): string {
  if (total <= 0 || shown > 0) return '';
  return total === 1
    ? 'The 1 run is from an older simulator and is hidden. Tick “Show runs from older simulators” to see it.'
    : `All ${total} runs are from older simulators and are hidden. Tick “Show runs from older simulators” to see them.`;
}

export function useShowOlderSims() {
  return showOlder;
}
