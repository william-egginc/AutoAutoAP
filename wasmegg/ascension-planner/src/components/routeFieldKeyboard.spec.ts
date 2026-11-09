/**
 * Kenzie (a new tester on her iPhone, 9 Nov 2026) could not type "218, 247, 278" into Follow another route: the field
 * was inputmode="numeric", which on a phone is a keypad with no comma and no space. Every field that takes a route
 * written as stops (numbers split by spaces, commas or arrows) now opens the full keyboard, and iOS is told not to
 * capitalise, correct or spell-check it. Read from each component's source (one input each, found by its id, test id
 * or model), and the Your runs Stops box also rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import RunsExploreBar from './myruns/RunsExploreBar.vue';

const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
/** Every <input ...> tag of a source whose text contains `marker`. */
const inputsWith = (text: string, marker: string) => (text.match(/<input\b[^>]*>/g) ?? []).filter(t => t.includes(marker));

const FIELDS: [string, string, number][] = [
  ['myruns/RightNowCard.vue', 'data-testid="now-follow-input"', 1],
  ['myruns/RunsExploreBar.vue', 'data-testid="runs-explore-stops"', 1],
  ['auto/ChainSearchPanel.vue', 'v-model="store.seedOverride"', 2],
];

describe('route fields open a keyboard with commas and spaces', () => {
  for (const [file, marker, count] of FIELDS)
    it(`${file}: ${marker}`, () => {
      const tags = inputsWith(src(file), marker);
      expect(tags).toHaveLength(count);
      for (const t of tags) {
        expect(t).not.toContain('inputmode="numeric"');
        expect(t).not.toContain('type="number"');
        expect(t).toContain('inputmode="text"');
        expect(t).toContain('autocapitalize="off"');
        expect(t).toContain('autocorrect="off"');
        expect(t).toContain('autocomplete="off"');
        expect(t).toContain('spellcheck="false"');
      }
    });

  it('the Stops box renders with the text keyboard', async () => {
    const html = await renderHtml(RunsExploreBar, { groups: [], sort: 'best', stops: '', shown: 3, total: 25, active: 0 });
    const tag = html.match(/<input[^>]*data-testid="runs-explore-stops"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('inputmode="text"');
    expect(tag).toContain('autocorrect="off"');
  });
});
