/**
 * spec-scrub-p5 (6 Nov 2026), red team P5 (aaap-tools notes/redteam-code-2026-11-06.md): "Download this save" kept
 *
 *   (1) `contracts.archive[].reportedUuids` (and `contracts.contracts[]`'s): other players this account reported, and
 *   (2) the values that link two downloads of one account: every inventory item's `serverId` (home and virtue), every
 *       mission's `identifier`, and the account's own item numbers (`itemId`, `itemSequence`).
 *
 * Now the first two are blank and the item numbers are renumbered 1, 2, 3, ... (the page reads itemId: an equipped
 * slot names its item by it). As before: no player ID but the stand-in (`eiUserId`, every `coopUserId`) and no device
 * identifier. The scrubbed file still loads into the same account (R7 red team, finding 2), and the gear read from it
 * (the worn sets, the gear stamp's delivery-set picks, the owned inventory, the missions shown) is the original's.
 *
 * Since spec-scrub-p5b a download keeps only what the planner reads (lib/saveKeep.ts): the home inventory and sets,
 * the mission archive, the non-virtue missions, serverIds, mission identifiers, itemSequence and coopUserId are not in
 * the file at all; the virtue items are still renumbered.
 *
 * Real stores, the real download and the real save loader on the synthetic save with a made-up ID
 * (EI9876543210987654) and made-up identifiers, a fixed clock. No player data.
 */
import '../../scripts/node-shims';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { ei, resolveColleggtibleContracts } from 'lib';
import { NOW, syntheticInputs, syntheticSaveWithId } from '@/test/syntheticSave';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { keepSave, loadKeptSave, parseSaveFile } from '@/search/keptSaves';
import { accountOf } from '@/search/runSaves';
import { gearStamp } from '@/search/tableGear';
import { virtueInventory } from '@/search/csv';
import { hashID } from '@/lib/storage/db';
import { getArtifactLoadoutFromBackup, getOptimalEarningsSet } from '@/lib/artifacts';
import { blankLinkingIds, PLACEHOLDER_ID } from '@/lib/saveScrub';
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
const DEVICE = {
  deviceId: '0a1b2c3d-0000-4000-8000-123456789abc',
  gameServicesId: 'G:1234567890',
  gameServicesIdScoped: 'A:_0123456789abcdef0123456789abcdef',
  pushUserId: 'fedcba98-7654-4321-8000-0123456789ab',
};
/** Made-up identifiers, each shaped as a real save carries it and each unique, so a leftover is found by text. */
const REPORTED = [
  'aa11bb22cc33dd44ee55ff6600778899',
  '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
  'c0ffee00c0ffee00c0ffee00c0ffee00',
];
const serverId = (i: number) => `SYNTHSRV${String(i).padStart(10, '0')}`;
const missionId = (i: number) => `SYNTHMSN-${String(i).padStart(4, '0')}-feedface`;
const ITEM_SEQUENCE = 987654321;
const leftovers = (text: string) => (text.match(/EI\d{16}/gi) ?? []).filter(m => m.toUpperCase() !== PLACEHOLDER_ID);

/** The account's save as kept: its ID everywhere a real save has it, the device identifiers, other players reported,
 *  serverIds on every item, mission identifiers in every place a mission sits, a saved home set; an hour old. */
