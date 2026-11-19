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
  { at: '2026-11-17T22:00:15Z', note: 'Your calendar link is saved with your account, scrambled on your device first, so all your browsers show the same link. Reset link and Delete everything saved online remove it' },
  { at: '2026-11-17T22:00:14Z', note: 'Your eggs’ “to goal” view has a picker (A1 · A2 · A3 · goal) to see each egg’s times for any ascension. Where the instant answer keeps no shifts, a note says to run a search from Try next' },
  { at: '2026-11-17T22:00:13Z', note: 'My runs is one timeline now: each ascension’s row in You are here opens to its shifts and dates (blocks start closed; press to open), and the Full timeline box is gone' },
  { at: '2026-11-17T22:00:12Z', note: 'Release 9: Quick and Full tours, My runs follows the plan on your newest save, Put my plan in my calendar is on, and instant answers on the newest simulator (sim5) where rebuilt', level: 'big' },
  { at: '2026-11-17T22:00:11Z', note: 'Target TE(s) checks your numbers. Ascensions from/to keep your edits. A link shows each ascension’s dates. Setup names hours and time off. A fresh first ascension no longer reads as under way.' },
  { at: '2026-11-17T22:00:10Z', note: 'A Quick tour (8 slides) and a Full tour (42, or fewer when it carries on from the Quick tour), in More and in the page footer. Show the tour again is in Setup' },
  { at: '2026-11-17T22:00:09Z', note: 'My runs follows the plan on your newest save and says “worked out on your save from…” for an older one. A box shows when the best for your date is below the TE you follow' },
  { at: '2026-11-17T22:00:08Z', note: 'Setup shows When the route starts in view, and on a smaller screen Setup is a round gear button at the bottom' },
  { at: '2026-11-17T22:00:07Z', note: 'The save line says how old your save is. The silo warning shows only when your save is fresh and your silos are low; otherwise you just see the save’s age' },
  { at: '2026-11-17T22:00:06Z', note: 'Put my plan in my calendar is on in Setup: a private link for Google or Apple Calendar with your shifts, buys and ascensions, and a cloud calendar that updates itself. It may be a day behind' },
  { at: '2026-11-17T22:00:05Z', note: 'Instant answers use the newest simulator (sim5) where rebuilt, with a yellow note where one still comes from an older simulator. Answers can differ by about a week on a 490 route' },
  { at: '2026-11-17T22:00:04Z', note: 'A fresh Safari start now uses fewer workers so the tab stays up, and Setup says how many started' },
  { at: '2026-11-17T22:00:03Z', note: 'A warning when your silo buys wait for your awake hours (1 silo overnight), and Monday’s 2x line says to check in during it. A close By a date answer offers Check this date with Fast' },
  { at: '2026-11-17T22:00:02Z', note: 'The Privacy text says your code is a hash of your ID, stored under a secret salt, so a copy of the server’s database can’t be matched to an ID by its codes' },
  { at: '2026-11-17T22:00:01Z', note: 'Searches expected to take 2 hours or more now always tell the planner’s server when they start and stop, so an update can wait. Only a random code and the search’s size and times; see About' },
  { at: '2026-11-10T06:00:07Z', note: 'Release 8: a simpler page (the rest is under More), a first-visit tour, plans that use your real TE, and one Save online switch that now also keeps your starting TE and tracker ticks and plan', level: 'big' },
  { at: '2026-11-04T18:00:07Z', note: 'Release 7: a Build-up tracker on My runs (what to buy and when to go offline), Re-plan from this save, one save-age box, and downloaded saves without your player ID', level: 'big' },
];

export default {
  // R9 (18 Nov 2026): one second after live R8.1's build time (2026-11-19T02:12:17.356Z), so open R8 and R8.1 tabs are asked
  // to reload into R9; the maintainer OK'd it. Was 2026-11-10T06:15:19.000Z (R8.1).
  reloadIfBuiltBefore: '2026-11-19T02:12:18.000Z',
  note: history[0].note,
  history,
};
