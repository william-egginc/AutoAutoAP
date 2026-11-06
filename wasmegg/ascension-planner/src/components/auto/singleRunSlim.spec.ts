/**
 * Single run (UX fluff review 2, 5 Nov 2026, items S-2 and S-4, and beyond-fluff finding 1). The "Simulated … from …"
 * banner loses "Each ascension's View details lists its steps and purchases." and, for a By a date route, says when
 * Single run's own finish is after the date ("here it finishes …, after your date"): the search reached it on Jul 13,
 * Single run on Jul 15, after a Jul 14 date, and nothing said so. The Setup's remembered line is one line. DRAFT wording.
 * No DOM: the sources are read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('Single run’s banner (AutomaticPlanner.vue)', () => {
  const src = read('AutomaticPlanner.vue');
  it('no "View details" sentence (S-4)', () => {
    expect(src).not.toContain("Each ascension's View details lists its steps and");
  });
  it('a By a date route that Single run finishes after the date says so, with its finish (S-4, finding 1)', () => {
    expect(src).toContain('data-testid="plan-from-instant-misses"');
    expect(src).toMatch(/Here it finishes \{\{ [^}]+ \}\}, after your date\. The search’s dates are on the answer\./);
    expect(src).toMatch(/const missesDate = computed/);
    // The finish is the ascension that reaches the route's last stop, not Single run's forced final one to 490 (found in
    // the harness: the banner said Sep 27, 2028 for a route that Single run finished in Jul 2027).
    expect(src).toContain('const end = bestResults.value[f.chain.length - 1]?.summary?.endTime;');
  });
  it('By a date hands the date to the banner with the route (DeadlinePanel.vue)', () => {
    expect(read('DeadlinePanel.vue')).toMatch(/ui\.planFromInstant = \{ \.\.\.ui\.planFromInstant, deadline/);
    expect(read('../../stores/ui.ts')).toMatch(/planFromInstant = ref<\{[^}]*deadline\?: number/);
  });
});

describe('Setup’s remembered line (YourSetup.vue, S-2)', () => {
  it('one line: Remembered for this account · Reset to defaults', () => {
    const src = read('YourSetup.vue');
    expect(src).not.toContain('your awake hours (and\n        whether shifts wait for them)');
    expect(src.match(/Remembered for this account<\/span>\{\{ ' ' \}\}·/g)).toHaveLength(2);
  });
});
