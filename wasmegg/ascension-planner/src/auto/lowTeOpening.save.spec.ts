/**
 * The opening switch (auto/lowTeOpening.ts) on a real account, the full simulator end to end.
 *
 *   - Low TE: from TE 75, 93 and 105 on this save one C1/K1/I1 pass can't max the habs inside I1's
 *     4-hour cap; PR 717's rounds (the default) max them in a few rounds, and Joo's v2 openings
 *     (`openingFallback: 'v2'`) in two. Both reach the goal.
 *   - Higher up: at TE 200, 300 and 400 the first pass maxes the habs, so the switch changes nothing.
 *     The numbers are pinned (BELOW), with what the code before the egg-beta2 merge gave beside them.
 *
 * The save is read where it is (never copied into the repo): LOWTE_SAVE, or the alt's backup in
 * ~/code/aap-private. SKIPPED when it is absent, and unless AAP_SLOW_SPECS=1. About a minute when it runs.
 */
import '../../scripts/node-shims';

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
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

/** LOWTE_GOLDEN_PRINT=FILE: append the measured numbers to FILE (to re-pin, or to compare openings). */
const golden = (line: string) => appendFileSync(process.env.LOWTE_GOLDEN_PRINT!, line + '\n');

const SAVE = process.env.LOWTE_SAVE ?? join(homedir(), 'code/aap-private/alt-backup-2026-10-10.json');
const hasSave = existsSync(SAVE);

/** One fresh ascension from `te` at `hour` of the reference week to `te + gain`: the variant the app
 *  picks, its days, the build up to C3 and its opening rounds. */
function ascension(inputs: SearchInputs, te: number, hour: number, gain = 43, mode?: 'rounds' | 'v2') {
  inputs.context.openingFallback = mode;
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
    inputs.context.openingFallback = undefined;
  }
}

type Pin = { key: string; seconds: number; preC3Seconds: number; shiftCount: number };

/** What the code before the egg-beta2 merge gave (ascension-chain-search c97f2423 to f93e05f0), alt 10
 *  Oct save, to TE + 43. Kept for the record; PINNED below is the merged simulator's. */
const BEFORE_EGG_BETA2: Record<string, Pin> = {
  '200@0': { key: '3-sale-tier13', seconds: 9805380.56045425, preC3Seconds: 2521.361424914348, shiftCount: 12 },
  '300@77': { key: '2-sale-tier13', seconds: 7583968.819357714, preC3Seconds: 3141.058310433775, shiftCount: 12 },
  '400@131': { key: '1-sale', seconds: 10211115.452676805, preC3Seconds: 1824.4548021566807, shiftCount: 12 },
};

/** The merged simulator (egg-beta2, Joo's 39261255 + ours), same cells. */
const PINNED: Record<string, Pin> = {
  '200@0': { key: '3-sale-tier13', seconds: 9805431.445010353, preC3Seconds: 4414.309467578185, shiftCount: 12 },
  '300@77': { key: '2-sale-tier13', seconds: 7583967.446167223, preC3Seconds: 3139.219150779773, shiftCount: 12 },
  // One shift fewer than before: C3 left K3 nothing to buy, so H1 waits out the build on Humility and
  // H2 drops out (Joo's 78ec357a).
  '400@131': { key: '1-sale', seconds: 10211115.452676803, preC3Seconds: 1824.4548021559694, shiftCount: 11 },
};

// SLOW (minutes of full simulation) and timing-sensitive: on a loaded machine it ran past its caps and failed
// the suite (18 Oct 2026), so it runs only when asked, and only where the save is:
//   AAP_SLOW_SPECS=1 npx vitest run src/auto/lowTeOpening.save.spec.ts
describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)('low-TE opening on a real save', () => {
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
    'from TE %i the opening takes more than one round and does not stall',
    te => {
      const rounds = ascension(inputs, te, 0);
      const v2 = ascension(inputs, te, 0, 43, 'v2');
      if (process.env.LOWTE_GOLDEN_PRINT) golden(`OPENING ${te} ${JSON.stringify({ rounds, v2 })}`);
      // PR 717's rounds (the default): every I1 but the backstop's is capped at 4 hours, and the
      // build to C3 takes under a day.
      expect(rounds.rounds).toBeGreaterThan(1);
      expect(rounds.rounds).toBeLessThan(MAX_OPENING_ROUNDS);
      expect(rounds.firstI1Seconds!).toBeLessThanOrEqual(4 * 3600);
      expect(rounds.preC3Seconds).toBeLessThan(86400);
      expect(rounds.endTE).toBeGreaterThanOrEqual(te + 43);
      // Joo's v2: two rounds, the same goal.
      expect(v2.rounds).toBe(2);
      expect(v2.endTE).toBeGreaterThanOrEqual(te + 43);
      // Every shift is named (the UI finds C3/K3 by name).
      expect(rounds.named).toBe(rounds.shiftCount);
      expect(v2.named).toBe(v2.shiftCount);
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
        // Rounds after the first shift back to Curiosity (a round's C1 that buys nothing is left
        // out), and every shift is inside the hours.
        const c1s = shifts.filter(a => a.type === 'shift' && a.payload.autoShiftName === 'C1').length;
        expect(c1s).toBeGreaterThan(0);
        expect(c1s).toBeLessThanOrEqual(build.preC3.state.lowTeOpening! - 1);
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
    // Higher up: one round, and the first Integrity shift measured as before.
    const at300 = integrityCheck({ ...inputs, planStart: REFERENCE_WEEK, baseState: startStateAt(inputs, 300) });
    expect(at300.lowTe).toBeNull();
    expect(at300.seconds!).toBeLessThan(3600);
  }, 300_000);

  it.each([
    [200, 0],
    [300, 77],
    [400, 131],
  ])(
    'higher up, TE %i hour %i: one round either way, pinned',
    (te, hour) => {
      const rounds = ascension(inputs, te, hour);
      const v2 = ascension(inputs, te, hour, 43, 'v2');
      expect(rounds.rounds).toBe(0);
      expect(rounds).toEqual(v2);
      const pinned = PINNED[`${te}@${hour}`];
      if (process.env.LOWTE_GOLDEN_PRINT) golden(`GOLDEN ${te}@${hour} ${JSON.stringify(rounds)}`);
      else {
        expect(pinned).toBeDefined();
        expect({
          key: rounds.key,
          seconds: rounds.seconds,
          preC3Seconds: rounds.preC3Seconds,
          shiftCount: rounds.shiftCount,
        }).toEqual(pinned);
      }
    },
    300_000
  );
});
