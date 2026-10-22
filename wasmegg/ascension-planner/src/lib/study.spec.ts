import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TICKS,
  accountStep,
  afterNo,
  afterNotThisAccount,
  afterWithdraw,
  afterWithdrawApplied,
  afterYes,
  anyTick,
  consentsFor,
  emptyStudy,
  parseStudy,
  storedStudy,
} from './study';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

describe('study record', () => {
  it('round-trips through storage', () => {
    const rec = afterYes(emptyStudy(), A, 1000, { share: true, csv: false, diag: true, checks: false }, 'name');
    expect(parseStudy(storedStudy(rec))).toEqual(rec);
  });

  it('a missing or broken record is unanswered', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{"v":2,"answer":"yes"}'])
      expect(parseStudy(raw)).toEqual(emptyStudy());
  });

  it('drops unknown fields, bad values and anything that is not a hash', () => {
    const rec = parseStudy(
      JSON.stringify({
        v: 1,
        answer: 'maybe',
        at: 'x',
        ticks: { share: 'yes', csv: false, extra: true },
        credit: 'Williamthe5thc',
        accounts: { [A]: 'yes', EI1234567890123456: 'yes', [B]: 'perhaps' },
        playerId: 'EI1234567890123456',
        name: 'Williamthe5thc',
      })
    );
    expect(rec.answer).toBeNull();
    expect(rec.at).toBe(0);
    expect(rec.ticks).toEqual({ ...DEFAULT_TICKS, csv: false });
    expect(rec.credit).toBe('anon');
    expect(rec.accounts).toEqual({ [A]: 'yes' });
    const stored = storedStudy(rec);
    expect(stored).not.toMatch(/EI\d{16}/);
    expect(stored).not.toContain('Williamthe5thc');
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['accounts', 'answer', 'at', 'credit', 'ticks', 'v']);
  });

  it('starts with every tick OFF (opt in, Jordan 21 Oct 2026) and maps each to its consent', () => {
    expect(DEFAULT_TICKS).toEqual({ share: false, csv: false, diag: false, checks: false });
    expect(emptyStudy().ticks).toEqual(DEFAULT_TICKS);
    expect(anyTick(DEFAULT_TICKS)).toBe(false);
    expect(anyTick({ ...DEFAULT_TICKS, checks: true })).toBe(true);
    expect(consentsFor({ share: true, csv: false, diag: true, checks: false })).toEqual([
      ['leaderboard', true],
      ['sendCsv', false],
      ['diagnosticsDefault', true],
      ['keepSharingChecks', false],
    ]);
  });
});

describe('accountStep', () => {
  it('unanswered: the box, for any account', () => {
    expect(accountStep(emptyStudy(), A)).toBe('ask-box');
    expect(accountStep(emptyStudy(), '')).toBe('none');
  });

  it('yes: nothing for an account that answered, the strip for a new one', () => {
    const rec = afterYes(emptyStudy(), A, 1);
    expect(accountStep(rec, A)).toBe('none');
    expect(accountStep(rec, B)).toBe('ask-strip');
    expect(accountStep(afterNotThisAccount(rec, B), B)).toBe('none');
  });

  it('no thanks: never asked again, for any account', () => {
    const rec = afterNo(emptyStudy(), 1);
    expect(accountStep(rec, A)).toBe('none');
    expect(accountStep(rec, B)).toBe('none');
  });

  it('withdrawn: the other accounts that said yes are turned off as they load, once', () => {
    let rec = afterYes(emptyStudy(), A, 1);
    rec = afterYes(rec, B, 2);
    rec = afterNotThisAccount(rec, C);
    rec = afterWithdraw(rec, A, 3);
    expect(rec.answer).toBe('withdrawn');
    expect(rec.accounts).toEqual({ [B]: 'withdraw' });
    expect(accountStep(rec, A)).toBe('none');
    expect(accountStep(rec, B)).toBe('withdraw');
    expect(accountStep(rec, C)).toBe('none');
    rec = afterWithdrawApplied(rec, B);
    expect(accountStep(rec, B)).toBe('none');
  });

  it('a yes again after a withdraw still turns the others off first, then asks them with the strip', () => {
    let rec = afterWithdraw(afterYes(afterYes(emptyStudy(), A, 1), B, 2), A, 3);
    rec = afterYes(rec, A, 4);
    expect(accountStep(rec, A)).toBe('none');
    expect(accountStep(rec, B)).toBe('withdraw');
    expect(accountStep(afterWithdrawApplied(rec, B), B)).toBe('ask-strip');
  });

  it('no thanks changes no account', () => {
    const rec = afterYes(emptyStudy(), A, 1);
    expect(afterNo(rec, 2).accounts).toEqual({ [A]: 'yes' });
  });
});
