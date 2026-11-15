/**
 * spec-scrub-p5b (6 Nov 2026), red team P5 follow-up: "Download this save" still kept other players' names and ids in
 * the contract and co-op data, and two more values that link two downloads of one account (approved by Jordan,
 * 6 Nov 2026). Then Jordan's ruling the same day: "We don't need that for virtue, do we? Why keep it then?" A
 * downloaded save keeps ONLY what the planner reads (lib/saveKeep.ts `plannerFieldsOnly`), so:
 *
 *   (1) No other player in it at all: `contracts.currentCoopStatuses` (the co-op's members, their farms and
 *       contribution amounts, gifts, chicken runs, its code and creator) is not in the file, nor any co-op code
 *       (`coopIdentifier`, an evaluation's, `lastCpi`'s unread evaluations).
 *   (2) No artifact set uid and no mission log or identifier: the home and saved sets are not in the file (the page
 *       reads the virtue set only), the virtue set has no uid, and only the virtue missions are, without either.
 *   (3) The gaps found last time are not in the file: `artifacts.itemBeingInfused` and `virtue.afx.itemBeingInfused`
 *       (their serverIds), `subInfo`'s `originalTransactionId`, `linkedTransactionId`, `pastUserIds` and history,
 *       `shellDb` (`savedConfigs`' serverId, id and displayName), `signature` and `checksum` (nothing verifies either:
 *       not the save loader, the upload guard, kept saves, lib's decoding or the collector).
 *   (4) Going forward: every leaf of the file is on one list, the fields the planner reads (each with its reader in
 *       lib/saveKeep.ts). Anything else a save carries, now or in a later game version, is left out.
 *
 * Kept: the account's own `userName`, and everything the colleggtibles, the farm, the gear, TE, fuel, missions,
 * Ultra and the save's clock read. The file loads back with the same colleggtible tiers and modifiers, the same gear,
 * the same earnings and laying rate and the same Setup state as the original; Manual Planner's import still refuses it
 * as it refuses the original (it takes plans, not saves).
 *
 * Real stores, the real download and the real save loader on the synthetic save with made-up IDs, names and codes
 * (EI9876543210987654 for the account, EI1234567890123456 and EI2345678901234567 for the others), a fixed clock.
 * No player data.
 */
import '../../scripts/node-shims';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ei, getColleggtibleTiers, resolveColleggtibleContracts } from 'lib';
import { customEggs } from 'lib/eggs';
import { COLLEGGTIBLE_CONTRACT_MAP } from 'lib/colleggtible-contracts';
import { NOW, syntheticInputs, syntheticSaveWithId } from '@/test/syntheticSave';
import { backupText, keepSave, loadKeptSave, parseSaveFile } from '@/search/keptSaves';
import { gearStamp } from '@/search/tableGear';
import { virtueInventory } from '@/search/csv';
import { hashID } from '@/lib/storage/db';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import { blankLinkingIds, PLACEHOLDER_ID } from '@/lib/saveScrub';
import { classifyLibraryFile } from '@/lib/uploadGuard';
import { saveClockOf } from '@/lib/saveFreshness';
import { saveFarmOf } from '@/lib/farmFacts';
import { createBaseEngineState, getSimulationContext } from 'lib/planners/engine/adapter';
import { computeSnapshot } from 'lib/planners/engine/compute';
import { useInitialStateStore } from './initialState';
import { usePlanStore } from '@/stores/plan';
import { useUIStore } from './ui';
import { useChainSearchStore } from './chainSearch';

const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/storage/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/storage/db')>()),
  ...(await import('@/test/memoryDb')).memoryDbModule(db),
  hashID: (await importOriginal<typeof import('@/lib/storage/db')>()).hashID,
}));

