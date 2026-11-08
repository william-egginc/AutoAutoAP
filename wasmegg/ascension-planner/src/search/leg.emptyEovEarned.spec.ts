/**
 * QA review 7 Nov 2026, finding #10 (LOW): `claimedTEEarned`'s fallback (the base state's TE, claimed + pending) fired
 * whenever `virtue.eovEarned` was EMPTY, not only when the save had no virtue block (the workers' trimmed save before
 * spec-workervirtue, which is what its warning names). A save whose virtue block holds no claimed TE but eggs delivered
 * past thresholds has claimed nothing, as the game reports it: its pending TE must not earn as claimed while the banner
 * says it is "not yet claimed". Decision pinned: an empty `eovEarned` is 0 claimed per egg; only a missing block keeps
 * the base state's TE.
 */
import '../../scripts/node-shims';

import { describe, expect, it, vi } from 'vitest';
import { syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import { continueState } from './leg';

describe('a save whose virtue block has an empty eovEarned', () => {
  it('prices 0 claimed TE per egg, with its eggs past 3 thresholds each still counted (pending)', async () => {
    const inputs = await syntheticInputs(() => {
      const b = syntheticBackup();
      b.virtue.eovEarned = [];
      b.virtue.eggsDelivered = [0, 1, 2, 3, 4].map(() => TE_BREAKPOINTS[2] * 1.01); // 3 thresholds passed per egg
      return b;
    });
    // The base state has the 15 pending TE rolled in (for a plan that starts at the next prestige).
    expect(inputs.baseState.te).toBe(15);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const st = continueState(inputs, inputs.baseState as never)!;
    for (const egg of ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const) expect(st.teEarned[egg]).toBe(0);
    expect(st.te).toBe(0);
    // The eggs delivered are kept: the pending TE still count toward the stop.
    expect(st.eggsDelivered).toEqual(inputs.baseState.eggsDelivered);
    expect(warn.mock.calls.some(c => String(c[0]).includes('no virtue block'))).toBe(false);
    warn.mockRestore();
  });

  it('control: a save with no virtue block at all keeps the base state TE (the warned fallback)', async () => {
    const inputs = await syntheticInputs(() => syntheticBackup());
    const raw = { ...inputs.context.rawBackup!, virtue: undefined } as typeof inputs.context.rawBackup;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const st = continueState({ ...inputs, context: { ...inputs.context, rawBackup: raw } }, inputs.baseState as never)!;
    expect(st.te).toBe(inputs.baseState.te);
    expect(st.teEarned).toEqual(inputs.baseState.teEarned);
    vi.restoreAllMocks();
  });
});
