/**
 * B1 ON JORDAN'S ALT, THROUGH THE REAL PAGE (spec-r7qa, 3 Nov 2026; QA: Willsalt in Safari read Producing, "nothing to buy
 * until your next prestige" and Next step "Building up until about Nov 3, 2026 at 1:26 PM"). The save file of Nov 1, 2026
 * (alt-2026-11-01-1330.json, its backup time Oct 31, 2026 16:08 UTC; scrubbed, read where it is, never copied; its ID replaced by the placeholder before anything reads it), loaded as
 * NowPage.a1Choice.alt.save.spec.ts loads it: useNowPage with the real stores, the Build-up tracker wired as MyRunsView.vue
 * wires it, every simulation run by the real simulator in-process, the clock five minutes after the save.
 *
 * MEASURED BEFORE THE FIX (a841f801): with Your setup's first ascension on Prestige now ('fresh') the simulated ascension
 * you are in is a fresh start (variant '1-sale', start = the moment asked, build phase ending a week on, first shift
 * Kindness 29 min on), so Next step read "Building up until about <that shift>" and Next shifts "Shift to Kindness, Shift
 * to Integrity, Shift to Curiosity …" (QA's list), with the badge Producing (the production set worn on Kindness) and the
 * tracker 'notBuilding'. With Your setup as it comes the ascension carried on ('continue') and Next step was a shift.
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1:
 *   AAP_SLOW_SPECS=1 npx vitest run src/components/myruns/NowPage.producingNextStep.alt.save.spec.ts
 * Another copy of the save: ALT_SAVE=/path/to/save.json.
 */
import '../../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, markRaw, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { saveTEOf } from '@/lib/saveFreshness';
import { nextActionWords, nextShiftWords } from '@/lib/nextAction';
import { ascensionStartOf } from '@/lib/buildUpTracker';
import { useBuildUpTracker } from '@/composables/useBuildUpTracker';
import { setChainPricer, type ChainPricer } from '@/composables/useFollowEstimate';
import { setSimRunner, setSimTiming, type SimRunner } from '@/composables/useCurrentSim';
import { createChainEvaluator } from '@/search/chain';
import { workerCopy } from '@/search/workerCopy';
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { BoardRow } from '@/lib/leaderboardRank';

const SAVE = process.env.ALT_SAVE ?? join(homedir(), 'code/aaap-tools/saves/alt-2026-11-01-1330.json');
const hasSave = existsSync(SAVE);
const A_ID = 'EI0000000000000000';
const WAIT = { timeout: 300_000, interval: 50 };
const out = (s: string) => process.stderr.write(`\n[alt b1] ${s}\n`);
const when = (t: number) => new Date(t * 1000).toISOString();

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)("B1 on Jordan's alt (Nov 1 file), through the real page", () => {
  let mem: Map<string, string>;
  const scopes: { stop: () => void }[] = [];
  beforeEach(() => {
    mem = new Map<string, string>();
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
  afterEach(() => {
    for (const s of scopes.splice(0)) s.stop();
    setChainPricer(null);
    setSimRunner(null);
    setSimTiming(null);
    vi.useRealTimers();
  });

  for (const first of ['fresh', 'auto'] as const)
    it(`Your setup's first ascension ${first}: Producing, tracker nothing to buy, Next step a real step`, async () => {
      const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
      const t = Math.floor(backup.settings.lastBackupTime);
      vi.useFakeTimers({ now: (t + 300) * 1000, toFake: ['Date'] });
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
      setSimRunner(
        (): SimRunner => ({
          run: async (inputs, chain, opts) => {
            await Promise.resolve();
            const legs = createChainEvaluator(workerCopy(inputs)).evaluate(chain, opts)?.legs ?? null;
            const l = legs?.[0];
            const end = l?.buildPhaseEndTime;
            out(`ask: ${chain.join(' ')} firstAscension ${inputs.firstAscension} -> ${l?.key}, start ${when(l?.startTime ?? 0)}, build phase end ${typeof end === 'number' ? when(end) : null}`);
            return legs;
          },
          terminate: () => undefined,
        })
      );
      loadAndSyncBackup(A_ID, markRaw(backup), 'plan_next');
      rollUpPendingTE();
      useChainSearchStore().setFirstAscension(first);
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
      scopes.push(scope);
      const { page, tracker } = scope.run(() => {
        const page = useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) });
        const tracker = useBuildUpTracker({
          account: computed(() => page.account.value || null),
          hasSave: page.hasSave,
          onVirtue: page.onVirtue,
          followed: computed(() => !!page.follow.value),
          building: computed(() => page.phase.value?.phase === 'building'),
          ascensionStart: computed(() => ascensionStartOf(page.cardPlan.value?.plan ?? null, page.now.value)),
          saveSeconds: page.saveSeconds,
          zone: page.zone,
          hours: computed(() => null),
          now: page.now,
          fresh: page.buildUpPlan,
          sim: page.buildUpSim,
          saveFarm: page.buildUpSave,
          finishChosen: page.a1Finish,
        });
        return { page, tracker };
      })!;
      page.selectGoal('fastest-490');
      await vi.waitFor(() => expect(page.follow.value).not.toBeNull(), { timeout: 60_000, interval: 50 });
      await vi.waitFor(() => expect(page.nextStep.value).not.toBeNull(), WAIT);
      const step = nextActionWords(page.nextStep.value!, when);
      out(`setup ${first}: TE ${te}, egg ${page.currentEgg.value}, badge ${page.phase.value?.phase}, tracker ${tracker.state.value}, buildLeft ${JSON.stringify(page.saveBuildLeft.value)}`);
      out(`Next step: ${step}`);
      out(`Next shifts: ${page.nextShiftLines.value.map(l => nextShiftWords(l, x => when(x))).join(' | ')}`);
      expect(page.phase.value?.phase).toBe('producing');
      expect(tracker.state.value).toBe('notBuilding');
      expect(step).not.toMatch(/Building up until/);
      expect(['shift', 'prestige']).toContain(page.nextStep.value!.kind);
      expect(page.nextShiftLines.value.map(l => l.kind)).not.toContain('build');
      if (first === 'fresh') expect(page.nextStep.value!.kind).toBe('prestige');
    }, 900_000);
});
