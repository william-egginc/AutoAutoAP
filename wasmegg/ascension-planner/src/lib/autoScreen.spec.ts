/**
 * The Auto Planner opens on the screen the player was last on (Jordan, 1 Nov 2026: the tab always landed on
 * Single run). Remembered in this browser under aap.autoScreen; nothing stored keeps the old default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { readAutoScreen, writeAutoScreen, AUTO_SCREEN_KEY } from './autoScreen';
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
  it('the bare tab click carries the current screen, not a forced one', () => {
    const fn = app.slice(app.indexOf('function selectSection'), app.indexOf('function goAuto'));
    expect(fn).toContain('currentRoute()');
    expect(fn).not.toContain("'classic'");
  });
});
