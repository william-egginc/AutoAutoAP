/**
 * Science › What we need to check and Submit a sweep after the site-wide fluff review 2 (5 Nov 2026, part B, Sc10-Sc12,
 * approved by Jordan): the intro drops its cross-links, the "can't list the gaps" note is one line, and the upload intro
 * says the files are checked without the internals. Read from the sources (App.vue, explorer/ChainExplorer.vue).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const squeeze = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8').replace(/\s+/g, ' ');
const app = squeeze('../../App.vue');
const explorer = squeeze('../../explorer/ChainExplorer.vue');

describe('Science intros (fluff review 2)', () => {
  it('Help check the planner: no cross-links sentence (Sc10)', () => {
    expect(app).toContain('These are the runs the Leaderboard still needs. Run one on your account and it fills a gap.');
    expect(app).not.toContain('How the planner works is under {{ NAMES.how }}');
  });
  it('no Leaderboard to work from: one line (Sc11)', () => {
    expect(explorer).not.toContain('The asks are worked out from the runs on the Leaderboard');
    expect(explorer).toContain("Can't list the gaps without the Leaderboard.");
    expect(explorer).toContain('Any run you send still helps.');
  });
  it('Submit a sweep: checked, without the internals (Sc12)', () => {
    expect(explorer).toContain('Upload its two files here. They are checked before anything is sent.');
    expect(explorer).not.toContain('for truncation and for the old delivery-set bug, before anything is sent');
  });
});
