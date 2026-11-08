/**
 * The Build-up tracker's days at a glance (spec-trackercompact, 8 Nov 2026; design ~/code/aaap-tools/notes/
 * tracker-compact-design.md, Jordan: "all suggested"): what a day buys in one place (Compact), and the done work folded
 * into one line that says what was bought (List and Compact).
 *
 * NOT A RESULT CODE INPUT: it reads lib/buildUpTracker.ts's lines as they are (types only from there) and is imported only by
 * the tracker component, so lib/resultCodeHash.ts never follows into it. Nothing here changes a plan or its lines: it
 * only groups what the component already has. Words: lib/buildUpWords.ts (DRAFT).
 *
 * RANGES. A research line's `parts` say each research's range for that check-in ("Grav Plating (17 → 18)", the Manual
 * Planner's form, lib/buildUpWords.ts) and its `items` the level after it. A day's (or a run's) range runs from the level
 * before its first buy of that research to the level after its last: the first part's "before" and the last item's
 * level, said again by `researchRangeWords` (so "max" reads as it does on the lines). A part that does not read as a
 * range (it never should) is kept as it is.
 *
 * DONE. A line is done when it is ticked: `ticks` is the tracker's merged set, the save's ticks and the player's own
 * (lib/buildUpBought.ts `effectiveTicks`). A day is done when it has lines to tick and every one is ticked; lines with
 * no box (sale on and off, waits, warnings, notes) don't count.
 */
import type { TrackerDay, TrackerLine } from './buildUpTracker';
import { CHEAP_SWEEP_MARK, RANGE_ARROW, researchRangeWords } from './buildUpWords';

/** One research's range over some lines. */
export interface RangeItem {
  /** Research id (or the part's own words when it carries none). */
  id: string;
  name: string;
  before: number;
  after: number;
  /** 'Grav Plating (17 → 18)', 'Neural Linking (25 → max)'. */
  words: string;
  /** Every line of it among the lines is ticked. */
  done: boolean;
}

/** A line that is something to do (a box) and is ticked. */
export const lineDone = (l: TrackerLine, ticks: ReadonlySet<string>): boolean => l.tickable && ticks.has(l.key);

/** A day with lines to tick, every one ticked. */
export function dayDone(d: Pick<TrackerDay, 'lines'>, ticks: ReadonlySet<string>): boolean {
  const t = d.lines.filter(l => l.tickable);
  return t.length > 0 && t.every(l => ticks.has(l.key));
}

/** Lines still to do: boxes not ticked. */
export const toDoCount = (d: Pick<TrackerDay, 'lines'>, ticks: ReadonlySet<string>): number =>
  d.lines.filter(l => l.tickable && !ticks.has(l.key)).length;

const PART = new RegExp(`^(.*) \\((\\d+) ${RANGE_ARROW} (?:\\d+|\\S+)\\)$`);

/** A part read back: its name and the level before ('Grav Plating (17 → 18)' → Grav Plating, 17); null if it isn't one. */
function readPart(part: string): { name: string; before: number } | null {
  const m = PART.exec(part.endsWith(CHEAP_SWEEP_MARK) ? part.slice(0, -CHEAP_SWEEP_MARK.length) : part);
  return m ? { name: m[1], before: Number(m[2]) } : null;
}

/** The research ranges over `lines` (in order of first appearance), merged per research. */
export function researchRanges(lines: readonly TrackerLine[], ticks: ReadonlySet<string>): RangeItem[] {
  const by = new Map<string, RangeItem & { plain?: boolean }>();
  for (const l of lines) {
    if (l.kind !== 'research' || !l.parts) continue;
    const done = lineDone(l, ticks);
    l.parts.forEach((part, n) => {
      const item = l.items?.[n];
      const id = item && item.kind === 'research' ? item.id : part;
      const after = item && item.kind === 'research' ? item.level : NaN;
      const read = readPart(part);
      const cur = by.get(id);
      if (!cur) {
        by.set(
          id,
          read && Number.isFinite(after)
            ? { id, name: read.name, before: read.before, after, words: '', done }
            : { id, name: part, before: NaN, after: NaN, words: part, done, plain: true }
        );
      } else {
        if (Number.isFinite(after)) cur.after = Math.max(cur.after, after);
        cur.done = cur.done && done;
      }
    });
  }
  return [...by.values()].map(({ plain, ...r }) => ({
    ...r,
    words: plain ? r.words : researchRangeWords(r.name, r.before, r.after, r.id),
  }));
}

