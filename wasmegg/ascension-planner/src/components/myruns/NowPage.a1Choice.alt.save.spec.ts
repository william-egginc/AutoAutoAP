/**
 * MY RUNS' A1 CHOICE ON JORDAN'S ALT, THROUGH THE REAL PAGE (spec-r7redteam-f, 1 Nov 2026): the save of Oct 31, 2026,
 * 3:12 pm (scrubbed, read where it is, never copied; its ID replaced by the placeholder before anything reads it), loaded
 * as NowPage.a1Choice.realPage.spec.ts loads the synthetic saves: useNowPage with the real stores, buildLeft from the
 * page's own rates, every simulation the page asks for run by the real simulator in-process. Prints what buildLeft was
 * given and said, each ask's side and the A1 choice (or why there is none). The alt's farm: four Chicken Universes,
 * seventeen hyperloops of seven cars, shipping just below laying at full habs (spec-noemptybuild: 8.36e11 against
 * 8.58e11), so the page takes the unfinished-build path; its build-up bought nothing then (spec-noemptybuild).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 npx vitest run src/components/myruns/NowPage.a1Choice.alt.save.spec.ts
 * Another copy of the save: ALT_SAVE=/path/to/save.json.
 */
import '../../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { saveTEOf } from '@/lib/saveFreshness';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { createChainEvaluator } from '@/search/chain';
import { workerCopy } from '@/search/workerCopy';
import type { SearchInputs } from '@/search/types';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const SAVE = process.env.ALT_SAVE ?? join(homedir(), 'code/aaap-tools/saves/alt-2026-10-31-1512.json');
const hasSave = existsSync(SAVE);
const A_ID = 'EI0000000000000000';
const WAIT = { timeout: 300_000, interval: 50 };
const out = (s: string) => process.stderr.write(`\n[alt a1] ${s}\n`);

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("Jordan's alt, Oct 31, through the real page", () => {
  const mem = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: () => null,
      length: 0,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setActivePinia(createPinia());
  });
  afterAll(() => {
    setChainPricer(null);
    setSimRunner(null);
    setSimTiming(null);
    vi.useRealTimers();
  });

  it("buildLeft's inputs, the asks and the A1 choice", async () => {
    const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
    const t = Math.floor(backup.settings.lastBackupTime);
    vi.useFakeTimers({ now: (t + 120) * 1000, toFake: ['Date'] });
    // Never a real player ID in anything this spec reads or prints.
    backup.eiUserId = A_ID;
    for (const c of [...(backup.contracts?.archive ?? []), ...(backup.contracts?.contracts ?? [])])
      if (c?.coopUserId) c.coopUserId = A_ID;
    resolveColleggtibleContracts(backup);
    setChainPricer(
      (): ChainPricer => ({
        priceChain: (_url: string, _o: PolishOptions, _chain: number[]) => new Promise<Route | null>(() => undefined),
        terminate: () => undefined,
      })
    );
    setSimTiming({ delayMs: 0 });
    const asked: { inputs: SearchInputs; chain: number[] }[] = [];
    setSimRunner(
      (): SimRunner => ({
        run: async (inputs, chain, opts) => {
        // The lazy fresh-start pricing beside a forced build-up (useNowPage `freshSim`, NowPage.freshSooner.spec.ts): left unanswered here.
        if (inputs.firstAscension === 'fresh') return new Promise(() => undefined);
          asked.push({ inputs, chain });
          await Promise.resolve();
          const t0 = performance.now();
          const legs = createChainEvaluator(workerCopy(inputs)).evaluate(chain, opts)?.legs ?? null;
          out(
            `ask ${asked.length}: route ${chain.join(' ')} firstAscension ${inputs.firstAscension} continueMaxSeconds ${inputs.continueMaxSeconds} continuePinSeconds ${inputs.continuePinSeconds} (${Math.round(performance.now() - t0)} ms)`
          );
          return legs;
        },
        terminate: () => undefined,
      })
    );
    loadAndSyncBackup(A_ID, markRaw(backup), 'plan_next');
    rollUpPendingTE();
    const te = saveTEOf(backup);
    const route = [te + 4, 490];
    const { resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
    resetGoalChoice();
    mem.set(
      `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
      JSON.stringify({ 'fastest-490': { chain: route, from: 'typed', source: 'manual', at: Date.now() - 60_000 } })
    );
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.partition).not.toBe(''), WAIT);
    const scope = effectScope();
    const page = scope.run(() =>
      useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) })
    )!;
    page.selectGoal('fastest-490');
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull(), { timeout: 60_000, interval: 50 });
    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0), WAIT);
    await vi.waitFor(() => expect(page.simWorking.value).toBeNull(), WAIT);
    const r = page.fullHabRates.value;
    const laying = r ? r.perChicken * r.maxHabs : null;
    out(`TE ${te}, route ${route.join(' ')}`);
    out(
      `rates: ${r ? `laying ${laying!.toExponential(3)}/s, delivery at full habs ${r.maxElr.toExponential(3)}/s (${(r.maxElr / laying!).toFixed(4)} of laying)` : 'none'}`
    );
    out(`buildLeft: ${JSON.stringify(page.saveBuildLeft.value)}`);
    const c = page.a1Choice.value;
    out(
      `a1Choice: ${c ? JSON.stringify({ side: c.side, buys: c.buys, buildEndDays: (c.buildEnd - t) / 86400, contEndDays: (c.contEnd - t) / 86400 }) : 'none'}; a1Finish ${page.a1Finish.value}`
    );
    out(`nextStep: ${JSON.stringify(page.nextStep.value)}`);
    // The alt is shipping-limited: the page's unfinished-build path (whatever the choice says).
    expect(page.saveBuildLeft.value).toContain('vehicles');
    expect(asked[0].inputs.firstAscension).not.toBe('auto');
    expect(page.simWorking.value).toBeNull();
    scope.stop();
  }, 900_000);
});