const ID = 'EI9876543210987654';
const OWN_NAME = 'SyntheticFixture';
const OTHER = [
  { userId: 'EI1234567890123456', userName: 'SynthOtherOne', uuid: 'synthuuid-0001-4000-8000-aaaaaaaaaaaa' },
  { userId: 'EI2345678901234567', userName: 'SynthOtherTwo', uuid: 'synthuuid-0002-4000-8000-bbbbbbbbbbbb' },
];
const OWN_UUID = 'synthuuid-0000-4000-8000-cccccccccccc';
const PUSH = ['synthpush-own-0000', 'synthpush-one-0001', 'synthpush-two-0002'];
const COOP = ['synthcoop-alpha', 'synthcoop-bravo', 'synthcoop-charlie', 'synthcoop-delta', 'synthcoop-echo'];
const TRACKING = 'synthtrack-gift-0001';
const SET_UID = [4242001, 4242002, 4242003];
const missionLog = (i: number) => `SYNTHLOG-${String(i).padStart(4, '0')}`;
const missionId = (i: number) => `SYNTHMSN-${String(i).padStart(4, '0')}`;
/** (3)'s made-up values: the infusing items' serverIds, the subscription's transactions and past users, the shell
 *  configs' ids and name, the signature and checksum, and the rest of what a save carries that the planner never reads. */
const GAPS = {
  infuseHome: 'synthinfuse-server-home-0001',
  infuseVirtue: 'synthinfuse-server-virtue-0002',
  originalTxn: 'synthtxn-original-0001',
  linkedTxn: 'synthtxn-linked-0002',
  pastUser: 'synthpastuser-0001',
  historyMsg: 'synthsubmsg-0001',
  shellServer: 'synthshell-server-0001',
  shellId: 'synthshell-id-0001',
  shellName: 'SynthShellConfigName',
  signature: 'SYNTHSIGNATUREc2lnbmF0dXJl',
  checksum: 3141592653,
  mail: 'synthmail-0001',
  tips: 'synthtips-0001',
  news: 'synthnews-0001',
  boost: 'synth_boost_token',
  season: 'synth-season-2026',
  storeStatus: 'synthstore-status',
};
/** Every made-up name, id and code above: none may be left anywhere in a download. */
const SECRETS = [
  ...OTHER.flatMap(o => [o.userName, o.uuid]),
  OWN_UUID,
  ...PUSH,
  ...COOP,
  TRACKING,
  ...SET_UID.map(String),
  ...Object.values(GAPS).map(String),
];

/** The colleggtible contracts: four custom eggs at four farm sizes (tiers 4, 2, 1 and 4), one egg twice (the larger
 *  counts), each in a co-op with its code and graded. */
function contract(i: number, egg: string, size: number, coop: string): any {
  return {
    contract: { identifier: `synthetic-${i}`, customEggId: egg },
    contractIdentifier: `synthetic-${i}`,
    coopIdentifier: coop,
    coopUserId: ID,
    maxFarmSizeReached: size,
    timeAccepted: NOW - 86400 * (10 + i),
    league: 0,
    grade: 5,
    numGoalsAchieved: 3,
    evaluation: { contractIdentifier: `synthetic-${i}`, coopIdentifier: coop, cxp: 1000 + i, coopSize: 3 },
  };
}

/** A colleggtible contract the save names only by its identifier (the game API no longer sends `contract`): lib
 *  resolves it from the bundled list. Its egg is none of the four above, so its tier shows on its own. */
const RESOLVED = (() => {
  const four = new Set(customEggs.slice(0, 4).map(e => e.identifier));
  const hit = [...COLLEGGTIBLE_CONTRACT_MAP.values()].find(c => c.customEggId && !four.has(c.customEggId))!;
  return { identifier: hit.identifier!, egg: hit.customEggId! };
})();

/** The account's save as kept: its own name, the colleggtible contracts (one by identifier only) and one that is not
 *  a colleggtible, the co-op it is in now with two other players (contributors with their farms and amounts, a gift,
 *  a chicken run), an unread evaluation and season progress, a uid on every artifact set, a log and an identifier on
 *  every mission (virtue and not), the gaps of (3), and the rest a save carries that the planner never reads; an hour
 *  old, on Ultra. */
