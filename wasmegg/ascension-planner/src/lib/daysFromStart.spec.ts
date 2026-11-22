/** The date row's line under the boxes (R11): "235 days from the route's start.", and never "0 days" (Words, 21 Nov 2026). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { daysFromStartLine } from './daysFromStart';

describe('daysFromStartLine', () => {
  it('whole days, singular and plural', () => {
    expect(daysFromStartLine(235)).toBe('235 days from the route’s start.');
    expect(daysFromStartLine(1)).toBe('1 day from the route’s start.');
    expect(daysFromStartLine(1.4)).toBe('1 day from the route’s start.');
    expect(daysFromStartLine(2.6)).toBe('3 days from the route’s start.');
  });
  it('under half a day it never says "0 days"', () => {
    expect(daysFromStartLine(0.4)).toBe('Right at the route’s start.');
    expect(daysFromStartLine(0)).toBe('Right at the route’s start.');
  });
  it('the date row uses it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');
    expect(src).toContain('daysFromStartLine(daysAway)');
    expect(src).not.toContain("from the route’s start.</template>");
  });
});
