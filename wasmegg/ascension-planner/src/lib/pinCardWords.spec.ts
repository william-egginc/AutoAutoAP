/** The PIN card's placeholder words: every refusal the account can give has a line, waits read in seconds, minutes, hours, and nothing says "this device". */
import { describe, expect, it } from 'vitest';
import * as W from './pinCardWords';
import type { PinFail } from './pinCloud';

const FAILS: PinFail[] = ['wrong', 'limit', 'exists', 'nopin', 'cooldown', 'session', 'rejected', 'off', 'offline', 'error'];

describe('every refusal has a plain line', () => {
  it('each code reads, none is empty, and no error is no line', () => {
    for (const f of FAILS) expect(W.pinErrorLine(f, null).length).toBeGreaterThan(5);
    expect(W.pinErrorLine('', null)).toBe('');
  });
  it('limit and cooldown name the wait', () => {
    expect(W.pinErrorLine('limit', 3600)).toContain('1 hour');
    expect(W.pinErrorLine('limit', 600)).toContain('10 minutes');
    expect(W.pinErrorLine('limit', 30)).toContain('30 seconds');
    expect(W.pinErrorLine('cooldown', 7200)).toContain('2 hours');
    expect(W.pinErrorLine('limit', null)).toContain('a while');
  });
});

describe('the words', () => {
  const all = Object.values(W).filter(v => typeof v === 'string') as string[];
  it('never say "this device" or "this computer", and use no 24-hour clock time', () => {
    for (const s of all) {
      expect(s).not.toMatch(/this device|this computer/i);
      expect(s).not.toMatch(/\b([01]?\d|2[0-3]):[0-5]\d\b(?! ?[AP]M)/);
    }
  });
  it('the banner names the date it was given, the revoked note counts links', () => {
    expect(W.pinResetBanner('Nov 28, 2026, 9:00 AM')).toContain('Nov 28, 2026, 9:00 AM');
    expect(W.pinRevokedNote(1)).toMatch(/link was/);
    expect(W.pinRevokedNote(3)).toMatch(/3 calendar links were/);
  });
});
