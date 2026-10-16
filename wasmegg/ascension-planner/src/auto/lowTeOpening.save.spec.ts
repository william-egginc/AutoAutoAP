/**
 * LOW-TE GATE (temporary until Joo's PR 717 merges): the low-TE opening (auto/lowTeOpening.ts) on a
 * real account, the full simulator end to end.
 *
 *   - Low TE: from TE 75, 93 and 105 on this save the current opening stalls on I1 for days to weeks;
 *     the gate takes Joo's rounds instead, which max the habs in a few rounds, and the whole ascension
 *     is much faster.
 *   - Above the cutoff: at TE 200, 300 and 400 the gate never engages and every number is the one the
 *     code before the gate gave (pinned below from a build of ascension-chain-search c97f2423).
 *
 * The save is read where it is (never copied into the repo): LOWTE_SAVE, or the alt's backup in
 * ~/code/aap-private. SKIPPED when it is absent. About a minute when it runs.
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import { runAscensionFromC3Variant } from '@/auto/ascension';
import { buildAt, REFERENCE_WEEK, startStateAt } from '@/search/tableBuild';
import { integrityCheck } from '@/search/leg';
import { MAX_OPENING_ROUNDS } from './lowTeOpening';
import type { SearchInputs } from '@/search/types';

const SAVE = process.env.LOWTE_SAVE ?? join(homedir(), 'code/aap-private/alt-backup-2026-10-10.json');
const hasSave = existsSync(SAVE);

/** One fresh ascension from `te` at `hour` of the reference week to `te + gain`: the variant the app
 *  picks, its days, the build up to C3 and its opening rounds. */
function ascension(inputs: SearchInputs, te: number, hour: number, gain = 43, mode?: 'never' | 'force') {
  inputs.context.lowTeOpening = mode;
  try {
    const start = REFERENCE_WEEK + hour * 3600;
    const build = buildAt(inputs, startStateAt(inputs, te), start, te);
    const fresh: Partial<Record<VariantKey, VariantResult>> = {};
    for (const v of build.variants) {
      const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
      fresh[key] = runAscensionFromC3Variant(
        startStateAt(inputs, te),
        build.preC3,
        v,
        build.ctx,
        start,
        'asc',
        te + gain
      );
    }
    const best = pickVariant(fresh);
    const key = (Object.keys(fresh) as VariantKey[]).find(k => fresh[k] === best)!;
    const shifts = build.preC3.actions.filter(a => a.type === 'shift');
    const integ = shifts.findIndex(a => a.type === 'shift' && a.payload.toEgg === 'integrity');
    const at = (i: number) => shifts[i]?.endState?.lastStepTime ?? build.preC3.elapsedSeconds;
    return {
      key,
      seconds: best.summary.totalDurationSeconds,
      endTE: best.summary.endTE,
      preC3Seconds: build.preC3.elapsedSeconds,
      firstI1Seconds: integ < 0 ? null : at(integ + 1) - at(integ),
      rounds: build.preC3.state.lowTeOpening ?? 0,
      shiftCount: best.actions.filter(a => a.type === 'shift').length,
      named: best.actions.filter(a => a.type === 'shift' && a.payload.autoShiftName).length,
      variants: build.variants.length,
    };
  } finally {
    inputs.context.lowTeOpening = undefined;
  }
}

/** Pinned from ascension-chain-search c97f2423 (before the gate), alt 10 Oct save, to TE + 43. */
const BEFORE_GATE: Record<string, { key: string; seconds: number; preC3Seconds: number; shiftCount: number }> = {
  '200@0': { key: '3-sale-tier13', seconds: 9805380.56045425, preC3Seconds: 2521.361424914348, shiftCount: 12 },
  '300@77': { key: '2-sale-tier13', seconds: 7583968.819357714, preC3Seconds: 3141.058310433775, shiftCount: 12 },
  '400@131': { key: '1-sale', seconds: 10211115.452676805, preC3Seconds: 1824.4548021566807, shiftCount: 12 },
};