function keptBackup(): any {
  const b = syntheticSaveWithId(ID);
  Object.assign(b, DEVICE, { userName: 'SyntheticFixture', checksum: 123456789 });
  b.approxTime = NOW - 3600;
  b.settings = { lastBackupTime: NOW - 3600 };
  b.contracts.archive[0].reportedUuids = [REPORTED[0], REPORTED[1]];
  b.contracts.archive[1].reportedUuids = [];
  b.contracts.contracts[0].reportedUuids = [REPORTED[2]];
  let s = 0;
  const adb = b.artifactsDb;
  for (const item of [...adb.inventoryItems, ...adb.virtueAfxDb.inventoryItems]) item.serverId = serverId(s++);
  adb.itemSequence = ITEM_SEQUENCE;
  adb.savedArtifactSets = [{ slots: [{ occupied: true, itemId: 920000001 }, { occupied: false }], uid: 1 }];
  let m = 0;
  for (const a of adb.missionArchive) a.identifier = missionId(m++);
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
    identifier: missionId(m++),
  });
  const { EXPLORING, FUELING } = ei.MissionInfo.Status;
  const { VIRTUE, STANDARD } = ei.MissionInfo.MissionType;
  adb.missionInfos = [mission(EXPLORING, VIRTUE), mission(EXPLORING, STANDARD)];
  adb.fuelingMission = mission(FUELING, STANDARD);
  adb.virtueAfxDb.fuelingMission = mission(FUELING, VIRTUE);
  return b;
}
const MISSION_IDS = (() => {
  const a = keptBackup().artifactsDb;
  return [...a.missionArchive, ...a.missionInfos, a.fuelingMission, a.virtueAfxDb.fuelingMission].map(
    x => x.identifier as string
  );
})();
const ITEM_IDS = (() => {
  const a = keptBackup().artifactsDb;
  return [...a.inventoryItems, ...a.virtueAfxDb.inventoryItems].map(x => x.itemId as number);
})();

/** "Download this save" on the kept save of the account. */
async function download(): Promise<string> {
  const kept = await keepSave(await hashID(ID), keptBackup(), 190);
  const out = await useChainSearchStore().entrySaveFile(ID, kept);
  expect(out).not.toBeNull();
  return out!.text;
}

/** Each equipped slot of a set as the artifact it names (undefined when it names none). */
function worn(dbPart: any, set: any): unknown[] {
  const byId = new Map((dbPart.inventoryItems ?? []).map((i: any) => [i.itemId, i.artifact]));
  return (set?.slots ?? []).map((sl: any) => (sl.occupied ? byId.get(sl.itemId) : null));
}

