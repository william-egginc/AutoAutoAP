/**
 * Files the page hands the player carry no player ID (spec-savescrub, 29 Oct 2026). A downloaded save had the
 * player's ID in `eiUserId` and in every contract's `coopUserId` (hundreds of them in a real save); every
 * EI + 16 digits in a download now becomes the stand-in below.
 *
 * And a save read back takes its account from the page, never from the file (`idFromScreen`): a scrubbed file
 * loads for the account on screen exactly as the original would, and with no account on screen it loads with
 * none (own instant answer, Follow, Saved answers and everything kept online are then off).
 *
 * The stand-in is "no account" wherever an ID comes IN from outside (a file, the player ID box, a link). Inside
 * the stores it is not special: specs use it as their test account (test/syntheticSave.ts).
 */

/** What every player ID in a downloaded file becomes. */
export const PLACEHOLDER_ID = 'EI0000000000000000';

const ANY_ID = /EI\d{16}/gi;
const IS_ID = /^EI\d{16}$/i;

/** The stand-in from a downloaded file (any case, spaces around it): never an account. */
export function isPlaceholderId(id: string | null | undefined): boolean {
  return /^EI0{16}$/i.test(String(id ?? '').trim());
}

/** Every EI + 16 digits in `text` as the stand-in. */
export function scrubPlayerIds(text: string): string {
  return text.replace(ANY_ID, PLACEHOLDER_ID);
}

/**
 * The same over a file given in pieces (utils/export `downloadParts`): a string piece is scrubbed, and the end of
 * one that could be the start of an ID ("E", "EI", "EI123…") is held back and joined to the next, so an ID split
 * across two pieces is still caught. Anything that is not a string (a Blob, bytes) passes as it is.
 */
export function* scrubParts(parts: Iterable<BlobPart>): Generator<BlobPart> {
  let carry = '';
  for (const part of parts) {
    if (typeof part !== 'string') {
      if (carry) yield scrubPlayerIds(carry);
      carry = '';
      yield part;
      continue;
    }
    const text = carry + part;
    const tail = /E(?:I\d{0,15})?$/i.exec(text);
    const cut = tail ? tail.index : text.length;
    carry = text.slice(cut);
    if (cut > 0) yield scrubPlayerIds(text.slice(0, cut));
  }
  if (carry) yield scrubPlayerIds(carry);
}

/**
 * A save's other persistent identifiers (QA's R7 red team, finding 1): the device, the Game Center / Play Games
 * player and the push-notification user. The page reads none of them (checked by grep, 1 Nov 2026), so a downloaded
 * save carries them blank. Since spec-scrub-p5b a download keeps only what the planner reads (lib/saveKeep.ts), so
 * these, `checksum` and `signature` are not in it at all (nothing verifies either on load); `userName` stays.
 */
export const DEVICE_ID_FIELDS = ['deviceId', 'gameServicesId', 'gameServicesIdScoped', 'pushUserId'] as const;

/** A copy of a save with `DEVICE_ID_FIELDS` blank (only those present; nothing added). `raw` is not changed. */
export function blankDeviceIds<T>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  const copy = { ...(raw as Record<string, unknown>) };
  for (const f of DEVICE_ID_FIELDS) if (f in copy && copy[f] != null) copy[f] = '';
  return copy as T;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The values that link two downloads of one account, and other players' identifiers (red team P5, 6 Nov 2026):
 *   - `contracts.archive[]` / `contracts.contracts[]` `.reportedUuids`: other players this account reported. Emptied.
 *   - `artifactsDb` (home and `virtueAfxDb`) `inventoryItems[].serverId`: the server's per-item id. Blanked.
 *   - Every mission's `identifier` (`missionInfos`, `missionArchive`, both `fuelingMission`s). Blanked.
 *   - `inventoryItems[].itemId`, the slots that point at them (`activeArtifactSets`, `savedArtifactSets`,
 *     `virtueAfxDb.activeArtifacts`) and `itemSequence`: the page DOES read itemId (an equipped slot names its item by
 *     it: lib/artifacts/virtue.ts, utils.ts `getArtifactLoadoutFromBackup`, lib Farm), so it is renumbered 1, 2, 3, ...
 *     in file order rather than blanked, every slot following its item (a slot naming no item still names none), and
 *     `itemSequence` is the next number. The worn and owned gear read back the same.
 * Nothing on the page reads serverId, a mission's identifier or reportedUuids (checked by grep, 6 Nov 2026: the
 * loaders, artifact and inventory parsing, the gear stamp, kept saves, the save loader, lib, ui and QA's harness).
 *
 * And (spec-scrub-p5b, 6 Nov 2026, approved by Jordan) every other player's name and id in the contract and co-op
 * data, from a review of ei.proto `MyContracts` and everything it holds, and two more values that link downloads:
 *   - `contracts.currentCoopStatuses[]` (ContractCoopStatusResponse): `coopIdentifier`, `creatorId`; each
 *     `contributors[]` (ContributionInfo) `uuid`, `userId`, `userName`, `pushId` (the account's own row too: the page
 *     reads the name only from the save's top-level `userName`); `gifts[]` `userId`, `userName`, `tracking`;
 *     `chickenRuns[]` `userId`, `userName`. Blanked. (A download has no `currentCoopStatuses` at all since Jordan's
 *     ruling the same day: lib/saveKeep.ts keeps only what the planner reads.)
 *   - `contracts.archive[]` / `contracts.contracts[]` `coopIdentifier` and `evaluation.coopIdentifier`, and
 *     `contracts.lastCpi.unreadEvaluations[].coopIdentifier`: the co-op's code, which looks up its members. Blanked.
 *   - Every artifact set's `uid` (`activeArtifactSets`, `savedArtifactSets`, `virtueAfxDb.activeArtifacts`): 0.
 *   - Every mission's `missionLog` (wherever a mission sits, as `identifier`). Blanked.
 * Kept: the save's own `userName` (initialState `nickname`, App's player name, LeaderboardPanel's own row) and all a
 * contract's colleggtibles and farm read (lib collegtibles.ts, contracts.ts `resolveColleggtibleContracts`, farm.ts,
 * prophecy_eggs.ts: `contract`, `contractIdentifier`, `maxFarmSizeReached`, `timeAccepted`, `league`, `grade`,
 * `numGoalsAchieved`). Nothing on the page, in lib or ui reads a field blanked here (checked by grep, 6 Nov 2026).
 * A copy of `raw` with only those changed (and only where present; nothing added). `raw` is not changed.
 */
