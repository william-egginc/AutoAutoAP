/** The search tabs' selection (lib/searchTab.ts; Allan, 14 Oct 2026: "use one at a time"). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SEARCH_TAB,
  loadSearchTabs,
  revealElement,
  revealRunTab,
  scrollToShownId,
  searchTabKey,
  searchTabs,
  selectSearchTab,
  tabForRun,
  tabOfElement,
} from './searchTab';

const mem = new Map<string, string>();
function fakeStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
}
beforeEach(() => {
  mem.clear();
  fakeStorage();
  loadSearchTabs();
});

/** A stand-in element inside a tab panel (only `closest` is read). */
function inPanel(screen: string, tab: string) {
  const panel = { getAttribute: (n: string) => (n === 'data-screen' ? screen : n === 'data-tab' ? tab : null) };
  return { closest: (sel: string) => (sel === '[data-search-tab-panel]' ? panel : null) };
}

describe('the selection', () => {
  it('opens on Search nearby on both screens', () => {
    expect(DEFAULT_SEARCH_TAB).toBe('nearby');
    expect(searchTabs.fastest).toBe('nearby');
    expect(searchTabs['by-date']).toBe('nearby');
  });
  it('remembers a pick per screen; a switch made for the player (a run, a link) is not remembered', () => {
    selectSearchTab('fastest', 'exhaustive', true);
    expect(mem.get('aap.searchTab.fastest')).toBe('exhaustive');
    selectSearchTab('by-date', 'exhaustive');
    expect(searchTabs['by-date']).toBe('exhaustive');
    expect(mem.has('aap.searchTab.by-date')).toBe(false);
    loadSearchTabs();
    expect(searchTabs).toEqual({ fastest: 'exhaustive', 'by-date': 'nearby' });
  });
  it('reads only the two names, and survives storage that throws', () => {
    mem.set(searchTabKey('by-date'), 'nonsense');
    loadSearchTabs();
    expect(searchTabs['by-date']).toBe('nearby');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => loadSearchTabs()).not.toThrow();
    expect(searchTabs.fastest).toBe('nearby');
    expect(() => selectSearchTab('fastest', 'exhaustive', true)).not.toThrow();
    expect(searchTabs.fastest).toBe('exhaustive');
  });
  it("drops the two retired CollapsibleSection keys (the tabs replaced those sections); keeps the instant answer's", () => {
    mem.set('aap-section-hidden-stronger', '1');
    mem.set('aap-section-hidden-exhaustive', '1');
    mem.set('aap-section-hidden-instant', '1');
    loadSearchTabs();
    expect([...mem.keys()]).toEqual(['aap-section-hidden-instant']);
  });
});

describe('the tab a run is in', () => {
  it("Fastest: Nearby routes in Search nearby, the Full sweep in Exhaustive; By a date by the run's own flag", () => {
    expect(tabForRun('smart', false)).toEqual({ screen: 'fastest', tab: 'nearby' });
    expect(tabForRun('full', true)).toEqual({ screen: 'fastest', tab: 'exhaustive' });
    expect(tabForRun('by-date', true)).toEqual({ screen: 'by-date', tab: 'nearby' });
    expect(tabForRun('by-date', false)).toEqual({ screen: 'by-date', tab: 'exhaustive' });
  });
  it('revealRunTab shows it without remembering it', () => {
    revealRunTab('full', false);
    expect(searchTabs.fastest).toBe('exhaustive');
    revealRunTab('by-date', false);
    expect(searchTabs['by-date']).toBe('exhaustive');
    expect(mem.size).toBe(0);
  });
});

describe('an element in a hidden tab', () => {
  it('knows its tab from the panel it sits in', () => {
    expect(tabOfElement(inPanel('by-date', 'exhaustive'))).toEqual({ screen: 'by-date', tab: 'exhaustive' });
    expect(tabOfElement(inPanel('elsewhere', 'exhaustive'))).toBe(null);
    expect(tabOfElement({ closest: () => null })).toBe(null);
    expect(tabOfElement({})).toBe(null);
    expect(tabOfElement(null)).toBe(null);
  });
  it('revealElement switches to its tab once, and says whether it did', () => {
    expect(revealElement(inPanel('fastest', 'exhaustive'))).toBe(true);
    expect(searchTabs.fastest).toBe('exhaustive');
    expect(revealElement(inPanel('fastest', 'exhaustive'))).toBe(false);
    expect(revealElement({})).toBe(false);
  });
  it('scrollToShownId scrolls to the copy that is laid out, not the first in the page', () => {
    const hidden = { getClientRects: () => ({ length: 0 }), scrollIntoView: vi.fn() };
    const shown = { getClientRects: () => ({ length: 1 }), scrollIntoView: vi.fn() };
    vi.stubGlobal('document', { querySelectorAll: (sel: string) => (sel === '[id="share-this-result"]' ? [hidden, shown] : []) });
    expect(scrollToShownId('share-this-result')).toBe(true);
    expect(hidden.scrollIntoView).not.toHaveBeenCalled();
    expect(shown.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(scrollToShownId('nothing-here')).toBe(false);
    vi.unstubAllGlobals();
    fakeStorage();
  });
});
