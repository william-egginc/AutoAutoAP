import { describe, expect, it } from 'vitest';
import {
  FULL_RESEARCH_TE,
  RESEARCH_BELOW_MAX_TEXT,
  STONES_BELOW_T4_TEXT,
  earningsBonus,
  gearDiffers,
  gearDiffersText,
  tableCaveat,
  weakDeliveryStones,
} from './gearDiffers';

describe('your gear isn’t the table’s (gearDiffers)', () => {
  it('shows below TE 340 when the delivery or the earnings set is off', () => {
    expect(gearDiffers(142, { bonusShort: 0, scale: 0.936 })).toBe(true);
    expect(gearDiffers(142, { bonusShort: 2, scale: 1 })).toBe(true);
    expect(gearDiffers(339.9, { bonusShort: 0, scale: 0.99 })).toBe(true);
  });

  it('stays quiet from TE 340, and for the table’s own gear', () => {
    expect(gearDiffers(FULL_RESEARCH_TE, { bonusShort: 5, scale: 0.8 })).toBe(false);
    expect(gearDiffers(142, { bonusShort: 0.05, scale: 1.004 })).toBe(false);
  });

  it('says how far off, in a player’s words', () => {
    expect(gearDiffersText({ bonusShort: 0, scale: 0.9357 })).toMatch(/^Your gear isn’t the gear the instant answer was built on \(delivery 93\.6% of its at full research\)\./);
    expect(gearDiffersText({ bonusShort: 1.234, scale: 1 })).toContain('(earnings set 1.23 Clothed TE short, delivery 100.0%');
    expect(gearDiffersText({ bonusShort: 0, scale: 1 })).toContain('“Import into the planner” gives your own times.');
  });

  it('reads no bonus without a save', () => {
    expect(earningsBonus(null)).toBe(0);
  });
});

describe('the caveat by the table that answered (tableCaveat)', () => {
  const maxedText = gearDiffersText({ bonusShort: 1, scale: 0.9 });

  it('plain maxed keeps its gear caveat, whatever the research', () => {
    expect(tableCaveat('maxed', maxedText, true)).toBe(maxedText);
    expect(tableCaveat('maxed', maxedText, false)).toBe(maxedText);
    expect(tableCaveat('maxed', null, true)).toBeNull();
  });

  it('delivery and earnings-shifted tables say only the research sentence, when research is below max', () => {
    for (const kind of ['delivery', 'maxed-shift'] as const) {
      expect(tableCaveat(kind, maxedText, true)).toBe(RESEARCH_BELOW_MAX_TEXT);
      expect(tableCaveat(kind, null, true)).toBe(RESEARCH_BELOW_MAX_TEXT);
      expect(tableCaveat(kind, maxedText, false)).toBeNull();
    }
    expect(RESEARCH_BELOW_MAX_TEXT).toBe(
      'Your epic research or colleggtibles aren’t maxed, which these tables assume, so times can be a little off.'
    );
    expect(RESEARCH_BELOW_MAX_TEXT).not.toMatch(/earnings set|delivery/);
  });

  it('delivery stones weaker than the table’s: one sentence, after the research one when both apply', () => {
    expect(STONES_BELOW_T4_TEXT).toBe(
      'Your delivery stones are lower tier than these tables assume, so times can be a little off.'
    );
    for (const kind of ['delivery', 'maxed-shift'] as const) {
      expect(tableCaveat(kind, maxedText, false, true)).toBe(STONES_BELOW_T4_TEXT);
      expect(tableCaveat(kind, null, true, true)).toBe(`${RESEARCH_BELOW_MAX_TEXT} ${STONES_BELOW_T4_TEXT}`);
      expect(tableCaveat(kind, null, false, false)).toBeNull();
    }
    // Only on those lines: the maxed table keeps its own caveat, own tables say nothing.
    expect(tableCaveat('maxed', maxedText, true, true)).toBe(maxedText);
    expect(tableCaveat('maxed', null, false, true)).toBeNull();
    expect(tableCaveat('account', null, true, true)).toBeNull();
    expect(tableCaveat('gear', null, false, true)).toBeNull();
  });

  it('weak stones: any below T4, or the delivery scale under 0.995', () => {
    expect(weakDeliveryStones(true, 1)).toBe(true);
    expect(weakDeliveryStones(false, 0.994)).toBe(true);
    expect(weakDeliveryStones(false, 0.995)).toBe(false);
    expect(weakDeliveryStones(undefined, 1)).toBe(false);
    expect(weakDeliveryStones(false, 1.0000000001)).toBe(false);
  });

  it('account and exact-gear tables say nothing', () => {
    for (const kind of ['account', 'gear'] as const) {
      expect(tableCaveat(kind, maxedText, true)).toBeNull();
      expect(tableCaveat(kind, null, false)).toBeNull();
    }
  });
});
