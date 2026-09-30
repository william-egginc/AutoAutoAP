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
    expect(integrityMessage(2 * 3600)).not.toMatch(/won't start/);
    expect(integrityMessage(483 * 86400)).toMatch(/483 days/);
    expect(integrityMessage(483 * 86400)).toMatch(/won't start/);
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

describe('what a blocked account needs, in its own numbers', () => {
  it('says how short it is and what each fix is worth for it', async () => {
    const { integrityMessage } = await import('./rules');
    const msg = integrityMessage(309 * 86400, {
      total: 172,
      te: 87,
      gear: 91.4,
      colleggtibles: -3.1,
      lab: 0,
      permit: -7.3,
    });
    expect(msg).toMatch(
      /Clothed TE is about 172 \(87 TE, earnings gear \+91\.4, colleggtibles -3\.1, standard permit -7\.3\)/
    );
    expect(msg).toMatch(/about 53 short/);
    expect(msg).toMatch(/about 53 more Truth Eggs/);
    expect(msg).toMatch(/up to \+37\.3 there/);
    expect(msg).toMatch(/colleggtibles: up to \+3\.1/);
    expect(msg).toMatch(/the Pro permit: \+7\.3/);
    expect(msg).not.toMatch(/Lab Upgrade/);
    expect(msg).toMatch(/won't start/);
  });

  it('keeps the general advice when nothing is known about the account', async () => {
    const { integrityMessage } = await import('./rules');
    expect(integrityMessage(309 * 86400)).toMatch(/Clothed TE of about 225/);
  });
});

describe('an account past the usual line but still blocked', () => {
  it('asks to hear about it instead of telling it to come back', async () => {
    const { integrityMessage } = await import('./rules');
    const msg = integrityMessage(483 * 86400, {
      total: 263.4,
      te: 137,
      gear: 126.4,
      colleggtibles: 0,
      lab: 0,
      permit: 0,
    });
    expect(msg).toMatch(/already past the usual line/);
    expect(msg).toMatch(/share this on Discord/);
    expect(msg).not.toMatch(/come back/);
  });
});

describe('the message, with its two key phrases picked out', () => {
  it('bolds the wait and "Nobody really waits that long", and loses no text', async () => {
    const { integrityMessage, integrityHighlights } = await import('./rules');
    const text = integrityMessage(483 * 86400);
    const parts = integrityHighlights(text, 483 * 86400);
    expect(parts.map(p => p.text).join('')).toBe(text);
    expect(parts.filter(p => p.bold).map(p => p.text)).toEqual(['483 days', 'Nobody really waits that long']);
  });
});