export function blankLinkingIds<T>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  const copy = { ...(raw as Obj) };
  if (isObj(copy.contracts)) {
    const c = { ...copy.contracts };
    for (const k of ['archive', 'contracts'])
      if (Array.isArray(c[k])) c[k] = (c[k] as unknown[]).map(blankLocalContract);
    if (Array.isArray(c.currentCoopStatuses)) c.currentCoopStatuses = c.currentCoopStatuses.map(blankCoopStatus);
    if (isObj(c.lastCpi) && Array.isArray(c.lastCpi.unreadEvaluations))
      c.lastCpi = { ...c.lastCpi, unreadEvaluations: c.lastCpi.unreadEvaluations.map(x => blank(x, COOP_CODE)) };
    copy.contracts = c;
  }
  if (isObj(copy.artifactsDb)) {
    const next = { n: 1 };
    const db = renumberItems({ ...copy.artifactsDb }, ['activeArtifactSets', 'savedArtifactSets'], next);
    for (const k of ['missionInfos', 'missionArchive'])
      if (Array.isArray(db[k])) db[k] = (db[k] as unknown[]).map(blankMission);
    if (db.fuelingMission != null) db.fuelingMission = blankMission(db.fuelingMission);
    if (isObj(db.virtueAfxDb)) {
      const v = renumberItems({ ...db.virtueAfxDb }, ['activeArtifacts'], next);
      if (v.fuelingMission != null) v.fuelingMission = blankMission(v.fuelingMission);
      db.virtueAfxDb = v;
    }
    if (db.itemSequence != null) db.itemSequence = next.n;
    copy.artifactsDb = db;
  }
  return copy as T;
}

/** `x` (an object) with each of `fields` it has set to `to`; anything else as it is. */
function blank(x: unknown, fields: readonly string[], to: unknown = ''): unknown {
  if (!isObj(x) || !fields.some(f => x[f] != null)) return x;
  const out = { ...x };
  for (const f of fields) if (out[f] != null) out[f] = to;
  return out;
}

const COOP_CODE = ['coopIdentifier'] as const;
/** A co-op member, gift or chicken run: the player's ids and name (ei.proto ContributionInfo, CoopGift, ChickenRun). */
const PLAYER_FIELDS = ['uuid', 'userId', 'userName', 'pushId', 'tracking'] as const;

/** A LocalContract: reportedUuids emptied, the co-op's code (its own and its evaluation's) blank. */
function blankLocalContract(x: unknown): unknown {
  if (!isObj(x)) return x;
  const out = { ...x };
  if (out.coopIdentifier != null) out.coopIdentifier = '';
  if (out.reportedUuids != null) out.reportedUuids = [];
  if (out.evaluation != null) out.evaluation = blank(out.evaluation, COOP_CODE);
  return out;
}

/** A ContractCoopStatusResponse: its code and creator blank, and every member's, gift's and chicken run's player. */
function blankCoopStatus(x: unknown): unknown {
  if (!isObj(x)) return x;
  const copy = { ...(blank(x, ['coopIdentifier', 'creatorId']) as Obj) };
  for (const k of ['contributors', 'gifts', 'chickenRuns'])
    if (Array.isArray(copy[k])) copy[k] = (copy[k] as unknown[]).map(p => blank(p, PLAYER_FIELDS));
  return copy;
}

