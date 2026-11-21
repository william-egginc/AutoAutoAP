/** The exact line's options and key (R10 option C): defaults until Jordan decides, and a key that changes with anything the answer depends on. */
import { describe, expect, it } from 'vitest';
import { EXACT_HOURS, exactDisabled, exactTriggerFor, instantExactKey } from './exactOptions';

const base = {
  rawBackup: { eiUserId: 'EI1234567890123456' },
  backupTime: 1800000000,
  chain: [226, 250, 490],
  hours: null,
  deferShifts: true,
  firstAscension: 'auto',
  deadline: null,
  planStart: 1800000100,
};

describe('options', () => {
  it('any hours, automatic on desktop and a button on a phone', () => {
    expect(EXACT_HOURS).toBe('anyHours');
    expect(exactTriggerFor(false)).toBe('auto');
    expect(exactTriggerFor(true)).toBe('manual');
  });
});

describe('the test switch (the tour picture generator sets it, as it sets __AAP_SUBMIT_URL__)', () => {
  it('off unless a page says so', () => {
    expect(exactDisabled({})).toBe(false);
    expect(exactDisabled({ __AAP_NO_EXACT__: true })).toBe(true);
    expect(exactDisabled({ __AAP_NO_EXACT__: false })).toBe(false);
  });
});

describe('instantExactKey', () => {
  it('is the same for the same inputs and carries no player ID', () => {
    expect(instantExactKey(base)).toBe(instantExactKey({ ...base }));
    expect(instantExactKey(base)).not.toMatch(/EI\d{16}/);
    expect(instantExactKey(base)).not.toContain('1234567890123456');
  });
  it.each([
    ['route', { chain: [226, 260, 490] }],
    ['save time', { backupTime: 1800000001 }],
    ['hours', { hours: { days: [], fromHour: 8, toHour: 23, timezone: 'America/Denver' } }],
    ['hold', { deferShifts: false }],
    ['first ascension', { firstAscension: 'fresh' }],
    ['deadline', { deadline: 1900000000 }],
    ['plan start', { planStart: 1800000200 }],
    ['account', { rawBackup: { eiUserId: 'EI6543210987654321' } }],
  ])('changes with the %s', (_n, patch) => expect(instantExactKey({ ...base, ...patch } as typeof base)).not.toBe(instantExactKey(base)));
});
