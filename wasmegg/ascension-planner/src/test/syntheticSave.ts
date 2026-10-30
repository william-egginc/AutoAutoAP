/**
 * A synthetic save (no player data) and the search inputs built from it the way initPlanFuture does,
 * for specs that run the real simulator: workerBackup.spec.ts (the trimmed save prices as the full one)
 * and leg.shiftTE.spec.ts (each shift's TE). Moved here from workerBackup.spec.ts on 15 Oct 2026.
 *
 * The save deliberately carries everything the worker trim drops: a home farm after the virtue farm,
 * home-farm artifacts, a mission archive, colleggtible contracts, and the usual identity fields. Its
 * virtue farm is farms[0] with equipped artifacts, so the continue variant runs, not only fresh builds.
 */
import '../../scripts/node-shims';

import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { customEggs } from 'lib/eggs';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { useActionsStore } from '@/stores/actions';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';
import type { SearchInputs } from '@/search/types';

export const NOW = Math.floor(Date.UTC(2026, 9, 1, 12, 0) / 1000);
export const PLAN_START = NOW + 3600;

/** A cumulative-delivery curve that puts each egg a little past its 38th Truth Egg. */
const TE_THRESHOLDS = [
  5e7, 1e9, 1e10, 7e10, 5e11, 2e12, 7e12, 2e13, 6e13, 1.5e14, 5e14, 1.5e15, 4e15, 1e16, 2.5e16, 5e16, 1e17, 1.5e17,
  2.1e17, 2.8e17, 3.6e17, 4.5e17, 5.5e17, 6.6e17, 7.8e17, 9.1e17, 1.05e18, 1.2e18, 1.36e18, 1.53e18, 1.71e18, 1.9e18,
  2.1e18, 2.31e18, 2.53e18, 2.76e18, 3.0e18, 3.25e18,
];

export function syntheticBackup(): any {
  const perEgg = [38, 38, 38, 38, 38];
  const epic = [
    ['hold_to_hatch', 15],
    ['epic_hatchery', 20],
    ['epic_internal_incubators', 20],
    ['video_doubler_time', 12],
    ['epic_clucking', 20],
    ['epic_multiplier', 100],
    ['cheaper_contractors', 10],
    ['bust_unions', 10],
    ['cheaper_research', 10],
    ['silo_capacity', 20],
    ['int_hatch_sharing', 10],
    ['int_hatch_calm', 20],
    ['accounting_tricks', 20],
    ['soul_eggs', 140],
    ['prestige_bonus', 20],
    ['drone_rewards', 20],
    ['epic_egg_laying', 20],
    ['transportation_lobbyist', 30],
    ['prophecy_bonus', 5],
    ['hold_to_research', 20],
    ['afx_mission_time', 60],
    ['afx_mission_capacity', 10],
  ].map(([id, level]) => ({ id, level }));
  // name, level, rarity, quantity, stones (name, level)
  const virtue: [number, number, number, number, [number, number][]][] = [
    [
      24,
      3,
      3,
      1,
      [
        [1, 2],
        [1, 2],
        [36, 2],
      ],
    ], // T4 legendary metronome, stoned
    [
      26,
      3,
      2,
      1,
      [
        [1, 2],
        [1, 2],
      ],
    ], // T4 epic compass
    [27, 3, 1, 1, [[36, 2]]], // T4 rare gusset
    [33, 2, 0, 12, []],
    [1, 2, 0, 12, []],
    [36, 2, 0, 12, []],
  ];
  const inventoryItems = virtue.map(([name, level, rarity, quantity, stones], i) => ({
    itemId: 910000000 + i,
    artifact: {
      spec: { name, level, rarity, egg: 1000 },
      stones: stones.map(([n, l]) => ({ name: n, level: l, rarity: 0 })),
    },
    quantity,
    serverId: '',
  }));
  const homeItems = [
    [0, 3, 2, 1],
    [3, 3, 1, 1],
    [8, 2, 0, 4],
  ].map(([name, level, rarity, quantity], i) => ({
    itemId: 920000000 + i,
    artifact: { spec: { name, level, rarity, egg: 1 } },
    quantity,
  }));
  const eggs = customEggs.slice(0, 3).map(e => e.identifier);
  const contract = (i: number, egg: string) => ({
    contract: { identifier: `synthetic-${i}`, customEggId: egg },
    contractIdentifier: `synthetic-${i}`,
    maxFarmSizeReached: 1e10,
    timeAccepted: NOW - 86400 * (10 + i),
  });
  return {
    userName: 'SyntheticFixture',
    eiUserId: 'EI0000000000000000',
    approxTime: NOW,
    settings: { lastBackupTime: NOW },
    game: { soulEggsD: 1e24, eggsOfProphecy: 180, permitLevel: 1, epicResearch: epic, maxFarmSizeReached: [1e9] },
    virtue: {
      shiftCount: 60,
      eovEarned: perEgg,
      eggsDelivered: perEgg.map(n => TE_THRESHOLDS[n - 1] * 1.01),
      afx: { tankFuels: [0, 0, 0, 0, 0] },
    },
    artifacts: { tankLevel: 7 },
    stats: { eggTotals: [1, 2, 3], numPrestiges: 400 },
    artifactsDb: {
      inventoryItems: homeItems,
      activeArtifactSets: [{ slots: [{ occupied: true, itemId: 920000000 }] }],
      artifactStatus: [{ spec: { name: 24, level: 3, rarity: 3 }, discovered: true, count: 1 }],
      missionArchive: Array.from({ length: 50 }, (_, i) => ({ ship: i % 10, missionId: `m${i}`, capacity: 10 })),
      virtueAfxDb: {
        inventoryItems,
        activeArtifacts: {
          slots: [
            { occupied: true, itemId: 910000000 },
            { occupied: true, itemId: 910000001 },
            { occupied: true, itemId: 910000002 },
            { occupied: false },
          ],
        },
      },
    },
    farms: [
      {
        eggType: 50,
        farmType: 2,
        habs: [12, 12, 13, 19],
        habPopulation: [2e7, 2e7, 3e7, 0],
        vehicles: [9, 9, 10, 10, 11],
        trainLength: [5, 5, 8, 8, 10],
        commonResearch: [
          { id: 'comfy_nests', level: 50 },
          { id: 'hab_capacity1', level: 8 },
          { id: 'leafsprings', level: 30 },
        ],
        silosOwned: 4,
        cashEarned: 1e20,
        cashSpent: 5e19,
        eggsLaid: 1e15,
        lastStepTime: NOW - 1800,
      },
      {
        eggType: 1,
        farmType: 0,
        habs: [18, 18, 18, 18],
        vehicles: [11, 11],
        trainLength: [10, 10],
        commonResearch: [{ id: 'comfy_nests', level: 50 }],
      },
    ],
    contracts: {
      archive: eggs.slice(0, 2).map((e, i) => contract(i, e)),
      contracts: [contract(9, eggs[2])],
    },
  };
}

