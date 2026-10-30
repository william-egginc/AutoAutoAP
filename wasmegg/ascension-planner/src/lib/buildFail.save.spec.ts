/**
 * "THE ASCENSION TO 218 TE COULD NOT BE SIMULATED" ON THE REAL SAVE (spec-buildfail, 30 Oct 2026; the synthetic
 * version is followSim.justPrestiged.spec.ts). The save is read where it is, never copied into the repo:
 * BUILDFAIL_SAVE, or ~/code/aaap-tools/saves/main-2026-10-30-0952.json. SKIPPED when it is absent. Two cases, as
 * My runs builds the request (useNowPage.ts `simRequest`): the save rewound to a minute after the prestige to 197
 * (its virtue farm bare, the state that failed), and the save as it is; the route 197 218 247 285 313, hours 7 am to
 * 1 am (America/Denver), shifts held for them, the build carried on. Fixed clocks. Each case runs the build-up
 * tracker on the plan (as buildUpTracker.real.spec.ts does); BUILDFAIL_DUMP=<file> writes its first lines (no IDs).
 * A few minutes.
 */
import '../../scripts/node-shims';

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { createChainEvaluator } from '@/search/chain';
import { inputsForWorkers } from '@/search/workerBackup';
import { followedFromNow } from './follow';
import { buildUpPlanFromSegments, simLegFromSegments } from './followSim';
import { siloSeconds } from './saveAge';
import { buildUpTracker, lineText } from './buildUpTracker';

const SAVE = process.env.BUILDFAIL_SAVE ?? join(homedir(), 'code/aaap-tools/saves/main-2026-10-30-0952.json');
const ZONE = 'America/Denver';
const HOURS = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 1, timezone: ZONE };
const ROUTE = [197, 218, 247, 285, 313];
/** 8:59 am Mountain on 30 Oct 2026: the prestige to 197. */
const PRESTIGED = Math.floor(Date.UTC(2026, 9, 30, 14, 59) / 1000);

const dump = (s: string) => {
  if (process.env.BUILDFAIL_DUMP) appendFileSync(process.env.BUILDFAIL_DUMP, s.replace(/EI\d{16}/gi, 'EI…') + '\n');
};

async function caseOf(rewind: boolean) {
  setActivePinia(createPinia());
  const backup = JSON.parse(readFileSync(SAVE, 'utf8'));
  const synced = rewind ? PRESTIGED : Math.floor(backup.settings.lastBackupTime);
  if (rewind) {
    const f = backup.farms[0];
    Object.assign(f, {
      habs: [0, 19, 19, 19],
      habPopulation: [0, 0, 0, 0],
      numChickens: 0,
      hatcheryPopulation: 0,
      vehicles: [0],
      trainLength: [1],
      commonResearch: f.commonResearch.map((r: { id: string }) => ({ id: r.id, level: 0 })),
      silosOwned: 1,
      cashEarned: 0,
      cashSpent: 0,
      unclaimedCash: 0,
      eggsLaid: 0,
      eggsPaidFor: 0,
      eggsShipped: 0,
      activeBoosts: [],
      lastStepTime: synced,
    });
    backup.settings.lastBackupTime = synced;
  }
  resolveColleggtibleContracts(backup);
  await initPlanFuture('file', markRaw(backup));
  const store = useChainSearchStore();
  useAutoPlannerStore().timezone = ZONE;
  const i = store.collectInputs();
  const route = followedFromNow(ROUTE, i.currentTE);
  const inputs = inputsForWorkers({
    ...i,
    planStart: synced + 60,
    availability: HOURS,
    deferShifts: true,
    firstAscension: 'buildup',
    continueMaxSeconds: 0,
    milestones: [],
  });
  const plain = JSON.parse(JSON.stringify(inputs, (_k, v) => (typeof v === 'function' ? undefined : v)));
  const legs = createChainEvaluator(plain).evaluate([route[0]], { keepPurchases: true })?.legs ?? null;
  const leg = simLegFromSegments(legs, { timeOff: plain.timeOff, currentTE: plain.currentTE, planStart: plain.planStart });
  const level = plain.context?.epicResearchLevels?.['silo_capacity'];
  const made = buildUpPlanFromSegments(legs, { accountKey: 'acct-real', siloSeconds: siloSeconds(plain.currentFarmState?.numSilos, level) });
  const plan = made?.start ? { ...made, siloSeconds: siloSeconds(made.start.siloCount, level) } : made;
  const tracker = plan
    ? buildUpTracker({
        actions: plan.actions,
        zone: ZONE,
        hours: HOURS,
        siloSeconds: plan.siloSeconds,
        startSilos: plan.start?.siloCount ?? null,
        startEgg: plan.start?.egg ?? null,
        now: plain.planStart,
      })
    : null;
  const local = (t: number) =>
    new Date(t * 1000).toLocaleString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  dump(`== ${rewind ? 'rewound to just after the prestige' : 'the save as it is'}: TE ${i.currentTE}, route ${route.join(' ')}`);
  if (leg)
    dump(`leg ${leg.key} ${local(leg.startTime)} -> ${local(leg.endTime)} ${leg.endTE} TE; shifts ${leg.shifts.map(s => `${s.egg} ${local(s.at)}`).join(', ')}`);
  if (tracker) dump(tracker.lines.slice(0, 12).map(l => `${local(l.at)} | ${lineText(l)}`).join('\n'));
  return { i, route, leg, plan, tracker };
}

describe.skipIf(!existsSync(SAVE))("the ascension you are in on Jordan's save (read in place)", () => {
  it('a minute after the prestige to 197: simulated to 218, with a build-up plan from the prestige', async () => {
    const r = await caseOf(true);
    expect(r.i.currentTE).toBe(197);
    expect(r.route).toEqual([218, 247, 285, 313]);
    expect(r.leg).not.toBeNull();
    expect(r.leg!.endTE).toBe(218);
    expect(r.plan?.actions.length).toBeGreaterThan(0);
    expect(r.tracker!.lines.length).toBeGreaterThan(0);
  }, 1_800_000);

  it('the save as it is: simulated to 218', async () => {
    const r = await caseOf(false);
    expect(r.leg).not.toBeNull();
    expect(r.leg!.endTE).toBe(218);
  }, 1_800_000);
});
