/**
 * The instant answer's counts lists fit the card (18 Oct 2026: at a ~1570 px window, a ~1000 px card, By a date's
 * Route column and Simulate buttons were cut off behind a scroll that also carried the intro). No DOM here, so the
 * template is read.
 *
 * Since spec-slimcard (UX fluff review 5 Nov 2026, item 11) the lists are rows that open on tap, not a table: nothing
 * scrolls sideways at all; one grid of minmax(0, …) columns on a phone (the route on a second line inside the row) and
 * five from md up: By a date chevron, Ascensions, Highest TE, Spare, Route; Fastest chevron, Ascensions, Reaches,
 * Behind, Route. Instant numbers only (23 Oct 2026); Reached and the one Simulate / Follow pair are in the open row.
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

describe('the counts lists fit the card', () => {
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

      it('nothing in the card scrolls sideways; no table', () => {
        expect(card()).not.toContain('overflow-x-auto');
        expect(card()).not.toContain('<table');
        expect(card()).not.toContain('counts-scroll');
      });

      it('the heading sits above the list, in the card', () => {
        const intro = card().indexOf('Every number of ascensions');
        expect(intro).toBeGreaterThan(0);
        expect(intro).toBeLessThan(card().indexOf('data-testid="counts-list"'));
      });

      it('the route may wrap (min-w-0, break-words) in the body font with tabular figures; no mono, no nowrap on it', () => {
        const route = card().slice(card().indexOf('data-testid="counts-route"') - 400);
        const span = route.slice(route.lastIndexOf('<span', 400), route.indexOf('</span>', 400));
        expect(span).toContain('min-w-0 break-words tabular-nums');
        expect(span).not.toContain('whitespace-nowrap');
        expect(card()).not.toContain('font-mono');
      });

      it('instant numbers only; the buttons in the open row, not beside the route', () => {
        expect(card()).not.toContain('Exact, your account');
        const head = card().slice(card().indexOf('data-testid="counts-row-head"'), card().indexOf('data-testid="counts-row-panel"'));
        expect(head).not.toContain('Simulate this plan');
        expect(card().slice(card().indexOf('data-testid="counts-row-panel"'))).toContain('Simulate this plan');
      });

      it('no at-once line and no exact column (23 Oct 2026)', () => {
        expect(card()).not.toContain('atOnceText');
        expect(card()).not.toContain('at-once-line');
        expect(card()).not.toContain('instant-row-expand');
      });
    });
  }

  it('By a date: Reached is in the open row, not a column', () => {
    const date = cards[0];
    expect(date.slice(date.indexOf('data-testid="counts-row-panel"'))).toContain('Reached {{ show(r.end) }}');
    expect(date.slice(0, date.indexOf('data-testid="counts-row-panel"'))).not.toContain('Reached');
  });

  it('Fastest: the near-tie line may wrap, with no fixed width on a phone', () => {
    const fast = cards[1];
    expect(fast).toContain('class="block whitespace-normal text-small"');
    expect(fast).not.toContain('min-w-[9rem]');
  });
});