/**
 * The synthetic save carrying `id` as a real save does (spec-savescrub): its own `eiUserId` and every contract's
 * `coopUserId`. Pass a made-up ID only (EI9876543210987654), never a real one.
 */
export function syntheticSaveWithId(id: string): any {
  const b = syntheticBackup();
  b.eiUserId = id;
  for (const c of [...b.contracts.archive, ...b.contracts.contracts]) c.coopUserId = id;
  return b;
}

/** The synthetic save loaded into fresh stores, and the search inputs for it (plain data, as a worker
 *  gets them). `final` 192: a two-TE leg from the save's 190. */
export async function syntheticInputs(): Promise<SearchInputs> {
  setActivePinia(createPinia());
  let backup = syntheticBackup();
  resolveColleggtibleContracts(backup);
  backup = markRaw(backup);
  // initPlanFuture's sequence, as chain.spec.ts does it.
  await resetAllStores();
  loadAndSyncBackup('file', backup, 'plan_next');
  rollUpPendingTE();
  const vs = useVirtueStore();
  vs.resetToCurrentDateTime();
  vs.setBankValue(0);
  vs.setCurrentEgg('curiosity');
  const as = useActionsStore();
  const sa = as.getStartAction();
  if (sa) {
    sa.payload.initialFarmState = undefined;
    sa.payload.isQuickContinue = false;
    sa.payload.initialEgg = 'curiosity';
  }
  await as.setInitialSnapshot(computeSnapshot(createBaseEngineState(null), getSimulationContext()));
  const baseState = createBaseEngineState(null);
  const raw: SearchInputs = {
    context: getSimulationContext(),
    baseState,
    currentFarmState: useInitialStateStore().currentFarmState,
    planStart: PLAN_START,
    currentTE: baseState.te ?? 190,
    final: 192,
    forceContinue: false,
  };
  return JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === 'function' ? undefined : v)));
}