let mem: Map<string, string>;
beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
beforeEach(() => {
  db.clear();
  mem = new Map<string, string>();
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

describe('(1) a downloaded save carries no other players’ UUIDs, and (2) nothing that links two downloads', () => {
  it('no reportedUuids, serverIds or mission identifiers, item numbers renumbered', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    // (1) Other players reported: none left, in the archive or the current contracts.
    for (const u of REPORTED) expect(text, u).not.toContain(u);
    for (const c of [...file.contracts.archive, ...file.contracts.contracts]) expect(c.reportedUuids).toBeUndefined();
    // (2) serverIds: none, on any item (the home inventory is not in the file: the page reads the virtue one only).
    const adb = file.artifactsDb;
    expect(adb.inventoryItems).toBeUndefined();
    const items = adb.virtueAfxDb.inventoryItems;
    expect(items.length).toBe(6);
    for (const item of items) expect(item.serverId).toBeUndefined();
    expect(text).not.toMatch(/SYNTHSRV/);
    // Mission identifiers: none (only the virtue missions are in the file, the page shows no other).
    expect(adb.missionArchive).toBeUndefined();
    expect(adb.fuelingMission).toBeUndefined();
    const missions = [...adb.missionInfos, adb.virtueAfxDb.fuelingMission];
    expect(missions.length).toBe(2);
    for (const mi of missions) expect(mi.identifier).toBeUndefined();
    for (const id of MISSION_IDS) expect(text).not.toContain(id);
    // The account's own item numbers: 1..n in file order, none of the originals; no itemSequence.
    expect(items.map((i: any) => i.itemId)).toEqual(items.map((_: unknown, i: number) => i + 1));
    for (const id of ITEM_IDS) expect(text).not.toContain(String(id));
    expect(adb.itemSequence).toBeUndefined();
    expect(text).not.toContain(String(ITEM_SEQUENCE));
  });

  it('as before: no player ID but the stand-in, no device identifiers', async () => {
    setActivePinia(createPinia());
    const text = await download();
    const file = JSON.parse(text);
    expect(leftovers(text)).toEqual([]);
    expect(file.eiUserId).toBe(PLACEHOLDER_ID);
    const contracts = [...file.contracts.archive, ...file.contracts.contracts];
    expect(contracts.length).toBe(3);
    // coopUserId is not in the file since spec-scrub-p5b (nothing reads it), nor the device identifiers or checksum.
    for (const c of contracts) expect(c.coopUserId).toBeUndefined();
    for (const [f, v] of Object.entries(DEVICE)) {
      expect(file[f], f).toBeUndefined();
      expect(text, f).not.toContain(v);
    }
    expect(file.userName).toBe('SyntheticFixture');
    expect(file.checksum).toBeUndefined();
  });

  it('every equipped slot still names the same artifact; a slot naming no item still names none', async () => {
    setActivePinia(createPinia());
    const file = JSON.parse(await download());
    const orig = keptBackup().artifactsDb;
    const adb = file.artifactsDb;
    expect(worn(adb.virtueAfxDb, adb.virtueAfxDb.activeArtifacts)).toEqual(
      worn(orig.virtueAfxDb, orig.virtueAfxDb.activeArtifacts)
    );
    // The home and saved sets are not in the file since spec-scrub-p5b (the page reads the virtue set only).
    expect(adb.activeArtifactSets).toBeUndefined();
    expect(adb.savedArtifactSets).toBeUndefined();
    // A dangling slot (the game's known inconsistent-backup case) stays dangling, not pointed at some other item.
    const b = keptBackup();
    b.artifactsDb.virtueAfxDb.activeArtifacts.slots[3] = { occupied: true, itemId: 123 };
    const out = blankLinkingIds(b);
    const v = out.artifactsDb.virtueAfxDb;
    expect(worn(v, v.activeArtifacts)[3]).toBeUndefined();
    expect(v.activeArtifacts.slots[3].itemId).not.toBe(123);
  });

  it('the kept save, and the save handed to the scrub, are left as they were', async () => {
    setActivePinia(createPinia());
    const hash = await hashID(ID);
    const kept = await keepSave(hash, keptBackup(), 190);
    await useChainSearchStore().entrySaveFile(ID, kept);
    const stored = (await loadKeptSave(hash, kept.key)) as any;
    expect(stored.contracts.archive[0].reportedUuids).toEqual([REPORTED[0], REPORTED[1]]);
    expect(stored.artifactsDb.virtueAfxDb.inventoryItems[0].serverId).toBe(serverId(3));
    expect(stored.artifactsDb.missionArchive[0].identifier).toBe(MISSION_IDS[0]);
    const b = keptBackup();
    const before = JSON.stringify(b);
    blankLinkingIds(b);
    expect(JSON.stringify(b)).toBe(before);
  });
});

describe('the scrubbed file reads back as the original', () => {
  it('loads into the same account (R7 red team, finding 2), with the same worn set and missions shown', async () => {
    setActivePinia(createPinia());
    const text = await download();
    // The original, loaded as the account's latest save: what the page shows for it.
    setActivePinia(createPinia());
    useUIStore().screenPlayerId = ID;
    const latest = keptBackup();
    resolveColleggtibleContracts(latest);
    await initPlanFuture(ID, markRaw(latest), 'fresh');
    const want = {
      loadout: JSON.stringify(useInitialStateStore().artifactLoadout),
      missions: JSON.stringify(useInitialStateStore().virtueMissions),
    };
    expect(JSON.parse(want.missions).length).toBe(2);
    const store = useChainSearchStore();
    expect(await store.loadSaveFile(ID, text)).toBe(true);
    expect(store.olderSaveError).toBeNull();
    const raw = useInitialStateStore().rawBackup as Record<string, unknown>;
    expect(raw.eiUserId).toBe(ID);
    expect(accountOf(raw)).toBe(accountOf({ eiUserId: ID }));
    expect(useUIStore().runSaveLoaded).toMatchObject({ from: 'file' });
    expect(useUIStore().runSaveLoaded?.noAccount).toBeFalsy();
    expect(JSON.stringify(useInitialStateStore().artifactLoadout)).toBe(want.loadout);
    expect(JSON.stringify(useInitialStateStore().virtueMissions)).toBe(want.missions);
  });

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
