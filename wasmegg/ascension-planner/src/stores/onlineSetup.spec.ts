/**
 * Your setup read back from online, put in place in one go (crash2, 26 Oct 2026; stores/chainSearch.ts
 * `applyOnlineSetup`, called by stores/prefs.ts). In a fresh browser the whole Setup (awake hours, time off, no-prestige
 * days, the time zone) lands after the page has drawn, while the instant answer is up. Checked first, the time zone
 * before the dates read in it, every field muted (no `sync` watcher takes a half-applied Setup for the player's edit),
 * remembered in this browser once. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { watch } from 'vue';
import { useChainSearchStore } from './chainSearch';
import { useAutoPlannerStore } from './autoPlanner';
import { hashID } from '@/lib/storage/db';
import { setupKey } from '@/lib/setupMemory';
import { isKnownZone, setupFromCloud, type CloudSetup } from '@/lib/prefsCloud';

const A = 'EI1234567890123456';
let mem: Map<string, string>;
let writes: string[];

beforeEach(() => {
  mem = new Map();
  writes = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k.startsWith('aap-setup')) writes.push(k);
      mem.set(k, v);
    },
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-26T18:00:00Z'));
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Jordan's Setup (26 Oct 2026): 7 am to 11 pm every day, a no-prestige day Oct 27, time off Oct 29 to 30. */
const JORDAN: CloudSetup = {
  at: Date.UTC(2026, 9, 26, 17),
  hours: { start: '07:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6], scheduleEnabled: true },
  timeOff: [{ from: '2026-10-29', to: '2026-10-30' }],
  noPrestigeDays: [{ from: '2026-10-27', to: '2026-10-27' }],
  targetTE: null,
  timezone: 'America/Denver',
};

describe('applyOnlineSetup', () => {
  it('the time zone is in place before the hours, time off and no-prestige days arrive', async () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    planner.timezone = 'Europe/London';
    await store.loadSetupFor(A);
    const seen: string[] = [];
    watch(() => store.timeOff, () => seen.push(`timeOff in ${planner.timezone}`), { flush: 'sync' });
    watch(() => store.noPrestige, () => seen.push(`noPrestige in ${planner.timezone}`), { flush: 'sync' });
    watch(() => store.availability, a => seen.push(`hours in ${a?.timezone}`), { flush: 'sync' });
    expect(store.applyOnlineSetup(setupFromCloud(JORDAN))).toBe(true);
    expect(seen).toContain('timeOff in America/Denver');
    expect(seen).toContain('noPrestige in America/Denver');
    expect(seen.filter(s => s.startsWith('hours'))).not.toContain('hours in Europe/London');
    expect(store.availability).toEqual({ days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 23, timezone: 'America/Denver' });
    expect(store.timeOff).toEqual([{ from: '2026-10-29', to: '2026-10-30' }]);
    expect(store.noPrestige).toEqual([{ from: '2026-10-27', to: '2026-10-27' }]);
  });

  it('muted while it lands: no field is a player edit on its own; remembered here once, every group together', async () => {
    const store = useChainSearchStore();
    await store.loadSetupFor(A);
    const mutedAt: boolean[] = [];
    watch(
      () => [store.scheduleEnabled, store.availableFrom, store.availableTo, store.availableDays, store.timeOff, store.noPrestige],
      () => mutedAt.push(store.setupMuted()),
      { flush: 'sync', deep: true }
    );
    store.applyOnlineSetup(setupFromCloud(JORDAN));
    expect(mutedAt.length).toBeGreaterThan(0);
    expect(mutedAt.every(Boolean)).toBe(true);
    // Hold shifts isn't synced: a code-set "hours on" doesn't turn it on or off.
    expect(store.deferShifts).toBe(true);
    vi.advanceTimersByTime(1000);
    const key = setupKey(await hashID(A));
    expect(writes).toEqual([key]);
    const blob = JSON.parse(mem.get(key)!);
    expect(blob.hours).toEqual({ on: true, from: 7, to: 23, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(blob.timeOff).toEqual([{ from: '2026-10-29', to: '2026-10-30' }]);
    expect(blob.noPrestige).toEqual([{ from: '2026-10-27', to: '2026-10-27' }]);
  });

  it('checked first: an unknown time zone, an hour out of range and odd days are left out', async () => {
    const store = useChainSearchStore();
    const planner = useAutoPlannerStore();
    planner.timezone = 'America/Denver';
    await store.loadSetupFor(A);
    store.availableFrom = 9;
    expect(isKnownZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownZone('America/Denver')).toBe(true);
    store.applyOnlineSetup({ timezone: 'Mars/Olympus_Mons', fromHour: 25, toHour: 23, days: [9, 1, 1, 3], scheduleEnabled: true });
    expect(planner.timezone).toBe('America/Denver');
    expect(store.availableFrom).toBe(9);
    expect(store.availableTo).toBe(23);
    expect(store.availableDays).toEqual([1, 3]);
    // Nothing new: nothing changes, nothing written.
    vi.advanceTimersByTime(1000);
    const before = writes.length;
    expect(store.applyOnlineSetup({ fromHour: 9, toHour: 23, days: [1, 3], scheduleEnabled: true })).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(writes.length).toBe(before);
  });
});
