/**
 * The PIN's slow hash `pk` (lib/pinCrypt.ts; design notes/pin-cloud-design-2026-11-17.md): PBKDF2-SHA-256 of the 6 digits,
 * salt "aaap-pin-v1:" + the player ID, 600,000 rounds, 64 lowercase hex. The collector only ever sees `pk`; the PIN and the ID never leave the browser.
 */
import { describe, expect, it } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { PIN_ROUNDS, isPin, pinKeyOf } from './pinCrypt';

const ID = 'EI1234567890123456';

describe('the PIN', () => {
  it('is exactly 6 digits: nothing else is a PIN', () => {
    expect(isPin('123456')).toBe(true);
    expect(isPin('000000')).toBe(true);
    for (const no of ['12345', '1234567', '12345a', '12 456', ' 123456', '123456 ', '', '１２３４５６', '12345.', null, undefined, 123456]) expect(isPin(no as never)).toBe(false);
  });
});

describe('pk', () => {
  it('uses 600,000 rounds', () => {
    expect(PIN_ROUNDS).toBe(600_000);
  });
  it('matches an independent PBKDF2 of the digits with the salt "aaap-pin-v1:" + the ID (contract pin)', async () => {
    const want = pbkdf2Sync('123456', 'aaap-pin-v1:' + ID, PIN_ROUNDS, 32, 'sha256').toString('hex');
    expect(await pinKeyOf('123456', ID)).toBe(want);
    expect(want).toMatch(/^[0-9a-f]{64}$/);
  }, 30_000);
  it('the ID is trimmed and upper-cased as the account key does', async () => {
    expect(await pinKeyOf('123456', `  ${ID.toLowerCase()} `, 1000)).toBe(await pinKeyOf('123456', ID, 1000));
  });
  it('another PIN, another ID or another round count gives another pk', async () => {
    const a = await pinKeyOf('123456', ID, 1000);
    expect(await pinKeyOf('123457', ID, 1000)).not.toBe(a);
    expect(await pinKeyOf('123456', 'EI6543210987654321', 1000)).not.toBe(a);
    expect(await pinKeyOf('123456', ID, 1001)).not.toBe(a);
  });
  it('refuses a bad PIN or no ID before any work', async () => {
    await expect(pinKeyOf('12345', ID, 1000)).rejects.toThrow();
    await expect(pinKeyOf('abcdef', ID, 1000)).rejects.toThrow();
    await expect(pinKeyOf('123456', '  ', 1000)).rejects.toThrow();
  });
  it('is not the account key k, nor the calendar-link key: the collector, which sees k, learns nothing about pk', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('aaap-follow-v1:' + ID));
    const k = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    expect(await pinKeyOf('123456', ID, 1000)).not.toBe(k);
  });
});
