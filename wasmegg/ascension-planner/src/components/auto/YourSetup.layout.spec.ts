/**
 * Your setup's cards at desktop width (26 Oct 2026): opening "Memory · detail kept" made This computer tall, and in
 * a two-column grid the card beside it (Time off) sat next to a tall blank. The six cards now flow in two balanced
 * CSS columns, each kept whole; one column on a phone in the same order; the full-width cards follow in a grid.
 *
 * Since the slim Setup (UX fluff review 2, 5 Nov 2026) the columns are under More options and hold three cards (When the
 * plan starts, Your save file, This computer); Awake hours, No prestige days and Time off are in view above the fold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'YourSetup.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script'));

describe('Your setup: the cards flow in columns, not grid rows', () => {
  const start = template.indexOf('data-testid="setup-columns"');
  const gridAfter = template.indexOf('<div class="grid grid-cols-1 md:grid-cols-2 gap-4">', start);
  const more = template.indexOf('id="setup-more-body"');
  const columns = template.slice(start, gridAfter);

  it('two columns from md up only (a phone keeps one), no grid rows for the six cards', () => {
    expect(template).toContain('<div class="-mb-4 md:columns-2 md:gap-4" data-testid="setup-columns">');
    expect(more).toBeGreaterThan(0);
    expect(start).toBeGreaterThan(more);
    expect(gridAfter).toBeGreaterThan(start);
    expect(columns).not.toMatch(/\bgrid-cols-1 md:grid-cols-2\b/);
  });

  it('the two cards under More options, in order, each kept whole and spaced (When the route starts moved out, 17 Nov 2026)', () => {
    const marks = ['Your save file</h3>', 'data-testid="setup-this-computer"'].map(m => columns.indexOf(m));
    expect(marks.every((v, i) => v > 0 && (i === 0 || v > marks[i - 1]))).toBe(true);
    expect(columns).not.toContain('When the route starts</h3>');
    expect(columns.match(/class="mb-4 break-inside-avoid rounded-xl/g)).toHaveLength(2);
    // The Memory fold is inside This computer, so it grows that card's column only.
    expect(columns.indexOf('Memory · detail kept for')).toBeGreaterThan(columns.indexOf('data-testid="setup-this-computer"'));
  });

  it('in view, above More options: Awake hours, then No prestige days and Time off side by side from md up', () => {
    const above = template.slice(template.indexOf('v-if="docked" class="p-4 space-y-4"'), more);
    const marks = ['Awake hours</h3>', '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">', 'data-testid="setup-no-prestige-days"', '<TimeOffEditor />'].map(m =>
      above.indexOf(m)
    );
    expect(marks.every((v, i) => v > 0 && (i === 0 || v > marks[i - 1]))).toBe(true);
    expect(above).not.toContain('break-inside-avoid');
    // The start time and the first ascension (17 Nov 2026, QA at 1280x900: it was below the first screenful): right after Awake hours,
    // No prestige days and Time off, above Sharing and the study box.
    const plan = above.indexOf('When the route starts</h3>');
    expect(plan).toBeGreaterThan(above.indexOf('<TimeOffEditor />'));
    expect(plan).toBeLessThan(above.indexOf('<!-- SHARING AND PRIVACY'));
    expect(plan).toBeLessThan(above.indexOf('data-testid="share-instant"'));
    expect(above).toContain('aria-label="First ascension"');
  });

  it('the full-width cards stay in the grid after the columns', () => {
    const rest = template.slice(gridAfter);
    expect(rest).toContain('<SimulationSetup />');
    expect(rest).toContain('data-testid="experimental"');
    expect(rest).not.toContain('break-inside-avoid');
  });
});
