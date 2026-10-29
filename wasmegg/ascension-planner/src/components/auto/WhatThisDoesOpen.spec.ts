/**
 * Search > "What this does" (StrongerBox.vue, the explainer under the Fast / Exact / Custom picker) starts OPEN in a
 * fresh browser (Jordan, 29 Oct 2026, Release 6). It stays one of the remembered folds (lib/panelFold.ts
 * `whatItDoes`, PanelFold.vue): a player who closed it finds it closed next time. It is shown in one place,
 * StrongerBox.vue, which both Fastest (FastestRoute.vue) and By a date (DeadlinePanel.vue) render, so both agree.
 * The other folds keep their defaults. Server rendered, no DOM, no clocks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import StrongerBox from './StrongerBox.vue';
import { renderHtml } from '@/test/renderComponent';
import { PANEL_FOLD, foldKey, foldOpen, readFoldToggle, rememberFoldToggle } from '@/lib/panelFold';

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

const detailsTag = (html: string, id: string) =>
  html.match(new RegExp(`<details[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
const isOpen = (tag: string) => /\sopen(=|\s|>)/.test(tag);
const GOALS = ['fastest', 'date'] as const;

describe('"What this does" starts open (29 Oct 2026)', () => {
  it('the table says open; a fresh browser gets it open', () => {
    expect(PANEL_FOLD.whatItDoes).toBe('open');
    expect(readFoldToggle('whatItDoes')).toBeNull();
    expect(foldOpen('whatItDoes', { remembered: readFoldToggle('whatItDoes') })).toBe(true);
  });

  it('a player who closed it stays closed; one who reopened it stays open', () => {
    rememberFoldToggle('whatItDoes', false);
    expect(mem.get(foldKey('whatItDoes'))).toBe('0');
    expect(foldOpen('whatItDoes', { remembered: readFoldToggle('whatItDoes') })).toBe(false);
    expect(foldOpen('whatItDoes', { running: true, remembered: readFoldToggle('whatItDoes') })).toBe(false);
    rememberFoldToggle('whatItDoes', true);
    expect(foldOpen('whatItDoes', { remembered: readFoldToggle('whatItDoes') })).toBe(true);
  });

  it('the other folds keep their defaults: Every number of ascensions open, the rest folded', () => {
    const { whatItDoes: _w, ...rest } = PANEL_FOLD;
    expect(rest).toEqual({
      searchSettings: 'folded',
      acknowledgement: 'folded',
      steppingAway: 'folded',
      countTable: 'open',
      howWorkedOut: 'folded',
    });
  });

  for (const goal of GOALS) {
    it(`rendered (${goal}): open in a fresh browser`, async () => {
      const html = await renderHtml(StrongerBox, { goal });
      expect(isOpen(detailsTag(html, 'fold-whatItDoes'))).toBe(true);
      expect(html.match(/<details/g)).toHaveLength(1);
    });
    it(`rendered (${goal}): closed when the player closed it, also while a run goes`, async () => {
      mem.set(foldKey('whatItDoes'), '0');
      expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal }), 'fold-whatItDoes'))).toBe(false);
      expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal, running: true }), 'fold-whatItDoes'))).toBe(false);
    });
  }

  it('one place shows it (StrongerBox), and both Fastest and By a date render that', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    expect(read('StrongerBox.vue').match(/<PanelFold\s+section="whatItDoes"/g)).toHaveLength(1);
    expect(read('FastestRoute.vue')).toMatch(/<StrongerBox\b/);
    expect(read('DeadlinePanel.vue')).toMatch(/<StrongerBox\b/);
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue', 'SearchPanel.vue', 'ChainSearchPanel.vue'])
      expect(read(f), f).not.toMatch(/section="whatItDoes"/);
  });
});