/** A line's words without "buy " ('14 Hyperloop Trains (slots 1-14), cars to 5', 'shift to Humility'). */
export const chipWords = (l: Pick<TrackerLine, 'text'>): string => l.text.replace(/^buy /, '');

/** What `lines` did, in one go: research ranges and the other things to do (bold lines' words). */
export function whatLinesDo(lines: readonly TrackerLine[], ticks: ReadonlySet<string>): { research: RangeItem[]; other: TrackerLine[] } {
  return {
    research: researchRanges(lines, ticks),
    other: lines.filter(l => l.tickable && l.kind !== 'research'),
  };
}

/**
 * The leading run of done lines of a day: the boxed lines from the day's first up to the first one not ticked (lines
 * without a box inside it are skipped over, they stay on screen). Lines ticked after a gap are not in it: they stay in
 * place, dimmed, so the run's ranges are never wrong. Empty when the first box isn't ticked.
 */
export function doneRun(d: Pick<TrackerDay, 'lines'>, ticks: ReadonlySet<string>): TrackerLine[] {
  const run: TrackerLine[] = [];
  for (const l of d.lines) {
    if (!l.tickable) continue;
    if (!ticks.has(l.key)) break;
    run.push(l);
  }
  return run;
}

/** At most this many done days drawn one line each; the older ones go under one group line. */
export const DONE_DAYS_SHOWN = 3;

/**
 * Which done days are folded into the group line: the leading done days (every day before the first one with something
 * still to do; a day with nothing to tick neither stops them nor counts) but the last DONE_DAYS_SHOWN of them. Keys are
 * `ymd`.
 */
export function groupedDoneDays(days: readonly TrackerDay[], ticks: ReadonlySet<string>): Set<string> {
  const lead: string[] = [];
  for (const d of days) {
    if (!d.lines.some(l => l.tickable)) continue;
    if (!dayDone(d, ticks)) break;
    lead.push(d.ymd);
  }
  return new Set(lead.length > DONE_DAYS_SHOWN ? lead.slice(0, lead.length - DONE_DAYS_SHOWN) : []);
}

/**
 * An open day's lines in List, with its done work folded and the cap counting only lines still to do: the lines before
 * the done run's first, one `{ run }` entry where the run was (its lines out), then the rest, cut after the `cap`-th
 * line still to do (`cap` null: no cut). `hidden`: lines still to do past the cut.
 */
export function listLines(
  d: Pick<TrackerDay, 'lines'>,
  ticks: ReadonlySet<string>,
  cap: number | null
): { entries: ({ line: TrackerLine } | { run: TrackerLine[] })[]; hidden: number } {
  const run = doneRun(d, ticks);
  const inRun = new Set(run.map(l => l.key));
  const entries: ({ line: TrackerLine } | { run: TrackerLine[] })[] = [];
  let todo = 0;
  let hidden = 0;
  let placed = false;
  for (const l of d.lines) {
    if (inRun.has(l.key)) {
      if (!placed) entries.push({ run });
      placed = true;
      continue;
    }
    const isToDo = l.tickable && !ticks.has(l.key);
    if (cap !== null && todo >= cap) {
      if (isToDo) hidden++;
      continue;
    }
    entries.push({ line: l });
    if (isToDo) todo++;
  }
  return { entries, hidden };
}
