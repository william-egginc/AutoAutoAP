/** By a date's "I need to ascend at the last stop before the deadline" ticked by default with playing hours set
 *  (search/instantFilters.ts `ascendNeededFor`; the math review, 24 Oct 2026), as "Works inside my hours" is. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ascendNeededFor, readAscendNeededChoice, writeAscendNeededChoice } from './instantFilters';

describe('ascendNeededFor', () => {
  it('ticked whenever hours are set with a window that is not any hour, and no choice', () => {
    expect(ascendNeededFor(true, true, null)).toBe(true);
  });
  it('off with no hours, or any hour, as before', () => {
    expect(ascendNeededFor(false, false, null)).toBe(false);
    expect(ascendNeededFor(false, true, null)).toBe(false);
    expect(ascendNeededFor(true, false, null)).toBe(false);
    // No hours: off even after a tick (the box is hidden and the search ignores it).
    expect(ascendNeededFor(false, true, 'on')).toBe(false);
  });
  it('the player’s own untick wins and is never ticked again by itself; a tick wins too', () => {
    expect(ascendNeededFor(true, true, 'off')).toBe(false);
    expect(ascendNeededFor(true, false, 'on')).toBe(true);
  });
});

describe('the remembered choice', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('comes back as written, apart from Works inside my hours; anything else is no choice', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readAscendNeededChoice()).toBeNull();
    writeAscendNeededChoice('off');
    expect(readAscendNeededChoice()).toBe('off');
    expect(store.get('aap-instant-inside-hours')).toBeUndefined();
    writeAscendNeededChoice('on');
    expect(readAscendNeededChoice()).toBe('on');
    store.set('aap-ascend-needed', 'maybe');
    expect(readAscendNeededChoice()).toBeNull();
  });
  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readAscendNeededChoice()).toBeNull();
    expect(() => writeAscendNeededChoice('on')).not.toThrow();
  });
});

describe('the By a date panel', () => {
  it('sets the tick from the hours with the remembered choice, and a click records the choice', () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');
    expect(src).toContain('I need to ascend at the last stop before the deadline.');
    expect(src).toContain('ascendNeededFor(on, constrained, ascendNeededChoice.value)');
    expect(src).toContain('@change="setAscendNeeded(($event.target as HTMLInputElement).checked)"');
    expect(src).toContain('writeAscendNeededChoice(ascendNeededChoice.value)');
    expect(src).not.toContain('v-model="ascendNeeded"');
  });
});
