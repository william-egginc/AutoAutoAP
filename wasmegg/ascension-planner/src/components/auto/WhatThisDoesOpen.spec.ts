/**
 * Search > "What this does" (StrongerBox.vue, the explainer under the Fast / Exact / Custom picker) starts FOLDED in a
 * fresh browser again since 5 Nov 2026 (UX fluff review 2, items F6 and F7, Jordan approved; it started open from
 * 29 Oct 2026, Release 6). How long and the two safety clauses stay in view above it. It stays one of the remembered
 * folds (lib/panelFold.ts `whatItDoes`, PanelFold.vue): a player who opened it finds it open next time. It is shown in one place,
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

describe('"What this does" starts folded (5 Nov 2026)', () => {
  it('the table says folded; a fresh browser gets it folded', () => {
    expect(PANEL_FOLD.whatItDoes).toBe('folded');
    expect(readFoldToggle('whatItDoes')).toBeNull();
    expect(foldOpen('whatItDoes', { remembered: readFoldToggle('whatItDoes') })).toBe(false);
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
      buildUpTracker: 'folded',
      setupMore: 'folded', // Setup's More options (5 Nov 2026)
      buildUpCompact: 'folded', // the Build-up tracker starts on List (spec-trackercompact, 8 Nov 2026)
      // the simpler default page (9 Nov 2026): each screen's More and Setup's Sharing and privacy start closed
      moreFastest: 'folded',
      moreByDate: 'folded',
      moreMyRuns: 'folded',
      setupSharing: 'folded',
      myRunsTimeline: 'folded', // My runs' Full timeline (9 Nov 2026)
    });
  });

  for (const goal of GOALS) {
    it(`rendered (${goal}): folded in a fresh browser, How long and the safety clauses in view above it`, async () => {
      const html = await renderHtml(StrongerBox, { goal });
      expect(isOpen(detailsTag(html, 'fold-whatItDoes'))).toBe(false);
      expect(html.match(/<details/g)).toHaveLength(1);
      const inView = html.slice(0, html.indexOf('data-testid="fold-whatItDoes"'));
      expect(inView).toContain('data-testid="level-how-long"');
      expect(inView).toContain('Keep this tab in front (a hidden tab runs several times slower).');
      expect(inView).toContain('You can stop it any time and keep the best so far');
    });
    it(`rendered (${goal}): open when the player opened it`, async () => {
      mem.set(foldKey('whatItDoes'), '1');
      expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal }), 'fold-whatItDoes'))).toBe(true);
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
