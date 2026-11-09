/**
 * The sim4 bump (9 Nov 2026, Joo's PR #729: delivery research planned as a set, standard permit, the research sale
 * on sim time) works the same way as the sim3 one below; only the two names moved.
 *
 * The sim3 bump (3 Nov 2026: the Bust Unions fix, multi-level delivery research, own-egg
 * build-up purchases, K2's 24-hour budget and the 60 s rule): one SIM_VERSION, a new INSTANT_RULES
 * so saved instant answers are worked out again, and the simulator in the checkpoint fingerprint so
 * a checkpoint priced by an older simulator does not resume as if current.
 */
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from './simVersion';
import { INSTANT_RULES } from './instantTables';
import { fingerprintChanges, fingerprintRun, fingerprintSettings } from './persistence';

describe('the simulator bump (sim3, then sim4)', () => {
  it('SIM_VERSION and INSTANT_RULES move', () => {
    expect(SIM_VERSION).toBe('2026-11-09-sim4');
    expect(INSTANT_RULES).toBe('2026-11-09-sim4');
  });

  it('the checkpoint fingerprint carries the simulator, and a change of it is named', () => {
    const base = { playerId: 'p', planStart: 1_790_000_123, currentTE: 147, final: 490, forceContinue: true };
    const fp = fingerprintRun(base);
    expect(fp.split('|')).toContain(`sim:${SIM_VERSION}`);
    const older = fp.replace(`sim:${SIM_VERSION}`, 'sim:2026-10-21-egg-beta2');
    expect(fingerprintChanges(older, fp)).toEqual(['the simulator changed']);
    expect(fingerprintSettings(fp)?.availability).toBeNull();
  });
});
