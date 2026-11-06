/**
 * My runs › Your runs, "Other options" (LatestRunView.vue): the amber box that was not a warning ("Every view above reads
 * the N routes this run priced, so switching costs nothing…") is cut (UX fluff review 2, 5 Nov 2026, item M8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Other options: no amber box that is not a warning (M8)', () => {
  it('the "Every view above reads" box is gone', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'LatestRunView.vue'), 'utf8');
    expect(src).not.toContain('Every view above reads');
    expect(src).not.toContain('switching costs nothing and re-simulates nothing');
  });
});
