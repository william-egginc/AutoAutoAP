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
  { at: '2026-10-16T21:26:50Z', note: 'My runs: switch between Race to 490 and Egg Day, follow any route you like, a Producing or Building badge with your rate, and Recalculate; with your hours on, checks now try the next-best route too' },
  { at: '2026-10-16T15:15:49Z', note: 'New on My runs: where you are now, your next shifts with dates and calendar reminders, your saved answers with how sure they are, and each ascension step by step like Single run', level: 'big' },
  { at: '2026-10-16T02:31:45Z', note: 'New: My runs tab; Compare is now Leaderboard; arrows show when each stop and egg shift happens; maxed-gear what-if; Light results can be shared; your setup and choices are remembered', level: 'big' },
  { at: '2026-10-15T04:52:00Z', note: 'Your name choice is remembered; the running notice sits in the run bar; other options and charts moved to Compare, Your latest run; tags on the level buttons' },
  { at: '2026-10-15T00:42:15Z', note: 'New: Hide from the public on your own runs; About and privacy page; Light prices the instant routes at once on your hours; your hours no longer make the instant answer worse; limits follow the answer', level: 'big' },
  { at: '2026-10-14T21:05:05Z', note: 'Light now says it is waiting for Check exactly, then pricing your routes, with a button to search with Fast; near-tie ascension counts are marked about the same' },
  { at: '2026-10-14T20:04:27Z', note: 'Instant answer on top with two tabs (Search nearby, Exhaustive); each level says what it is for; no more pointless 489 to 490 plans; tabs stay put; maybe you on the board', level: 'big' },
  { at: '2026-10-14T03:59:25Z', note: 'Low-TE accounts that used to stall now get Joo’s opening rounds; clearer run times and advice; old runs fold away; at most 12 workers by default', level: 'big' },
];

export default {
  reloadIfBuiltBefore: '2026-10-05T06:22:00Z',
  note: history[0].note,
  history,
};
