import { describe, expect, it } from 'vitest';
import {
  CONTINUE_MAX_SECONDS,
  CONTINUE_PIN_MAX_SECONDS,
  CONTINUE_WARN_SECONDS,
  INTEGRITY_BLOCK_SECONDS,
  INTEGRITY_WARN_SECONDS,
  describeDuration,
  integrityMessage,
} from './rules';

describe('the rules, as decided', () => {
  it('pins continue under a week, warns past three months, and drops it past six', () => {
    expect(CONTINUE_PIN_MAX_SECONDS).toBe(7 * 86400);
    expect(CONTINUE_WARN_SECONDS).toBe(90 * 86400);
    expect(CONTINUE_MAX_SECONDS).toBe(183 * 86400);
  });

  it('warns on an Integrity wait past an hour and refuses past a week', () => {
    expect(INTEGRITY_WARN_SECONDS).toBe(3600);
    expect(INTEGRITY_BLOCK_SECONDS).toBe(7 * 86400);
    expect(integrityMessage(2 * 3600)).toMatch(/2\.0 hours/);
    expect(integrityMessage(2 * 3600)).not.toMatch(/will not start/);
    expect(integrityMessage(483 * 86400)).toMatch(/483 days/);
    expect(integrityMessage(483 * 86400)).toMatch(/will not start/);
  });
});

describe('describeDuration', () => {
  it('picks the unit a person would', () => {
    expect(describeDuration(30)).toBe('1 minute');
    expect(describeDuration(38 * 60)).toBe('38 minutes');
    expect(describeDuration(5.2 * 3600)).toBe('5.2 hours');
    expect(describeDuration(12 * 86400)).toBe('12 days');
    expect(describeDuration(87.1 * 365.25 * 86400)).toBe('87.1 years');
    expect(describeDuration(Infinity)).toBe('forever');
  });
});
