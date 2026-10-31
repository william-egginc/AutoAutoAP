/**
 * The build-time warning when src/ has commits newer than the last change to release.ts (vite.config.ts,
 * `warnIfReleaseStale`). Pure, so its git questions can be answered by a spec: `git` runs one git command and
 * returns its output, or throws (no git, a shallow copy).
 *
 * WHY LOUD (R7, 31 Oct 2026). It used to be one plugin warning line, easy to miss in the build output and
 * filtered out entirely by a deploy script that keeps only "built in|error". Since R7 a build with no new note
 * shows open tabs NO banner at all, so a deploy of player-visible changes without a note now goes unannounced.
 * The warning's first line starts with RELEASE_NOTE_MISSING, exactly, so a deploy script can grep for it.
 */

/** The first line of the warning starts with exactly this (no colour codes or other prefix): deploy scripts grep it. */
export const RELEASE_NOTE_MISSING = 'RELEASE NOTE MISSING:';

/** Runs `git <args>` in the app folder and returns its output; throws when git cannot answer. */
export type Git = (args: string[]) => string;

/**
 * How many non-merge commits reachable from HEAD, but not from release.ts's last commit, touch src/. 0 when there
 * is none, when release.ts has no commit, or when git cannot answer.
 */
export function srcCommitsSinceReleaseNote(git: Git): number {
  try {
    const rel = git(['log', '-1', '--format=%H', '--', 'release.ts']).trim();
    if (!rel) return 0;
    const n = Number(git(['rev-list', '--count', '--no-merges', `${rel}..HEAD`, '--', 'src']).trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** The warning for `count` src/ commits since the last note (`newestNote`, release.ts's newest), or null for 0. */
export function releaseNoteWarning(count: number, newestNote: string): string | null {
  if (!(count > 0)) return null;
  const rule = '='.repeat(78);
  const newest = newestNote.length > 70 ? `${newestNote.slice(0, 70)}...` : newestNote;
  return [
    `${RELEASE_NOTE_MISSING} src/ changed since the last release.ts note (${count} commit${count === 1 ? '' : 's'}).`,
    rule,
    `  Add a note to release.ts before deploying.`,
    `  Without a new note, open tabs show NO update banner: players are not told about this deploy.`,
    `  Newest note: "${newest}"`,
    `  A fix an open tab would trip over also needs reloadIfBuiltBefore (ask the maintainer first).`,
    `  Nothing players will notice (specs, comments, tooling)? Then no note is needed.`,
    rule,
  ].join('\n');
}

/** Both together: the warning for this checkout, or null. */
export function releaseNoteWarningFor(git: Git, newestNote: string): string | null {
  return releaseNoteWarning(srcCommitsSinceReleaseNote(git), newestNote);
}
