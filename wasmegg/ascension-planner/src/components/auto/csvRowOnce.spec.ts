/**
 * One CSV download per result (UX fluff review 2, 5 Nov 2026, item C8, now also on Fast and Exact): with the result card
 * on screen its Download ▾ has the CSV, so the CSV row under it shows only while a run is going (the card's buttons come
 * when it stops) or when there is no card. Custom keeps its mid-run CSV the same way. Sources read, no DOM.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the CSV row only when the card has no Download ▾', () => {
  it('Fast and Exact (ChainSearchPanel.vue)', () => {
    const src = read('ChainSearchPanel.vue');
    expect(src).toMatch(/<CsvCard\s+v-if="ownRun && \(store\.csvRows \|\| store\.resumable\)"\s+:csv="store\.isRunning \|\| !\(store\.bestDays > 0\)"/);
    expect(src).not.toContain('strategy, sale count, start and end times in your plan');
  });
  it('Custom (InsanePanel.vue): mid-run too', () => {
    expect(read('InsanePanel.vue')).toMatch(/<CsvCard[\s\S]*?:csv="store\.isRunning && store\.csvRows > 0"/);
  });
});

describe('D0b: the date line is short (DeadlinePanel.vue)', () => {
  it('days from the plan start and the Egg Day bonuses, no second time or "The plan is for reaching…"', () => {
    const src = read('DeadlinePanel.vue');
    expect(src).not.toContain("in your planner's time, {{ plural(Math.round(daysAway), 'day') }} after the plan");
    expect(src).not.toContain('The plan is for reaching the TE by then.');
    expect(src).toContain("{{ plural(Math.round(daysAway), 'day') }} from your plan start.");
  });
});
