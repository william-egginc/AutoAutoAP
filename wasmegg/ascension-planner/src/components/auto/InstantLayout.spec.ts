/** The instant card's layout (wireframes/price-route-v2, Jordan 23 Oct 2026; was the table inside the green card above
 *  Check exactly, 12 Oct): the green box with Simulate this plan and Follow this route, then the one line, then every
 *  number of ascensions, then the pointer to a search's result. No Check exactly, no check history. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const t = src.slice(0, src.indexOf('<script'));

describe('InstantRoute layout', () => {
  for (const [goal, heading, rowsFor] of [
    ['By a date', 'Highest TE by {{ show(deadline) }}', 'v-for="r in dateRows"'],
    ['Fastest', 'Fastest to {{ store.finalTE }} TE', 'v-for="r in shownRows"'],
  ] as const) {
    it(`${goal}: box, its two buttons, the one line, then the counts list`, () => {
      const box = t.indexOf(heading);
      const actions = t.indexOf('data-testid="box-actions"', box);
      const line = t.indexOf('data-testid="instant-one-line"', box);
      const counts = t.indexOf('data-testid="counts-card"', box);
      const table = t.indexOf(rowsFor, box);
      expect(box).toBeGreaterThan(0);
      expect(actions).toBeGreaterThan(box);
      expect(line).toBeGreaterThan(actions);
      expect(counts).toBeGreaterThan(line);
      expect(table).toBeGreaterThan(counts);
      // Both buttons on the box (Jordan's answer 2: keep Simulate this plan and Follow this route).
      const buttons = t.slice(actions, line);
      expect(buttons).toContain('Simulate this plan');
      expect(buttons).toContain('<FollowButton');
      expect(buttons).toContain('from="answer"');
    });
  }
  it('the pointer sits after both counts lists, on the instant card', () => {
    const pointer = t.indexOf('data-testid="instant-pointer"');
    expect(pointer).toBeGreaterThan(t.lastIndexOf('v-for="r in shownRows"'));
    expect(pointer).toBeGreaterThan(t.lastIndexOf('v-for="r in dateRows"'));
  });
  it('no Check exactly and no check history on the card', () => {
    expect(t).not.toContain('Check exactly');
    expect(t).not.toContain('Check all again');
    expect(t).not.toContain('check-history');
    expect(t).not.toContain('pressCheck');
  });
});