function blankMission(m: unknown): unknown {
  return blank(m, ['identifier', 'missionLog']);
}

/** An itemId as a key: a number, or a protobuf Long read as one (`{low, high, unsigned}`). */
function idKey(id: unknown): unknown {
  if (isObj(id) && typeof id.low === 'number' && typeof id.high === 'number')
    return (id.unsigned ? id.high >>> 0 : id.high) * 4294967296 + (id.low >>> 0);
  return id;
}

/**
 * `db` (a copy) with its inventory's serverIds blank and its itemIds renumbered from `next.n`, and the slots of the
 * sets under `setKeys` (each a set or a list of sets) following their items, each set's `uid` 0. A slot's id that
 * names no item gets a number of its own (still naming no item). Changes `db` and `next`, not what they point at.
 */
function renumberItems(db: Obj, setKeys: string[], next: { n: number }): Obj {
  const ids = new Map<unknown, number>();
  const fresh = (id: unknown): number => {
    const k = idKey(id);
    let n = ids.get(k);
    if (n === undefined) ids.set(k, (n = next.n++));
    return n;
  };
  if (Array.isArray(db.inventoryItems)) {
    db.inventoryItems = db.inventoryItems.map(item => {
      if (!isObj(item)) return item;
      const out = { ...item };
      if (out.serverId != null) out.serverId = '';
      if (out.itemId != null) out.itemId = fresh(out.itemId);
      return out;
    });
  }
  const set = (s: unknown): unknown => {
    const out = blank(s, ['uid'], 0);
    return isObj(out) && Array.isArray(out.slots)
      ? {
          ...out,
          slots: out.slots.map(sl => (isObj(sl) && sl.itemId != null ? { ...sl, itemId: fresh(sl.itemId) } : sl)),
        }
      : out;
  };
  for (const k of setKeys) {
    if (Array.isArray(db[k])) db[k] = (db[k] as unknown[]).map(set);
    else if (db[k] != null) db[k] = set(db[k]);
  }
  return db;
}

/** An ID compared as an account: trimmed, the "mk2!" super-user prefix (lib/schema PlayerIdSchema) dropped, upper case. */
function plainId(id: string | null | undefined): string {
  return String(id ?? '')
    .trim()
    .replace(/^mk2!/i, '')
    .toUpperCase();
}

/** Whether two IDs name the same account (`plainId`); never for a blank one or the stand-in. */
export function sameAccountId(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = plainId(a);
  return IS_ID.test(x) && !isPlaceholderId(x) && x === plainId(b);
}

/** The account fields of a save that the page reads (search/runSaves.ts `accountOf`, the stores' `eiUserId`). */
type SaveIds = { eiUserId?: string | null; userId?: string | null };

/**
 * A save read from a file, given the account on screen: 'ok' with its ID set to that account's (a scrubbed file, one
 * with no ID, or the same account's own); 'other' when it names a different real account (left as it is, for the
 * caller to refuse); 'none' with no account on screen, its IDs blanked, so nothing is keyed by a file's ID.
 * Everything else in the save is kept. Changes `raw`.
 */
export function idFromScreen(raw: SaveIds, screenId: string): 'ok' | 'other' | 'none' {
  const screen = isPlaceholderId(screenId) ? '' : (screenId ?? '').trim();
  const file = String(raw.eiUserId ?? '').trim();
  const userIdIsId = IS_ID.test(String(raw.userId ?? '').trim());
  if (!screen) {
    if (raw.eiUserId != null) raw.eiUserId = '';
    if (userIdIsId) raw.userId = '';
    return 'none';
  }
  if (file && !isPlaceholderId(file)) {
    // A real ID in the file: another account's when both are IDs and differ (the caller refuses it). The same
    // account in another form (lower case, the "mk2!" super-user prefix) is this account, with the screen's form, so
    // the loaded save's account check (chainSearch `loadOlderSave`) sees the same ID (R7 red team, finding 2).
    const a = plainId(file);
    const b = plainId(screen);
    if (IS_ID.test(a) && IS_ID.test(b)) {
      if (a !== b) return 'other';
      raw.eiUserId = screen;
    }
    return 'ok';
  }
  raw.eiUserId = screen;
  if (userIdIsId && isPlaceholderId(raw.userId)) raw.userId = screen;
  return 'ok';
}

/** Said when a save is loaded with no account on screen (DRAFT wording, for Words). */
export const NO_ACCOUNT_LINE =
  'This save is loaded without an account, so these are off: your own instant answer, Follow, Saved answers, and anything saved online or sent to the Leaderboard. Enter your player ID at the top to turn them on.';
