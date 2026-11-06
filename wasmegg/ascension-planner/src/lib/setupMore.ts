/**
 * Setup's More options summary line (auto/YourSetup.vue, docked; UX fluff review 2, part B, 5 Nov 2026). More options
 * starts closed, so its one line has to say what is inside that matters: the plan start, the first ascension and the
 * workers always, and every other value there that is not its default ("a hidden one is how people run with a
 * schedule they forgot they set", YourSetup.vue). The words are DRAFT for Words.
 *
 * Pure: the component hands in the values. Imported only by the component (not a result code hash input).
 */
import { scopeLine } from './panelFold';

export interface SetupMoreValues {
  /** The plan start as Setup shows it ("Nov 3, 12:19 pm", or "now (not set)"). */
  planStart: string;
  /** The first ascension's label without "(default)" ("Soonest"). */
  firstAscension: string;
  workers: number;
  threads: number;
  /** Keep my computer awake while a search runs (default on). */
  keepAwake: boolean;
  /** Let the instant answer run during a search (default off). */
  instantDuringSearch: boolean;
  /** Workers while the tab is in the background; 0 keeps full speed (the default). */
  backgroundWorkers: number;
  /** Routes that keep their per-ascension detail (0 keeps all), and this computer's default. */
  legDetail: number;
  legDetailDefault: number;
  /** Dates in the browser's format (default) or the fixed one, with an example of the fixed one. */
  isoDates: string | null;
  /** The optional tabs, off by default (only with a collector). */
  leaderboardTab: boolean;
  scienceTab: boolean;
  /** The experimental Prestige by box and its default here (on only on the beta site). */
  prestigeBy: boolean;
  prestigeByDefault: boolean;
  /** Include the prediction in results I share (default off; only counts while the box is on and sharing is offered). */
  prestigeByRecord: boolean;
}

/** The values under More options that are not their defaults, in the order the fold shows them. */
export function setupMoreChanged(v: SetupMoreValues): string[] {
  const out: string[] = [];
  if (v.backgroundWorkers > 0) out.push(`In the background ${v.backgroundWorkers} worker${v.backgroundWorkers === 1 ? '' : 's'}`);
  if (!v.keepAwake) out.push('Keep awake off');
  if (v.instantDuringSearch) out.push('Instant answer during a search on');
  if (v.legDetail !== v.legDetailDefault)
    out.push(v.legDetail ? `Detail kept for ${v.legDetail.toLocaleString()} routes` : 'Detail kept for all routes');
  if (v.isoDates) out.push(`Dates as ${v.isoDates}`);
  if (v.leaderboardTab) out.push('Leaderboard tab on');
  if (v.scienceTab) out.push('Science tab on');
  if (v.prestigeBy !== v.prestigeByDefault) out.push(`Prestige by… ${v.prestigeBy ? 'on' : 'off'}`);
  if (v.prestigeBy && v.prestigeByRecord) out.push('Prestige by… in results I share');
  return out;
}

/** "Plan start Nov 3, 12:19 pm · First ascension Soonest · 2 of 4 workers", then each changed value. */
export function setupMoreSummary(v: SetupMoreValues): string {
  return scopeLine([
    `Plan start ${v.planStart}`,
    `First ascension ${v.firstAscension}`,
    `${v.workers} of ${v.threads} workers`,
    ...setupMoreChanged(v),
  ]);
}
