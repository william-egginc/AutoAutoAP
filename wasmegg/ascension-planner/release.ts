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
  { at: '2026-10-27T00:30:04Z', note: 'One Run button (Run Fast, Run Exact or Run Custom) with a tick to send the result to the Leaderboard; Prefer fewer is on by default, and your old pick is reset', level: 'big' },
  { at: '2026-10-27T00:30:03Z', note: 'Your Setup and sharing choices are saved online, so other devices show them; No prestige days now sit beside Awake hours and Time off in Setup', level: 'big' },
  { at: '2026-10-27T00:30:02Z', note: 'Follow this route is saved online, so other devices show it; Earlier versions keeps the last 5, and Restore brings one back', level: 'big' },
  { at: '2026-10-27T00:30:01Z', note: 'My runs shows your Next step and Next shifts from your live save, a timeline with a build-up line for each ascension, and a check for a newer save' },
  { at: '2026-10-27T00:30:00Z', note: 'New instant answers (some numbers will move); the Silos tile estimates time left; Your routes at a glance is a heat map; the Help box has Yes to all' },
  { at: '2026-10-23T00:30:00Z', note: 'Joo’s latest planner with an artifact and stone editor; one Search panel (Fast, Exact, Custom); Egg Day picks finish before Egg Day; hours ahead or behind on My runs', level: 'big' },
  { at: '2026-10-22T15:20:20Z', note: 'Big update today at 4 pm Pacific (T+7). Please refresh this page before then; if a long run needs more time, message Williamthe5thc on Discord.', level: 'big' },
  { at: '2026-10-20T00:37:44Z', note: 'prefer fewer ascensions, try waiting before each prestige, a quick estimate for low-TE accounts, big searches ask first, faster Highest TE by a date searches, a My runs route chart', level: 'big' },
];

export default {
  reloadIfBuiltBefore: '2026-10-17T23:00:00Z',
  note: history[0].note,
  history,
};
