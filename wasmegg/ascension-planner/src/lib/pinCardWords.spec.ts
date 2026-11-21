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

describe('waits up to a day or a week (collector 52ec1142a: the true time left, up to about 24 h, a reset cooldown up to 7 days)', () => {
  it.each([
    [30, '30 seconds'],
    [89, '89 seconds'],
    [600, '10 minutes'],
    [3599, 'about 60 minutes'],
    [3600, '1 hour'],
    [3601, 'about 2 hours'],
    [5400, 'about 2 hours'],
    [7200, '2 hours'],
    [17000, 'about 5 hours'],
    [18000, '5 hours'],
    [86400, '24 hours'],
    [90000, '25 hours'],
    [90001, 'about 26 hours'],
    [172799, 'about 48 hours'],
    [172800, '2 days'],
    [200000, 'about 3 days'],
    [604800, '7 days'],
    [601000, 'about 7 days'],
  ])('%i seconds reads as %s', (s, text) => expect(W.pinWait(s)).toBe(text));
  it('never says "1 hour" or "1 day" unless it is exactly that', () => {
    for (const s of [3601, 4000, 5000]) expect(W.pinWait(s)).not.toMatch(/\b1 hour/);
    for (const s of [86401, 100000]) expect(W.pinWait(s)).not.toMatch(/\b1 day/);
  });
  it('the limit and cooldown lines carry it', () => {
    expect(W.pinErrorLine('limit', 18000)).toContain('5 hours');
    expect(W.pinErrorLine('cooldown', 172800)).toContain('2 days');
    expect(W.pinErrorLine('cooldown', 200000)).toContain('about 3 days');
  });
});

