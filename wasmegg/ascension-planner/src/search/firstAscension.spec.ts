import { describe, expect, it } from 'vitest';
import {
  CONTINUE_START_WINDOW_SECONDS,
  firstAscensionAt,
  firstAscensionFromFlags,
  firstAscensionFromTag,
  firstAscensionTag,
  forceContinueOf,
  fromClassicOverride,
  readFirstAscension,
  readFirstAscensionOrNull,
} from './firstAscension';

describe('reading the setting from any record', () => {
  it('takes the new field first', () => {
    expect(readFirstAscension({ firstAscension: 'fresh', forceContinue: true })).toBe('fresh');
    expect(readFirstAscension({ firstAscension: 'auto' })).toBe('auto');
  });

  it('reads the old boolean: true is Continue Asc., false is Fastest', () => {
    expect(readFirstAscension({ forceContinue: true })).toBe('continue');
    expect(readFirstAscension({ forceContinue: false })).toBe('auto');
  });

  it('falls back when there is neither, or junk', () => {
    expect(readFirstAscension({})).toBe('auto');
    expect(readFirstAscension(null)).toBe('auto');
    expect(readFirstAscension({ firstAscension: 'later' })).toBe('auto');
    expect(readFirstAscensionOrNull({})).toBeNull();
    expect(readFirstAscensionOrNull({ firstAscension: 'later', forceContinue: 'yes' })).toBeNull();
  });

  it('writes the old boolean for old readers', () => {
    expect([forceContinueOf('auto'), forceContinueOf('continue'), forceContinueOf('fresh')]).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe("Classic's one-hour rule", () => {
  const now = 1_800_000_000;
  it('keeps the setting for a plan starting now, in the past, or within the hour', () => {
    // 1.8 h back is the alt run of 9 Oct (plan start 1:47 pm, run at 3:33 pm): it kept "auto".
    for (const start of [now - 86400, now - 1.8 * 3600, now, now + CONTINUE_START_WINDOW_SECONDS]) {
      expect(firstAscensionAt('continue', start, now)).toBe('continue');
      expect(firstAscensionAt('auto', start, now)).toBe('auto');
    }
  });

  it('starts fresh when the plan starts more than an hour from now', () => {
    expect(firstAscensionAt('continue', now + CONTINUE_START_WINDOW_SECONDS + 1, now)).toBe('fresh');
    expect(firstAscensionAt('auto', now + 2 * 86400, now)).toBe('fresh');
    expect(firstAscensionAt('fresh', now + 2 * 86400, now)).toBe('fresh');
  });
});

describe("Classic's A1 dropdown", () => {
  it('reads Continue Asc. as continue, any build as Prestige Now, nothing as no say', () => {
    expect(fromClassicOverride('continue')).toBe('continue');
    expect(fromClassicOverride('2-sale')).toBe('fresh');
    expect(fromClassicOverride('3-sale-tier13')).toBe('fresh');
    expect(fromClassicOverride(undefined)).toBeNull();
  });
});

describe('fingerprint tags', () => {
  it("keep the boolean's old tags for continue and auto, and add fresh", () => {
    expect(firstAscensionTag('continue')).toBe('fc');
    expect(firstAscensionTag('auto')).toBe('auto');
    expect(firstAscensionTag('fresh')).toBe('fresh');
    for (const m of ['auto', 'continue', 'fresh'] as const) expect(firstAscensionFromTag(firstAscensionTag(m))).toBe(m);
  });
});

describe('command-line flags', () => {
  const flags =
    (...set: string[]) =>
    (f: string) =>
      set.includes(f);
  it('defaults to auto, reads the old pair, and lets --first-ascension decide', () => {
    expect(firstAscensionFromFlags(undefined, flags())).toBe('auto');
    expect(firstAscensionFromFlags(undefined, flags('force-continue'))).toBe('continue');
    expect(firstAscensionFromFlags(undefined, flags('no-force-continue'))).toBe('auto');
    expect(firstAscensionFromFlags('fresh', flags('force-continue'))).toBe('fresh');
    expect(() => firstAscensionFromFlags('sometimes', flags())).toThrow(/auto, continue or fresh/);
  });
});
