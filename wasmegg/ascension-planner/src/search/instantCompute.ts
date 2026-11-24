/**
 * THE INSTANT ANSWER'S PRICING INPUTS, IN ONE PLACE (26 Oct 2026, Jordan: My Runs said "not priced on this save yet"
 * after his Setup changed, until Highest TE by a date was opened on another tab). The instant answer
 * (components/auto/InstantRoute.vue) and My Runs (composables/useInstantCompute.ts) both read:
 *
 *   - which table the answer reads (`chooseInstantTable`): the player's own when it was built on the gear the save has
 *     now and by this simulator, else a board gear combination's exactly like theirs below GEAR_TABLE_TO, else the
 *     maxed table moved to their gear (the form G), else the maxed one; each under its `.v2` name first;
 *   - the player's own first ascensions to every stop (`instantFirstLegs`): continue, the build-up and a fresh build,
 *     held for the hours and the no-prestige days as the answer holds them;
 *   - the options its routes are priced with (`instantPricingOptions`, routeFinder.ts PolishOptions).
 *
 * The instant answer goes on to find and polish its routes; My Runs stops here and keeps the pricing record
 * (lib/followEstimate.ts `recordPricing`), which is all that pricing a followed route needs (routeFinder.ts
 * `priceChain`: the table, the first ascensions and these options). One pipeline: neither has a copy of it.
 *
 * No Vue, no stores: what it reads from the page comes in as functions.
 */
import type { TableHeader } from './precomputedTable';
import { compositeUrl, deliveryUrl, gearRowsOfUrl, gearShiftUrl, parseGearShiftUrl } from './precomputedTable';
import { isTableStall, probeFirst } from './tableFetch';
import {
  deliveryKey,
  deliveryTableFile,
  earningsKey,
  gearChanges,
  gearStamp,
  gearTableFiles,
  legacyGearTableName,
  stonesKey,
  type TableGear,
} from './tableGear';
import { tableSimMismatch } from './simVersion';
import { instantDeliveryScale, saveSiloSeconds } from './leg';
import { gearShiftKey, instantGearShift, instantTail, nearMaxedGear } from './instantGear';
import { instantFirstLegsBase, type BuildUpFlags, type BuildUpTailsResult } from './instantFirstLegs';
import { cardDeliveryScale } from './instantScale';
import type { FirstLegsBase } from './priceOnTable';
import { CLIFF_JUMP, CLIFF_LAG, type FirstLeg, type PolishOptions, type TailOptions } from './routeFinder';
import type { Availability } from './availabilitySchedule';
import type { BuildParams } from './precomputedLeg';
import type { SearchInputs, TimeOffWindow } from './types';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SimulationContext } from '@/engine/types';

/** Where gear tables end and the maxed table takes over: from there it is exact for any gear on the
 *  board (the collector analyst, 1 Oct, B2). */
export const GEAR_TABLE_TO = 340;

/** What the table choice reads: a route pool's `header` (the worker loads the file), the maxed table's URL, the folder
 *  the tables are in, the player's own table's URLs, the save's inputs and earnings set. */
export interface InstantTableDeps {
  pool: { header(url: string): Promise<TableHeader> };
  /** The maxed table (tableBracket.ts MAXED_TABLE_FILE under `base`). */
  maxedUrl: string;
  /** The tables' folder, ending in '/' (`${BASE_URL}precompute/`). */
  base: string;
  /** Where the player's own table would be (search/tableGear.ts ownTableNames under `base`); none without a save. */
  ownTableUrls: () => Promise<string[]>;
  /** The store's `collectInputs` (read at each step, as the card always did). */
  inputs: () => SearchInputs;
  /** The save's earnings set (the store's `readInventory().earnings`). */
  earnings: () => EquippedArtifact[] | null | undefined;
  /** The file names tables.json lists, each entry's file and aliases (search/tableListing.ts `listedTableNames`): an
   *  own or gear name not among them is not asked for (review 15 Nov 2026 P6: every name was, one by one, each a
   *  request). Null, or absent, when tables.json can't be read: every name is asked for, as before. */
  listed?: () => Promise<ReadonlySet<string> | null>;
  /** The save's TE (whole): an own or gear table that starts above it is passed over, so a player below a gear
   *  table's first TE gets the form G or the maxed table, not "No instant answer" (code review 22 Nov 2026,
   *  T1.5). Absent: every table is taken as before (the command line). */
  te?: number;
}

