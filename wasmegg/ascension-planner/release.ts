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
  { at: '2026-10-08T19:10:52Z', note: 'Highest TE by a date runs keep every worker busy (up to about twice as fast on big machines), always try the instant answer route, warn when the best route is on a box edge, and give one honest time estimate', level: 'big' },
  { at: '2026-10-08T17:55:07Z', note: 'Tabs renamed Your plan, Fastest to 490 and Highest TE by a date; the instant answer shows straight away on a repeat visit; Find and submit can send your CSV and, if you like, diagnostics', level: 'big' },
  { at: '2026-10-08T06:49:42Z', note: 'Searches use less memory: workers get only the parts of your save they need, and the instant answer frees its workers while a search runs' },
  { at: '2026-10-08T02:22:20Z', note: 'The search chart is hidden until you press Show the chart, so big runs use less memory; a single chain no longer fills the chart' },
  { at: '2026-10-07T23:35:19Z', note: 'Searches wait until your save has loaded and always start from it; By a date carry-ons and saved answers keep their own save when sent' },
  { at: '2026-10-07T23:07:14Z', note: 'Insights rewritten with what we know now, including Egg Day runs; Full sweep chains get the same range and step sliders as By a date; search time estimates match real runs', level: 'big' },
  { at: '2026-10-07T21:32:00Z', level: 'small', note: 'Instant answer: Simulate this plan opens the route in Classic already simulated, scrolled to its ascensions, with a way back to the answer' },
  { at: '2026-10-07T20:11:01Z', level: 'big', note: 'New: an instant answer on Fastest route and By a date. Every ascension was simulated ahead of time, so your best route shows in seconds; then the full simulator checks it on your account.' },
];

export default {
  reloadIfBuiltBefore: '2026-10-05T06:22:00Z',
  note: history[0].note,
  history,
};