function keptBackup(): any {
  const b = syntheticSaveWithId(ID);
  b.userName = OWN_NAME;
  b.approxTime = NOW - 3600;
  b.settings = { lastBackupTime: NOW - 3600, sfx: true, lastNotificationQueryTime: NOW - 99, userAdsEnabled: false };
  const eggs = customEggs.slice(0, 4).map(e => e.identifier);
  b.contracts = {
    archive: [
      contract(0, eggs[0], 1.2e10, COOP[0]),
      contract(1, eggs[1], 2e8, COOP[1]),
      contract(2, eggs[3], 1.5e7, COOP[2]),
      contract(3, eggs[0], 5e6, COOP[3]),
      {
        contractIdentifier: RESOLVED.identifier,
        coopIdentifier: COOP[3],
        coopUserId: ID,
        maxFarmSizeReached: 3e9,
        timeAccepted: NOW - 86400 * 20,
      },
      { ...contract(5, eggs[0], 9e12, COOP[2]), contract: { identifier: 'synthetic-5' } },
    ],
    contracts: [contract(9, eggs[2], 1.1e10, COOP[4])],
    currentCoopStatuses: [
      {
        contractIdentifier: 'synthetic-9',
        coopIdentifier: COOP[4],
        creatorId: OTHER[0].userId,
        totalAmount: 1e15,
        contributors: [
          { uuid: OWN_UUID, userId: ID, userName: OWN_NAME, pushId: PUSH[0], contributionAmount: 5e14, active: true },
          ...OTHER.map((o, i) => ({
            ...o,
            pushId: PUSH[i + 1],
            contractIdentifier: 'synthetic-9',
            contributionAmount: 2e14,
            soulPower: 30,
            farmInfo: { habs: [18, 18, 18, 18], commonResearch: [{ id: 'comfy_nests', level: 50 }] },
          })),
        ],
        gifts: [{ userId: OTHER[0].userId, userName: OTHER[0].userName, amount: 5, tracking: TRACKING }],
        chickenRuns: [{ userId: OTHER[1].userId, userName: OTHER[1].userName, amount: 1e6 }],
      },
    ],
    lastCpi: {
      unreadEvaluations: [{ contractIdentifier: 'synthetic-3', coopIdentifier: COOP[3], cxp: 1003 }],
      seasonProgress: [{ seasonId: GAPS.season, totalCxp: 5000, startingGrade: 5 }],
    },
    contractIdsSeen: ['synthetic-0', 'synthetic-9'],
    customEggInfo: [{ identifier: eggs[0] }],
  };
  const adb = b.artifactsDb;
  adb.activeArtifactSets[0].uid = SET_UID[0];
  adb.savedArtifactSets = [{ slots: [{ occupied: true, itemId: 920000001 }, { occupied: false }], uid: SET_UID[1] }];
  adb.virtueAfxDb.activeArtifacts.uid = SET_UID[2];
  adb.itemSequence = 930000000;
  adb.artifactStatus[0].seen = true;
  adb.artifactStatus[0].craftable = true;
  adb.virtueAfxDb.artifactStatus = [{ spec: { name: 24, level: 3, rarity: 3 }, count: 1 }];
  let m = 0;
  for (const a of adb.missionArchive) {
    a.missionLog = missionLog(m);
    a.identifier = missionId(m++);
  }
  const mission = (status: ei.MissionInfo.Status, type: ei.MissionInfo.MissionType) => ({
    ship: 3,
    durationType: 1,
    status,
    type,
    level: 2,
    capacity: 20,
    durationSeconds: 7200,
    secondsRemaining: 3600,
    startTimeDerived: NOW - 7200,
    qualityBump: 1.5,
    resetIndex: 2,
    targetArtifact: 24,
    fuel: [{ egg: 50, amount: 1e9 }],
    missionLog: missionLog(m),
    identifier: missionId(m++),
  });
  const { EXPLORING, FUELING } = ei.MissionInfo.Status;
  const { VIRTUE, STANDARD } = ei.MissionInfo.MissionType;
  adb.missionInfos = [mission(EXPLORING, VIRTUE), mission(EXPLORING, STANDARD)];
  adb.fuelingMission = mission(FUELING, STANDARD);
  adb.virtueAfxDb.fuelingMission = mission(FUELING, VIRTUE);
  // (3) The gaps found last time, and the rest of what a save carries that the planner never reads.
  const infusing = (itemId: number, serverId: string) => ({
    itemId,
    serverId,
    quantity: 1,
    artifact: { spec: { name: 24, level: 2, rarity: 0, egg: 1000 } },
  });
  b.artifacts = {
    ...b.artifacts,
    infusing: true,
    itemBeingInfused: infusing(920000005, GAPS.infuseHome),
    craftingXp: 12345,
  };
  b.virtue = {
    ...b.virtue,
    resets: 2,
    lastSync: NOW - 50,
    pastSimTime: 1234,
    activeAfx: [{ occupied: true, itemId: 910000000 }],
    afx: {
      ...b.virtue.afx,
      tankLevel: 3,
      itemBeingInfused: infusing(910000005, GAPS.infuseVirtue),
      inventoryScore: 77,
    },
  };
  b.subInfo = {
    subscriptionLevel: ei.UserSubscriptionInfo.Level.PRO,
    status: ei.UserSubscriptionInfo.Status.ACTIVE,
    originalTransactionId: GAPS.originalTxn,
    linkedTransactionId: GAPS.linkedTxn,
    pastUserIds: [GAPS.pastUser, OTHER[1].userId],
    history: [{ timestamp: NOW - 86400, messageId: GAPS.historyMsg, message: 'renewed' }],
    storeStatus: GAPS.storeStatus,
    platform: 1,
    periodEnd: NOW + 86400,
  };
  b.shellDb = {
    savedConfigs: [{ id: GAPS.shellId, serverId: GAPS.shellServer, displayName: GAPS.shellName, clientSaveTime: NOW }],
    shellInventory: [{ identifier: 'synthshell-item', owned: true }],
  };
  b.signature = GAPS.signature;
  b.checksum = GAPS.checksum;
  b.version = 7;
  b.forceBackup = true;
  b.userId = OTHER[0].uuid;
  b.deviceId = 'synthdevice-0001';
  b.tutorial = { introShown: true };
  b.misc = { friendRank: 5, globalRank: 9000 };
  b.readMailIds = [GAPS.mail];
  b.mailState = { readMailIds: [GAPS.mail], tipsChecksum: GAPS.tips };
  b.shells = { introAlert: true };
  b.mission = { currentMission: 'synth-current' };
  b.sim = { eggType: 1, habs: [1, 2] };
  Object.assign(b.game, {
    soulEggs: 123,
    goldenEggsEarned: 5000,
    maxEggReached: 19,
    news: [{ id: GAPS.news, read: true }],
    achievements: [{ id: 'synth-achievement', achieved: true }],
    eggMedalLevel: [4, 4, 4],
    numDailyGiftsCollected: 800,
    boosts: [{ boostId: GAPS.boost, count: 3 }],
  });
  Object.assign(b.farms[0], {
    farmType: 2,
    numChickensRunning: 5,
    hatcheryPopulation: 99,
    activeBoosts: [{ boostId: GAPS.boost }],
  });
  b.farms.push({ eggType: 3, farmType: 1, contractId: 'synthetic-9', habs: [18, 18, 18, 18], numChickens: 1e9 });
  return b;
}

