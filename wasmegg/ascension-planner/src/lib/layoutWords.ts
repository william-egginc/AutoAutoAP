/**
 * The words of the simpler default page (design note notes/simpler-design.md, 9 Nov 2026): the same regions in the same
 * order on every screen, the primary path first and the rest under one closed "More" fold. Final (Words, 10 Nov 2026;
 * Jordan approved the design). Plain section names; the explanations
 * that used to sit on the first screen are the "?" texts below. Wording only (a *Words.ts file is out of the result code
 * hash, lib/resultCodeHash.ts `isWordingOnly`). Names come from lib/siteNav.ts NAMES where they exist.
 */

// ---------------------------------------------------------------------------------------- the fold and its line

/** The one closed fold at the foot of each screen (Setup keeps its own "More options"). */
export const MORE_TITLE = 'More';

/** Fastest and By a date: what is inside, said once under the fold's name. `changed` names a value not at its default.
 *  DRAFT (Words), 12 Nov 2026 pm: "Every number of ascensions, " dropped, the table is on the answer card now (Jordan). */
export const MORE_LINE_AUTO = 'Run a search (Fast, Exact or Custom), maxed gear, how it works';
/** My Runs. */
/** My Runs' More line: Your eggs and the timeline moved above More, so they are not named here (spec-simpler2). */
export const MORE_LINE_MYRUNS = 'Change route, gear, saved answer, try next, your runs';
/** The second fold control at the foot of an open More (Allan, 9 Nov 2026: one click folds all of it). */
export const MORE_LESS = 'Less ⌃';
/** Its name for a screen reader (the "⌃" is drawn, not read). */
export const MORE_LESS_LABEL = `Close ${MORE_TITLE}`;
/** "Every number of ascensions, ... · Prefer fewer: within 12 h". */
export function moreLineWithChanges(line: string, changed: readonly string[]): string {
  return changed.length ? `${line} · ${changed.join(' · ')}` : line;
}

// ---------------------------------------------------------------------------------------- "What to do now"

export const NOW_BEFORE_FOLLOW = 'Press Follow this route: My Runs then shows what to buy and when.';
export const NOW_OPEN_MY_RUNS = 'Open My Runs ›';
/** While a search runs or has a new result: its progress or result, then a link that opens More at the search. */
export const nowSearchRunning = (kind: string, percent: number): string => `${kind} search running: ${Math.round(percent)}%`;
export const NOW_SHOW_SEARCH = 'Show search ›';

// ---------------------------------------------------------------------------------------- the lines under the tabs

/** Fastest to N TE (490, or the player's own target). "Simulated" is not a player word: other events are not counted. */
export const fastestLine = (target: number): string =>
  `The soonest you can reach ${target} TE from your save and Setup. It counts the weekly Research Sale and the Monday boost, not other events.`;
/** Highest TE by a date. */
export const BYDATE_LINE = 'The most TE you can reach by a date (Egg Day by default), from your save and Setup.';

/** The Follow button once pressed. */
export const FOLLOWING = 'Following ✓';
/** The one explainer link (replaces Why?, How this is worked out, How it works and the date version). */
export const HOW_IT_WORKS_LINK = 'How it works ›';
/** Inside More, under the table of every number of ascensions. */
export const ROW_HINT = 'Open a row to follow or simulate that route instead.';
/** The Search card's one line. */
export const SEARCH_CARD_LINE = 'Checks the instant answer on your save.';

// ---------------------------------------------------------------------------------------- My Runs

/** The button that opens Setup, above the answer. Was "Filters" (Jordan's word, 12 Nov 2026); renamed 13 Nov 2026 because it opens Setup,
 *  and the real filters sit under it (UX review H4). Round 2, 14 Nov 2026: an instruction (Jordan: "Click to open Setup: awake hours, time off and more filters").
 *  Words owns the final text (click or tap on a phone). 17 Nov 2026 (Jordan): it also says what Setup holds. */
/** The "?" beside the Target TE | By a date switch (layout/GoalHelp.vue): its accessible name. DRAFT: Words owns it. */
export const GOAL_HELP_LABEL = 'About this page';

export const FILTERS = 'Click to open Setup: awake hours, time off and more filters';

export const STOP_FOLLOWING = 'Stop following';
export const CHANGE_ROUTE = 'Change route';
// ---------------------------------------------------------------------------------------- Setup

export const SHARING_FOLD_TITLE = 'Sharing and privacy';
/** The fold's line: every setting that sends, with its state, so nothing is hidden without being named. */
export function sharingSummaryWords(o: {
  help: 'yes' | 'no' | 'none';
  saveOnline: boolean;
  /** The two share ticks, when the account can share (omit them otherwise). */
  searchResults?: boolean;
  instantWithRuns?: boolean;
  /** The table-answered ping (R10.1; DRAFT for Words). Omit it when there is no collector. */
  tablePick?: boolean;
}): string {
  const help = o.help === 'yes' ? 'yes' : o.help === 'no' ? 'no thanks' : 'not answered';
  const onOff = (b: boolean) => (b ? 'on' : 'off');
  const base = `Help improve: ${help} · Save online: ${onOff(o.saveOnline)}`;
  const table = o.tablePick === undefined ? '' : ` · Table answered: ${onOff(o.tablePick)}`;
  if (o.searchResults === undefined || o.instantWithRuns === undefined) return `${base}${table}`;
  return `${base} · Search results: ${onOff(o.searchResults)} · Instant Answer with runs: ${onOff(o.instantWithRuns)}${table}`;
}
export const SHOW_EVERYTHING_LABEL = 'Show everything';
export const SHOW_EVERYTHING_LINE = 'Every More fold starts open, like the old page.';

// ---------------------------------------------------------------------------------------- the save line

/** The save line's button while Setup's Change player has the player ID box open: it folds the box again. */
export const SAVE_LINE_CLOSE = 'Close player box';
/** Setup's button that opens the player ID box. */
export const CHANGE_PLAYER = 'Change player';
/** The save line's stand-in for a save with no name (moved from layout/SaveLine.vue unchanged). */
export const YOUR_ACCOUNT = 'Your account';
/** The save line's button holds the player's name (Jordan, 12 Nov 2026: "▾ Williamthe5thc"); its name for a screen reader
 *  still starts with Change player. DRAFT (spec-header), for Words. */
export const changePlayerLabel = (name: string): string => `${CHANGE_PLAYER}: ${name}`;
/** My Runs: the "?" after Right now's "Calculated from your … save" line, for a screen reader. It opens the save strip
 *  (its age, Why is my save out of date?, Details, Load latest save). DRAFT (spec-header, 12 Nov 2026), for Words. */
export const SAVE_DETAILS_LABEL = 'Your save: its age and details';

// ---------------------------------------------------------------------------------------- the "?" texts

/** The workers control, shown only while a search runs. The other "?" texts (Prefer fewer, the awake-hours tick, the ascension range, maxed gear) are today's words, moved behind the "?" unchanged. */
export const WORKERS_TIP = 'Workers are the parts of your computer a search uses at once. More is faster, and slows what else you do.';
