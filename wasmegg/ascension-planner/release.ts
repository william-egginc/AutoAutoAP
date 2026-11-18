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
  { at: '2026-11-17T22:00:06Z', note: 'Release 9: Quick and Full tours, My runs follows the plan on your newest save, Put my plan in my calendar is on, and instant answers on the newest simulator (sim5) where rebuilt', level: 'big' },
  { at: '2026-11-17T22:00:05Z', note: 'Quick tour (22 slides) and Full tour (42 slides), in More and in the page footer. The Full tour can carry on from where the Quick tour ends. Show the tour again is in Setup' },
  { at: '2026-11-17T22:00:04Z', note: 'My runs follows the plan on your newest save and says “worked out on your save from…” for an older one. A box shows when the best for your date is below the TE you follow' },
  { at: '2026-11-17T22:00:03Z', note: 'Setup shows When the plan starts in view, and on a small screen Setup is a round gear button at the bottom' },
  { at: '2026-11-17T22:00:02Z', note: 'The save line says how old your save is. The silo warning shows only when your save is fresh and your silos are low; otherwise you just see the save’s age' },
  { at: '2026-11-17T22:00:01Z', note: 'Put my plan in my calendar is on in Setup: a private link for Google or Apple Calendar with your shifts, buys and ascensions, and a cloud calendar that updates itself. It may be a day behind' },
  { at: '2026-11-17T22:00:00Z', note: 'Instant answers use the newest simulator (sim5) where rebuilt, with a yellow note where one still comes from an older simulator. Answers can differ by about a week on a 490 route' },
  { at: '2026-11-13T22:00:03Z', note: 'Build-up tracker stages: Buying to Tier 13, Focus on ROI and Delivery research, each with its colour, a key and the day on a later band; Compact splits a day by stage; Tier 13 shows where it unlocks' },
  { at: '2026-11-13T22:00:02Z', note: 'A By a date answer with under about 2 days to spare is a close call and says it may miss; a lower TE Custom found is named as confirmed. No answer for an old date shows under a new date' },
  { at: '2026-11-13T22:00:01Z', note: 'Target TE sits in one card like By a date; My runs’ rate says which set it is for (“with your earnings set”); Your eggs show when each reaches its goal' },
  { at: '2026-11-13T22:00:00Z', note: 'The diagnostics download now covers a reload and a carry-on, and a By a date carry-on counts its saved routes' },
  { at: '2026-11-13T06:00:01Z', note: 'Times read the same everywhere: 9:00 AM, with the minutes and capitals' },
  { at: '2026-11-13T06:00:00Z', note: 'The save line stays small at any age, and a small silo line says when your silos run out as of your save (amber when low)' },
  { at: '2026-11-10T21:00:00Z', note: 'A Silo trick setting in Setup › Awake hours (off to start): count the extra cash from collecting inside Monday’s 2x event' },
  { at: '2026-11-10T20:00:02Z', note: 'Joo’s planner update: wait for 2x or sale start and end buttons, smart buys folded in the history, and Continue from the middle of a build in Single run' },
  { at: '2026-11-10T20:00:01Z', note: 'Old saves are caught up all the way to now, with no cap at what your silos hold' },
  { at: '2026-11-10T20:00:00Z', note: 'New instant answers for 12 artifact sets, built with the newest code; other sets use the maxed table for now' },
  { at: '2026-11-10T06:00:07Z', note: 'Release 8: a simpler page (the rest is under More), a first-visit tour, plans that use your real TE, and one Save online switch that now also keeps your starting TE and tracker ticks and plan', level: 'big' },
  { at: '2026-11-10T06:00:06Z', note: 'A simpler page: your answer and Follow come first; the rest is in one More box (Less at the bottom). Buttons have instant tips, with an “i” on phones. Show everything in Setup opens it all.' },
  { at: '2026-11-10T06:00:05Z', note: 'A first-visit tour with a welcome box and a picture on each step; Skip, Remind me later and Show the tour again are always there' },
  { at: '2026-11-10T06:00:04Z', note: 'Plans and the Build-up tracker use your real TE again, so no more wrong “prestige now” or “shift now”; a TE you haven’t claimed yet is no longer counted' },
  { at: '2026-11-10T06:00:03Z', note: 'Build-up tracker: no longer stuck “working it out”, says “max” for maxed research, groups cheap buys, warns when a sale buy is due just before the sale ends, and has a Compact view' },
  { at: '2026-11-10T06:00:02Z', note: 'If your build-up can’t be worked out, the first step says not to prestige and to reload; a banner tells you when your answers start from a typed TE, or one set on another device' },
  { at: '2026-11-10T06:00:01Z', note: 'My runs: Your eggs and the full timeline sit above More; Fast shows a more typical time and number of routes; dates read “on Nov 14 at 9:52 AM”; empty footers are hidden' },
  { at: '2026-11-10T06:00:00Z', note: 'Searches expected to take 2 hours or more tell the maintainer they started and ended, so site updates can wait for them; nothing about you is sent, and Setup has an off switch (see About)' },
  { at: '2026-11-04T18:00:07Z', note: 'Release 7: a Build-up tracker on My runs (what to buy and when to go offline), Re-plan from this save, one save-age box, and downloaded saves without your player ID', level: 'big' },
  { at: '2026-11-04T18:00:06Z', note: "Build-up tracker on My runs: what to buy and when to go offline, ticked from your save; plans that continue it keep the artifacts you're wearing until Humility, so dates match what you can do" },
  { at: '2026-11-04T18:00:05Z', note: 'When keeping on building would end your ascension later, My runs lets you pick: keep building or finish without buying' },
  { at: '2026-11-04T18:00:04Z', note: 'Right now says when starting fresh would end your ascension over an hour sooner than your build-up, with a Switch to Soonest button; the instant answer says it is an estimate' },
  { at: '2026-11-04T18:00:03Z', note: 'Re-plan from this save is offered when your save no longer matches the route you follow, or the route starts with a build-up that buys nothing; the Building/Producing label follows your save' },
  { at: '2026-11-04T18:00:02Z', note: 'One save-age box (green, yellow or red) says when to sync; Downloaded saves no longer contain your player ID or device IDs; after an update, answers are worked out again with the new version' },
  { at: '2026-11-04T18:00:01Z', note: 'Download for Excel (.xlsx) beside the CSV; saving the same answer twice no longer duplicates it; the update list shows only what is new to you; phone layout and banner tidy-ups' },
  { at: '2026-11-04T18:00:00Z', note: "My runs shows a You are here row and tag; the Auto Planner remembers its screen; Fastest's Save run says Saved ✓; Next step says Prestige at N TE for a producing save; waiting labels have moving dots" },
];

export default {
  reloadIfBuiltBefore: '2026-11-10T04:25:00.000Z',
  note: history[0].note,
  history,
};
