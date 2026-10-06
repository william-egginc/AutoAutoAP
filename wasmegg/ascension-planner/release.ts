/**
 * What an open tab is told when a newer build goes live (vite.config.ts writes this into
 * version.json; src/composables/useNewVersion.ts reads it).
 *
 * - reloadIfBuiltBefore: the time of the most recent change that an open tab could trip over. Set
 *   it to (roughly) now whenever such a change ships, and leave it alone for wording or looks. A tab
 *   whose own build is older is asked to reload, even if it skipped the deploy that set it; any
 *   newer tab just gets a quiet "small update available" note.
 * - history: one entry per deploy players will notice, NEWEST FIRST, one entry per line (so merges
 *   from other branches stay easy), at most ~8. `at` is the deploy time in ISO UTC. A tab that was
 *   built before several of them shows the newest note plus "and N earlier updates" with the rest.
 * - note: the newest note, derived from history[0] (old open tabs read this field).
 *
 * With every deploy that players will notice, add an entry at the TOP of history (and bump
 * reloadIfBuiltBefore if a fix ships), dropping the oldest past ~8. Notes are cut at 200 chars: `pnpm build` warns when src/ has commits
 * newer than this file's last one (vite.config.ts `warnIfReleaseStale`).
 *
 * A .ts file on purpose: the repo ignores *.json in this folder (it is for player backups).
 */
const history: { at: string; note: string }[] = [
  { at: '2026-10-06T19:13:00Z', note: "Instant answer: without a table of your own gear, it also prices your route on the nearest tables for stronger and weaker gear and says where your date likely falls" },
  { at: '2026-10-06T19:02:00Z', note: 'Instant answer: routes polished, and polished harder in the background; "Works inside my hours" keeps every prestige inside your hours; "At most N ascensions"; Open this plan builds a row in Classic' },
  { at: '2026-10-06T19:00:55Z', note: 'By a date: one clear offer to carry on an unfinished search, and it brings back each chain\'s sliders too' },
  { at: '2026-10-06T18:01:03Z', note: 'Charts start on a heat map, with a choice of how many dots to draw; update notes now list what you missed since your last visit' },
  { at: '2026-10-06T15:51:18Z', note: 'Big runs stay light: past 20,000 chains the charts wait for a button and a heat map shows instead; TE keeps collecting while you wait; My plans filters; a Stepping away? box' },
  { at: '2026-10-06T04:05:49Z', note: 'TE keeps collecting while you wait for your hours; My plans can filter and show the best per group; a Stepping away? box can carry a crashed run on by itself; By a date boxes reset for a new account' },
  { at: '2026-10-06T01:33:42Z', note: 'with Let me pick my hours, TE now keeps collecting while a prestige or an egg shift waits for your hours, so plans with hours come out sooner (often by days)' },
  { at: '2026-10-05T20:20:42Z', note: 'the plan start note says when a newer sync would change it, and a save older than your silos now shows in red and asks you to force a sync' },
];

export default {
  reloadIfBuiltBefore: '2026-10-05T06:22:00Z',
  note: history[0].note,
  history,
};
