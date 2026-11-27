/**
 * A pending calendar upload for account A never goes to B's calendar after a player switch (code review 22 Nov 2026,
 * rel-state-2): each account's feed sends only while that account is on screen (and its key was made for it, as
 * useOverrideSync's target already checks since R5.1). One change covers flush, saveLink, checkSaved and revokeAll.
 * Placeholder IDs only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';

const target = { url: 'https://collector.example/sync', k: 'c'.repeat(64) };
vi.mock('./useOverrideSync', async orig => ({ ...(await orig<typeof import('./useOverrideSync')>()), syncTarget: () => target }));
import { calendarTargetFor } from './useCalendarFeed';

const A = 'EI1234567890123456';
const B = 'EI9876543210987654';

beforeEach(() => {
  setActivePinia(createPinia());
  useInitialStateStore().rawBackup = { eiUserId: A } as never;
});

describe('calendarTargetFor', () => {
  it('A on screen: A’s feed has its target', () => {
    expect(calendarTargetFor(accountOf({ eiUserId: A }))()).toEqual(target);
  });
  it('B loaded: A’s feed has none (its upload waiting in the 10 s is not sent under B’s key), B’s has it', () => {
    const forA = calendarTargetFor(accountOf({ eiUserId: A }));
    useInitialStateStore().rawBackup = { eiUserId: B } as never;
    expect(forA()).toBeNull();
    expect(calendarTargetFor(accountOf({ eiUserId: B }))()).toEqual(target);
  });
  it('the feeds use it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, 'useCalendarFeed.ts'), 'utf8');
    expect(src).toMatch(/target: calendarTargetFor\(account\)/);
  });
});
