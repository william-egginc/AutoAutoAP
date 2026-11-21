/**
 * Weekly hours (R10, 21 Nov 2026) through the store, its memory and the online Setup value. The store keeps
 * `blockedHours` (null: the daily window, as before); `weekBlocked` is what the picker edits: the mask, or the daily
 * window turned into one (maskOfWindow) until the player paints. The search's `availability` carries the mask.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChainSearchStore } from './chainSearch';
import { maskOfWindow, weekIndex } from '@/search/availabilitySchedule';
import { parseSetup, setupDefaults } from '@/lib/setupMemory';
import { scheduleFromCloud, scheduleToCloud } from '@/lib/prefsCloud';
import { showSchedule } from '@/lib/displayTime';

const WORK = [1, 2, 3, 4, 5].flatMap(d => [9, 10, 11, 12, 13, 14, 15, 16].map(h => weekIndex(d, h)));
const SLEEP_WORK = [...new Set([...maskOfWindow([], 7, 23), ...WORK])].sort((a, b) => a - b);

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  setActivePinia(createPinia());
});

describe('the store', () => {
  it('no mask: the daily window as before, and weekBlocked reads it as a mask', () => {
    const s = useChainSearchStore();
    s.scheduleEnabled = true;
    expect(s.blockedHours).toBeNull();
    expect(s.availability && 'blocked' in s.availability).toBe(false);
    expect(s.weekBlocked).toEqual(maskOfWindow([0, 1, 2, 3, 4, 5, 6], 7, 23));
    s.availableFrom = 6;
    expect(s.weekBlocked).toEqual(maskOfWindow([], 6, 23));
  });
  it('painting sets the mask (valid indices only), and the search gets it', () => {
    const s = useChainSearchStore();
    s.scheduleEnabled = true;
    s.weekBlocked = [...SLEEP_WORK, 999, -1];
    expect(s.blockedHours).toEqual(SLEEP_WORK);
    expect(s.availability?.blocked).toEqual(SLEEP_WORK);
    expect(s.weekBlocked).toEqual(SLEEP_WORK);
  });
  it('hours off: no schedule whatever the mask; every hour blocked: no schedule', () => {
    const s = useChainSearchStore();
    s.weekBlocked = SLEEP_WORK;
    expect(s.availability).toBeNull();
    s.scheduleEnabled = true;
    s.weekBlocked = Array.from({ length: 168 }, (_, i) => i);
    expect(s.availability).toBeNull();
  });
  it('remembered with the hours group, and put back', () => {
    const s = useChainSearchStore();
    s.scheduleEnabled = true;
    s.weekBlocked = SLEEP_WORK;
    const saved = s.setupNow();
    expect(saved.hours.blocked).toEqual(SLEEP_WORK);
    setActivePinia(createPinia());
    const t = useChainSearchStore();
    t.applySetup(saved);
    expect(t.blockedHours).toEqual(SLEEP_WORK);
    t.applySetup(setupDefaults());
    expect(t.blockedHours).toBeNull();
  });
  it('read back from online: a mask is set, null clears it, absent (an older client or collector) leaves it', () => {
    const s = useChainSearchStore();
    s.applyOnlineSetup({ blocked: SLEEP_WORK });
    expect(s.blockedHours).toEqual(SLEEP_WORK);
    s.applyOnlineSetup({ fromHour: 8 });
    expect(s.blockedHours).toEqual(SLEEP_WORK);
    s.applyOnlineSetup({ blocked: null });
    expect(s.blockedHours).toBeNull();
  });
});

describe('the remembered blob and the online value', () => {
  it('parseSetup keeps a valid mask and drops a bad one; an old blob has none', () => {
    const raw = (blocked: unknown) => JSON.stringify({ v: 1, hours: { on: true, from: 7, to: 23, days: [], blocked }, at: 1 });
    expect(parseSetup(raw(SLEEP_WORK), '2026-11-21')?.hours.blocked).toEqual(SLEEP_WORK);
    expect(parseSetup(raw([3, 3, 200, 'x', 1]), '2026-11-21')?.hours.blocked).toEqual([1, 3]);
    expect(parseSetup(raw('nope'), '2026-11-21')?.hours.blocked).toBeUndefined();
    expect(parseSetup(JSON.stringify({ v: 1, hours: { on: true, from: 7, to: 23, days: [] }, at: 1 }), '2026-11-21')?.hours.blocked).toBeUndefined();
  });
  it('the online hours carry the mask only when there is one (a Setup with none is the value it always was); read back, hours without one mean no mask, and no hours mean not said', () => {
    const base = { scheduleEnabled: true, fromHour: 7, toHour: 23, days: [] as number[] };
    expect(scheduleToCloud({ ...base, blocked: SLEEP_WORK }).hours?.blocked).toEqual(SLEEP_WORK);
    expect(scheduleToCloud({ ...base, blocked: null }).hours).not.toHaveProperty('blocked');
    expect(scheduleToCloud({ ...base, blocked: [] }).hours).not.toHaveProperty('blocked');
    expect(scheduleToCloud({ ...base, blocked: null })).toEqual(scheduleToCloud(base));
    expect(scheduleFromCloud(scheduleToCloud({ ...base, blocked: SLEEP_WORK })).blocked).toEqual(SLEEP_WORK);
    expect(scheduleFromCloud({ hours: { start: '07:00', end: '23:00' } }).blocked).toBeNull();
    expect(scheduleFromCloud({})).not.toHaveProperty('blocked');
  });
});

describe('showSchedule', () => {
  const tz = 'America/Denver';
  it('a mask that is its own window reads as the window; any other is custom weekly hours with the hours a week', () => {
    const w = { days: [], fromHour: 7, toHour: 23, timezone: tz };
    expect(showSchedule({ ...w, blocked: maskOfWindow([], 7, 23) }, 'local')).toBe(showSchedule(w, 'local'));
    expect(showSchedule({ ...w, blocked: SLEEP_WORK }, 'local')).toBe(`Custom weekly hours, ${168 - SLEEP_WORK.length} hours a week you can play (${tz})`);
  });
});
