/**
 * THE BUILD TO C3, SHARED ACROSS TARGETS (search/leg.ts `legBuild`, 16 Oct 2026): every target tried
 * from one start gives exactly what it gave when each leg built its own, on a real save with the full
 * simulator. The save is read where it is (never copied into the repo): LOWTE_SAVE, or the alt's
 * backup in ~/code/aap-private. SKIPPED when it is absent, and unless AAP_SLOW_SPECS=1. A few minutes when it runs.
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { REFERENCE_WEEK, startStateAt } from '@/search/tableBuild';
import { legBuildStats, runLeg, setLegBuildSharing } from './leg';
import { fromSleepHours } from './availability';
import type { SearchInputs } from './types';

const SAVE = process.env.LOWTE_SAVE ?? join(homedir(), 'code/aap-private/alt-backup-2026-10-10.json');
const hasSave = existsSync(SAVE);

// SLOW (minutes of full simulation) and timing-sensitive: on a loaded machine it ran past its caps and failed
// the suite (18 Oct 2026), so it runs only when asked, and only where the save is:
//   AAP_SLOW_SPECS=1 npx vitest run src/search/leg.shareBuild.save.spec.ts
describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)('the build to C3, shared across targets, on a real save', () => {
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
  afterAll(() => setLegBuildSharing(true));

  /** Each target's leg from one start, as JSON (what a route keeps of it). */
  function legs(te: number, hour: number, targets: number[]): string[] {
    const start = REFERENCE_WEEK + hour * 3600;
    return targets.map((t, i) => JSON.stringify(runLeg(inputs, startStateAt(inputs, te), start, t, false, te, i)));
  }

  it.each([
    [200, 40, [215, 218, 221, 224, 227, 230]],
    [250, 100, [262, 266, 270]],
  ])('from TE %i at hour %i, every target exactly as when each leg built its own', (te, hour, targets) => {
    setLegBuildSharing(false);
    const t0 = performance.now();
    const own = legs(te, hour, targets);
    const tOwn = performance.now() - t0;

    setLegBuildSharing(true);
    legBuildStats(true);
    const t1 = performance.now();
    const shared = legs(te, hour, targets);
    const tShared = performance.now() - t1;

    expect(shared).toEqual(own);
    for (const leg of own) expect(JSON.parse(leg)?.summary?.endTE).toBeGreaterThan(te);
    // One build, then every other target from it.
    expect(legBuildStats()).toEqual({ hits: targets.length - 1, misses: 1 });
    if (process.env.LEG_SHARE_TIMING)
      console.log(`TE ${te}@${hour}, ${targets.length} targets: own builds ${(tOwn / 1000).toFixed(1)} s, shared ${(tShared / 1000).toFixed(1)} s`);
  }, 900_000);

  it('builds again for another start, another TE or other hours', () => {
    setLegBuildSharing(true);
    legBuildStats(true);
    legs(200, 40, [215]);
    legs(200, 41, [215]);
    legs(201, 40, [216]);
    // Awake 7 am to 1 am Pacific (asleep 1 am to 7 am).
    const withHours = { ...inputs, availability: fromSleepHours(1, 7, 'America/Los_Angeles'), deferShifts: true };
    runLeg(withHours, startStateAt(inputs, 200), REFERENCE_WEEK + 40 * 3600, 215, false, 200, 0);
    expect(legBuildStats()).toEqual({ hits: 0, misses: 4 });
  }, 900_000);
});
