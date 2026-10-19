/** exactInputs.ts: Joo's rollUpPendingTE as arithmetic on copies (no store written). */
import { describe, expect, it } from 'vitest';
import { rolledUp } from './exactInputs';

describe('rolledUp (his rollUpPendingTE on copies)', () => {
  it('pending TE added to the initial TE (capped at 98); other eggs keep the store’s TE', () => {
    const pending = { curiosity: 2, kindness: 0, humility: 5 };
    const initialTeEarned = { curiosity: 30, kindness: 40, humility: 95 };
    const teEarned = { curiosity: 30, kindness: 41, humility: 95 };
    const eggsDelivered = { curiosity: 1e15, kindness: 2e15, humility: 3e15 };
    const r = rolledUp({ pending, initialTeEarned, teEarned, eggsDelivered });
    expect(r.teEarned).toEqual({ curiosity: 32, kindness: 41, humility: 98 });
    expect(r.te).toBe(171);
    expect(r.eggsDelivered).toEqual(eggsDelivered);
    expect(r.eggsDelivered).not.toBe(eggsDelivered);
    // Nothing given was changed.
    expect(teEarned).toEqual({ curiosity: 30, kindness: 41, humility: 95 });
    expect(pending.curiosity).toBe(2);
  });
});
