/**
 * What an open tab is told when a newer build goes live (vite.config.ts writes this into
 * version.json; src/composables/useNewVersion.ts reads it; src/components/NewVersionBanner.vue
 * shows it). THREE LEVELS, and a tab's level only ever goes up:
 *
 * - SMALL (the default): a quiet corner note, "Small update available ...". For wording, looks,
 *   small tweaks and small features. Nothing is asked of the player.
 * - BIG: a full-width banner across the top, "New on the planner: <note> (and N earlier updates)".
 *   For something players should hear about: a new view, a new way to search, a change in what
 *   the planner does for them. Still no reload needed ("you'll get it next time you open the
 *   page, or reload when convenient"); dismissable. Mark the entry with `level: 'big'`.
 * - ESSENTIAL: asks the player to reload. Driven ONLY by `reloadIfBuiltBefore` below, never by an
 *   entry. Use it only for a fix an open tab would trip over (e.g. the collector now refuses what
 *   old tabs send, or a bug that corrupts saved runs or submissions); NEVER for features. Ask the
 *   user before using it.
 *
 * A tab shows ESSENTIAL if its own build is older than `reloadIfBuiltBefore`, else BIG if ANY
 * update it missed is marked big, else SMALL.
 *
 * - reloadIfBuiltBefore: the time of the most recent change that an open tab could trip over. Set
 *   it to (roughly) now only when such a fix ships (see ESSENTIAL), and leave it alone otherwise. A
 *   tab whose own build is older is asked to reload, even if it skipped the deploy that set it.
 * - history: one entry per deploy players will notice, NEWEST FIRST, one entry per line (so merges
 *   from other branches stay easy), at most ~8. `at` is the deploy time in ISO UTC; `level` is
 *   'big' or omitted (small). A tab built before several of them shows the newest note (the newest
 *   big one, when the level is big) plus "and N earlier updates" with the rest.
 * - note: the newest note, derived from history[0] (old open tabs read this field).
 *
 * With every deploy that players will notice, add an entry at the TOP of history, dropping the
 * oldest past ~8. Notes are cut at 200 chars: `pnpm build` warns when src/ has commits
 * newer than this file's last one (vite.config.ts `warnIfReleaseStale`).
 *
 * A .ts file on purpose: the repo ignores *.json in this folder (it is for player backups).
 */
const history: { at: string; note: string; level?: 'small' | 'big' }[] = [
  { at: '2026-10-06T23:41:57Z', note: 'A long run carried on after a crash now reports the save it actually used, so it is no longer filed as a what-if' },
  { at: '2026-10-06T19:00:55Z', note: 'By a date: one clear offer to carry on an unfinished search, and it brings back each chain\'s sliders too' },
  { at: '2026-10-06T18:01:03Z', level: 'big', note: 'Charts start on a heat map, with a choice of how many dots to draw; update notes now list what you missed since your last visit' },
  { at: '2026-10-06T15:51:18Z', level: 'big', note: 'Big runs stay light: past 20,000 chains the charts wait for a button and a heat map shows instead; TE keeps collecting while you wait; My plans filters; a Stepping away? box' },
  { at: '2026-10-06T04:05:49Z', level: 'big', note: 'TE keeps collecting while you wait for your hours; My plans can filter and show the best per group; a Stepping away? box can carry a crashed run on by itself; By a date boxes reset for a new account' },
  { at: '2026-10-06T01:33:42Z', level: 'big', note: 'with Let me pick my hours, TE now keeps collecting while a prestige or an egg shift waits for your hours, so plans with hours come out sooner (often by days)' },
  { at: '2026-10-05T20:20:42Z', note: 'the plan start note says when a newer sync would change it, and a save older than your silos now shows in red and asks you to force a sync' },
  { at: '2026-10-05T20:13:37Z', note: 'Smart search explains itself more plainly, Find and submit says what to tick, "Let me pick my hours" now holds egg shifts too, and refreshing your save moves the plan start up to it' },
];

export default {
  reloadIfBuiltBefore: '2026-10-05T19:54:00Z',
  note: history[0].note,
  history,
};
