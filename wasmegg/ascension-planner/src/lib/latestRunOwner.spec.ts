/** Whose run it is (lib/latestRunOwner.ts), for My runs › Your latest run. */
import { describe, expect, it } from 'vitest';
import { runIsMine } from './latestRunOwner';
import { accountHash, accountHashNow } from './accountHash';

describe('runIsMine', () => {
  it('the run is shown only on the account it is tagged with', () => {
    expect(runIsMine({ owner: 'a', here: 'a' })).toBe(true);
    expect(runIsMine({ owner: 'a', here: 'b' })).toBe(false);
  });
  it('unknown on either side: not shown', () => {
    expect(runIsMine({ owner: '', here: 'a' })).toBe(false);
    expect(runIsMine({ owner: 'a', here: '' })).toBe(false);
  });
  it("a save of another account than the loaded one: not shown; unknown save accounts don't block", () => {
    expect(runIsMine({ owner: 'a', here: 'a', saveAccount: 's1', nowAccount: 's2' })).toBe(false);
    expect(runIsMine({ owner: 'a', here: 'a', saveAccount: 's1', nowAccount: 's1' })).toBe(true);
    expect(runIsMine({ owner: 'a', here: 'a', saveAccount: 's1' })).toBe(true);
    expect(runIsMine({ owner: 'a', here: 'a', nowAccount: 's2' })).toBe(true);
  });
});

describe('accountHash', () => {
  it('a SHA-256 hex, remembered for synchronous reads; never the ID itself', async () => {
    expect(accountHashNow('EI1234567890123456')).toBe('');
    const h = await accountHash(' EI1234567890123456 ');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('1234567890123456');
    expect(accountHashNow('EI1234567890123456')).toBe(h);
    expect(await accountHash('EI0000000000000000')).not.toBe(h);
    expect(await accountHash('')).toBe('');
  });
});
