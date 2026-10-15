/**
 * "Your plan" became "Single run" (15 Oct 2026): every player-facing mention of that screen comes from
 * NAMES.classic, so another rename is one line in lib/siteNav.ts; "Single run (was Your plan)" appears in
 * one place only, the screen's own intro on the Auto Planner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAMES } from './siteNav';
import { BUILDUP_NOTE } from '@/search/byDateSimulate';

const SRC = path.resolve(__dirname, '..');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(vue|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts') ? [p] : [];
  });
}

/** "Your plan" as the screen's name in code that reaches a player: not in a comment, not "Your plan start". */
function playerFacing(file: string): string[] {
  const src = fs
    .readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return src.split('\n').filter(l => /Your plan\b(?! start)/.test(l));
}

describe('the Single run name', () => {
  it('lives in NAMES.classic', () => {
    expect(NAMES.classic).toBe('Single run');
  });

  it('no component or module names the screen "Your plan" itself (outside NAMES)', () => {
    const left = files(SRC)
      .filter(f => !f.endsWith(path.join('lib', 'siteNav.ts')))
      // Joo's Classic planner's own internals are not ours to rename.
      .filter(f => !f.includes(`${path.sep}components${path.sep}classic${path.sep}`))
      .flatMap(f => playerFacing(f).map(l => `${path.relative(SRC, f)}: ${l.trim()}`));
    expect(left).toEqual([]);
  });

  it('"(was Your plan)" is said once, on the screen\'s own intro', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.vue'), 'utf8');
    expect(app.match(/NAMES\.classicFirst/g)).toHaveLength(1);
    const uses = files(SRC).filter(f => /NAMES\.classicFirst|\(was Your plan\)/.test(fs.readFileSync(f, 'utf8')));
    expect(uses.map(f => path.relative(SRC, f)).sort()).toEqual(['App.vue', path.join('lib', 'siteNav.ts')].sort());
  });

  it("By a date's build-up note follows the name", () => {
    expect(BUILDUP_NOTE).toBe(`${NAMES.classic} prices the first ascension as a fresh build/continue.`);
  });
});
