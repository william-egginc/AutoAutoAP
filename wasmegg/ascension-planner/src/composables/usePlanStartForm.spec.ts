/**
 * The plan start has to be set up on whichever Auto Planner screen the page opens on, not only on
 * Classic (the unified layout), and a screen switch must not put an old saved start back.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { usePlanStartForm, resetPlanStartForm } from './usePlanStartForm';
import { resetBackupPlanStart } from './useBackupPlanStart';
import { loadAutoPlannerSchedule, saveAutoPlannerSchedule } from '@/lib/autoPlannerFormCache';
import { useAutoPlannerStore } from '@/stores/autoPlanner';

function installStorageStub(): void {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, String(value)),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  });
}

describe('usePlanStartForm', () => {
  beforeEach(() => {
    installStorageStub();
    setActivePinia(createPinia());
    resetPlanStartForm();
    resetBackupPlanStart();
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 30, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('restores the start and timezone saved on the last visit, without Classic open', () => {
    saveAutoPlannerSchedule({ timezone: 'Asia/Tokyo', startDate: '2026-10-02', startTime: '09:00', targetTE: '' });
    usePlanStartForm();
    const auto = useAutoPlannerStore();
    expect([auto.timezone, auto.startDate, auto.startTime]).toEqual(['Asia/Tokyo', '2026-10-02', '09:00']);
  });

  it('saves a start changed on any screen, keeping the rest of the saved form', async () => {
    saveAutoPlannerSchedule({ timezone: 'UTC', startDate: '2026-10-02', startTime: '09:00', targetTE: '151 251 490' });
    usePlanStartForm();
    const auto = useAutoPlannerStore();
    auto.startTime = '18:30';
    await nextTick();
    expect(loadAutoPlannerSchedule()).toMatchObject({ startTime: '18:30', targetTE: '151 251 490' });
  });

  it('restores once per page, so remounting keeps what was changed since', () => {
    saveAutoPlannerSchedule({ timezone: 'UTC', startDate: '2026-10-02', startTime: '09:00', targetTE: '' });
    usePlanStartForm();
    const auto = useAutoPlannerStore();
    auto.startDate = '2026-10-05';
    usePlanStartForm();
    expect(auto.startDate).toBe('2026-10-05');
  });
});
