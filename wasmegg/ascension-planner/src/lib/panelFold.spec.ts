/**
 * The search panel's open / folded split (lib/panelFold.ts; the UX review of 25 Oct 2026, item C).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOLD_OPENS_WHEN,
  PANEL_FOLD,
  foldKey,
  foldOpen,
  readFoldToggle,
  rememberFoldToggle,
  scopeLine,
  type FoldSection,
} from './panelFold';

const SECTIONS: FoldSection[] = [
  'whatItDoes',
  'searchSettings',
  'acknowledgement',
  'steppingAway',
  'countTable',
  'howWorkedOut',
];

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the default split (the review\'s proposal)', () => {
  it('has every section; Jordan\'s defaults (26 Oct 2026; Stepping away? folded since 28 Oct): Every number of ascensions open, the rest folded; What this does open since 29 Oct', () => {
    expect(Object.keys(PANEL_FOLD).sort()).toEqual([...SECTIONS].sort());
    const open: FoldSection[] = ['countTable', 'whatItDoes'];
    for (const s of SECTIONS) expect(PANEL_FOLD[s], s).toBe(open.includes(s) ? 'open' : 'folded');
  });
  it('Search settings stays folded (Fast unless the player opens it)', () => {
    expect(PANEL_FOLD.searchSettings).toBe('folded');
    expect(foldOpen('searchSettings')).toBe(false);
  });
  it('only a long run started opens anything by itself: Stepping away? (28 Oct 2026; any run going did before)', () => {
    expect(FOLD_OPENS_WHEN).toEqual({ steppingAway: ['longRun'] });
  });
});

describe('foldOpen', () => {
  it('idle, nothing remembered: the table', () => {
    for (const s of SECTIONS) expect(foldOpen(s), s).toBe(s === 'countTable' || s === 'whatItDoes');
    for (const s of SECTIONS) expect(foldOpen(s, {}), s).toBe(PANEL_FOLD[s] === 'open');
  });
  it('a long run started opens Stepping away?, even where the table says folded; nothing else', () => {
    for (const s of SECTIONS) expect(foldOpen(s, { longRun: true }), s).toBe(PANEL_FOLD[s] === 'open' || s === 'steppingAway');
    expect(foldOpen('steppingAway', { longRun: true })).toBe(true);
    expect(foldOpen('steppingAway')).toBe(false);
  });
  it('a run going alone no longer opens Stepping away? (28 Oct 2026)', () => {
    for (const s of SECTIONS) expect(foldOpen(s, { running: true }), s).toBe(PANEL_FOLD[s] === 'open');
  });
  it('a remembered close of an open-by-default section wins (the player\'s choice over the default)', () => {
    expect(foldOpen('countTable', { remembered: false })).toBe(false);
    expect(foldOpen('steppingAway', { remembered: false })).toBe(false);
  });
  it('a long run started wins over the player having closed Stepping away? before', () => {
    expect(foldOpen('steppingAway', { longRun: true, remembered: false })).toBe(true);
  });
  it('an unfinished run alone opens nothing the table does not', () => {
    for (const s of SECTIONS) expect(foldOpen(s, { unfinished: true }), s).toBe(PANEL_FOLD[s] === 'open');
  });
  it("the player's own toggle wins over the table, both ways", () => {
    for (const s of SECTIONS) {
      expect(foldOpen(s, { remembered: true }), s).toBe(true);
      expect(foldOpen(s, { remembered: false }), s).toBe(false);
      expect(foldOpen(s, { remembered: null }), s).toBe(PANEL_FOLD[s] === 'open');
    }
  });
  it('follows the table: a section set to open starts open', () => {
    const was = PANEL_FOLD.howWorkedOut;
    try {
      PANEL_FOLD.howWorkedOut = 'open';
      expect(foldOpen('howWorkedOut')).toBe(true);
      expect(foldOpen('howWorkedOut', { remembered: false })).toBe(false);
    } finally {
      PANEL_FOLD.howWorkedOut = was;
    }
  });
});

describe("the player's toggle, remembered per section", () => {
  it('none until toggled; then per section', () => {
    for (const s of SECTIONS) expect(readFoldToggle(s)).toBeNull();
    rememberFoldToggle('acknowledgement', true);
    rememberFoldToggle('countTable', false);
    expect(mem.get(foldKey('acknowledgement'))).toBe('1');
    expect(readFoldToggle('acknowledgement')).toBe(true);
    expect(readFoldToggle('countTable')).toBe(false);
    expect(readFoldToggle('whatItDoes')).toBeNull();
  });
  it('keeps what players chose under the older Search settings key', () => {
    mem.set('aap.fastest.searchSettingsOpen', '1');
    expect(readFoldToggle('searchSettings')).toBe(true);
    mem.set('aap.fastest.searchSettingsOpen', '0');
    expect(readFoldToggle('searchSettings')).toBe(false);
    rememberFoldToggle('searchSettings', true);
    expect(readFoldToggle('searchSettings')).toBe(true);
  });
  it('the merged promise fold (26 Oct 2026): its old keys are harmless, What this does keeps its own toggle', () => {
    mem.set('aap-stronger-promise-closed', '0');
    mem.set('aap.fold.promise', '1');
    expect(readFoldToggle('whatItDoes')).toBeNull();
    expect(foldOpen('whatItDoes', { remembered: readFoldToggle('whatItDoes') })).toBe(true);
    rememberFoldToggle('whatItDoes', false);
    expect(readFoldToggle('whatItDoes')).toBe(false);
    expect(Object.keys(PANEL_FOLD)).not.toContain('promise');
  });
  it('never throws without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readFoldToggle('whatItDoes')).toBeNull();
    expect(() => rememberFoldToggle('whatItDoes', true)).not.toThrow();
  });
});

describe('scopeLine', () => {
  it('joins the parts it has with a middle dot', () => {
    expect(scopeLine(['Nearby routes', '', null, '±3', false, undefined, '25 min'])).toBe('Nearby routes · ±3 · 25 min');
    expect(scopeLine([])).toBe('');
  });
});
