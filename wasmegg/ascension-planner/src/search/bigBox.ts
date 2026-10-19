/**
 * @module bigBox
 * @description The note an Exhaustive box gets when it is big: its routes, about how many hours it
 * takes here, and where a run that long is better off. ONE wording for the site (InsanePanel.vue's
 * Exhaustive on Fastest, DeadlinePanel.vue's on By a date) and the command line (scripts/siteRun.ts,
 * in `--dry-run` and once at the start of a run), so the two cannot drift.
 *
 * The count is the one the screen already shows as routes, and the time is the estimate it already
 * shows beside it (Est. wall clock): nothing is worked out twice here, only put in words. With no
 * estimate to go on it says "many hours" rather than a number.
 */
import { thisDevice } from './device';

/** Above this many routes a box gets the note (at exactly this many it does not). */
export const BIG_BOX_ROUTES = 300000;

export interface BigBoxInput {
  /** The box's routes, as the screen shows them. */
  routes: number;
  /** The count is itself an estimate (By a date's "~N routes"): said "about N". */
  approximate?: boolean;
  /** The screen's estimate of the wall clock, in seconds; null or 0 when there is none. */
  seconds: number | null;
  /** Workers the estimate is for. */
  workers: number;
  /** Where the speed came from, in words: "measured on this computer", "the typical speed for
   *  5-ascension routes in players' runs". */
  basis: string;
  /** "this computer" / "this tablet" / "this phone"; `thisDevice()` when left out (on the command
   *  line, Node's navigator reads as a computer). */
  device?: string;
  /** The site points to the command line; the command line says how to keep a long run going. */
  where: 'site' | 'cli';
}

/** What the site says after the size: where a run this long belongs. */
export const BIG_BOX_SITE_TAIL =
  'The command line runs the same search without keeping a browser tab open: see the README (The command line).';
/** What the command line says instead. */
export const BIG_BOX_CLI_TAIL =
  'Keep this terminal open; with --out DIR, a run that stops carries on when the same command runs again.';

const n = (x: number) => Math.round(x).toLocaleString('en-US');

/** Two significant figures, for a rate that is only a guide: 9,437 -> 9,400. */
function twoFigures(x: number): number {
  if (x < 100) return Math.round(x);
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / unit) * unit;
}

/** Hours, plainly: "about 63 hours", "about 1 hour", "under an hour". */
export function hoursWords(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return 'under an hour';
  const r = Math.round(h);
  return `about ${n(r)} hour${r === 1 ? '' : 's'}`;
}

/** The note, or null for a box at or under `BIG_BOX_ROUTES`. */
export function bigBoxNote(input: BigBoxInput): string | null {
  const routes = input.routes;
  if (!(routes > BIG_BOX_ROUTES) || !Number.isFinite(routes)) return null;
  const count = `${input.approximate ? 'about ' : ''}${n(routes)} routes`;
  const tail = input.where === 'site' ? BIG_BOX_SITE_TAIL : BIG_BOX_CLI_TAIL;
  const s = input.seconds;
  if (!(s && s > 0 && Number.isFinite(s))) return `Big box: ${count}. This will take many hours. ${tail}`;
  const device = input.device || thisDevice();
  const workers = Math.max(1, Math.round(input.workers));
  const perHour = twoFigures(routes / (s / 3600));
  return (
    `Big box: ${count}, ${hoursWords(s)} on ${device} ` +
    `(estimated from about ${n(perHour)} routes an hour on ${workers} worker${workers === 1 ? '' : 's'}, ${input.basis}). ${tail}`
  );
}