/** Every leaf of `v` as a path, array positions as `[]` (sorted, each once). */
function leaves(v: unknown, at = ''): string[] {
  if (Array.isArray(v)) return [...new Set(v.flatMap(x => leaves(x, `${at}[]`)))].sort();
  if (v && typeof v === 'object')
    return [...new Set(Object.entries(v).flatMap(([k, x]) => leaves(x, at ? `${at}.${k}` : k)))].sort();
  return [at];
}

/** (4): the leaves a downloaded save may have, each read by the planner (its reader in lib/saveKeep.ts). */
const KEPT_LEAVES = [
  'approxTime',
  'artifacts.tankLevel',
  'artifactsDb.artifactStatus[].count',
  'artifactsDb.artifactStatus[].discovered',
  'artifactsDb.artifactStatus[].spec.level',
  'artifactsDb.artifactStatus[].spec.name',
  'artifactsDb.artifactStatus[].spec.rarity',
  'artifactsDb.missionInfos[].capacity',
  'artifactsDb.missionInfos[].durationSeconds',
  'artifactsDb.missionInfos[].durationType',
  'artifactsDb.missionInfos[].fuel[].amount',
  'artifactsDb.missionInfos[].fuel[].egg',
  'artifactsDb.missionInfos[].level',
  'artifactsDb.missionInfos[].ship',
  'artifactsDb.missionInfos[].startTimeDerived',
  'artifactsDb.missionInfos[].status',
  'artifactsDb.missionInfos[].targetArtifact',
  'artifactsDb.missionInfos[].type',
  'artifactsDb.virtueAfxDb.activeArtifacts.slots[].itemId',
  'artifactsDb.virtueAfxDb.activeArtifacts.slots[].occupied',
  'artifactsDb.virtueAfxDb.fuelingMission.capacity',
  'artifactsDb.virtueAfxDb.fuelingMission.durationSeconds',
  'artifactsDb.virtueAfxDb.fuelingMission.durationType',
  'artifactsDb.virtueAfxDb.fuelingMission.fuel[].amount',
  'artifactsDb.virtueAfxDb.fuelingMission.fuel[].egg',
  'artifactsDb.virtueAfxDb.fuelingMission.level',
  'artifactsDb.virtueAfxDb.fuelingMission.ship',
  'artifactsDb.virtueAfxDb.fuelingMission.startTimeDerived',
  'artifactsDb.virtueAfxDb.fuelingMission.status',
  'artifactsDb.virtueAfxDb.fuelingMission.targetArtifact',
  'artifactsDb.virtueAfxDb.fuelingMission.type',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.spec.egg',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.spec.level',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.spec.name',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.spec.rarity',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.stones[].level',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.stones[].name',
  'artifactsDb.virtueAfxDb.inventoryItems[].artifact.stones[].rarity',
  'artifactsDb.virtueAfxDb.inventoryItems[].itemId',
  'artifactsDb.virtueAfxDb.inventoryItems[].quantity',
  'contracts.archive[].contract.customEggId',
  'contracts.archive[].contractIdentifier',
  'contracts.archive[].maxFarmSizeReached',
  'contracts.archive[].timeAccepted',
  'contracts.contracts[].contract.customEggId',
  'contracts.contracts[].contractIdentifier',
  'contracts.contracts[].maxFarmSizeReached',
  'contracts.contracts[].timeAccepted',
  'eiUserId',
  'farms[].cashEarned',
  'farms[].cashSpent',
  'farms[].commonResearch[].id',
  'farms[].commonResearch[].level',
  'farms[].eggType',
  'farms[].eggsLaid',
  'farms[].habPopulation[]',
  'farms[].habs[]',
  'farms[].lastStepTime',
  'farms[].silosOwned',
  'farms[].trainLength[]',
  'farms[].vehicles[]',
  'game.eggsOfProphecy',
  'game.epicResearch[].id',
  'game.epicResearch[].level',
  'game.permitLevel',
  'game.soulEggsD',
  'settings.lastBackupTime',
  'subInfo.status',
  'subInfo.subscriptionLevel',
  'userName',
  'virtue.afx.tankFuels[]',
  'virtue.eggsDelivered[]',
  'virtue.eovEarned[]',
  'virtue.shiftCount',
];

