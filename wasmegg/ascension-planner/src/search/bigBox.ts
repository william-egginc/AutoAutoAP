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
 *
 * ASKING FIRST (18 Oct 2026; the note alone was not enough). Starting a box above 100,000 routes asks
 * once, with the note's words; above 500,000 it asks a second time after the first yes ("This is a very
 * big box: about N hours. Are you sure?"). A no to either starts nothing. `confirmBigBoxFlow` is the
 * flow, with the asking handed in: the site's dialog (components/auto/BigBoxConfirm.vue, through
 * composables/useBigBoxConfirm.ts) and the command line's `Continue? [y/N]` (scripts/siteRun.ts, which
 * `--yes` skips).
 */
import { thisDevice } from './device';

/** Above this many routes a box gets the note (at exactly this many it does not). */
export const BIG_BOX_ROUTES = 300000;
/** Above this many routes, starting the box asks first (once), with the note's words. */
export const BIG_BOX_CONFIRM_ROUTES = 100000;
/** Above this many routes it asks a second time, after the first OK, more strongly. */
export const BIG_BOX_SECOND_CONFIRM_ROUTES = 500000;

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
  return bigBoxText(input);
}

/** The note's words for any size: what the first confirmation says (`bigBoxConfirms`), even for a box
 *  between 100,000 and 300,000 routes that has no note on the screen. */
export function bigBoxText(input: BigBoxInput): string {
  const routes = input.routes;
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

/**
 * How many times starting a box of `routes` asks first: 0 at or under 100,000 routes, 1 above that, 2
 * above 500,000 (strictly above: exactly 100,000 or 500,000 asks one time fewer).
 */
export function bigBoxConfirms(routes: number): 0 | 1 | 2 {
  if (!Number.isFinite(routes)) return 0;
  if (routes > BIG_BOX_SECOND_CONFIRM_ROUTES) return 2;
  if (routes > BIG_BOX_CONFIRM_ROUTES) return 1;
  return 0;
}

/** The second question's words: "This is a very big box: about 63 hours. Are you sure?" ("many hours"
 *  with no estimate). */
export function bigBoxSecondText(seconds: number | null): string {
  const s = seconds;
  const time = s && s > 0 && Number.isFinite(s) ? hoursWords(s) : 'many hours';
  return `This is a very big box: ${time}. Are you sure?`;
}

/** One question of the flow: which one (1 or 2) and its words. */
export interface BigBoxQuestion {
  step: 1 | 2;
  text: string;
}

/**
 * Ask before a big box starts: none, one or two questions (`bigBoxConfirms`), the second only after a
 * yes to the first. True to start, false when a question was answered no. The asking itself is handed
 * in (the site's dialog, BigBoxConfirm.vue; the command line's `Continue? [y/N]`), so the flow is the
 * same on both and testable without either.
 */
export async function confirmBigBoxFlow(
  input: BigBoxInput,
  ask: (q: BigBoxQuestion) => Promise<boolean>
): Promise<boolean> {
  const n = bigBoxConfirms(input.routes);
  if (n === 0) return true;
  if (!(await ask({ step: 1, text: bigBoxText(input) }))) return false;
  if (n === 1) return true;
  return await ask({ step: 2, text: bigBoxSecondText(input.seconds) });
}

/** The command line's question, after the note (or the stronger sentence). */
export const CLI_CONTINUE_PROMPT = 'Continue? [y/N] ';

/** A yes to `Continue? [y/N]`: "y" or "yes", any case. Anything else, an empty line included, is no. */
export function cliYes(answer: string | null | undefined): boolean {
  return /^\s*y(es)?\s*$/i.test(answer ?? '');
}

/** What the command line says when it cannot ask (its input is not a terminal) and has no --yes. */
export const CLI_NEEDS_YES =
  'Not started: a box above 100,000 routes asks first, and this command cannot be asked (its input is not a terminal). Add --yes to start it.';

/**
 * The command line's asking (scripts/siteRun.ts, once before a real run starts, on the run's whole box:
 * every queued Full sweep box added up). `--yes` skips it; `--dry-run` never asks (it only prints);
 * with input that is not a terminal and no `--yes` it refuses rather than wait for an answer that
 * cannot come. `textShown`: the note for this box is already on screen, so the first question is only
 * `Continue? [y/N]`. The prompt and the printing are handed in, for the specs.
 */
export async function cliConfirmBigBox(
  input: BigBoxInput,
  o: {
    yes: boolean;
    dryRun: boolean;
    interactive: boolean;
    textShown: boolean;
    prompt: (question: string) => Promise<string>;
    print: (line: string) => void;
  }
): Promise<{ go: true } | { go: false; message: string }> {
  if (o.dryRun || o.yes || bigBoxConfirms(input.routes) === 0) return { go: true };
  if (!o.interactive) return { go: false, message: CLI_NEEDS_YES };
  const yes = await confirmBigBoxFlow(input, async q => {
    if (q.step === 2 || !o.textShown) o.print(q.text);
    return cliYes(await o.prompt(CLI_CONTINUE_PROMPT));
  });
  return yes ? { go: true } : { go: false, message: 'Not started.' };
}
