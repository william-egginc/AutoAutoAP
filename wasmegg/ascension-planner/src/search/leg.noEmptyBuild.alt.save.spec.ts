/**
 * NO EMPTY BUILD-UP on Jordan's alt (spec-noemptybuild, 31 Oct 2026; aaap-tools notes/continue-order-2026-10-31.md):
 * the save of Oct 31, 2026 (scrubbed, read where it is, never copied), on Kindness at 146 TE wearing its production set,
 * with nothing left to buy. Plan start Oct 31, 3:09 pm Mountain, goal 166 TE, no hours.
 *
 * Measured before the fix (Reliability's notes, and this spec on cca35261): the build-up A1 bought nothing and was
 * 6 shifts (K->C at once, H, K, C, I, R), 38.59Q of soul eggs, ending Dec 13, 10:50 am; My runs' unfinished-build
 * simulation (continue left out, useNowPage.ts `continueMaxSeconds` 0) took it. Continue is 3 shifts (K->I at K33,
 * I->C, C->R), 17.82Q, ending Dec 12, 10:50 am (Mountain), as Wonky says. Now every setting that builds up gives
 * continue, and the build-up is no option at all (no variant, no instant-answer tails).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1 (about half a minute when it runs):
 *   AAP_SLOW_SPECS=1 npx vitest run src/search/leg.noEmptyBuild.alt.save.spec.ts
 * Another copy of the save: ALT_SAVE=/path/to/save.json.
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { buildUpTailParams, buildUpVariantForCheck, continueVariantForCheck, runLeg } from './leg';
import type { SearchInputs } from './types';

const SAVE = process.env.ALT_SAVE ?? join(homedir(), 'code/aaap-tools/saves/alt-2026-10-31-1512.json');
const hasSave = existsSync(SAVE);

/** Oct 31, 2026, 3:09 pm Mountain (MDT). */
const START = Math.floor(Date.parse('2026-10-31T21:09:00Z') / 1000);
const GOAL = 166;
/** Dec 12, 2026, 10:50 am Mountain (MST): continue's end, measured (Reliability's notes and this spec agree). */
const CONTINUE_END = 1797097806;
/** Dec 13, 2026, 10:50 am Mountain: the empty build-up's end before the fix (for the record; no longer simulated). */
const EMPTY_BUILDUP_END_BEFORE = 1797184206;
/** Soul eggs in Jordan's Q (the game's quadrillion of soul eggs counts 1e18 here, notes/continue-order). */
const Q = 1e18;

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Jordan's alt: the build-up buys nothing, so A1 is continue", () => {
  let base: SearchInputs;

  beforeAll(async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-31T21:12:00Z'), toFake: ['Date'] });
    setActivePinia(createPinia());
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    // Never a real player ID in anything this spec prints.
    backup.eiUserId = 'EI0000000000000000';
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useChainSearchStore();
    store.setFirstAscension('auto');
    store.continueStartRule = false;
    store.pinPlanStart(START);
    base = store.collectInputs();
  }, 600_000);
  afterAll(() => vi.useRealTimers());

  const state = () => JSON.parse(JSON.stringify(base.baseState));
  const leg = (extra: Partial<SearchInputs>) => {
    const inputs = { ...base, ...extra } as SearchInputs;
    return runLeg(inputs, state(), inputs.planStart, GOAL, true, Math.floor(inputs.currentTE), 0);
  };

  it('continue: 3 shifts (Kindness to its next TE first), 17.82Q, Dec 12, 10:50 am', () => {
    const c = continueVariantForCheck(base, state(), base.planStart, GOAL, 0)!;
    const shifts = c.actions.filter(a => a.type === 'shift');
    expect(shifts.map(a => (a.payload as { toEgg: string }).toEgg)).toEqual(['integrity', 'curiosity', 'resilience']);
    expect((shifts[0].payload as { fromEgg: string }).fromEgg).toBe('kindness');
    const se = shifts.reduce((n, a) => n + ((a as unknown as { cost: number }).cost || 0), 0);
    expect(se / Q).toBeCloseTo(17.82, 2);
    expect(Math.floor(c.summary.endTime)).toBe(CONTINUE_END);
  });

  it('the build-up is no option: no variant, and no tails for the instant answer', () => {
    expect(buildUpVariantForCheck(base, state(), base.planStart, GOAL, 0, Math.floor(base.currentTE))).toBeNull();
    expect(buildUpTailParams(base, base.planStart)).toEqual([]);
  });

  it("A1 is continue (3 shifts, Dec 12, 10:50 am) under Fastest, Continue my build-up and My runs' unfinished build", () => {
    const settings = [
      { firstAscension: 'auto' },
      { firstAscension: 'buildup' },
      { firstAscension: 'buildup', continueMaxSeconds: 0 },
    ] as const;
    const legs = settings.map(extra => leg(extra)!);
    // Before the fix the unfinished build's took the empty build-up: 6 shifts to Dec 13, 10:50 am.
    expect(legs.map(r => r.key)).toEqual(['continue', 'continue', 'continue']);
    for (const r of legs) {
      expect(r.key).toBe('continue');
      expect(r.shifts).toHaveLength(3);
      expect(r.shifts.map(s => s.egg)).toEqual(['integrity', 'curiosity', 'resilience']);
      expect(Math.floor(r.summary.endTime)).toBe(CONTINUE_END);
      expect(Math.floor(r.summary.endTime)).toBeLessThan(EMPTY_BUILDUP_END_BEFORE);
      expect(r.firstLegEnds?.buildup).toBeUndefined();
    }
  }, 600_000);
});
