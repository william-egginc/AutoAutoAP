/** "Works inside my hours" ticked by default with playing hours set (search/instantFilters.ts; Jordan, 22 Oct 2026). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defaultInsideHours, insideHoursFor, readInsideHoursChoice, writeInsideHoursChoice } from './instantFilters';

describe('defaultInsideHours', () => {
  it('ticked whenever hours are set with a window that is not any hour, and no choice', () => {
    expect(defaultInsideHours(true, false, null)).toBe(true);
  });
  it('off with no hours, or any hour', () => {
    expect(defaultInsideHours(false, false, null)).toBe(false);
    expect(defaultInsideHours(true, true, null)).toBe(false);
  });
  it('the player’s own untick wins, and so does a tick', () => {
    expect(defaultInsideHours(true, false, 'off')).toBe(false);
    expect(defaultInsideHours(true, true, 'on')).toBe(true);
  });
});

describe('insideHoursFor', () => {
  it('no hours: the remembered value as before (the box is hidden and unused)', () => {
    expect(insideHoursFor(false, false, null, true)).toBe(true);
    expect(insideHoursFor(false, true, 'on', false)).toBe(false);
  });
  it('any hour and no choice: as before', () => {
    expect(insideHoursFor(true, false, null, true)).toBe(true);
    expect(insideHoursFor(true, false, null, false)).toBe(false);
  });
  it('hours set: ticked, unless the player unticked it (never ticked again by itself)', () => {
    expect(insideHoursFor(true, true, null, false)).toBe(true);
    expect(insideHoursFor(true, true, 'off', true)).toBe(false);
    expect(insideHoursFor(true, true, 'on', false)).toBe(true);
  });
});

describe('the remembered choice', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('comes back as written; anything else is no choice', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readInsideHoursChoice()).toBeNull();
    writeInsideHoursChoice('off');
    expect(readInsideHoursChoice()).toBe('off');
    writeInsideHoursChoice('on');
    expect(readInsideHoursChoice()).toBe('on');
    store.set('aap-instant-inside-hours', 'maybe');
    expect(readInsideHoursChoice()).toBeNull();
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
    expect(readInsideHoursChoice()).toBeNull();
    expect(() => writeInsideHoursChoice('off')).not.toThrow();
  });
});

describe('wiring', () => {
  const route = fs.readFileSync(path.join(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
  const now = fs.readFileSync(path.join(__dirname, '../composables/useNowPage.ts'), 'utf8');
  it('the tick box records the player’s own choice; the default follows the hours', () => {
    expect(route).toContain('@change="setInsideHours(($event.target as HTMLInputElement).checked)"');
    expect(route).not.toContain('v-model="filters.inHours"');
    expect(route).toContain("insideHoursChoice.value = on ? 'on' : 'off';");
    expect(route).toContain('writeInsideHoursChoice(insideHoursChoice.value);');
    expect(route).toContain('insideHoursFor(on, constrained, insideHoursChoice.value, filters.value.inHours)');
    expect(route).toContain('() => [hoursOn.value, isConstrained(store.availability)] as const');
  });
  it('Right now reads it the same way', () => {
    expect(now).toContain(
      'insideHoursFor(true, isConstrained(store.availability), readInsideHoursChoice(), filters.inHours)'
    );
  });
});