/** "Download this save" on the kept save of the account. */
async function download(): Promise<string> {
  const kept = await keepSave(await hashID(ID), keptBackup(), 190);
  const out = await useChainSearchStore().entrySaveFile(ID, kept);
  expect(out).not.toBeNull();
  return out!.text;
}

/** What the page shows for a save file loaded on screen for the account: the colleggtible tiers and modifiers (the
 *  Setup colleggtibles), the worn set, the farm's laying rate and earnings now (the engine's snapshot), and the rest
 *  Setup and My runs read off the save (TE, fuel, missions, Ultra, soul eggs, epic research, the farm, the clock). */
async function loadAndRead(text: string) {
  setActivePinia(createPinia());
  useUIStore().screenPlayerId = ID;
  const store = useChainSearchStore();
  expect(await store.loadSaveFile(ID, text)).toBe(true);
  expect(store.olderSaveError).toBeNull();
  const is = useInitialStateStore();
  const setup = JSON.parse(
    JSON.stringify({
      isUltra: is.isUltra,
      soulEggs: is.soulEggs,
      lastBackupTime: is.lastBackupTime,
      epic: is.epicResearchLevels,
      teEarned: is.initialTeEarned,
      tePending: is.initialTePending,
      delivered: is.initialEggsDelivered,
      fuel: is.initialFuelAmounts,
      tank: is.initialTankLevel,
      farm: is.currentFarmState,
      missions: is.plannerMissions,
      saveNote: is.saveNote,
      shifts: usePlanStore().initialShiftCount,
      permit: (is.rawBackup as any)?.game?.permitLevel,
      clock: saveClockOf(is.rawBackup),
      saveFarm: saveFarmOf(is.rawBackup),
    })
  );
  // The save's own virtue farm as it stands (the continue state: its habs, vehicles, research and chickens).
  is.$patch({ isContinuing: true });
  const snap = computeSnapshot(createBaseEngineState(null), getSimulationContext());
  return {
    nickname: is.nickname,
    tiers: JSON.parse(JSON.stringify(is.colleggtibleTiers)) as Record<string, number>,
    modifiers: JSON.parse(JSON.stringify(is.colleggtibleModifiers)) as Record<string, number>,
    loadout: JSON.stringify(is.artifactLoadout),
    setup,
    earnings: {
      elr: snap.elr,
      layRate: snap.layRate,
      onlineEarnings: snap.onlineEarnings,
      offlineEarnings: snap.offlineEarnings,
      onlineIHR: snap.onlineIHR,
    },
  };
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
beforeEach(() => {
  db.clear();
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('(1) a downloaded save carries no other player, and no co-op code', () => {
  it('the current co-op is not in it: no contributors (names, ids, farms, amounts), creator, gifts or chicken runs', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    for (const s of SECRETS) expect(text, s).not.toContain(s);
    expect(file.contracts.currentCoopStatuses).toBeUndefined();
    expect(text).not.toMatch(/contributors|contributionAmount|farmInfo|soulPower|chickenRuns|gifts|creatorId/);
    expect(file.contracts.lastCpi).toBeUndefined();
  });

  it('no co-op code (a contract’s own, its evaluation’s, the unread evaluations’) and no co-op user id', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    const all = [...file.contracts.archive, ...file.contracts.contracts];
    expect(all.length).toBe(6);
    for (const c of all) {
      expect(c.coopIdentifier).toBeUndefined();
      expect(c.evaluation).toBeUndefined();
      expect(c.coopUserId).toBeUndefined();
    }
    expect(text).not.toMatch(/coopIdentifier|coopUserId|evaluation|reportedUuids/);
  });

  it('the account’s own name kept; every contract the colleggtibles count kept with what they read, no other', async () => {
    setActivePinia(createPinia());
    const file = JSON.parse(await download());
    expect(file.userName).toBe(OWN_NAME);
    const orig = keptBackup().contracts;
    const read = (cs: any[]) =>
      cs.map(c => ({
        customEggId: c.contract?.customEggId ?? COLLEGGTIBLE_CONTRACT_MAP.get(c.contractIdentifier)?.customEggId,
        contractIdentifier: c.contractIdentifier,
        maxFarmSizeReached: c.maxFarmSizeReached,
        timeAccepted: c.timeAccepted,
      }));
    // The archive's last one is no colleggtible (its contract has no egg): not in the file.
    expect(read(file.contracts.archive)).toEqual(read(orig.archive.slice(0, 5)));
    expect(read(file.contracts.contracts)).toEqual(read(orig.contracts));
    expect(file.contracts.archive[4].contract).toEqual({ customEggId: RESOLVED.egg });
  });
});

describe('(2) no artifact set uid and no mission log or identifier', () => {
  it('only the virtue set (no uid) and the virtue missions (no log, no identifier) are in the file', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const adb = JSON.parse(text).artifactsDb;
    expect(adb.activeArtifactSets).toBeUndefined();
    expect(adb.savedArtifactSets).toBeUndefined();
    expect(adb.inventoryItems).toBeUndefined();
    expect(adb.itemSequence).toBeUndefined();
    expect(adb.missionArchive).toBeUndefined();
    expect(adb.fuelingMission).toBeUndefined();
    expect(adb.virtueAfxDb.activeArtifacts.uid).toBeUndefined();
    const missions = [...adb.missionInfos, adb.virtueAfxDb.fuelingMission];
    expect(missions.map(x => x.type)).toEqual([ei.MissionInfo.MissionType.VIRTUE, ei.MissionInfo.MissionType.VIRTUE]);
    for (const mi of missions) {
      expect(mi.missionLog).toBeUndefined();
      expect(mi.identifier).toBeUndefined();
    }
    expect(text).not.toMatch(/SYNTHLOG|SYNTHMSN|"uid"/);
  });

  it('the save handed to the scrub is left as it was; a save without these fields gets none added', () => {
    const b = keptBackup();
    const before = JSON.stringify(b);
    blankLinkingIds(b);
    expect(JSON.stringify(b)).toBe(before);
    const bare = syntheticSaveWithId(ID);
    const out = blankLinkingIds(bare);
    expect(out.contracts.currentCoopStatuses).toBeUndefined();
    expect(out.contracts.archive[0].coopIdentifier).toBeUndefined();
    expect(out.contracts.archive[0].evaluation).toBeUndefined();
    expect(out.artifactsDb.activeArtifactSets[0].uid).toBeUndefined();
    expect(out.artifactsDb.missionArchive[0].missionLog).toBeUndefined();
  });
});

