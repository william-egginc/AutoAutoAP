/**
 * "Your plan" became "Single run" (15 Oct 2026): every player-facing mention of that screen comes from
 * NAMES.classic, so another rename is one line in lib/siteNav.ts; "Single run (was Your plan)" appears in
 * one place only, the screen's own intro on the Auto Planner. Since Chain Finder (12 Nov 2026) the name is dropped:
 * the screen is just the Auto Planner (NAMES.classic === NAMES.auto).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAMES, simulateNote } from './siteNav';
import { BUILDUP_NOTE } from '@/search/byDateSimulate';
import { CHAIN_FINDER_WORDS } from './chainFinderWords';

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
  it('lives in NAMES.classic: the Auto Planner since 12 Nov 2026 (was Single run)', () => {
    expect(NAMES.classic).toBe('Auto Planner');
    expect(NAMES.classic).toBe(NAMES.auto);
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
          // The README's history mentions: "(was Your plan)" and "(formerly Your plan, formerly Classic)".
          .map(l => l.replace('(was Your plan)', '').replace('(formerly Your plan, formerly Classic)', '').replace('(was Single run, before that Your plan, Classic)', '').replace('(formerly Single run, Your plan and Classic)', ''))
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

  it("Simulate this plan's line says what it does, in the Auto Planner (Joo's original planner)", () => {
    expect(simulateNote()).toBe(
      "Simulate this plan opens this route in the Auto Planner (Joo's original planner) and simulates every shift: when each TE arrives, and each ascension's dates and purchases."
    );
    expect(simulateNote('Build this plan')).toMatch(/^Build this plan opens this route in the Auto Planner/);
    for (const f of ['InstantRoute.vue']) {
      const src = fs.readFileSync(path.join(SRC, 'components', 'auto', f), 'utf8');
      expect(src, f).toMatch(/\{\{ simulate(?:Note|Line)\((?:'Build this plan')?\) \}\}/);
      expect(src, f).not.toContain('shows every shift and when each TE arrives');
    }
    // The result cards: the button's tip only (UX fluff review 2, 5 Nov 2026, items C6 and D10; the title became a
    // Tip, Allan 9 Nov 2026).
    for (const f of ['RouteResultCard.vue', 'ByDateRouteCard.vue']) {
      const card = fs.readFileSync(path.join(SRC, 'components', 'auto', f), 'utf8');
      expect(card, f).toContain(':text="TIP_SIMULATE"');
      expect(card, f).not.toMatch(/simulate(?:Note|Line)\(/);
    }
  });

  it('"(was Your plan)" is no longer said: the rename was a month ago (UX fluff review 2, 5 Nov 2026, item S-1)', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.vue'), 'utf8');
    // The intro moved to lib/chainFinderWords.ts (12 Nov 2026).
    expect(app).toContain('{{ CHAIN_FINDER_WORDS.autoPlannerIntro(fastestName(chainSearchStore.finalTE), NAMES.byDate) }}');
    expect(CHAIN_FINDER_WORDS.autoPlannerIntro('Fastest to 490 TE', NAMES.byDate)).toMatch(/^The Auto Planner is Joo's original planner: /);
    expect(CHAIN_FINDER_WORDS.autoPlannerIntro('Fastest to 490 TE', NAMES.byDate)).toMatch(/use Chain Finder \(Fastest to 490 TE or Highest TE by a date\)\.$/);
    const uses = files(SRC).filter(f => /NAMES\.classicFirst|\(was Your plan\)/.test(fs.readFileSync(f, 'utf8')));
    expect(uses.map(f => path.relative(SRC, f))).toEqual([]);
  });

  it('no code that reaches a player says "Single run" (12 Nov 2026: the screen is just the Auto Planner)', () => {
    const strip = (src: string) =>
      src
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const left = files(SRC)
      // Joo's planner's own internals, and the Words file that keeps the retired name for specs.
      .filter(f => !f.includes(`${path.sep}components${path.sep}classic${path.sep}`))
      .filter(f => !f.endsWith(path.join('lib', 'chainFinderWords.ts')))
      .flatMap(f =>
        strip(fs.readFileSync(f, 'utf8'))
          .split('\n')
          .filter(l => /Single run/.test(l))
          .map(l => `${path.relative(SRC, f)}: ${l.trim()}`)
      );
    expect(left).toEqual([]);
  });

  it("By a date's build-up note follows the name", () => {
    expect(BUILDUP_NOTE).toBe(`The ${NAMES.classic} can't carry on a build-up, so it starts ascension 1 fresh.`);
  });
});
