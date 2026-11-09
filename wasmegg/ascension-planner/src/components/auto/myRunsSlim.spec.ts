/**
 * My runs (UX fluff review 2, 5 Nov 2026, part A items M1, M4, M7): the intro is its first clause; "Fastest is not always
 * best…" is behind a "?" by the Other options heading, word for word; "Nothing else here is a genuinely different
 * plan…" is one line with a button to the Fastest view. New wording is DRAFT for Words. Sources read, no DOM.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('My runs, slim', () => {
  it('M1: no intro line since the simpler page (9 Nov 2026): the save line says it', () => {
    expect(read('../MyRunsView.vue')).not.toContain('data-testid="my-runs-intro"');
  });
  it('M4: "Fastest is not always best" is behind a ? next to the heading', () => {
    const src = read('LatestRunView.vue').replace(/\s+/g, ' ');
    expect(src).toMatch(/Other options worth considering <HelpTip> Fastest is not always best\. Every prestige is a full rebuild/);
    expect(src).not.toMatch(/<p class="text-body text-slate-500 max-w-prose"> Fastest is not always best/);
  });
  it('M7: one line and a button to the Fastest view', () => {
    const src = read('LatestRunView.vue');
    expect(src).not.toContain('Nothing else here is a genuinely different plan');
    expect(src).toMatch(/Nothing here is a different plan\.\{\{ ' ' \}\}<button[^>]*data-testid="shortlist-see-fastest"[^>]*@click="store\.setShortlistView\('fastest'\)"/);
  });
});
