/**
 * THE FILTERS FOLD (R11, Jordan 21 Nov 2026, the orchestrator's pick on his 12 Nov "always shown"): Filters is one closed fold with a
 * one-line summary of what is set inside it, on both goal screens. It holds the Setup button and the answer's filters (Works
 * inside my awake hours, Ascensions from/to, Prefer fewer), which InstantRoute still teleports into the same host. Flipping it back to
 * always shown is one word in lib/panelFold.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_FOLD } from '@/lib/panelFold';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const tplOf = (s: string) => s.slice(0, s.indexOf('</template>\n\n<script'));

describe('the table', () => {
  it('goalFilters starts folded, and one word flips it back', () => {
    expect(PANEL_FOLD.goalFilters).toBe('folded');
    expect(read('../../lib/panelFold.ts')).toMatch(/goalFilters: 'folded'/);
  });
});

for (const [name, file, host] of [
  ['Fastest', 'FastestRoute.vue', 'filters-fastest-answer'],
  ['By Egg Day', 'DeadlinePanel.vue', 'filters-bydate-answer'],
] as const) {
  describe(`${name}: the Filters region is a fold`, () => {
    const tpl = tplOf(read(file));
    const at = tpl.indexOf('data-region="filters"');
    const region = tpl.slice(at - 200, at + 1400);
    it('a PanelFold of section goalFilters with the summary as its hint', () => {
      expect(region).toMatch(/<PanelFold[^>]*section="goalFilters"/);
      expect(region).toContain(':hint="filtersText"');
      expect(region).toContain('title="Filters"');
    });
    it('inside it: the Setup button and the teleport host the instant answer fills', () => {
      expect(region).toContain('<FiltersButton');
      expect(region).toContain(`id="${host}"`);
      expect(region).toContain('data-testid="filters-under"');
    });
    it('the instant answer tells the screen the summary line', () => {
      expect(tpl).toMatch(/@filters-line="l => \(filtersText = l\)"/);
    });
  });
}

describe('InstantRoute says its summary', () => {
  const src = read('InstantRoute.vue');
  it('emits filters-line from the same state the controls use', () => {
    expect(src).toMatch(/'filters-line': \[line: string\]/);
    expect(src).toContain("filtersLine({");
    expect(src).toMatch(/emit\(\s*'filters-line'/);
  });
});
