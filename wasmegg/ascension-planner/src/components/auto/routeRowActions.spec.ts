/**
 * A table row's two buttons, Simulate this plan and Follow this route (Jordan, 29 Oct 2026: on rows with a long
 * route Follow dropped under the route text and the columns jagged). They sit in one block of their own
 * (resultCardStyle.ts `ROUTE_ACTIONS`), the same width on every row, beside the route on a wide card and under it on
 * a narrow one (one over the other: four columns and both side by side don't fit the card); the route wraps inside
 * its own column (`min-w-0`). Every table in src/components with both buttons in one cell uses the shared classes,
 * so they cannot drift. No DOM: the template is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTE_ACTION, ROUTE_ACTIONS, ROUTE_CELL, ROUTE_TEXT } from './resultCardStyle';

const components = path.join(__dirname, '..');
function vueFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? vueFiles(p) : e.name.endsWith('.vue') ? [p] : [];
  });
}
/** Every <td>…</td> holding both buttons, per file. */
const cells = vueFiles(components).flatMap(f => {
  const src = fs.readFileSync(f, 'utf8');
  const t = src.slice(0, src.indexOf('<script'));
  return [...t.matchAll(/<td\b[\s\S]*?<\/td>/g)]
    .map(m => m[0])
    .filter(c => c.includes('Simulate this plan') && c.includes('<FollowButton'))
    .map(cell => ({ file: path.relative(components, f), cell }));
});

describe('the shared classes', () => {
  it('the route wraps in its own column; the buttons are a block of their own that never shrinks', () => {
    expect(ROUTE_CELL).toContain('grid');
    expect(ROUTE_CELL).toContain('md:grid-cols-[minmax(0,1fr)_auto]');
    expect(ROUTE_TEXT).toContain('min-w-0');
    expect(ROUTE_TEXT).toContain('break-words');
    expect(ROUTE_TEXT).toContain('tabular-nums');
    expect(ROUTE_ACTIONS).toContain('shrink-0');
    expect(ROUTE_ACTIONS).toContain('md:justify-self-end');
  });
  it('the same width on every row and screen: one fixed 10rem column, equal heights, one line each', () => {
    expect(ROUTE_ACTIONS).toContain('grid-cols-[10rem]');
    expect(ROUTE_ACTIONS).not.toMatch(/\b\w+:grid-cols-/);
    expect(ROUTE_ACTION).toContain('whitespace-nowrap');
    expect(ROUTE_ACTIONS).toContain('auto-rows-fr');
    expect(ROUTE_ACTION).toContain('w-full');
    expect(ROUTE_ACTION).toContain('justify-center');
  });
  it('type rules: no px text, no caps, no mono', () => {
    for (const c of [ROUTE_CELL, ROUTE_TEXT, ROUTE_ACTIONS, ROUTE_ACTION]) {
      expect(c).not.toMatch(/text-\[\d+px\]|uppercase|font-mono|font-medium|font-semibold/);
    }
  });
});

describe('every table with both buttons uses them', () => {
  it('the instant answer has two such tables (By a date, Fastest)', () => {
    expect(cells.filter(c => c.file === 'auto/InstantRoute.vue')).toHaveLength(2);
  });
  for (const { file, cell } of cells) {
    it(`${file}: one block for both buttons, the route beside it`, () => {
      expect(cell).toContain(':class="ROUTE_CELL"');
      expect(cell).toMatch(/<span :class="ROUTE_TEXT">/);
      const block = cell.slice(cell.indexOf('<div :class="ROUTE_ACTIONS">'));
      expect(cell).toContain('<div :class="ROUTE_ACTIONS">');
      // Both buttons inside the block, each with the shared width and its 44 px tap target.
      expect(block).toMatch(/<button[^>]*:class="\[SECONDARY_BUTTON, ROUTE_ACTION\]"[^>]*>\s*Simulate this plan\s*<\/button>/);
      expect(block).toMatch(/<FollowButton[^>]*\bprimary\b[^>]*:class="ROUTE_ACTION"/);
      expect(cell).not.toContain('flex-wrap');
    });
  }
});
