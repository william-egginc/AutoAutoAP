/** Exhaustive's amber promise box (the user, 12 Oct 2026), on both screens. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ExhaustivePromise from './ExhaustivePromise.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('ExhaustivePromise', () => {
  it('By a date: every promise, the exact last stop included', async () => {
    const t = textOf(await renderHtml(ExhaustivePromise, { goal: 'deadline' }));
    // Titled "How Custom works" since 5 Nov 2026, with the lead's bullets first (UX fluff review 2, C-pre1, C-pre2).
    expect(t).toMatch(/^How Custom works › It is for proving an answer, not for finding a much better one\./);
    expect(t).toContain('tries every route in your boxes');
    expect(t).toContain('says nothing about routes outside it');
    expect(t).toContain('The last stop is found to the exact TE.');
    expect(t).toContain('A step above 1 TE skips values between its grid points');
    expect(t).toContain('hours, sometimes overnight');
    expect(t).toContain('A refresh is safe');
    expect(t).toContain('"Let me pick my hours"');
  });

  it("Fastest: the same, without the By a date line about the last stop", async () => {
    const t = textOf(await renderHtml(ExhaustivePromise, { goal: 'fastest' }));
    expect(t).toContain('tries every route in your boxes');
    expect(t).toContain('A refresh is safe');
    expect(t).not.toContain('exact TE');
  });

  it('is on both screens, and the By a date explainer is under the title', () => {
    expect(read('FastestRoute.vue')).toMatch(/<ExhaustivePromise goal="fastest">\s*<CustomHowItWorks \/>\s*<\/ExhaustivePromise>/);
    expect(read('DeadlinePanel.vue')).toContain('<ExhaustivePromise goal="deadline" />');
    const screen = read('ByDateScreen.vue');
    expect(screen.indexOf('data-testid="by-date-how"')).toBeGreaterThan(screen.indexOf('{{ NAMES.byDate }}</h2>'));
    expect(screen.indexOf('data-testid="by-date-how"')).toBeLessThan(screen.indexOf('<YourSetup'));
    expect(read('DeadlinePanel.vue')).not.toContain('How {{ NAMES.byDate }} works');
  });
});
