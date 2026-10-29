/**
 * The instant answer's counts tables fit a desktop card (18 Oct 2026: at a ~1570 px window, a ~1000 px card,
 * By a date's Route column and Simulate buttons were cut off behind a scroll that also carried the intro).
 * No DOM here, so the template is read: only the table scrolls, and only below its minimum width (phones);
 * every wide cell may wrap; the Simulate button sits in the route's cell, beside it or under it (since 29 Oct 2026
 * one block with Follow, the same width on every row: routeRowActions.spec.ts).
 *
 * Since 23 Oct 2026 (wireframes/price-route-v2) the lists show instant numbers only, four columns: By a date
 * Ascensions, TE · spare, Reached, Route; Fastest Ascensions, Reaches, Behind (with the near-tie line's 9rem),
 * Route. Below 30rem (phones) each count is a stacked row (`.counts-stack`, wireframe v1): no sideways scroll.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const t = src.slice(0, src.indexOf('<script'));

/** The markup from `start` to the closing tag that balances it (div nesting only). */
function element(from: number): string {
  // Quote-aware: attributes may hold ">" (v-if="dateRows.length > 1").
  const re = /<(\/?)div\b(?:[^>"]|"[^"]*")*?(\/?)>/g;
  re.lastIndex = from;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return t.slice(from, re.lastIndex);
  }
  throw new Error('unbalanced');
}
const cards = [...t.matchAll(/<div (?:[^>"]|"[^"]*")*data-testid="counts-card"/g)].map(m => element(m.index!));

describe('the counts tables fit the card', () => {
  it('both goals have the card (By a date first, then Fastest)', () => {
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('v-for="r in dateRows"');
    expect(cards[1]).toContain('v-for="r in shownRows"');
  });

  for (const [name, i] of [
    ['By a date', 0],
    ['Fastest', 1],
  ] as const) {
    describe(name, () => {
      const card = () => cards[i];
      const open = () => card().match(/^<div (?:[^>"]|"[^"]*")*>/)![0];
      const scroller = () =>
        element(t.indexOf(card()) + card().indexOf('<div class="overflow-x-auto" data-testid="counts-scroll">'));

      it('the card itself never scrolls; one scroller, holding only the table', () => {
        expect(open()).not.toContain('overflow');
        expect(card().match(/overflow-x-auto/g)).toHaveLength(1);
        const sc = scroller();
        expect(sc.startsWith('<div class="overflow-x-auto" data-testid="counts-scroll">')).toBe(true);
        expect(sc).toContain('<table');
        expect(sc).not.toContain('<MaxedWhatIf');
        // Nothing after the table inside the scroller.
        expect(sc).toMatch(/<\/table>\s*<\/div>$/);
      });

      it('the heading sits above the scroller, in the card', () => {
        const intro = card().indexOf('Every number of ascensions');
        expect(intro).toBeGreaterThan(0);
        expect(intro).toBeLessThan(card().indexOf('data-testid="counts-scroll"'));
      });

      it('the table wraps: no nowrap on it; a table from 30rem up, stacked rows below (phones)', () => {
        const table = card().match(/<table [^>]*>/)![0];
        expect(table).toContain('min-[30rem]:min-w-[30rem]');
        expect(table).toContain('counts-stack');
        expect(table).toContain('w-full');
        expect(table).not.toContain('whitespace-nowrap');
      });

      it('four columns, instant numbers only: the buttons live in the route cell, in their own block', () => {
        expect(card().match(/<th /g)).toHaveLength(4);
        expect(card()).not.toContain('colspan');
        expect(card()).not.toContain('Exact, your account');
        const route = card().slice(card().indexOf('data-testid="counts-route"'));
        const cell = route.slice(0, route.indexOf('</td>'));
        expect(cell).toContain('<div :class="ROUTE_ACTIONS">');
        expect(cell).toContain('Simulate this plan');
        // The route in the body font with tabular figures (resultCardStyle.ts `ROUTE_TEXT`): no mono anywhere
        // (Jordan, 26 Oct 2026).
        expect(cell).toContain('<span :class="ROUTE_TEXT">');
        expect(cell).not.toContain('font-mono');
        expect(cell).not.toMatch(/<td[^>]*whitespace-nowrap/);
      });

      it('no at-once line and no exact column (23 Oct 2026)', () => {
        expect(card()).not.toContain('atOnceText');
        expect(card()).not.toContain('at-once-line');
        expect(card()).not.toContain('instant-row-expand');
      });
    });
  }

  it('Fastest: the near-tie line may wrap', () => {
    const fast = cards[1];
    expect(fast).toContain('class="block min-w-[9rem] max-w-[13rem] whitespace-normal text-small"');
  });
});

describe('the counts list on a phone: stacked rows below 30rem (wireframe v1)', () => {
  const style = src.slice(src.indexOf('<style scoped>'));
  it('below 30rem: no header, each row a grid, the count on the left, the rest stacked on the right', () => {
    expect(style).toContain('@media (max-width: 29.99rem)');
    expect(style).toMatch(/\.counts-stack thead \{\s*display: none;/);
    expect(style).toMatch(/\.counts-stack tr \{\s*display: grid;\s*grid-template-columns: 2\.25rem minmax\(0, 1fr\);/);
    expect(style).toMatch(/\.counts-stack td:first-child \{\s*grid-column: 1;\s*grid-row: 1 \/ span 3;/);
    // Four cells: the count, then three stacked (TE and spare or finish, when or behind, the route).
    for (const c of cards) expect(c.match(/<td /g)).toHaveLength(4);
  });
});
