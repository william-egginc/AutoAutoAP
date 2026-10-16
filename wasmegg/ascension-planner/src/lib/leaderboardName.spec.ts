/**
 * "Compare" became "Leaderboard" (16 Oct 2026): every player-facing mention of the board's tab comes from
 * NAMES.compare, so another rename is one line in lib/siteNav.ts. The address stays #/compare (old links),
 * and #/leaderboard is read as the same tab (siteNav.spec.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAMES } from './siteNav';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p, ext);
    return ext.test(e.name) && !e.name.endsWith('.spec.ts') ? [p] : [];
  });
}

/** Code without its comments: what a player can read. */
function uncommented(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** "Compare" as the tab's name: "Compare's Egg Day tab", "Compare › All runs", "on Compare", 'Compare'. */
const TAB = /\bCompare(?:['’]s\b| ›| >| tab\b)|\b(?:on|to|in|opens?) Compare\b|(['"`])Compare\1/;

describe('the Leaderboard name', () => {
  it('lives in NAMES.compare', () => {
    expect(NAMES.compare).toBe('Leaderboard');
  });

  it('no component or module names the tab "Compare" itself (outside NAMES)', () => {
    const left = files(SRC, /\.(vue|ts)$/)
      .filter(f => !f.endsWith(path.join('lib', 'siteNav.ts')))
      .flatMap(f =>
        uncommented(fs.readFileSync(f, 'utf8'))
          .split('\n')
          .filter(l => TAB.test(l))
          .map(l => `${path.relative(SRC, f)}: ${l.trim()}`)
      );
    expect(left).toEqual([]);
  });

  it('the About page and the README say Leaderboard', () => {
    for (const f of [...files(path.join(ROOT, 'public'), /\.html$/), path.join(ROOT, 'README.md')]) {
      const lines = uncommented(fs.readFileSync(f, 'utf8'))
        .split('\n')
        .filter(l => /\bCompare\b/.test(l) && !/\(was Compare\)/.test(l) && TAB.test(l.replace(/\*\*/g, "'")));
      expect(lines, path.relative(ROOT, f)).toEqual([]);
    }
  });

  it('the top tab and the possessives read from NAMES.compare', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.vue'), 'utf8');
    expect(app).toMatch(/label: NAMES\.compare,/);
    const deadline = fs.readFileSync(path.join(SRC, 'components', 'auto', 'DeadlinePanel.vue'), 'utf8');
    expect(deadline).toContain("Answers go on the {{ NAMES.compare }}'s Egg Day");
  });
});
