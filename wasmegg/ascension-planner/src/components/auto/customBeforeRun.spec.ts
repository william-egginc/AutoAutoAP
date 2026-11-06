/**
 * Custom before a run (UX fluff review 2, 5 Nov 2026, part A items C-pre1 to C-pre10): a one-line lead, the evidence and
 * how it works in one fold ("How Custom works"), "Suggest would fill in…" behind the Suggest button (its size on the
 * button), no amber "The winner will be the best…", the ascension-count rule in the Ranges tip, the estimate's basis in
 * the Assumed cost tip with only "Leave the tab open: a closed tab stops the workers." in view, and By a date's Format and
 * "Counted in ascensions…" behind tips. New wording is DRAFT for Words. No DOM: the sources and SSR renders are read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import ExhaustivePromise from './ExhaustivePromise.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const LEAD = 'Tries every route in your boxes, so it proves the best inside them. It rarely beats Fast by more than hours, and big boxes take hours.';

describe('C-pre1, C-pre2: one lead line, one fold', () => {
  it('both screens open Custom with the one line, no bullets', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const src = read(f);
      expect(src, f).toContain(LEAD);
      expect(src, f).not.toContain('<li v-for="line in CUSTOM_POINTS"');
    }
  });
  it('the fold is "How Custom works" and holds the evidence; Fastest’s how-it-works is inside it', async () => {
    const t = textOf(await renderHtml(ExhaustivePromise, { goal: 'fastest' }));
    expect(t).toMatch(/^How Custom works ›/);
    expect(t).toContain('It is for proving an answer, not for finding a much better one.');
    expect(read('FastestRoute.vue')).toMatch(/<ExhaustivePromise goal="fastest">\s*<CustomHowItWorks \/>/);
    expect(read('InsanePanel.vue')).not.toContain('works, and what it costs');
  });
});

describe('C-pre3 to C-pre9 (InsanePanel.vue)', () => {
  const src = read('InsanePanel.vue');
  it('the Suggest size is on its button; the long line is behind it', () => {
    expect(src).not.toMatch(/<span v-if="suggestion" class="text-small text-slate-500">\s*Suggest would fill in/);
    expect(src).toMatch(/Suggest a space<template v-if="suggestion">\{\{ ' ' \}\}\(\{\{ chainsTimeLabel\(suggestion\.chains\) \}\}\)<\/template>/);
  });
  it('no amber "The winner will be the best…" box', () => {
    expect(src).not.toContain('The winner will be the best');
  });
  it('the ascension-count rule is in the Ranges tip, not a paragraph', () => {
    const tip = src.slice(src.indexOf('Ranges, one per stop'), src.indexOf('</HelpTip>', src.indexOf('Ranges, one per stop'))).replace(/\s+/g, ' ');
    expect(tip).toContain('The ascension count includes the final target, so 4 ranges is 5 ascensions.');
    expect(src.replace(/\s+/g, ' ').split('The ascension count includes the final target').length - 1).toBe(1);
  });
  it('under the tiles: only the safety clause; the basis is in the Assumed cost tip', () => {
    expect(src).toContain('<template v-else> Leave the tab open: a closed tab stops the workers. </template>');
    const tip = src.slice(src.indexOf('Assumed cost</span>'), src.indexOf('</HelpTip>', src.indexOf('Assumed cost</span>'))).replace(/\s+/g, ' ');
    expect(tip).toContain('The estimate assumes {{ assumedCostLabel }} per route on {{ store.workerBudget }} workers');
  });
});

describe('C-pre10 (By a date)', () => {
  it('the Format and its bullets are behind a Format tip; Counted in ascensions… is in the Est. time tip', () => {
    const help = read('CustomBoxesHelp.vue');
    expect(help).toMatch(/<HelpTip[^>]*>[\s\S]*Put <span class="tabular-nums">;<\/span> between ascensions/);
    const panel = read('DeadlinePanel.vue');
    expect(panel).not.toMatch(/<p[^>]*>\s*Counted in ascensions, not routes/);
    expect(panel).toMatch(/<HelpTip>\s*Counted in ascensions, not routes/);
  });
});
