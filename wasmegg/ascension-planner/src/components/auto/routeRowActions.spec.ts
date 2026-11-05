/**
 * A count row's Simulate this plan and Follow this route (spec-slimcard; UX fluff review 5 Nov 2026, item 11). Until
 * then every row of the instant answer's "Every number of ascensions" had both buttons in its route cell (one shared
 * block, resultCardStyle.ts ROUTE_ACTIONS, Jordan 29 Oct 2026): 12 buttons for 6 counts. Now the rows open on tap like
 * Joo's and ONE pair sits in each open row's panel (InstantRoute.states.spec.ts draws it). This guards the source: in
 * both lists the pair is inside the panel and drawn only while the row is open, and no component has a table cell with
 * both buttons in it any more. No DOM: the template is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as style from './resultCardStyle';

const components = path.join(__dirname, '..');
function vueFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? vueFiles(p) : e.name.endsWith('.vue') ? [p] : [];
  });
}
const templateOf = (f: string) => {
  const src = fs.readFileSync(f, 'utf8');
  return src.slice(0, src.indexOf('<script'));
};
const instant = templateOf(path.join(__dirname, 'InstantRoute.vue'));
/** Each count row (<li data-testid="counts-row"> … </li>) in the template. */
const rows = [...instant.matchAll(/<li v-for="r in (?:dateRows|shownRows)"[\s\S]*?<\/li>/g)].map(m => m[0]);

describe('the count rows: one pair, in the open row', () => {
  it('two lists (By a date, Fastest), each row a head button and a panel', () => {
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toContain('data-testid="counts-row-head"');
      expect(r).toContain('data-testid="counts-row-panel"');
    }
  });
  for (const [name, i] of [
    ['By a date', 0],
    ['Fastest', 1],
  ] as const) {
    it(`${name}: Simulate and Follow only inside the panel, drawn only while the row is open`, () => {
      const r = rows[i];
      const head = r.slice(0, r.indexOf('data-testid="counts-row-panel"'));
      expect(head).not.toContain('Simulate this plan');
      expect(head).not.toContain('<FollowButton');
      const panel = r.slice(r.indexOf('data-testid="counts-row-panel"'));
      const shown = panel.slice(panel.indexOf('v-if="countOpen(r)"'));
      expect(panel.indexOf('v-if="countOpen(r)"')).toBeGreaterThan(-1);
      expect(shown.match(/>\s*Simulate this plan\s*<\/button>/g)).toHaveLength(1);
      expect(shown.match(/<FollowButton\b/g)).toHaveLength(1);
      // The 44 px buttons (SECONDARY_BUTTON, FollowButton's primary), each named with its route.
      expect(shown).toMatch(/<button[^>]*:class="SECONDARY_BUTTON"[^>]*:aria-label="`Simulate \$\{r\.chain\.join\(' '\)\}`"/);
      expect(shown).toMatch(/<FollowButton[^>]*\bprimary\b[^>]*from="count"[^>]*:route-label="r\.chain\.join\(' '\)"/);
    });
  }
  it('no component has a table cell with both buttons (the pair-per-row table is gone)', () => {
    const cells = vueFiles(components).flatMap(f =>
      [...templateOf(f).matchAll(/<td\b[\s\S]*?<\/td>/g)]
        .map(m => m[0])
        .filter(c => c.includes('Simulate this plan') && c.includes('<FollowButton'))
        .map(() => path.relative(components, f))
    );
    expect(cells).toEqual([]);
  });
  it('the shared per-row button block is gone with it', () => {
    expect(Object.keys(style)).not.toContain('ROUTE_ACTIONS');
    expect(Object.keys(style)).not.toContain('ROUTE_CELL');
  });
});
