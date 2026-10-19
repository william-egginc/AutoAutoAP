/**
 * Joo's opening in rounds (PR 717; auto/ascension.ts runC1K1I1Segment) on a real account, the full
 * simulator end to end. It replaced our low-TE gate (19 Oct 2026), so this spec replaced the gate's.
 *
 *   - Low TE: from TE 75, 93 and 105 on this save one 4-hour I1 can't max the habs; the opening goes
 *     round C1, K1, I1 a few times, inside the 10-round backstop, and the build to C3 takes under a day.
 *   - The player's hours hold every shift of the rounds.
 *   - The integrity check counts the rounds instead of reading the capped first I1.
 *   - Pinned numbers at TE 93, 200, 300 and 400 (recorded on joo-lite at the merge, 19 Oct 2026), so a
 *     later change to the simulator shows up here as well as in the SIM_SOURCE_HASH guard.
 *
 * The save is read where it is (never copied into the repo): LOWTE_SAVE, or the alt's backup in
 * ~/code/aap-private. SKIPPED when it is absent, and unless AAP_SLOW_SPECS=1. About a minute when it runs.
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
import { MAX_OPENING_ROUNDS } from './ascension';
import type { SearchInputs } from '@/search/types';

const SAVE = process.env.LOWTE_SAVE ?? join(homedir(), 'code/aap-private/alt-backup-2026-10-10.json');
const hasSave = existsSync(SAVE);

/** One fresh ascension from `te` at `hour` of the reference week to `te + gain`: the variant the app
 *  picks, its days, the build up to C3 and its opening rounds. */
function ascension(inputs: SearchInputs, te: number, hour: number, gain = 43) {
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
  const at = (i: number) => shifts[i]?.endState?.lastStepTime ?? build.preC3.elapsedSeconds;
  const i1s = shifts.flatMap((a, i) =>
    a.type === 'shift' && a.payload.toEgg === 'integrity' ? [at(i + 1) - at(i)] : []
  );
  return {
    key,
    seconds: best.summary.totalDurationSeconds,
    endTE: best.summary.endTE,
    preC3Seconds: build.preC3.elapsedSeconds,
    i1Seconds: i1s,
    rounds: i1s.length,
    shiftCount: best.actions.filter(a => a.type === 'shift').length,
    named: best.actions.filter(a => a.type === 'shift' && a.payload.autoShiftName).length,
  };
}

/** Recorded on joo-lite at the merge (19 Oct 2026), alt 10 Oct save, to TE + 43. Re-record with
 *  OPENING_GOLDEN_PRINT=1 only when the simulator's results change on purpose (and SIM_VERSION moves). */
const PINNED: Record<
  string,
  { key: string; seconds: number; preC3Seconds: number; shiftCount: number; rounds: number }
> = {
  '93@0': { key: '2-sale', seconds: 7980193.843198372, preC3Seconds: 27653.9542051558, shiftCount: 15, rounds: 2 },
  '200@0': {
    key: '3-sale-tier13',
    seconds: 9805431.445010353,
    preC3Seconds: 4414.309467578185,
    shiftCount: 12,
    rounds: 1,
  },
  '300@77': {
    key: '2-sale-tier13',
    seconds: 7583967.446167223,
    preC3Seconds: 3139.219150779773,
    shiftCount: 12,
    rounds: 1,
  },
  '400@131': {
    key: '1-sale',
    seconds: 10211115.452676803,
    preC3Seconds: 1824.4548021559694,
    shiftCount: 12,
    rounds: 1,
  },
};

// SLOW (minutes of full simulation) and timing-sensitive: on a loaded machine it ran past its caps and failed
// the suite (18 Oct 2026), so it runs only when asked, and only where the save is:
//   AAP_SLOW_SPECS=1 npx vitest run src/auto/openingRounds.save.spec.ts
describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)('opening rounds on a real save', () => {
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
    'from TE %i the opening goes round a few times and does not stall',
    te => {
      const asc = ascension(inputs, te, 0);
      expect(asc.rounds).toBeGreaterThan(1);
      expect(asc.rounds).toBeLessThan(MAX_OPENING_ROUNDS);
      // Every I1 inside the backstop is capped at 4 hours, and the build to C3 takes under a day.
      for (const s of asc.i1Seconds) expect(s).toBeLessThanOrEqual(4 * 3600);
      expect(asc.preC3Seconds).toBeLessThan(86400);
      expect(asc.endTE).toBeGreaterThanOrEqual(te + 43);
      // Every shift is named (the UI finds C3/K3 by name).
      expect(asc.named).toBe(asc.shiftCount);
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
        const shifts = build.preC3.actions.filter(a => a.type === 'shift');
        const rounds = shifts.filter(a => a.type === 'shift' && a.payload.toEgg === 'integrity').length;
        expect(rounds).toBeGreaterThan(1);
        // Rounds after the first shift back to Curiosity, and every one of them is inside the hours.
        expect(shifts.filter(a => a.type === 'shift' && a.payload.autoShiftName === 'C1').length).toBe(rounds - 1);
        for (const s of shifts) {
          const at = start + (s.endState?.lastStepTime ?? 0);
          expect(holdUntil(at)).toBe(at);
        }
      }
    } finally {
      delete inputs.context.holdUntil;
    }
  }, 300_000);

  it('the integrity check counts the rounds, not the capped first I1', () => {
    // From the reference week, like every other case here: the check runs from the plan start, which is
    // otherwise now, and the opening is shorter when it starts in or just before the research sale.
    const at93 = { ...inputs, planStart: REFERENCE_WEEK, baseState: startStateAt(inputs, 93) };
    const check = integrityCheck(at93);
    expect(check.opening?.rounds).toBeGreaterThan(1);
    expect(check.opening!.openingSeconds).toBeGreaterThan(4 * 3600);
    // Inside the 10-round backstop the rounds fix the stall: no warning.
    expect(check.seconds).toBe(0);
    // One round: no opening to report, and its I1 measured as always.
    const at300 = integrityCheck({ ...inputs, planStart: REFERENCE_WEEK, baseState: startStateAt(inputs, 300) });
    expect(at300.opening).toBeNull();
    expect(at300.seconds!).toBeLessThan(3600);
  }, 300_000);

  it.each([
    [93, 0],
    [200, 0],
    [300, 77],
    [400, 131],
  ])(
    'TE %i hour %i gives the numbers pinned at the merge',
    (te, hour) => {
      const asc = ascension(inputs, te, hour);
      const got = {
        key: asc.key,
        seconds: asc.seconds,
        preC3Seconds: asc.preC3Seconds,
        shiftCount: asc.shiftCount,
        rounds: asc.rounds,
      };
      if (process.env.OPENING_GOLDEN_PRINT) console.log(`GOLDEN '${te}@${hour}': ${JSON.stringify(got)},`);
      else expect(got).toEqual(PINNED[`${te}@${hour}`]);
      expect(asc.named).toBe(asc.shiftCount);
    },
    300_000
  );
});
