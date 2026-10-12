/** The instant answer's layout (the user, 12 Oct 2026): each box's per-ascension table sits inside its
 *  green card, above the Check exactly / Simulate buttons; the check history stays below, folded. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const t = src.slice(0, src.indexOf('<script'));

describe('InstantRoute layout', () => {
  it('By a date: the table is inside the card, above its buttons', () => {
    const table = t.indexOf('v-for="r in dateRows"');
    const button = t.indexOf("@click=\"pressCheck('check-date')\"");
    expect(table).toBeGreaterThan(t.indexOf('Highest TE by {{ show(deadline) }}'));
    expect(table).toBeLessThan(button);
  });
  it('Fastest: the table is inside the card, above its buttons', () => {
    const card = t.indexOf('>Fastest route</div>');
    const table = t.indexOf('v-for="r in rows"');
    const button = t.indexOf('Check all again', card);
    expect(table).toBeGreaterThan(card);
    expect(table).toBeLessThan(button);
  });
  it('the check history stays below, folded', () => {
    const history = t.indexOf('data-testid="check-history"');
    expect(history).toBeGreaterThan(t.indexOf('v-for="r in rows"'));
    expect(t.slice(history - 80, history)).toContain('<details');
  });
});
