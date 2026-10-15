/**
 * "Your plan" became "Single run" (15 Oct 2026): every player-facing mention of that screen comes from
 * NAMES.classic, so another rename is one line in lib/siteNav.ts; "Single run (was Your plan)" appears in
 * one place only, the screen's own intro on the Auto Planner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAMES, simulateNote } from './siteNav';
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

  it('no other spelling of it either: "Your Plan", "YOUR PLAN", "in your plan", in code, the About page or the README', () => {
    // Any capital in "your plan" names the screen; all lower case it is ordinary English ("set up your
    // plan", "your plan's timezone") unless it says where something happens ("arrives in your plan").
    const named = /\b(?!your plan\b)[Yy][Oo][Uu][Rr][\s-]+[Pp][Ll][Aa][Nn]\b(?! start)|\b(?:in|on|opens?(?: it)? in) your plan\b(?!'s| start)/;
    const strip = (src: string) =>
      src
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const root = path.resolve(SRC, '..');
    const others = [
      ...fs
        .readdirSync(path.join(root, 'public'))
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(root, 'public', f)),
      path.join(root, 'README.md'),
    ];
    const left = [
      ...files(SRC).filter(f => !f.endsWith(path.join('lib', 'siteNav.ts'))),
      ...others,
    ]
      .filter(f => !f.includes(`${path.sep}components${path.sep}classic${path.sep}`))
      .flatMap(f =>
        strip(fs.readFileSync(f, 'utf8'))
          .split('\n')
          // The README's one "(was Your plan)", as the screen's own intro says it.
          .map(l => l.replace('(was Your plan)', ''))
          .filter(l => named.test(l))
          .map(l => `${path.relative(root, f)}: ${l.trim()}`)
      );
    expect(left).toEqual([]);
    // The guard itself: each spelling it is for is caught.
    for (const bad of ['Your Plan', 'YOUR PLAN', "when each TE arrives in your plan", 'opens in your plan', 'Your-plan'])
      expect(named.test(bad), bad).toBe(true);
    for (const fine of ['set up your plan', "your plan's timezone", 'Your plan start', 'your plans'])
      expect(named.test(fine), fine).toBe(false);
  });

  it("Simulate this plan's line says what it does, in Single run (Joo's original planner)", () => {
    expect(simulateNote()).toBe(
      "Simulate this plan opens this route in Single run (Joo's original planner) and simulates every shift: when each TE arrives, and each ascension's dates and purchases."
    );
    expect(simulateNote('Build this plan')).toMatch(/^Build this plan opens this route in Single run/);
    for (const f of ['ByDateRouteCard.vue', 'InstantRoute.vue', 'RouteResultCard.vue']) {
      const src = fs.readFileSync(path.join(SRC, 'components', 'auto', f), 'utf8');
      expect(src, f).toMatch(/\{\{ simulate(?:Note|Line)\((?:'Build this plan')?\) \}\}/);
      expect(src, f).not.toContain('shows every shift and when each TE arrives');
    }
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
