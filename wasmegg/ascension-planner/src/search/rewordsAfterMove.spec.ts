/**
 * The rewords that follow the move-first commit (UX fluff review 2, 5 Nov 2026), each in a *Words.ts file, so the result
 * code hash stays: C3 the build-up good news as a clause in the First ascension line; D8/S-4 Single run's build-up
 * note; R6 "Replaces the instant answer · Go back to it"; M6 one line per Other options view. DRAFT wording for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildUpNoteWords } from './healthWords';
import { BUILDUP_NOTE } from './byDateSimulateWords';
import { VIEW_HINTS } from './viewsWords';
import { MAKES_DATE_WORDS } from '@/lib/searchPlanWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('C3: the build-up good news is a clause in the First ascension line', () => {
  it('the words', () => {
    expect(buildUpNoteWords('buildup', '157.2 days', null)).toBe('carries on your build-up (157.2 days sooner than finishing the farm as it is)');
    // The advice for the other variants is unchanged.
    expect(buildUpNoteWords('continue', '3.0 days', null)).toMatch(/^Your build isn't finished/);
  });
  it('the cards put it in the First ascension line, not a box', () => {
    expect(read('../stores/chainSearch.ts')).toMatch(/const buildUpClause = computed/);
    for (const f of ['InsanePanel.vue', 'ChainSearchPanel.vue']) expect(read(`../components/auto/${f}`), f).toContain(':first-note="store.buildUpClause"');
    expect(read('../components/auto/RouteExtras.vue')).toMatch(/First ascension:<template v-if="firstNote">\{\{ ' ' \}\}\{\{ firstNote \}\},<\/template>/);
  });
});

describe('D8/S-4: Single run’s build-up note', () => {
  it('says what Single run does with A1', () => {
    expect(BUILDUP_NOTE).toBe("The Auto Planner can't carry on a build-up, so it starts ascension 1 fresh.");
  });
});

describe('R6: the way back is short', () => {
  it('"Replaces the instant answer ·" and "Go back to it"', () => {
    expect(MAKES_DATE_WORDS).toBe('Replaces the instant answer ·');
    expect(read('../components/myruns/RightNowCard.vue')).toContain("replaceLine.endsWith('·') ? 'Go back to it' : 'Go back to the instant answer'");
  });
});

describe('M6: one line per view', () => {
  it('each hint is one sentence', () => {
    for (const [k, h] of Object.entries(VIEW_HINTS)) {
      expect(h.split(/\. /).length, k).toBe(1);
      expect(h.length, k).toBeLessThan(110);
    }
  });
});
