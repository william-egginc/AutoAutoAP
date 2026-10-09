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
  { at: '2026-10-09T23:57:44Z', note: 'Advanced (Full sweep): one time left for the whole queue that ignores replayed chains after a carry-on, and Jump to it stays on your run' },
  { at: '2026-10-09T22:49:50Z', note: 'Searches show honest progress from the start; Jump to it lands on your run in one click; a second tab no longer offers to carry on a run that is still going' },
  { at: '2026-10-09T19:00:00Z', note: 'Stepping away? can now send your best so far by itself, every 30 minutes or an hour, only when it has changed' },
  { at: '2026-10-09T18:03:00Z', note: 'Long runs can send their best so far to the leaderboard while they keep going; the finished result replaces it', level: 'big' },
  { at: '2026-10-09T17:29:18Z', note: 'First ascension now works like Classic: by default it picks whichever is faster, continuing your current ascension or prestiging now; choose Continue or Prestige now in Your setup or Classic', level: 'big' },
  { at: '2026-10-09T17:12:46Z', note: 'Big Highest TE by a date runs go about twice as fast after the first round, with an honest progress bar and time left; Fastest says when a route with more ascensions might be faster', level: 'big' },
  { at: '2026-10-09T06:52:10Z', note: 'Fixes: sweep links always send their CSV, By a date offers Retry if the CSV upload fails, Work it out again keeps your saved instant answer, and clearer Insights on how close the instant answer is' },
  { at: '2026-10-08T23:56:02Z', note: 'Check exactly shows when it is busy; moving the sliders on a box you typed offers to use the sliders instead; clearer note when a stop is your TE now' },
];

export default {
  reloadIfBuiltBefore: '2026-10-05T06:22:00Z',
  note: history[0].note,
  history,
};
