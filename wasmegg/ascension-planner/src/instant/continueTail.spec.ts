import { describe, expect, it } from 'vitest';
import { catchUpSeconds, hasVirtueFarm, siloSeconds, staleSaveNote } from './continueTail';

describe('continue’s catch-up and the save’s age', () => {
  it('credits the time since the sync, never more than the silos hold', () => {
    const sync = 1_800_000_000;
    expect(catchUpSeconds(sync, sync + 3600, 7200)).toBe(3600);
    expect(catchUpSeconds(sync, sync + 86400, 7200)).toBe(7200);
    expect(catchUpSeconds(sync, sync - 10, 7200)).toBe(0);
    expect(catchUpSeconds(0, sync, 7200)).toBe(0);
  });

  it('silos hold more with more silos', () => {
    expect(siloSeconds(10, 0)).toBeGreaterThan(siloSeconds(1, 0));
    expect(siloSeconds(0, 0)).toBe(siloSeconds(1, 0));
  });

  it('says nothing for a fresh save, a line for an old one, and warns past the silos', () => {
    const sync = 1_800_000_000;
    expect(staleSaveNote(sync, sync + 600, 7200)).toBeNull();
    expect(staleSaveNote(sync, sync + 2 * 3600, 3 * 3600)).toMatch(/2 hours old: anything you bought/);
    expect(staleSaveNote(sync, sync + 5 * 86400, 3 * 3600)).toMatch(/5 days old, longer than your silos hold/);
    expect(staleSaveNote(null, sync, 1)).toBeNull();
  });

  it('a farm is in progress only on a virtue egg', () => {
    const farm = { eggType: 50 } as Parameters<typeof hasVirtueFarm>[0];
    expect(hasVirtueFarm(farm)).toBe(true);
    expect(hasVirtueFarm({ ...farm!, eggType: 1 })).toBe(false);
    expect(hasVirtueFarm(null)).toBe(false);
  });
});
