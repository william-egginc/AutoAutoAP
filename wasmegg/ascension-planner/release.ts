/**
 * What an open tab is told when a newer build goes live (vite.config.ts writes this into
 * version.json; src/composables/useNewVersion.ts reads it).
 *
 * - reloadIfBuiltBefore: the time of the most recent change that an open tab could trip over. Set
 *   it to (roughly) now whenever such a change ships, and leave it alone for wording or looks. A tab
 *   whose own build is older is asked to reload, even if it skipped the deploy that set it; any
 *   newer tab just gets a quiet "small update available" note.
 * - note: one short line players will read in either notice.
 *
 * Update both with every deploy that players will notice: `pnpm build` warns when src/ has commits
 * newer than this file's last one (vite.config.ts `warnIfReleaseStale`).
 *
 * A .ts file on purpose: the repo ignores *.json in this folder (it is for player backups).
 */
export default {
  reloadIfBuiltBefore: '2026-10-06T15:51:00Z',
  note: 'Big runs stay light: past 20,000 chains the charts wait for a button and a heat map shows instead; TE keeps collecting while you wait; My plans filters; a Stepping away? box',
};
