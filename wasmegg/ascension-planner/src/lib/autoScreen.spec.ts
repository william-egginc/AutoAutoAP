/**
 * The Auto Planner opened on the screen the player was last on (Jordan, 1 Nov 2026: the tab always landed on
 * Single run). Remembered in this browser under aap.autoScreen; nothing stored keeps the old default.
 * Since Chain Finder (spec-chainfinder, 12 Nov 2026) it is Chain Finder's last goal: Fastest (and its depth) or By a
 * date. A stored 'classic' (from before) reads as Fastest, the Auto Planner tab always opens the simulator, and opening
 * the simulator never overwrites the goal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { readAutoScreen, rememberedChainGoal, writeAutoScreen, AUTO_SCREEN_KEY } from './autoScreen';
import { useUIStore } from '@/stores/ui';

let mem: Map<string, string>;
function stub(throws = false) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (throws) throw new Error('blocked');
      return mem.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error('blocked');
      mem.set(k, v);
    },
  });
}
beforeEach(() => {
  mem = new Map();
  stub();
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

describe('autoScreen memory', () => {
  it('uses an aap. key and round-trips a screen and depth', () => {
    expect(AUTO_SCREEN_KEY.startsWith('aap.')).toBe(true);
    expect(readAutoScreen()).toBeNull();
    writeAutoScreen('fastest', 'full');
    expect(readAutoScreen()).toEqual({ view: 'fastest', depth: 'full' });
  });
  it("a 'classic' stored before Chain Finder reads as Fastest, its depth kept", () => {
    mem.set(AUTO_SCREEN_KEY, '{"view":"classic","depth":"full"}');
    expect(readAutoScreen()).toEqual({ view: 'fastest', depth: 'full' });
  });
  it('opening the simulator writes nothing: the goal stays', () => {
    writeAutoScreen('by-date', 'smart');
    writeAutoScreen('classic', 'full');
    expect(readAutoScreen()).toEqual({ view: 'by-date', depth: 'smart' });
  });
  it('ignores junk and survives blocked storage', () => {
    mem.set(AUTO_SCREEN_KEY, '{"view":"nope","depth":"x"}');
    expect(readAutoScreen()).toBeNull();
    mem.set(AUTO_SCREEN_KEY, 'not json');
    expect(readAutoScreen()).toBeNull();
    stub(true);
    expect(readAutoScreen()).toBeNull();
    expect(() => writeAutoScreen('by-date', 'smart')).not.toThrow();
  });
});

describe('the goal a player picked on Chain Finder (where a first load lands, spec-startchain2)', () => {
  it('is null on a first visit, junk or blocked storage', () => {
    expect(rememberedChainGoal()).toBeNull();
    mem.set(AUTO_SCREEN_KEY, 'not json');
    expect(rememberedChainGoal()).toBeNull();
    stub(true);
    expect(rememberedChainGoal()).toBeNull();
  });
  it('is Target TE or By a date as written, with its depth', () => {
    writeAutoScreen('fastest', 'full');
    expect(rememberedChainGoal()).toEqual({ view: 'fastest', depth: 'full' });
    writeAutoScreen('by-date', 'smart');
    expect(rememberedChainGoal()).toEqual({ view: 'by-date', depth: 'smart' });
  });
  it("a 'classic' stored before Chain Finder is no goal the player picked (Joo's simulator): none", () => {
    mem.set(AUTO_SCREEN_KEY, '{"view":"classic","depth":"smart"}');
    expect(rememberedChainGoal()).toBeNull();
    // The tab itself still reads it as Fastest (readAutoScreen).
    expect(readAutoScreen()).toEqual({ view: 'fastest', depth: 'smart' });
  });
});

describe('the ui store', () => {
  it('first visit keeps Single run', () => {
    expect(useUIStore().autoView).toBe('classic');
  });
  it('opens on the remembered screen and depth', () => {
    writeAutoScreen('fastest', 'full');
    const ui = useUIStore();
    expect(ui.autoView).toBe('fastest');
    expect(ui.fastestDepth).toBe('full');
  });
  it("Chain Finder's goal: Fastest on a first visit, else the remembered one (a stored classic is Fastest)", () => {
    expect(useUIStore().chainView).toBe('fastest');
    setActivePinia(createPinia());
    writeAutoScreen('by-date', 'smart');
    expect(useUIStore().chainView).toBe('by-date');
    setActivePinia(createPinia());
    mem.set(AUTO_SCREEN_KEY, '{"view":"classic","depth":"smart"}');
    expect(useUIStore().chainView).toBe('fastest');
  });
  it('the simulator leaves the goal alone; a goal change is remembered', async () => {
    const ui = useUIStore();
    ui.autoView = 'by-date';
    await nextTick();
    ui.autoView = 'classic';
    await nextTick();
    expect(ui.chainView).toBe('by-date');
    expect(readAutoScreen()?.view).toBe('by-date');
  });
  it('remembers a change of screen or depth', async () => {
    const ui = useUIStore();
    ui.autoView = 'by-date';
    await nextTick();
    expect(readAutoScreen()?.view).toBe('by-date');
    ui.fastestDepth = 'full';
    await nextTick();
    expect(readAutoScreen()).toEqual({ view: 'by-date', depth: 'full' });
  });
});

describe('App.vue', () => {
  const app = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8');
  it('an address to another tab leaves the remembered Auto Planner screen alone', () => {
    const at = app.indexOf('function applyRoute');
    const fn = app.slice(at, app.indexOf('plannerTab.value =', at));
    expect(fn).toMatch(/if \(r\.section === 'auto'\)/);
  });
  it("the Auto Planner tab opens the simulator; Chain Finder its remembered goal (the store's chainView)", () => {
    const fn = app.slice(app.indexOf('function selectSection'), app.indexOf('function goAuto'));
    expect(fn).toContain('currentRoute()');
    expect(fn).toContain("goAuto('classic')");
    expect(fn).toContain('uiStore.chainView');
  });
});
