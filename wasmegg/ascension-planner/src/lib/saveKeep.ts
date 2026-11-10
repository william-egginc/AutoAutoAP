/**
 * A downloaded save keeps ONLY what the planner reads (Jordan, 6 Nov 2026: "We don't need that for virtue, do we? Why
 * keep it then?"). "Download this save" (stores/chainSearch.ts `entrySaveFile`) cuts the kept save down to the fields
 * below before the id scrub (lib/saveScrub.ts); everything else a save carries, now or in a later game version, is
 * left out: other players (the co-op's members, their farms and amounts), co-op codes, the home farm's artifacts and
 * sets, contract farms, the mission archive, mail, shells, the subscription's transactions, the signature and checksum
 * (nothing verifies either: not the save loader, the upload guard, kept saves, lib's decoding or the collector) and
 * the device and game-service ids. The file loads back as the original does: the same colleggtibles, gear, earnings,
 * TE, fuel, missions and Setup state (chainSearch.saveScrubP5b.spec.ts).
 *
 * Kept, with what reads each (checked by grep over src, scripts, lib and ui, 6 Nov 2026):
 *   - `eiUserId`: the account check on load (saveScrub.ts `idFromScreen`, runSaves.ts `accountOf`); always the
 *     stand-in in a download.
 *   - `userName`: the name over the ID box (initialState.ts `loadFromBackup`).
 *   - `approxTime`, `settings.lastBackupTime`: the save's time (initialState.ts, saveFreshness.ts `backupSecondsOf`,
 *     chainSearch.ts `loadOlderSave`, uploadGuard.ts `checkSave`).
 *   - `game.soulEggsD`, `game.permitLevel`, `game.epicResearch` (id, level): initialState.ts, lib/artifacts/virtue.ts,
 *     utils.ts `getOptimalEarningsSet`, saveFreshness.ts, useNowPage.ts. `game.eggsOfProphecy`: scripts/fastsearch.ts
 *     `--dump-state` (a downloaded save can be its `--backup`).
 *   - `virtue.shiftCount`, `virtue.eovEarned`, `virtue.eggsDelivered`, `virtue.afx.tankFuels`, `artifacts.tankLevel`:
 *     TE, shifts and fuel (backupVirtue.ts, initialState.ts, farmFacts.ts, saveFreshness.ts, startProvenance.ts).
 *   - `subInfo.subscriptionLevel`, `subInfo.status`: Ultra (initialState.ts `isUltra`).
 *   - `farms`: the first one (lib/artifacts/virtue.ts `getOptimalELRSet` reads `farms[0]`) and the virtue one (egg 50
 *     to 54: backupVirtue.ts `parseVirtueFarm`, farmFacts.ts, planPace.ts, saveFreshness.ts, onVirtue.ts), each with
 *     only `FARM`'s fields.
 *   - `contracts.archive`, `contracts.contracts`: the colleggtible contracts only (lib collegtibles.ts reads
 *     `contract.customEggId` and `maxFarmSizeReached`; contracts.ts `resolveColleggtibleContracts` fills `contract`
 *     from `contractIdentifier` and `timeAccepted`). A contract with no custom egg counts for nothing and is left out.
 *   - `artifactsDb.virtueAfxDb`: its inventory and equipped set (lib Inventory with `virtue`, utils.ts
 *     `getArtifactLoadoutFromBackup`, virtue.ts, csv.ts `virtueInventory`) and its fueling mission;
 *     `artifactsDb.artifactStatus` (lib Inventory: crafted counts, discovered); `artifactsDb.missionInfos` (the
 *     missions shown: initialState.ts `plannerMissions`, lib Mission). Missions: the virtue ones only (the page shows
 *     no other), with `MISSION`'s fields.
 * Not kept although something in lib reads it: what lib Farm, prophecy_eggs.ts and contract_seasons.ts read (the home
 * farm's sets and inventory, `game.eggMedalLevel`, `numDailyGiftsCollected`, `contracts.lastCpi`, a contract's
 * `league`, `grade`, `numGoalsAchieved`, `evaluation`): the planner never calls them (its artifact picks use virtue
 * strategies only, which build no Farm and read no prophecy eggs).
 */
import { resolveColleggtibleContracts } from 'lib';

