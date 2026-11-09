/**
 * The simpler default page's folds (notes/simpler-design.md, Jordan 9 Nov 2026): each screen's one "More" starts closed,
 * remembers the player's own open or close per screen in this browser, opens by itself while the screen's search runs
 * or can be carried on, and Setup › More options › Show everything opens every More whatever was remembered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MORE_SECTIONS,
  PANEL_FOLD,
  SHOW_EVERYTHING_KEY,
  foldOpen,
  readFoldToggle,
  readShowEverything,
  rememberFoldToggle,
  rememberShowEverything,
} from './panelFold';

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

describe('More folds', () => {
  it('one per screen, each closed by default, and Sharing and privacy closed', () => {
    expect([...MORE_SECTIONS]).toEqual(['moreFastest', 'moreByDate', 'moreMyRuns']);
    for (const s of MORE_SECTIONS) expect(PANEL_FOLD[s]).toBe('folded');
    expect(PANEL_FOLD.setupSharing).toBe('folded');
    for (const s of MORE_SECTIONS) expect(foldOpen(s)).toBe(false);
  });

  it('remembers the player’s own open and close, per screen', () => {
    rememberFoldToggle('moreFastest', true);
    expect(readFoldToggle('moreFastest')).toBe(true);
    expect(readFoldToggle('moreByDate')).toBe(null);
    expect(foldOpen('moreFastest', { remembered: readFoldToggle('moreFastest') })).toBe(true);
    rememberFoldToggle('moreFastest', false);
    expect(foldOpen('moreFastest', { remembered: readFoldToggle('moreFastest') })).toBe(false);
  });

  it('opens by itself while the search inside runs or can be carried on', () => {
    expect(foldOpen('moreFastest', { running: true, remembered: false })).toBe(true);
    expect(foldOpen('moreByDate', { unfinished: true, remembered: false })).toBe(true);
    expect(foldOpen('moreMyRuns', { running: true })).toBe(false);
  });

  it('Show everything opens every More, over a remembered close, and nothing else', () => {
    for (const s of MORE_SECTIONS) expect(foldOpen(s, { showEverything: true, remembered: false })).toBe(true);
    expect(foldOpen('whatItDoes', { showEverything: true })).toBe(false);
    expect(foldOpen('setupSharing', { showEverything: true })).toBe(false);
  });

  it('Show everything is remembered in this browser, off by default', () => {
    expect(readShowEverything()).toBe(false);
    rememberShowEverything(true);
    expect(mem.get(SHOW_EVERYTHING_KEY)).toBe('1');
    expect(readShowEverything()).toBe(true);
    rememberShowEverything(false);
    expect(readShowEverything()).toBe(false);
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
    expect(readShowEverything()).toBe(false);
    expect(() => rememberShowEverything(true)).not.toThrow();
  });
});