describe.skipIf(!hasSave)('low-TE opening on a real save', () => {
  let inputs: SearchInputs;

  beforeAll(async () => {
    setActivePinia(createPinia());
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useChainSearchStore();
    store.continueStartRule = false;
    inputs = store.collectInputs();
  }, 120_000);

  it.each([75, 93, 105])(
    'engages from TE %i and does not stall',
    te => {
      const today = ascension(inputs, te, 0, 43, 'never');
      const gated = ascension(inputs, te, 0);
      // Today's opening sits on I1 for longer than the 4-hour cap; the gate takes Joo's rounds instead.
      expect(today.firstI1Seconds!).toBeGreaterThan(4 * 3600);
      expect(gated.rounds).toBeGreaterThan(1);
      expect(gated.rounds).toBeLessThan(MAX_OPENING_ROUNDS);
      // Every I1 inside the rounds is capped at 4 hours, and the build to C3 takes under a day.
      expect(gated.firstI1Seconds!).toBeLessThanOrEqual(4 * 3600);
      expect(gated.preC3Seconds).toBeLessThan(86400);
      // Same goal, and much sooner.
      expect(gated.endTE).toBeGreaterThanOrEqual(te + 43);
      expect(gated.seconds).toBeLessThan(today.seconds);
      // The low-TE path names its shifts (the UI finds C3/K3 by name there).
      expect(gated.named).toBe(gated.shiftCount);
    },
    300_000
  );

  it("keeps the player's hours: every shift of the rounds waits for them", () => {
    // Shifts only from 14:00 to 23:00 UTC.
    const holdUntil = (t: number) => {
      const h = Math.floor(t / 3600) % 24;
      if (h >= 14 && h < 23) return t;
      const day = Math.floor(t / 86400) * 86400;
      return h < 14 ? day + 14 * 3600 : day + 86400 + 14 * 3600;
    };
    inputs.context.holdUntil = holdUntil;
    try {
      for (const hour of [0, 40]) {
        const start = REFERENCE_WEEK + hour * 3600;
        const build = buildAt(inputs, startStateAt(inputs, 93), start, 93);
        expect(build.preC3.state.lowTeOpening).toBeGreaterThan(1);
        const shifts = build.preC3.actions.filter(a => a.type === 'shift');
        // Rounds after the first shift back to Curiosity, and every one of them is inside the hours.
        expect(shifts.filter(a => a.type === 'shift' && a.payload.autoShiftName === 'C1').length).toBe(
          build.preC3.state.lowTeOpening! - 1
        );
        for (const s of shifts) {
          const at = start + (s.endState?.lastStepTime ?? 0);
          expect(holdUntil(at)).toBe(at);
        }
      }
    } finally {
      delete inputs.context.holdUntil;
    }
  }, 300_000);

  it('the integrity check measures the rounds, not the capped first I1', () => {
    // From the reference week, like every other case here: the check runs from the plan start, which is
    // otherwise now, and the opening is about 5 h outside the research sale but 1-2 h when it starts in or
    // just before the sale (16 Oct 2026: it failed on a Friday morning, Pacific, and passed later).
    const at93 = { ...inputs, planStart: REFERENCE_WEEK, baseState: startStateAt(inputs, 93) };
    const check = integrityCheck(at93);
    expect(check.lowTe?.rounds).toBeGreaterThan(1);
    expect(check.lowTe!.openingSeconds).toBeGreaterThan(4 * 3600);
    // Inside the 10-round backstop the rounds fix the stall: no warning.
    expect(check.seconds).toBe(0);
    // Above the cutoff: no low-TE opening, and the first Integrity shift measured as before.
    const at300 = integrityCheck({ ...inputs, planStart: REFERENCE_WEEK, baseState: startStateAt(inputs, 300) });
    expect(at300.lowTe).toBeNull();
    expect(at300.seconds!).toBeLessThan(3600);
  }, 300_000);

  it.each([
    [200, 0],
    [300, 77],
    [400, 131],
  ])(
    'above the cutoff, TE %i hour %i is exactly what it was before the gate',
    (te, hour) => {
      const gated = ascension(inputs, te, hour);
      const never = ascension(inputs, te, hour, 43, 'never');
      expect(gated.rounds).toBe(0);
      expect(gated.named).toBe(0);
      expect(gated).toEqual(never);
      const pinned = BEFORE_GATE[`${te}@${hour}`];
      if (process.env.LOWTE_GOLDEN_PRINT) console.log(`GOLDEN ${te}@${hour} ${JSON.stringify(gated)}`);
      else {
        expect(pinned).toBeDefined();
        expect({
          key: gated.key,
          seconds: gated.seconds,
          preC3Seconds: gated.preC3Seconds,
          shiftCount: gated.shiftCount,
        }).toEqual(pinned);
      }
    },
    300_000
  );
});