describe('(3) the gaps found last time are not in the file', () => {
  it('no infusing item (its serverId), no subscription transactions, past users or history, no shell configs', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    expect(file.artifacts).toEqual({ tankLevel: 7 });
    expect(file.virtue.afx).toEqual({ tankFuels: [0, 0, 0, 0, 0] });
    expect(file.subInfo).toEqual({
      subscriptionLevel: ei.UserSubscriptionInfo.Level.PRO,
      status: ei.UserSubscriptionInfo.Status.ACTIVE,
    });
    expect(file.shellDb).toBeUndefined();
    expect(text).not.toMatch(/itemBeingInfused|serverId|TransactionId|pastUserIds|savedConfigs|displayName/);
  });

  it('no signature and no checksum (nothing verifies either), and the file still loads', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    expect(file.signature).toBeUndefined();
    expect(file.checksum).toBeUndefined();
    expect(parseSaveFile(text)).toBeTruthy();
  });

  it('the kept save itself is left as it was (only the file is cut down)', async () => {
    setActivePinia(createPinia());
    const hash = await hashID(ID);
    const kept = await keepSave(hash, keptBackup(), 190);
    await useChainSearchStore().entrySaveFile(ID, kept);
    expect(await loadKeptSave(hash, kept.key)).toEqual(parseSaveFile(backupText(keptBackup())));
  });
});

