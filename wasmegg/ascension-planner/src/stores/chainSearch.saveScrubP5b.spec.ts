/**
 * spec-scrub-p5b (6 Nov 2026), red team P5 follow-up: "Download this save" still kept other players' names and ids in
 * the contract and co-op data, and two more values that link two downloads of one account. Now blank (approved by
 * Jordan, 6 Nov 2026):
 *
 *   (1) Other players, from the proto (ei.proto `MyContracts` and what it holds):
 *       - `contracts.currentCoopStatuses[]` (ContractCoopStatusResponse): `coopIdentifier`, `creatorId`;
 *         `contributors[]` (ContributionInfo) `uuid`, `userId`, `userName`, `pushId`; `gifts[]` (CoopGift) `userId`,
 *         `userName`, `tracking`; `chickenRuns[]` (ChickenRun) `userId`, `userName`.
 *       - `contracts.archive[]` / `contracts.contracts[]` (LocalContract) `coopIdentifier` and `evaluation.coopIdentifier`,
 *         and `contracts.lastCpi.unreadEvaluations[].coopIdentifier`: the co-op's code, which looks up its members.
 *   (2) Every artifact set's `uid` (ActiveArtifactSet: home, saved, virtue) and every mission's `missionLog`.
 *
 * Kept: the account's own `userName` (the name over the ID box, LeaderboardPanel's own row), and everything the
 * colleggtibles and the farm read from the contracts (`contract`, `contractIdentifier`, `maxFarmSizeReached`,
 * `timeAccepted`, `league`, `grade`). The scrubbed file loads back with the same colleggtible tiers and modifiers, the
 * same gear and the same earnings and laying rate as the original.
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
import { NOW, syntheticInputs, syntheticSaveWithId } from '@/test/syntheticSave';
import { backupText, keepSave, parseSaveFile } from '@/search/keptSaves';
import { gearStamp } from '@/search/tableGear';
import { virtueInventory } from '@/search/csv';
import { hashID } from '@/lib/storage/db';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import { blankLinkingIds, PLACEHOLDER_ID } from '@/lib/saveScrub';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import { computeSnapshot } from '@/engine/compute';
import { useInitialStateStore } from './initialState';
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
/** Every made-up name, id and code above: none may be left anywhere in a download. */
const SECRETS = [
  ...OTHER.flatMap(o => [o.userName, o.uuid]),
  OWN_UUID,
  ...PUSH,
  ...COOP,
  TRACKING,
  ...SET_UID.map(String),
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

/** The account's save as kept: its own name, the colleggtible contracts, the co-op it is in now with two other
 *  players (contributors, a gift, a chicken run), an unread evaluation, a uid on every artifact set and a log on
 *  every mission; an hour old. */
function keptBackup(): any {
  const b = syntheticSaveWithId(ID);
  b.userName = OWN_NAME;
  b.approxTime = NOW - 3600;
  b.settings = { lastBackupTime: NOW - 3600 };
  const eggs = customEggs.slice(0, 4).map(e => e.identifier);
  b.contracts = {
    archive: [
      contract(0, eggs[0], 1.2e10, COOP[0]),
      contract(1, eggs[1], 2e8, COOP[1]),
      contract(2, eggs[3], 1.5e7, COOP[2]),
      contract(3, eggs[0], 5e6, COOP[3]),
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
    lastCpi: { unreadEvaluations: [{ contractIdentifier: 'synthetic-3', coopIdentifier: COOP[3], cxp: 1003 }] },
  };
  const adb = b.artifactsDb;
  adb.activeArtifactSets[0].uid = SET_UID[0];
  adb.savedArtifactSets = [{ slots: [{ occupied: true, itemId: 920000001 }, { occupied: false }], uid: SET_UID[1] }];
  adb.virtueAfxDb.activeArtifacts.uid = SET_UID[2];
  let m = 0;
  for (const a of adb.missionArchive) a.missionLog = missionLog(m++);
  const mission = (status: ei.MissionInfo.Status, type: ei.MissionInfo.MissionType) => ({
    ship: 3,
    durationType: 1,
    status,
    type,
    capacity: 20,
    durationSeconds: 7200,
    secondsRemaining: 3600,
    startTimeDerived: NOW - 7200,
    fuel: [],
    missionLog: missionLog(m++),
  });
  const { EXPLORING, FUELING } = ei.MissionInfo.Status;
  const { VIRTUE, STANDARD } = ei.MissionInfo.MissionType;
  adb.missionInfos = [mission(EXPLORING, VIRTUE), mission(EXPLORING, STANDARD)];
  adb.fuelingMission = mission(FUELING, STANDARD);
  adb.virtueAfxDb.fuelingMission = mission(FUELING, VIRTUE);
  return b;
}
const MISSION_LOGS = (() => {
  const a = keptBackup().artifactsDb;
  return [...a.missionArchive, ...a.missionInfos, a.fuelingMission, a.virtueAfxDb.fuelingMission].map(
    x => x.missionLog as string
  );
})();

/** "Download this save" on the kept save of the account. */
async function download(): Promise<string> {
  const kept = await keepSave(await hashID(ID), keptBackup(), 190);
  const out = await useChainSearchStore().entrySaveFile(ID, kept);
  expect(out).not.toBeNull();
  return out!.text;
}

/** What the page shows for a save file loaded on screen for the account: the colleggtible tiers and modifiers (the
 *  Setup colleggtibles), the worn set, and the farm's laying rate and earnings now (the engine's snapshot). */
async function loadAndRead(text: string) {
  setActivePinia(createPinia());
  useUIStore().screenPlayerId = ID;
  const store = useChainSearchStore();
  expect(await store.loadSaveFile(ID, text)).toBe(true);
  expect(store.olderSaveError).toBeNull();
  const is = useInitialStateStore();
  // The save's own virtue farm as it stands (the continue state: its habs, vehicles, research and chickens).
  is.$patch({ isContinuing: true });
  const snap = computeSnapshot(createBaseEngineState(null), getSimulationContext());
  return {
    nickname: is.nickname,
    tiers: JSON.parse(JSON.stringify(is.colleggtibleTiers)) as Record<string, number>,
    modifiers: JSON.parse(JSON.stringify(is.colleggtibleModifiers)) as Record<string, number>,
    loadout: JSON.stringify(is.artifactLoadout),
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

describe('(1) a downloaded save carries no other player’s name or id, and no co-op code', () => {
  it('the current co-op: contributors, creator, gifts and chicken runs blank; their contributions kept', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    for (const s of SECRETS) expect(text, s).not.toContain(s);
    const [st] = file.contracts.currentCoopStatuses;
    expect(st.coopIdentifier).toBe('');
    expect(st.creatorId).toBe('');
    expect(st.contributors.length).toBe(3);
    for (const c of st.contributors) {
      expect(c.uuid).toBe('');
      expect(c.userId).toBe('');
      expect(c.userName).toBe('');
      expect(c.pushId).toBe('');
    }
    expect(st.contributors.map((c: any) => c.contributionAmount)).toEqual([5e14, 2e14, 2e14]);
    expect(st.contributors[1].farmInfo.habs).toEqual([18, 18, 18, 18]);
    expect(st.gifts).toEqual([{ userId: '', userName: '', amount: 5, tracking: '' }]);
    expect(st.chickenRuns).toEqual([{ userId: '', userName: '', amount: 1e6 }]);
    expect(st.contractIdentifier).toBe('synthetic-9');
  });

  it('every contract’s co-op code blank (its own and its evaluation’s, and the unread evaluations’)', async () => {
    setActivePinia(createPinia());
    const file = JSON.parse(await download());
    const all = [...file.contracts.archive, ...file.contracts.contracts];
    expect(all.length).toBe(5);
    for (const c of all) {
      expect(c.coopIdentifier).toBe('');
      expect(c.evaluation.coopIdentifier).toBe('');
      expect(c.evaluation.contractIdentifier).toBe(c.contractIdentifier);
      expect(c.coopUserId).toBe(PLACEHOLDER_ID);
    }
    expect(file.contracts.lastCpi.unreadEvaluations).toEqual([
      { contractIdentifier: 'synthetic-3', coopIdentifier: '', cxp: 1003 },
    ]);
  });

  it('the account’s own name kept; everything the colleggtibles and the farm read from the contracts kept', async () => {
    setActivePinia(createPinia());
    const file = JSON.parse(await download());
    expect(file.userName).toBe(OWN_NAME);
    const orig = keptBackup().contracts;
    const read = (cs: any[]) =>
      cs.map(c => ({
        contract: c.contract,
        contractIdentifier: c.contractIdentifier,
        maxFarmSizeReached: c.maxFarmSizeReached,
        timeAccepted: c.timeAccepted,
        league: c.league,
        grade: c.grade,
        numGoalsAchieved: c.numGoalsAchieved,
        cxp: c.evaluation.cxp,
      }));
    expect(read(file.contracts.archive)).toEqual(read(orig.archive));
    expect(read(file.contracts.contracts)).toEqual(read(orig.contracts));
  });
});

describe('(2) no artifact set uid and no mission log', () => {
  it('every set’s uid 0 (home, saved, virtue) and every mission’s log blank', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const adb = JSON.parse(text).artifactsDb;
    expect(adb.activeArtifactSets[0].uid).toBe(0);
    expect(adb.savedArtifactSets[0].uid).toBe(0);
    expect(adb.virtueAfxDb.activeArtifacts.uid).toBe(0);
    const missions = [...adb.missionArchive, ...adb.missionInfos, adb.fuelingMission, adb.virtueAfxDb.fuelingMission];
    expect(missions.length).toBe(MISSION_LOGS.length);
    for (const mi of missions) expect(mi.missionLog).toBe('');
    expect(text).not.toMatch(/SYNTHLOG/);
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

describe('the scrubbed file reads back as the original', () => {
  it('the same colleggtible tiers and modifiers, own name, worn set, laying rate and earnings', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const want = await loadAndRead(backupText(keptBackup()));
    // The check means something: four colleggtibles at four tiers, so the modifiers are not all 1.
    const eggs = customEggs.slice(0, 4).map(e => e.identifier);
    expect(eggs.map(e => want.tiers[e])).toEqual([3, 1, 3, 0]);
    expect(Object.values(want.modifiers).some(v => v !== 1)).toBe(true);
    expect(want.earnings.elr).toBeGreaterThan(0);
    expect(want.earnings.onlineEarnings).toBeGreaterThan(0);
    expect(want.nickname).toBe(OWN_NAME);
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
});
