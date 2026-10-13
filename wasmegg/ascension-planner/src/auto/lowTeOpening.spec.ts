/**
 * LOW-TE GATE (temporary until Joo's PR 717 merges): the gate's rule and the instant answer's label,
 * without the simulator. The real-save checks are in lowTeOpening.save.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import type { EngineState, SimulationContext } from './types';
import {
  habsMaxed,
  LOW_TE_STALL_SECONDS,
  LOW_TE_TABLE_FLOOR,
  lowTeCandidate,
  onLowTePath,
  tagShiftName,
  wantsLowTeOpening,
} from './lowTeOpening';
import { lowTeOpeningNote } from '@/search/instantIntegrity';
import type { Action } from '@/types/actions/meta';

const ctx = (o: Partial<SimulationContext> = {}) => o as SimulationContext;
const at = (te: number) => ({ te }) as EngineState;

describe('the low-TE gate', () => {
  it('only considers builds that start below the lowest TE any table covers', () => {
    expect(LOW_TE_TABLE_FLOOR).toBe(120);
    expect(lowTeCandidate(ctx(), at(93))).toBe(true);
    expect(lowTeCandidate(ctx(), at(119))).toBe(true);
    expect(lowTeCandidate(ctx(), at(120))).toBe(false);
    expect(lowTeCandidate(ctx(), at(400))).toBe(false);
  });

  it("switches only when the current opening stalls on I1 past Joo's 4-hour cap", () => {
    expect(LOW_TE_STALL_SECONDS).toBe(4 * 3600);
    expect(wantsLowTeOpening(ctx(), 54 * 60)).toBe(false);
    expect(wantsLowTeOpening(ctx(), 4 * 3600)).toBe(false);
    expect(wantsLowTeOpening(ctx(), 4 * 3600 + 1)).toBe(true);
  });

  it('can be forced either way for tests and probes', () => {
    expect(lowTeCandidate(ctx({ lowTeOpening: 'never' }), at(75))).toBe(false);
    expect(lowTeCandidate(ctx({ lowTeOpening: 'force' }), at(400))).toBe(true);
    expect(wantsLowTeOpening(ctx({ lowTeOpening: 'force' }), 0)).toBe(true);
    expect(wantsLowTeOpening(ctx({ lowTeOpening: 'never' }), 1e9)).toBe(false);
  });

  it('marks the path on the state and names shifts', () => {
    expect(onLowTePath({} as EngineState)).toBe(false);
    expect(onLowTePath({ lowTeOpening: 3 } as EngineState)).toBe(true);
    expect(habsMaxed({ habIds: [18, 18, 18, 18] } as EngineState)).toBe(true);
    expect(habsMaxed({ habIds: [18, 17, 18, 18] } as EngineState)).toBe(false);
    const actions = [
      { type: 'buy_hab', payload: {} },
      { type: 'shift', payload: { toEgg: 'integrity' } },
    ] as unknown as Action[];
    tagShiftName(actions, 'I1');
    expect((actions[1].payload as { autoShiftName?: string }).autoShiftName).toBe('I1');
  });
});

describe("the instant answer's low-TE label", () => {
  it('says nothing for the standard opening', () => {
    expect(lowTeOpeningNote(null)).toBe('');
    expect(lowTeOpeningNote({ rounds: 0, openingSeconds: 0 })).toBe('');
  });

  it('names the rounds and the opening, and that Check exactly prices it', () => {
    const note = lowTeOpeningNote({ rounds: 3, openingSeconds: 15 * 3600 });
    expect(note).toContain('3 times');
    expect(note).toContain('15.0 hours');
    expect(note).toContain('Check exactly prices the low-TE opening');
  });
});
