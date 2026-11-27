/**
 * The optimizer's effort starts at Max while the plan is made around the player's awake hours, and at Medium
 * otherwise; a level the player picks is kept (Jordan, 22 Nov 2026: "default to Max when awake hours are on").
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effortFor, newVisitSettings } from './humilityOptimizer';

describe('effortFor', () => {
  it('nothing chosen, no hours: Medium (the old default)', () => {
    expect(effortFor(newVisitSettings(), false)).toBe('medium');
  });
  it('nothing chosen, awake hours on: Max', () => {
    expect(effortFor(newVisitSettings(), true)).toBe('max');
  });
  it('a level the player picked is kept, hours or not', () => {
    const low = { ...newVisitSettings(), effort: 'low' as const, effortChosen: true };
    expect(effortFor(low, true)).toBe('low');
    expect(effortFor(low, false)).toBe('low');
    const med = { ...newVisitSettings(), effort: 'medium' as const, effortChosen: true };
    expect(effortFor(med, true)).toBe('medium');
  });
});

describe('the panel and the store use it', () => {
  const panel = readFileSync(new URL('../components/actions/rockets/HumilityOptimizerPanel.vue', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../stores/humilityOptimizer.ts', import.meta.url), 'utf8');
  it('the buttons show the effort in force and a click marks it chosen', () => {
    expect(panel).toContain(":aria-pressed=\"effort === level\"");
    expect(panel).toContain('patch({ effort: level, effortChosen: true })');
    expect(panel).toContain('EFFORT_META[effort]');
  });
  it('both solves and the question key carry the effort in force', () => {
    expect(panel).toMatch(/function bestSettings[\s\S]*?effort: effort\.value/);
    expect(panel).toMatch(/function fitsSettings[\s\S]*?effort: effort\.value/);
    expect(panel).toMatch(/const questionKey = computed[\s\S]*?effort: effort\.value/);
  });
  it('an old stored level other than Medium counts as chosen; a stored Medium is left to the default', () => {
    expect(store).toContain('effortChosen:');
  });
});
