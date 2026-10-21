/**
 * The opening switch (auto/lowTeOpening.ts) and the instant answer's label, without the simulator.
 * The real-save checks are in lowTeOpening.save.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import type { EngineState, SimulationContext } from './types';
import { DEFAULT_OPENING_FALLBACK, MAX_OPENING_ROUNDS, onLowTePath, openingFallback } from './lowTeOpening';
import { habsMaxed } from './shifts/i1';
import { tagShiftName } from './ascension';
import { lowTeOpeningNote } from '@/search/instantIntegrity';
import type { Action } from '@/types/actions/meta';

const ctx = (o: Partial<SimulationContext> = {}) => o as SimulationContext;

describe('the opening switch', () => {
  it("defaults to PR 717's rounds, and a run can ask for Joo's v2 openings", () => {
    expect(DEFAULT_OPENING_FALLBACK).toBe('rounds');
    expect(openingFallback(ctx())).toBe('rounds');
    expect(openingFallback(ctx({ openingFallback: 'v2' }))).toBe('v2');
    expect(openingFallback(ctx({ openingFallback: 'rounds' }))).toBe('rounds');
    expect(MAX_OPENING_ROUNDS).toBe(10);
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
