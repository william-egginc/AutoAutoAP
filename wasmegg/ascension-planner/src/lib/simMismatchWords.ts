/**
 * The yellow note on an instant answer made with a simulator other than the one this page runs
 * (InstantRoute.vue; search/simVersion.ts `tableSimMismatch` gives `simNote`). It used to explain the Oct 13 low-TE gate
 * change; since the sim5 bump (14 Nov 2026) the difference is small and the instant answers are being rebuilt, so it
 * says that, and how big the difference can be (lib/simLabel.ts says the same on a board row's chip). Wording only.
 * If a later bump ships without a rebuild, change "are being rebuilt" with it.
 */
import { SIM_VERSION } from '@/search/simVersion';

/** "simulator 2026-11-03-sim4" is "simulator sim4"; "an older simulator" is left as it is. */
const shorten = (s: string): string => s.replace(/^simulator \d{4}-\d{2}-\d{2}-/, 'simulator ');

export function simMismatchWords(simNote: string | null): string {
  if (!simNote) return '';
  const current = SIM_VERSION.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return `This instant answer was made with ${shorten(simNote)}. This page runs ${current}, and the instant answers are being rebuilt for it. Until then its dates can differ by up to about a week on a 490 route (about 1%). Fast, Exact or Custom below prices them on your account.`;
}
