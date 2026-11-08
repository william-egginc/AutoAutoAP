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
  { at: '2026-11-08T23:00:00Z', note: 'Tidier: the instant-answer note is said once, dates read “on Nov 14 at 9:52 AM”, simpler tracker sale lines, the goal shown once, empty footers hidden, a held prestige shows the time you press it' },
  { at: '2026-11-08T01:38:34Z', note: 'A banner tells you when your answers start from a TE you typed instead of your save’s, with Use my save’s TE; Setup › Sharing has one Save online switch for everything kept online' },
  { at: '2026-11-08T01:38:33Z', note: 'The Build-up tracker no longer waits for ever when a typed starting TE is on, says Try again after 3 minutes, and gives up after 8 with the reason' },
  { at: '2026-11-07T18:41:52Z', note: 'Release 8 (beta): plans and the Build-up tracker use your real TE again, so no more wrong “prestige now” or “shift now”; a stuck tracker fix for Safari; long searches can tell the maintainer', level: 'big' },
  { at: '2026-11-07T18:41:51Z', note: 'Fixed: a TE you haven’t claimed yet was counted, so your current ascension looked about 10% richer; plans, buy times and the tracker now use your claimed TE' },
  { at: '2026-11-07T18:41:50Z', note: 'Build-up tracker: no longer stuck “working it out” in Safari; says “max” for maxed research; cheap buys are grouped; a Tight warning when a sale buy is due minutes before the sale ends' },
  { at: '2026-11-07T18:41:49Z', note: 'If your build-up can’t be worked out, the first step now says not to prestige and to reload, instead of “prestige now”; a reload works it out again' },
  { at: '2026-11-07T18:41:48Z', note: 'Searches of 2 hours or more tell the maintainer they started and ended, so site updates can wait for them; nothing about you is sent, and Setup has an off switch (see About)' },
  { at: '2026-11-07T18:41:47Z', note: 'The “?” tip and About say exactly what goes online; downloaded saves keep only what the planner reads; instant answers are worked out again when your save changes' },
  { at: '2026-11-04T18:00:07Z', note: 'Release 7: a Build-up tracker on My runs (what to buy and when to go offline), Re-plan from this save, one save-age box, and downloaded saves without your player ID', level: 'big' },
  { at: '2026-11-04T18:00:06Z', note: "Build-up tracker on My runs: what to buy and when to go offline, ticked from your save; plans that continue it keep the artifacts you're wearing until Humility, so dates match what you can do" },
  { at: '2026-11-04T18:00:05Z', note: 'When keeping on building would end your ascension later, My runs lets you pick: keep building or finish without buying' },
  { at: '2026-11-04T18:00:04Z', note: 'Right now says when starting fresh would end your ascension over an hour sooner than your build-up, with a Switch to Soonest button; the instant answer says it is an estimate' },
  { at: '2026-11-04T18:00:03Z', note: 'Re-plan from this save is offered when your save no longer matches the route you follow, or the route starts with a build-up that buys nothing; the Building/Producing label follows your save' },
  { at: '2026-11-04T18:00:02Z', note: 'One save-age box (green, yellow or red) says when to sync; Downloaded saves no longer contain your player ID or device IDs; after an update, answers are worked out again with the new version' },
  { at: '2026-11-04T18:00:01Z', note: 'Download for Excel (.xlsx) beside the CSV; saving the same answer twice no longer duplicates it; the update list shows only what is new to you; phone layout and banner tidy-ups' },
  { at: '2026-11-04T18:00:00Z', note: "My runs shows a You are here row and tag; the Auto Planner remembers its screen; Fastest's Save run says Saved ✓; Next step says Prestige at N TE for a producing save; waiting labels have moving dots" },
  { at: '2026-10-29T23:00:07Z', note: 'Release 6: new instant answers, My runs shows your next step and shifts, your Setup and followed route are saved online, and one Run button', level: 'big' },
  { at: '2026-10-29T23:00:06Z', note: 'New instant answers (some numbers will move), and new gear tables make them more exact for more gear sets; the Silos tile estimates time left' },
  { at: '2026-10-29T23:00:05Z', note: 'My runs shows your Next step and Next shifts from your live save, a timeline with a build-up line for each ascension, and a check for a newer save; Your routes at a glance is a heat map' },
  { at: '2026-10-29T23:00:04Z', note: 'Your Setup and sharing choices and the route you follow are saved online, so other devices show them; Earlier versions keeps the last 5, and Restore brings one back' },
  { at: '2026-10-29T23:00:03Z', note: 'One Run button (Run Fast, Run Exact or Run Custom) with a tick to send the result to the Leaderboard; Prefer fewer is on by default, and your old pick is reset' },
  { at: '2026-10-29T23:00:02Z', note: "Opening a Manual plan no longer changes the Auto Planner's answers; the eggs' to goal times are fixed; Not sent yet is orange only when something is unsent; Same TE picks the fewest ascensions" },
  { at: '2026-10-29T23:00:01Z', note: 'The phone watch keeps reporting and warns you when its updates fail; Stepping away starts closed and opens on long runs; the CSV buttons say what they hold, plus a download for the full CSV you sent' },
  { at: '2026-10-29T23:00:00Z', note: 'No prestige days now sit beside Awake hours and Time off in Setup; Custom help is now short bullets; the Help box has Yes to all; this list of updates shows the newest first, with dates' },
  { at: '2026-10-23T00:30:00Z', note: 'Joo’s latest planner with an artifact and stone editor; one Search panel (Fast, Exact, Custom); Egg Day picks finish before Egg Day; hours ahead or behind on My runs', level: 'big' },
  { at: '2026-10-22T15:20:20Z', note: 'Big update today at 4 pm Pacific (T+7). Please refresh this page before then; if a long run needs more time, message Williamthe5thc on Discord.', level: 'big' },
  { at: '2026-10-20T00:37:44Z', note: 'prefer fewer ascensions, try waiting before each prestige, a quick estimate for low-TE accounts, big searches ask first, faster Highest TE by a date searches, a My runs route chart', level: 'big' },
];

export default {
  reloadIfBuiltBefore: '2026-10-23T00:13:48.000Z',
  note: history[0].note,
  history,
};
