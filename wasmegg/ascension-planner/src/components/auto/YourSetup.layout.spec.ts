/**
 * Your setup's cards at desktop width (26 Oct 2026): opening "Memory · detail kept" made This computer tall, and in
 * a two-column grid the card beside it (Time off) sat next to a tall blank. The six cards now flow in two balanced
 * CSS columns, each kept whole; one column on a phone in the same order; the full-width cards follow in a grid.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'YourSetup.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script'));

describe('Your setup: the cards flow in columns, not grid rows', () => {
  const start = template.indexOf('data-testid="setup-columns"');
  const gridAfter = template.indexOf('<div class="grid grid-cols-1 md:grid-cols-2 gap-4">', start);
  const columns = template.slice(start, gridAfter);

  it('two columns from md up only (a phone keeps one), no grid rows for the six cards', () => {
    expect(template).toContain('<div class="-mb-4 md:columns-2 md:gap-4" data-testid="setup-columns">');
    expect(start).toBeGreaterThan(0);
    expect(gridAfter).toBeGreaterThan(start);
    expect(columns).not.toMatch(/\bgrid-cols-1 md:grid-cols-2\b/);
  });

  it('the six cards, in order, each kept whole and spaced', () => {
    const marks = [
      'Your save</h3>',
      'When the plan starts</h3>',
      'Awake hours</h3>',
      'data-testid="setup-no-prestige-days"',
      '<TimeOffEditor />',
      'data-testid="setup-this-computer"',
    ].map(m => columns.indexOf(m));
    expect(marks.every((v, i) => v > 0 && (i === 0 || v > marks[i - 1]))).toBe(true);
    expect(columns.match(/class="mb-4 break-inside-avoid rounded-xl/g)).toHaveLength(6);
    // The Memory fold is inside This computer, so it grows that card's column only.
    expect(columns.indexOf('Memory · detail kept for')).toBeGreaterThan(columns.indexOf('data-testid="setup-this-computer"'));
  });

  it('the full-width cards stay in the grid after the columns', () => {
    const rest = template.slice(gridAfter);
    expect(rest).toContain('<SimulationSetup />');
    expect(rest).toContain('data-testid="experimental"');
    expect(rest).not.toContain('break-inside-avoid');
  });
});