describe('(4) going forward: only what the planner reads', () => {
  it('every leaf of the file is a field the planner reads', async () => {
    setActivePinia(createPinia());
    const file = JSON.parse(await download());
    expect(leaves(file)).toEqual(KEPT_LEAVES);
    // Of the farms, the first (the simulator's fallback) and the virtue one; here the same: the contract farm and the
    // home farm after it are not in the file.
    expect(file.farms.map((f: any) => f.eggType)).toEqual([50]);
  });

  it('a field the game adds later is left out too', async () => {
    setActivePinia(createPinia());
    const b = keptBackup();
    b.someFutureField = 'synthfuture-0001';
    b.game.someFutureCounter = 42;
    b.artifactsDb.virtueAfxDb.inventoryItems[0].artifact.someFutureTag = 'synthfuture-0002';
    const kept = await keepSave(await hashID(ID), b, 190);
    const text = (await useChainSearchStore().entrySaveFile(ID, kept))!.text;
    expect(text).not.toMatch(/someFuture|synthfuture/);
  });
});

describe('the scrubbed file reads back as the original', () => {
  it('the same colleggtible tiers and modifiers, own name, worn set, Setup state, laying rate and earnings', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const want = await loadAndRead(backupText(keptBackup()));
    // The check means something: four colleggtibles at four tiers and one resolved from the bundled list, so the
    // modifiers are not all 1; Ultra, two virtue missions, the farm and the clock read.
    const eggs = customEggs.slice(0, 4).map(e => e.identifier);
    expect(eggs.map(e => want.tiers[e])).toEqual([3, 1, 3, 0]);
    expect(want.tiers[RESOLVED.egg]).toBeGreaterThan(0);
    expect(Object.values(want.modifiers).some(v => v !== 1)).toBe(true);
    expect(want.earnings.elr).toBeGreaterThan(0);
    expect(want.earnings.onlineEarnings).toBeGreaterThan(0);
    expect(want.nickname).toBe(OWN_NAME);
    expect(want.setup.isUltra).toBe(true);
    expect(want.setup.missions.length).toBe(2);
    expect(want.setup.farm.eggType).toBe(50);
    expect(want.setup.clock.hasVirtueFarm).toBe(true);
    const got = await loadAndRead(text);
    expect(got).toEqual(want);
    // And straight from the files, as lib reads them.
    const tiers = (t: string) => {
      const raw = parseSaveFile(t);
      resolveColleggtibleContracts(raw);
      return getColleggtibleTiers(raw);
    };
    expect(tiers(text)).toEqual(tiers(backupText(keptBackup())));
    // And the readout would catch a scrub that touched what the colleggtibles read: the same save with every
    // contract's farm size under 10M reads lower tiers, modifiers and earnings.
    const small = keptBackup();
    for (const c of [...small.contracts.archive, ...small.contracts.contracts]) c.maxFarmSizeReached = 1e6;
    const less = await loadAndRead(backupText(small));
    expect(less.tiers).not.toEqual(want.tiers);
    expect(less.modifiers).not.toEqual(want.modifiers);
    expect(less.earnings).not.toEqual(want.earnings);
  }, 120_000);

  it('the same gear: worn set, earnings set, owned inventory, and the gear stamp’s delivery-set picks', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const scrubbed = () => parseSaveFile(text);
    const original = keptBackup;
    expect(getArtifactLoadoutFromBackup(scrubbed())).toEqual(getArtifactLoadoutFromBackup(original()));
    expect(getOptimalEarningsSet(scrubbed())).toEqual(getOptimalEarningsSet(original()));
    expect(virtueInventory(scrubbed())).toEqual(virtueInventory(original()));
    const research = { comfortable_nests: 50, hab_capacity1: 8, leafsprings: 30, lightweight_boxes: 40 };
    const stamp = async (from: () => any) => {
      const inputs = await syntheticInputs(from);
      return gearStamp(inputs, getArtifactLoadoutFromBackup(from()), research);
    };
    const want = await stamp(original);
    expect(want?.deliveryFull.length).toBeGreaterThan(0);
    expect(await stamp(scrubbed)).toEqual(want);
  }, 120_000);

  it('Manual Planner’s import takes plans, not saves: it refuses the file as it refuses the original', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const refusal = (t: string) => {
      try {
        classifyLibraryFile(JSON.parse(t));
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(refusal(backupText(keptBackup()))).toMatch(/isn't a plan/);
    expect(refusal(text)).toBe(refusal(backupText(keptBackup())));
  });
});