export interface InstantTableChoice {
  url: string;
  header: TableHeader;
  /** What changed since the player's own table was made, when it no longer fits their save ('' otherwise). */
  mismatch: string;
  /** The gear stamp's legacy hash, for an instant answer record ('' without a stamp). */
  stampHash: string;
  /** The maxed table moved to the player's gear (the form G), or a delivery set's table moved to it: already at their
   *  delivery. */
  gearShifted: boolean;
  /** The delivery set whose table answered (search/tableGear.ts `deliveryKey`, e.g. `T4L-T4E-T4L`), for the record
   *  code to read; absent otherwise. Not sent yet: the live collector takes only own / gear / maxed (worker.js). */
  deliveryKey?: string;
  /** The player's own delivery set, whether or not a table has it (Jordan, 24 Nov 2026: to see which are wanted);
   *  absent without a save or when their best set lacks one of the three. Not sent yet. */
  playerDeliveryKey?: string;
  /** What the instant answer record could say about the player's gear (Jordan, 24 Nov 2026), under the collector's
   *  names (gear.delivery, gear.earnings, gear.deliveryStones, gear.earningsStones, gear.noTable; collector 8aa9bc925):
   *  their delivery and earnings sets' keys, the stones slotted in each (tableGear.ts `stonesKey`), and whether no
   *  delivery table is listed for their set (left out when tables.json can't be read). Each left out when unknown.
   *  Kept, not sent: it waits on the consent wording. */
  playerGear?: PlayerGear;
}

export interface PlayerGear {
  delivery?: string;
  earnings?: string;
  deliveryStones?: string;
  earningsStones?: string;
  noTable?: boolean;
}

/**
 * The table the instant answer reads for this save. Throws what the loader throws (a missing file, a stall, a worker
 * that never started: search/tableFetch.ts `tableLoadFailed` tells those apart).
 */
