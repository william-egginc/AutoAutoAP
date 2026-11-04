/**
 * The loud build warning when src/ changed since the last release.ts note (vite.config.ts warnIfReleaseStale). A fake
 * git answers from a small commit list, oldest first, so no real repository is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELEASE_NOTE_MISSING,
  releaseNoteWarning,
  releaseNoteWarningFor,
  srcCommitsSinceReleaseNote,
  type Git,
} from './releaseNoteWarning';

interface Commit {
  hash: string;
  paths: string[];
  merge?: boolean;
}

/** Answers the two questions the helper asks, from `commits` (oldest first, all reachable from HEAD). */
function fakeGit(commits: Commit[]): Git {
  return args => {
    if (args[0] === 'log' && args.at(-1) === 'release.ts') {
      const c = [...commits].reverse().find(x => !x.merge && x.paths.includes('release.ts'));
      return c ? `${c.hash}\n` : '';
    }
    if (args[0] === 'rev-list') {
      const range = args.find(a => a.endsWith('..HEAD'))!;
      const from = commits.findIndex(c => c.hash === range.slice(0, -'..HEAD'.length));
      const after = commits.slice(from + 1).filter(c => !c.merge && c.paths.some(p => p.startsWith('src/')));
      return `${after.length}\n`;
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

const NOTE = 'Release 6: new instant answers and one Run button';

describe('srcCommitsSinceReleaseNote', () => {
  it('no commits since the note: no warning', () => {
    const git = fakeGit([
      { hash: 'a1', paths: ['src/App.vue'] },
      { hash: 'b2', paths: ['release.ts', 'src/lib/x.ts'] },
    ]);
    expect(srcCommitsSinceReleaseNote(git)).toBe(0);
    expect(releaseNoteWarningFor(git, NOTE)).toBeNull();
  });

  it('src/ commits after the last note: the warning, with the count', () => {
    const git = fakeGit([
      { hash: 'a1', paths: ['release.ts'] },
      { hash: 'b2', paths: ['src/App.vue'] },
      { hash: 'c3', paths: ['README.md'] },
      { hash: 'd4', paths: ['src/lib/x.ts', 'vite.config.ts'] },
      { hash: 'e5', paths: ['src/App.vue'], merge: true },
    ]);
    expect(srcCommitsSinceReleaseNote(git)).toBe(2);
    const w = releaseNoteWarningFor(git, NOTE)!;
    expect(w.split('\n')[0]).toBe('RELEASE NOTE MISSING: src/ changed since the last release.ts note (2 commits).');
    expect(w).toContain('Add a note to release.ts before deploying.');
    expect(w).toContain(`Newest note: "${NOTE}"`);
  });

  it('only non-src commits after the note: no warning', () => {
    const git = fakeGit([
      { hash: 'a1', paths: ['src/App.vue'] },
      { hash: 'b2', paths: ['release.ts'] },
      { hash: 'c3', paths: ['README.md', 'collector/worker.js'] },
      { hash: 'd4', paths: ['vite.config.ts'] },
    ]);
    expect(srcCommitsSinceReleaseNote(git)).toBe(0);
    expect(releaseNoteWarningFor(git, NOTE)).toBeNull();
  });

  it('no git, or no release.ts commit: no warning (the build goes ahead quietly)', () => {
    expect(
      srcCommitsSinceReleaseNote(() => {
        throw new Error('not a git repository');
      })
    ).toBe(0);
    expect(srcCommitsSinceReleaseNote(fakeGit([{ hash: 'a1', paths: ['src/App.vue'] }]))).toBe(0);
  });
});

describe('releaseNoteWarning', () => {
  it('starts with the marker deploy scripts grep for, nothing before it, then the box', () => {
    expect(RELEASE_NOTE_MISSING).toBe('RELEASE NOTE MISSING:');
    const lines = releaseNoteWarning(1, NOTE)!.split('\n');
    expect(lines[0].startsWith(RELEASE_NOTE_MISSING)).toBe(true);
    expect(lines[0]).toBe('RELEASE NOTE MISSING: src/ changed since the last release.ts note (1 commit).');
    expect(lines[1]).toMatch(/^=+$/);
    expect(lines.at(-1)).toMatch(/^=+$/);
    // No colour codes anywhere.
    expect(lines.join('\n')).not.toMatch(/\u001b\[/);
  });

  it('nothing for no commits; a long note is cut', () => {
    expect(releaseNoteWarning(0, NOTE)).toBeNull();
    expect(releaseNoteWarning(3, 'x'.repeat(200))).toContain(`"${'x'.repeat(70)}..."`);
  });

  it('vite.config.ts prints it with console.warn at build start, the marker first', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(src).toMatch(/releaseNoteWarningFor\(/);
    expect(src).toMatch(/console\.warn\(`\\n\$\{warning\}\\n`\)/);
  });
});
