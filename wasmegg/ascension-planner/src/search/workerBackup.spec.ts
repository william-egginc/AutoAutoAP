/**
 * The trimmed save chain-search workers receive (search/workerBackup.ts) must price every chain
 * exactly as the full save does. Bit-identical, not close: the run's results, its checkpoints and
 * the collector all assume a worker simulates what the page would.
 *
 * The fixture is synthetic (no player data) and deliberately carries everything the trim drops: a
 * home farm after the virtue farm, home-farm artifacts, a mission archive, colleggtible contracts,
 * and the usual identity fields. Its virtue farm is farms[0] with equipped artifacts, so the
 * continue variant (getArtifactLoadoutFromBackup, getOptimalEarningsSet, getOptimalELRSet on the
 * save's own habs and vehicles) runs, not only the fresh builds.
 *
 * A second test runs the same evaluations against a recording Proxy of the full save and requires
 * every property read to lie inside what the trim keeps, so a new reader of some other field fails
 * here rather than silently simulating against a missing value in the browser.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { customEggs } from 'lib/eggs';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { resetAllStores } from '@/lib/modes/reset';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { useActionsStore } from '@/stores/actions';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';
import { createChainEvaluator } from './chain';
import { continueTailParams, instantDeliveryScale, integrityWaitSeconds } from './leg';
import { inputsForWorkers, trimBackupForWorkers } from './workerBackup';
import type { SearchInputs } from './types';

const NOW = Math.floor(Date.UTC(2026, 9, 1, 12, 0) / 1000);
const PLAN_START = NOW + 3600;

/** A cumulative-delivery curve that puts each egg a little past its 38th Truth Egg. */
const TE_THRESHOLDS = [
  5e7, 1e9, 1e10, 7e10, 5e11, 2e12, 7e12, 2e13, 6e13, 1.5e14, 5e14, 1.5e15, 4e15, 1e16, 2.5e16, 5e16, 1e17, 1.5e17,
  2.1e17, 2.8e17, 3.6e17, 4.5e17, 5.5e17, 6.6e17, 7.8e17, 9.1e17, 1.05e18, 1.2e18, 1.36e18, 1.53e18, 1.71e18, 1.9e18,
  2.1e18, 2.31e18, 2.53e18, 2.76e18, 3.0e18, 3.25e18,
];

function syntheticBackup(): any {
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

/** What a worker received before the trim: the inputs, sanitized and structured-cloned. */
function asSent(inputs: SearchInputs): SearchInputs {
  return structuredClone(sanitizeLongs(inputs));
}

let base: SearchInputs;
let rawFull: any;

beforeAll(async () => {
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
  base = JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === 'function' ? undefined : v)));
  rawFull = base.context.rawBackup;
}, 120_000);

describe('trimBackupForWorkers', () => {
  it('keeps what the simulator reads, in the same nesting, and drops the rest', () => {
    const t: any = trimBackupForWorkers(rawFull, base.context);
    expect(Object.keys(t).sort()).toEqual(['artifactsDb', 'farms', 'game']);
    expect(Object.keys(t.artifactsDb).sort()).toEqual(['artifactStatus', 'virtueAfxDb']);
    expect(t.artifactsDb.virtueAfxDb).toEqual(rawFull.artifactsDb.virtueAfxDb);
    expect(t.farms).toHaveLength(1);
    expect(Object.keys(t.farms[0]).sort()).toEqual(['commonResearch', 'habs', 'trainLength', 'vehicles']);
    expect(t.game).toEqual({ permitLevel: 1, epicResearch: rawFull.game.epicResearch });
    expect(JSON.stringify(t).length).toBeLessThan(JSON.stringify(rawFull).length / 2);
  });

  it('keeps the contracts only when the context has no colleggtible modifiers to use instead', () => {
    const t: any = trimBackupForWorkers(rawFull, { colleggtibleModifiers: undefined as never });
    expect(t.contracts).toEqual({ archive: rawFull.contracts.archive, contracts: rawFull.contracts.contracts });
  });

  it('leaves no save alone, and an empty farm list empty', () => {
    expect(trimBackupForWorkers(null)).toBeNull();
    expect(trimBackupForWorkers(undefined)).toBeUndefined();
    expect((trimBackupForWorkers({ farms: [] }) as any).farms).toEqual([]);
    const noSave = { ...base, context: { ...base.context, rawBackup: undefined } };
    expect(inputsForWorkers(noSave)).toBe(noSave);
  });
});

describe('a worker given the trimmed save prices chains exactly as with the full one', () => {
  /** One leg, the first: the one that weighs "continue current ascension" (the save's own farm and
   *  equipped set) against the fresh builds (C1's earnings set, H1's and the sale buys' ELR sets).
   *  Each leg of this fixture is a minute or more of simulation, so one is what the test affords. */
  const CHAIN = [192];

  function everything(inputs: SearchInputs) {
    const k3 = { research: { comfy_nests: 50, hab_capacity1: 8 }, delivery: [] };
    return {
      chain: createChainEvaluator(inputs).evaluate(CHAIN),
      integrity: integrityWaitSeconds(inputs),
      tail: continueTailParams(inputs, inputs.planStart),
      scale: instantDeliveryScale(inputs, k3 as never),
    };
  }

  /** `v` behind Proxies that note every property read, as a path (array indices as `[]`, except the
   *  farm index, which matters). */
  function recording(v: unknown, read: Set<string>, path = ''): unknown {
    if (typeof v !== 'object' || v === null) return v;
    const step = (target: object, key: string) =>
      `${path}.${Array.isArray(target) && /^\d+$/.test(key) && !path.endsWith('.farms') ? '[]' : key}`;
    return new Proxy(v as object, {
      get(target, key, recv) {
        const value = Reflect.get(target, key, recv);
        if (typeof key === 'symbol' || typeof value === 'function') return value;
        const p = step(target, key);
        read.add(p);
        return recording(value, read, p);
      },
      has(target, key) {
        if (typeof key === 'string') read.add(step(target, key));
        return Reflect.has(target, key);
      },
    });
  }

  it('deep-equals, and reads nothing of the full save outside what the trim keeps', () => {
    const read = new Set<string>();
    const sent = asSent(base);
    const full = everything({
      ...sent,
      context: { ...sent.context, rawBackup: recording(sent.context.rawBackup, read) },
    });
    const trimmed = everything(asSent(inputsForWorkers(base)));

    // The fixture must exercise the paths that read the save: a priced leg, and continue's farm.
    expect(full.chain).not.toBeNull();
    expect(full.tail).not.toBeNull();
    expect(trimmed).toEqual(full);
    // toEqual treats -0 and 0, and undefined keys, loosely; the serialised form does not.
    expect(JSON.stringify(trimmed)).toBe(JSON.stringify(full));

    const allowed = [
      /^\.artifactsDb$/,
      /^\.artifactsDb\.(virtueAfxDb|artifactStatus)(\.|$)/,
      /^\.farms(\.length)?$/,
      /^\.farms\.0(\.(habs|vehicles|trainLength|commonResearch)(\..*)?)?$/,
      /^\.game(\.(permitLevel|epicResearch)(\..*)?)?$/,
    ];
    // The save's own farm and equipped set were read (continue), not only the inventory.
    expect(read).toContain('.farms.0.habs');
    expect(read).toContain('.artifactsDb.virtueAfxDb.activeArtifacts');
    expect([...read].filter(p => !allowed.some(re => re.test(p)))).toEqual([]);
  }, 900_000);
});