export async function chooseInstantTable(d: InstantTableDeps): Promise<InstantTableChoice> {
  const { pool: p, maxedUrl: TABLE_URL } = d;
  const listed = (await d.listed?.().catch(() => null)) ?? null;
  const isListed = (u: string) => !listed || listed.has(u.slice(u.lastIndexOf('/') + 1));
  const startsAbove = (t: TableHeader) => d.te !== undefined && d.te < t.from;
  const ownTableUrls = async () => (await d.ownTableUrls()).filter(isListed);
  let url = TABLE_URL;
  let h: TableHeader | null = null;
  let mismatch = '';
  let stampHash = '';
  // The player's gear (search/tableGear.ts), at their own table's research when they have one, else the maxed one's:
  // their delivery set's key comes from it either way (`playerDeliveryKey`).
  let stamp: TableGear | null = null;
  // Under its `.v2` name, else the plain one: one this page can't read is none (tableFetch.ts probeFirst).
  // No table of their own (the usual case): the maxed one. A stall stops here.
  const ownHit = await probeFirst(await ownTableUrls().catch(() => []), u => p.header(u));
  const mine = ownHit?.url ?? null;
  const oh = ownHit?.header ?? null;
  if (oh?.gear && mine) {
    stamp = gearStamp(d.inputs(), d.earnings(), oh.gear.research);
    const changes = stamp ? gearChanges(oh.gear, stamp) : ['gear'];
    // INSTANT ANSWER V2: only a table made by this simulator; an older one gives way to the form G below.
    if (!changes.length) {
      if (!tableSimMismatch(oh) && !startsAbove(oh)) {
        url = mine;
        h = oh;
      }
    } else mismatch = changes.join(', ');
  }
  h ??= await p.header(TABLE_URL);
  // No table of their own: one built on a board gear combination exactly like theirs, if there is
  // one (search/tableGear.ts gearTableName), below GEAR_TABLE_TO; the maxed one from there.
  if (url === TABLE_URL && h.k3) {
    stamp = gearStamp(d.inputs(), d.earnings(), h.k3.research);
    if (stamp) {
      // The gear stamp's hash, for an instant answer record: the legacy name's, which analysis
      // matches to the deployed files (tableGear.ts legacyGearTableName).
      stampHash = (await legacyGearTableName(stamp)).replace(/^gear-|\.bin$/g, '');
      const scale = instantDeliveryScale(d.inputs(), h.k3);
      // The canonical name first (the same gear however it is worn), then the legacy one; each `.v2` name
      // before any plain one (tableGear.ts gearTableFiles).
      let found = false;
      for (const gearName of await gearTableFiles(stamp)) {
        const gearUrl = `${d.base}${gearName}`;
        if (!isListed(gearUrl)) continue;
        const both = compositeUrl(gearUrl, TABLE_URL, GEAR_TABLE_TO, scale);
        try {
          const gh = await p.header(both);
          // INSTANT ANSWER V2: a gear table made by an older simulator, or one that starts above the save's TE,
          // gives way to the form G below.
          if (tableSimMismatch(gh) || startsAbove(gh)) break;
          h = gh;
          url = both;
          found = true;
          break;
        } catch (e) {
          // Not under this name. Stalled: no other name either (the maxed one is already in).
          if (isTableStall(e)) break;
        }
      }
      // No table for this gear (the usual case): the maxed one.
      if (!found) h = await p.header(TABLE_URL);
    }
  }
  // DELIVERY-SET TABLES (Jordan, 23 Nov 2026): no own or board gear table, but one built on their delivery set
  // (metronome / compass / gusset, no stones: tableGear.ts `deliveryKey`), listed, by this simulator and with the save
  // inside its TEs: it moved to their gear (the form G from it), and the maxed table (moved too) above its last TE.
  let gearShifted = false;
  let delivery: string | undefined;
  const playerKey = deliveryKey(stamp?.deliveryFull);
  const playerFile = playerKey ? await deliveryTableFile(playerKey) : null;
  const key = url === TABLE_URL ? playerKey : null;
  if (key) {
    const lowUrl = `${d.base}${playerFile}`;
    if (isListed(lowUrl) && listed) {
      try {
        const lh = await p.header(lowUrl);
        const inside = !startsAbove(lh) && (d.te === undefined || d.te <= lh.to);
        const low = !tableSimMismatch(lh) && inside ? instantGearShift(d.inputs(), lh) : null;
        if (low) {
          const high = instantGearShift(d.inputs(), h);
          const highKey = high && !nearMaxedGear(high) ? gearShiftKey(high) : '';
          const both = deliveryUrl(lowUrl, gearShiftKey(low), TABLE_URL, highKey, lh.to + 1);
          h = await p.header(both);
          url = both;
          gearShifted = true;
          delivery = key;
        }
      } catch (e) {
        // Not there after all. Stalled: the maxed one (already in) answers.
        if (!isTableStall(e)) throw e;
      }
    }
  }
  // INSTANT ANSWER V2: no own or gear table of this simulator: the maxed table moved to the player's
  // gear (search/instantGear.ts, the form G), unless they are as good as maxed.
  if (url === TABLE_URL) {
    const shift = instantGearShift(d.inputs(), h);
    if (shift && !nearMaxedGear(shift)) {
      const shiftedUrl = gearShiftUrl(TABLE_URL, gearShiftKey(shift));
      h = await p.header(shiftedUrl);
      url = shiftedUrl;
      gearShifted = true;
    }
  }
  return {
    url,
    header: h,
    mismatch,
    stampHash,
    gearShifted,
    ...(delivery ? { deliveryKey: delivery } : {}),
    ...(playerKey ? { playerDeliveryKey: playerKey } : {}),
    ...(stamp ? { playerGear: playerGearOf(stamp, playerKey, playerFile && listed ? !listed.has(playerFile) : null) } : {}),
  };
}

/** The record's gear keys from a stamp (`InstantTableChoice.playerGear`): each left out when unknown. */
function playerGearOf(stamp: TableGear, delivery: string | null, noTable: boolean | null): PlayerGear {
  const earnings = earningsKey(stamp.earnings);
  const deliveryStones = stonesKey(stamp.deliveryFull);
  const earningsStones = stonesKey(stamp.earnings);
  return {
    ...(delivery ? { delivery } : {}),
    ...(earnings ? { earnings } : {}),
    ...(deliveryStones ? { deliveryStones } : {}),
    ...(earningsStones ? { earningsStones } : {}),
    ...(noTable !== null ? { noTable } : {}),
  };
}

/**
 * The player's delivery against the chosen table's, as the card reads it (InstantRoute.vue `deliveryScale`, the same
 * search/instantScale.ts `cardDeliveryScale`): 1 on their own table, a gear table (its URL carries its scale) or the
 * form G (already at their delivery).
 */
export function instantScaleOf(
  choice: Pick<InstantTableChoice, 'url' | 'header' | 'gearShifted'>,
  maxedUrl: string,
  context: () => SimulationContext
): number {
  if (choice.gearShifted) return 1;
  const own = choice.url !== maxedUrl && !parseGearShiftUrl(choice.url);
  return cardDeliveryScale(own, choice.header, context) ?? 1;
}

/** No prestige on these days for the instant answer (routeFinder.ts `TailOptions.noPrestige`, with the save's silo
 *  seconds for the laying while one holds a prestige), from the inputs; null without them. */
