/**
 * MY RUNS' A1 CHOICE on Jordan's main (spec-a1choice, 1 Nov 2026): the save of Oct 31, 2026, 12:23 am (scrubbed, read
 * where it is, never copied), mid build-up at 197 TE. It does NOT show the case the choice is for: its build-up buys 16
 * things and ends far SOONER than finishing without buying (to 200 TE: 8.46 days against 19.58, measured with this
 * spec), so Right now shows no choice and follows the build-up as before. Kept as the real-save check that the choice
 * stays away from a sooner build-up; the later-ending case is covered on synthetic saves (leg.a1Choice.spec.ts).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1 (a few seconds when it runs):
 *   AAP_SLOW_SPECS=1 npx vitest run src/search/leg.a1Choice.main.save.spec.ts
 * Another copy of the save: MAIN_SAVE=/path/to/save.json.
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
import { a1Candidates, a1Decision, a1Inputs } from '@/lib/a1Choice';
import { runLeg } from './leg';
import type { SearchInputs } from './types';

const SAVE = process.env.MAIN_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-10-31-0023.json');
const hasSave = existsSync(SAVE);
const GOAL = 200;

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Jordan's main, Oct 31: a sooner buying build-up, so no A1 choice", () => {
  let base: SearchInputs;
  beforeAll(async () => {
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    const t = Math.floor(backup.settings.lastBackupTime);
    vi.useFakeTimers({ now: (t + 120) * 1000, toFake: ['Date'] });
    setActivePinia(createPinia());
    // Never a real player ID in anything this spec prints.
    backup.eiUserId = 'EI0000000000000000';
    resolveColleggtibleContracts(backup);
    await initPlanFuture('file', markRaw(backup));
    const store = useChainSearchStore();
    store.setFirstAscension('auto');
    store.continueStartRule = false;
    store.pinPlanStart(t + 60);
    base = store.collectInputs();
  }, 600_000);
  afterAll(() => vi.useRealTimers());

  it('the unfinished build: the build-up, buying 16 things, about 11 days sooner; no choice, the build-up followed', () => {
    const inputs = { ...base, ...a1Inputs('buildup') } as SearchInputs;
    const r = runLeg(inputs, JSON.parse(JSON.stringify(base.baseState)), inputs.planStart, GOAL, true, Math.floor(inputs.currentTE), 0)!;
    expect(Math.floor(base.currentTE)).toBe(197);
    expect(r.key).toBe('buildup');
    const cand = a1Candidates(r)!;
    expect(cand.buys).toBe(16);
    expect((cand.contEnd - cand.buildEnd) / 86400).toBeGreaterThan(10);
    expect(a1Decision({ cand, pick: null, setting: 'auto' })).toMatchObject({ show: false, side: 'buildup', why: 'sooner' });
  }, 600_000);
});
