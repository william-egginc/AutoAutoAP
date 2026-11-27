/**
 * THE TOP MENU KEPT OPEN (QA, 26 Oct 2026: in Safari, after narrowing the window and widening it again, the account
 * chips came back folded away). Nothing in the page resets the menu on a resize (it is one ref, the ui store's
 * `isHeaderCollapsed`, never tied to a media query); what folds it is the automatic collapse when the Auto Planner
 * opens (also on a reload that restores it). A menu the player opened with the chevron now stays open through those.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { useUIStore } from './ui';

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

describe('the top menu kept open', () => {
  it('opened with the chevron, it is kept for this tab (a reload too); folded, forgotten', () => {
    const ui = useUIStore();
    expect(ui.headerKeptOpen).toBe(false);
    ui.setHeaderKeptOpen(true);
    setActivePinia(createPinia());
    expect(useUIStore().headerKeptOpen).toBe(true);
    useUIStore().setHeaderKeptOpen(false);
    setActivePinia(createPinia());
    expect(useUIStore().headerKeptOpen).toBe(false);
  });

  it('storage that throws never breaks it', () => {
    vi.stubGlobal('sessionStorage', {
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
    setActivePinia(createPinia());
    const ui = useUIStore();
    expect(ui.headerKeptOpen).toBe(false);
    expect(() => ui.setHeaderKeptOpen(true)).not.toThrow();
    expect(ui.headerKeptOpen).toBe(true);
  });

  it('App: the chevron keeps the choice, the automatic collapse respects it, and no resize or media query touches the menu', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8');
    expect(app).toContain('uiStore.setHeaderKeptOpen(!isHeaderCollapsed.value);');
    expect(app).toContain('if (playerId.value && initialStateStore.rawBackup && !uiStore.headerKeptOpen) isHeaderCollapsed.value = true;');
    expect(app).not.toMatch(/addEventListener\('resize'/);
    expect(app).not.toMatch(/matchMedia\([^)]*width/);
    const ui = readFileSync(fileURLToPath(new URL('./ui.ts', import.meta.url)), 'utf8');
    expect(ui).not.toMatch(/innerWidth|matchMedia\(|addEventListener\('resize'/);
  });
});