type Obj = Record<string, unknown>;
/** A field kept as it is (`true`) or cut down to its own kept fields (on each element, for a list). */
type Keep = true | { readonly [field: string]: Keep };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const RESEARCH = { id: true, level: true } as const;
const SPEC = { name: true, level: true, rarity: true, egg: true } as const;
/** A mission as lib Mission reads it for the missions shown (lib/missions.ts; no `identifier` or `missionLog`). */
const MISSION = {
  ship: true,
  status: true,
  durationType: true,
  type: true,
  level: true,
  capacity: true,
  durationSeconds: true,
  startTimeDerived: true,
  targetArtifact: true,
  fuel: { egg: true, amount: true },
} as const;
/** A farm as parseVirtueFarm, farmFacts.ts `saveFarmOf`, saveFreshness.ts and virtue.ts read it. */
const FARM = {
  eggType: true,
  habs: true,
  habPopulation: true,
  numChickens: true,
  vehicles: true,
  trainLength: true,
  commonResearch: RESEARCH,
  unclaimedCash: true,
  cashEarned: true,
  cashSpent: true,
  silosOwned: true,
  eggsLaid: true,
  lastStepTime: true,
} as const;
const CONTRACT = {
  contract: { customEggId: true },
  contractIdentifier: true,
  timeAccepted: true,
  maxFarmSizeReached: true,
} as const;

/** Everything a downloaded save keeps (see the module comment for what reads each). */
const KEEP = {
  eiUserId: true,
  userName: true,
  approxTime: true,
  settings: { lastBackupTime: true },
  game: { soulEggsD: true, eggsOfProphecy: true, permitLevel: true, epicResearch: RESEARCH },
  virtue: { shiftCount: true, eovEarned: true, eggsDelivered: true, afx: { tankFuels: true } },
  artifacts: { tankLevel: true },
  subInfo: { subscriptionLevel: true, status: true },
  farms: FARM,
  contracts: { archive: CONTRACT, contracts: CONTRACT },
  artifactsDb: {
    artifactStatus: { spec: SPEC, count: true, discovered: true, recipeDiscovered: true },
    missionInfos: MISSION,
    virtueAfxDb: {
      inventoryItems: { itemId: true, quantity: true, artifact: { spec: SPEC, stones: SPEC } },
      activeArtifacts: { slots: { occupied: true, itemId: true } },
      fuelingMission: MISSION,
    },
  },
} as const;

/** `v` cut down to `keep`: an object to its kept fields (those it has), a list element by element; a value that is
 *  not the shape `keep` expects is dropped (undefined). New objects and lists; `v` is not changed. */
function cut(v: unknown, keep: Keep): unknown {
  if (keep === true) return v;
  if (Array.isArray(v)) return v.map(x => cut(x, keep)).filter(x => x !== undefined);
  if (!isObj(v)) return undefined;
  const out: Obj = {};
  for (const [k, sub] of Object.entries(keep)) {
    if (v[k] === undefined) continue;
    const c = cut(v[k], sub);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

const VIRTUE_MISSION = 1; // ei.MissionInfo.MissionType.VIRTUE: lib Mission's `type` is `missionInfo.type || STANDARD`
const isVirtueMission = (m: unknown) => isObj(m) && m.type === VIRTUE_MISSION;
const isVirtueFarm = (f: unknown) => isObj(f) && typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54;

/**
 * A copy of the save with only the fields the planner reads (`KEEP`): the first farm and the virtue one, the
 * colleggtible contracts, the virtue missions. `raw` is not changed. Anything not an object comes back as it is.
 */
export function plannerFieldsOnly<T>(raw: T): T {
  if (!isObj(raw)) return raw;
  const src: Obj = { ...raw };
  if (Array.isArray(src.farms)) src.farms = src.farms.filter((f, i) => i === 0 || isVirtueFarm(f));
  if (isObj(src.artifactsDb)) {
    const adb: Obj = { ...src.artifactsDb };
    if (Array.isArray(adb.missionInfos)) adb.missionInfos = adb.missionInfos.filter(isVirtueMission);
    if (isObj(adb.virtueAfxDb) && !isVirtueMission(adb.virtueAfxDb.fuelingMission))
      adb.virtueAfxDb = { ...adb.virtueAfxDb, fuelingMission: undefined };
    src.artifactsDb = adb;
  }
  const out = cut(src, KEEP) as Obj;
  if (isObj(out.contracts)) {
    // The contracts as the planner reads them: `contract` filled from the bundled list where the save names a
    // colleggtible contract only by its identifier (what the save loader does), then only those with a custom egg.
    const c = out.contracts as { archive?: Obj[]; contracts?: Obj[] };
    resolveColleggtibleContracts({ contracts: c } as never);
    for (const k of ['archive', 'contracts'] as const)
      if (Array.isArray(c[k]))
        c[k] = c[k]
          .map(x => cut(x, CONTRACT) as Obj)
          .filter(
            x => isObj(x.contract) && typeof x.contract.customEggId === 'string' && x.contract.customEggId !== ''
          );
  }
  return out as T;
}