export function instantDays(inputs: SearchInputs): { noPrestige: TimeOffWindow[]; siloSeconds: number } | null {
  return inputs.noPrestige?.length ? { noPrestige: inputs.noPrestige, siloSeconds: saveSiloSeconds(inputs) } : null;
}

export interface InstantLegsDeps {
  pool: { firstLegs(request: FirstLegsBase & { url: string; deliveryScale: number }): Promise<FirstLeg[]> };
  url: string;
  header: Pick<TableHeader, 'to'>;
  /** The store's `collectInputs()`, read once by the caller. */
  inputs: SearchInputs;
  /** The save's TE (whole). */
  te: number;
  /** The TE the first ascensions go up to (the answer's target: a date's 490). */
  final: number;
  /** `instantScaleOf`, or the card's own reading of it. */
  scale: number;
  /** The hours the answer works inside (a plain copy), or null. */
  hours: Availability | null;
  /** Setup's "hold my shifts for my hours" (the store's `deferShifts`). */
  deferShifts: boolean;
  /** Continue my build-up's tails (the store's `buildUpTails`, which says when they failed). */
  buildUpTails: () => Promise<BuildParams[] | BuildUpTailsResult>;
  /** A fresh build simulated live, above the table's top (the store's `liveFreshBuilds`). */
  liveFresh: (te: number, start: number) => Promise<BuildParams[]>;
  /** False once the caller no longer wants the answer (a newer run): stops before the worker is asked. */
  alive?: () => boolean;
  /** Merged into the tail the first legs are asked with and handed back: the no-held-buys pass's `{ heldBuys: false }`
   *  (InstantRoute.vue `runAltPass`; code review 22 Nov 2026, math-exact-4: the first ascension had them still). */
  tailExtra?: Partial<TailOptions>;
}

export interface InstantLegs {
  /** With `buildUpMissing` when the build-up could not be worked out (search/instantFirstLegs.ts BuildUpFlags). */
  legsRequest: FirstLegsBase & BuildUpFlags;
  days: ReturnType<typeof instantDays>;
  tail: TailOptions;
  firstLegs: FirstLeg[];
}

/** The player's own first ascension to every stop up to `final`, on the chosen table. Null when `alive` said stop. */
export async function instantFirstLegs(d: InstantLegsDeps): Promise<InstantLegs | null> {
  const { inputs, te, url } = d;
  // The first-legs request, Continue my build-up included (search/instantFirstLegs.ts): the standard
  // build carried on from the farm in the save, simulated on a background worker (a few seconds).
  const legsRequest: FirstLegsBase & BuildUpFlags = await instantFirstLegsBase(inputs, {
    startTE: te,
    final: d.final,
    // Above the table's top it has no row for the player: their one ascension to the target is
    // simulated live instead (search/liveCell.ts), a few seconds on a background worker.
    ...(te > d.header.to ? { liveFresh: d.liveFresh } : {}),
    buildUpTails: d.buildUpTails,
  });
  if (d.alive && !d.alive()) return null;
  // INSTANT ANSWER V2: the table's legs (and the first) held for the player's hours as Check exactly holds them.
  // No prestige on these days (search/noPrestige.ts): every prestige waits past them, hours ticked or not.
  const days = instantDays(inputs);
  const hours = d.hours;
  const tail: TailOptions = { ...instantTail(hours, d.deferShifts, gearRowsOfUrl(url), days), ...(d.tailExtra ?? {}) };
  const firstLegs = await d.pool.firstLegs({ url, deliveryScale: d.scale, ...legsRequest, ...tail, hours });
  return { legsRequest, days, tail, firstLegs };
}

/** The options the instant answer's routes are priced with (its polish, and My Runs' estimate of a followed route). */
export function instantPricingOptions(o: {
  te: number;
  start: number;
  firstLegs: FirstLeg[];
  scale: number;
  deadline?: number;
  hours: Availability | null;
  tail: TailOptions;
}): PolishOptions {
  return {
    startTE: o.te,
    start: o.start,
    firstLegs: o.firstLegs,
    deliveryScale: o.scale,
    ...(o.deadline ? { deadline: o.deadline } : {}),
    ...(o.hours ? { hours: o.hours } : {}),
    ...o.tail,
    // THE CLIFF GUARD (routeFinder.ts `guardCliff`, R10.1): a short ascension costs the worse of now and a day later.
    cliffGuard: o.tail.cliffGuard ?? CLIFF_LAG,
    // By the cell (routeFinder.ts `cellJumps`): every length, priced twice only where the cell shows a missed sale.
    cliffJump: o.tail.cliffJump ?? CLIFF_JUMP,
  };
}
