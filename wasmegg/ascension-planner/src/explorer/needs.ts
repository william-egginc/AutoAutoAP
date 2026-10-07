/**
 * @module explorer/needs
 * @description What the corpus is still short of, and what it would cost a volunteer to fill each
 * gap.
 *
 * WORKED OUT FROM THE ROWS, NOT A FIXED LIST. Each need is a coverage test over what has been
 * submitted -- accounts per sweep preset, starting TEs outside the measured range, the same save
 * run with force-continue on and off, weak delivery gear -- and it drops off the list once enough
 * accounts have covered it. A static "please run M2" banner would still be asking a year from now.
 *
 * TIMES COME FROM THE COLLECTOR'S OWN `run` FIELD (search/speed.ts), not a benchmark of the viewer's
 * machine (the planner's Re-benchmark button does that): worker-seconds per chain at this chain
 * length, the board's median where enough exhaustive runs agree, divided by the tier's workers.
 * They used to be one flat figure per machine size, which ignored chain length and came out 3-4x
 * short for 2-ascension sweeps (an 8-core desktop's M1: estimated 2 min, took 7).
 */
import { countBanded, parseBands } from '@/search/exhaustive';
import { sweepSeconds, workerSecondsPerChain } from '@/search/speed';
import { plannedRoutes } from '@/search/deadlineEstimate';
import { countBandShapes as countStopShapes } from '@/search/deadline';
import { groupByAccount, gearOf, isProof } from './analysis';
import type { CollectorRow } from './collector';
import { SWEEP_PRESETS } from './upload';
import type { InventoryCount } from '@/search/csv';
import type { ByDateRequest } from '@/search/byDateRequest';

export interface ComputeTier {
  id: string;
  label: string;
  detail: string;
  /** Workers the planner runs on this machine: one per core, less one for the page. */
  workers: number;
}

export const COMPUTE_TIERS: ComputeTier[] = [
  { id: 'laptop', label: 'Laptop', detail: '4 cores', workers: 3 },
  { id: 'desktop', label: 'Desktop', detail: '8 cores', workers: 7 },
  { id: 'workstation', label: 'Workstation', detail: '16-20 cores', workers: 17 },
];

/** Seconds a sweep of `chains` at this length takes on this tier, from the board's own speeds. */
export function estimateSeconds(
  chains: number,
  ascensions: number,
  tier: ComputeTier,
  measured?: Map<number, { seconds: number }>
): number {
  return sweepSeconds(chains, tier.workers, workerSecondsPerChain(ascensions, measured));
}

/** `under a minute`, `25 min`, `3.5 h`. Coarse on purpose; these are estimates. */
export function formatEstimate(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
}

export interface DataNeed {
  id: string;
  title: string;
  /** Why the corpus needs it, in a sentence. */
  why: string;
  /** Who can help: "anyone", "players at 200+ TE", ... */
  who: string;
  /** Accounts that already cover it. */
  have: number;
  /** Accounts wanted before it drops off the list. */
  want: number;
  /** Which sweep preset to run. */
  preset: string;
  /** How many times to run the preset (the force-continue pair is 2). */
  runs: number;
  /** Anything to change from the preset's defaults. */
  note?: string;
  /** Which list it belongs in (see SweepPreset.group), or 'gear' for accounts and gear the board has
   *  not seen. Unset is the main list. */
  group?: 'main' | 'big' | 'end' | 'gear' | 'bydate';
  /** A specific set of gear this ask is for (the gear group's cards). Unset for asks about the account. */
  gear?: GearSet;
  /** Set for Highest TE by a date asks: they open that screen, not a sweep (`preset` is '' then). */
  byDate?: ByDateAsk;
}

export type GearFamily =
  | 'demeters_necklace'
  | 'tungsten_ankh'
  | 'lunar_totem'
  | 'puzzle_cube'
  | 'ornate_gusset'
  | 'interstellar_compass'
  | 'quantum_metronome';
export type StoneFamily = 'lunar' | 'tachyon' | 'quantum';
/** Legendary, Epic, Rare, Common: the icon does not show it, so the card writes it beside the icon. */
export type GearRarity = 'L' | 'E' | 'R' | 'C';

export interface GearSlot {
  family: GearFamily;
  tier: number;
  rarity: GearRarity;
  /** Which half of the set it belongs to. */
  role: 'earnings' | 'delivery';
}
export interface GearStone {
  family: StoneFamily;
  tier: number;
  /** In words: "every slot", "one per artifact". */
  where: string;
}
export interface GearSet {
  slots: GearSlot[];
  stones: GearStone[];
  /** The delivery half, when it is "any" set rather than named pieces. */
  deliveryNote?: string;
  /** The CTE line, as the collector analyst gave it. */
  cte: string;
}

/**
 * A Highest TE by a date ask: one run over several ascension counts (one chain each). A chain with n
 * ascensions has n-1 early-stop boxes and a last stop the panel finds itself, starting inside `last`
 * (and going outside it if the answer is there). So the n-th stop's own box is never a band for the
 * n-ascension chain.
 */
export interface ByDateAsk {
  /** Ascension counts, one chain each. */
  asc: number[];
  /** Egg Day (the only date these asks use). */
  eggDay: true;
  /** Boxes by count, `lo-hi:step; ...`, the first TE-relative (`+1-+40:1`). Counts without one are
   *  suggested from the save (see `around`). */
  chainBoxes?: Record<number, string>;
  /** The last stop's starting box, fitted to the player's TE. */
  last?: string;
  /** Around the panel's own suggestion, per count: TE either side of each stop, and the step between
   *  them (later stops; the first is always every TE). Both must be on the By a date sliders. */
  around?: Record<number, { pm: number; step: number }>;
  /** A wider width to quote the cost of, "+-N would take about X days" (a slider value). */
  altPm?: number;
  /** Plain words about what the run covers, for the card. */
  summary: string;
}

/** Gear with a precomputed table (5 Oct 2026), named by what sets it apart from the maxed set (all
 *  T4L, every stone T4). Keep in step with the tables deployed on egg-precompute. */
const COVERED_GEAR = [
  'the maxed set',
  'T4E compass (rest T4L)',
  'T4E metronome with a T3L ankh and earnings 2.3 CTE short',
  'all T4L with a Demeters necklace as the 4th',
  'T4E gusset, metronome with 2 T4 stones, earnings 8.7 short',
  'T4E metronome and compass, earnings 2.3 short',
  'T4E compass, earnings 7.1 short',
  'T4E gusset, T4R compass, T3E metronome, earnings 10.2 short',
  'T2E gusset, T3E metronome, earnings 13.4 short',
];

/** A finished exhaustive run to the main 490 target. Finished is the page's one proof test (`isProof`:
 *  every plan in its box priced). An uploaded sweep carries no `space`; its CSV's own chain count
 *  already guards against a partial file, so it counts as finished. */
function finished490(r: CollectorRow): boolean {
  const finished = r.space ? isProof(r) : r.source === 'upload';
  return finished && r.finalTE === 490;
}

/** Every run so far started at TE 124 or more. Below this, the shape is a guess. */
const LOW_TE = 125;

const slot = (
  role: GearSlot['role'],
  family: GearFamily,
  tier: number,
  rarity: GearRarity
): GearSlot => ({ family, tier, rarity, role });
const earn = (r: [GearRarity, GearRarity, GearRarity, GearRarity]): GearSlot[] => [
  slot('earnings', 'demeters_necklace', 4, r[0]),
  slot('earnings', 'tungsten_ankh', 4, r[1]),
  slot('earnings', 'lunar_totem', 4, r[2]),
  slot('earnings', 'puzzle_cube', 4, r[3]),
];
const deliver = (g: GearRarity, c: GearRarity, m: GearRarity): GearSlot[] => [
  slot('delivery', 'ornate_gusset', 4, g),
  slot('delivery', 'interstellar_compass', 4, c),
  slot('delivery', 'quantum_metronome', 4, m),
];
/** Necklace, ankh (no T4 epic ankh exists, so the epic set has a rare one), totem, cube. */
const EPIC_EARN = earn(['E', 'R', 'E', 'E']);
const RARE_EARN = earn(['R', 'R', 'R', 'R']);
const MAXED_EARN = earn(['L', 'L', 'L', 'L']);
const EVERY = (tier: number): GearStone[] => [
  { family: 'lunar', tier, where: 'every slot' },
  { family: 'tachyon', tier, where: 'every slot' },
  { family: 'quantum', tier, where: 'every slot' },
];

/**
 * The gear cards, in the collector analyst's rank order (7 Oct 2026). Every one runs M3 (4
 * ascensions at every 5th TE). Counts are not detected yet: `have` is 0 on all of them.
 * The CTE ranges are the analyst's; the two cards the analyst gave none for say so in words.
 */
const GEAR_ASKS: Omit<DataNeed, 'preset' | 'runs' | 'have' | 'group'>[] = [
  {
    id: 'gear-epic-earnings',
    title: 'Epic earnings set',
    why: 'The first point inside the empty gap between the all-common floor and every account on the board. It shows how earnings below the board change the plans.',
    who: 'players with this earnings set and any legendary delivery set',
    want: 2,
    gear: {
      slots: EPIC_EARN,
      stones: [{ family: 'lunar', tier: 4, where: 'every slot' }],
      deliveryNote: 'any legendary set',
      cte: 'About +104 earnings bonus. CTE 229 to 304 at TE 125 to 200.',
    },
  },
  {
    id: 'gear-rare-earnings',
    title: 'Rare earnings set',
    why: 'Its CTE straddles the line (about 225) where first ascensions start stalling on Integrity, so it measures where plans start stalling.',
    who: 'players with this earnings set and any legendary delivery set; one account under 140 TE and one over 170 is ideal',
    want: 2,
    note: 'If the planner warns the first ascension will wait on Integrity, run it anyway if it lets you start: that wait is part of what we are measuring.',
    gear: {
      slots: RARE_EARN,
      stones: [{ family: 'lunar', tier: 4, where: 'one per artifact' }],
      deliveryNote: 'any legendary set',
      cte: 'CTE 212 to 287 at TE 125 to 200.',
    },
  },
  {
    id: 'gear-rare-common-delivery',
    title: 'Rare or common delivery set',
    why: 'Strong earnings with weak delivery separates what delivery does from what earnings do.',
    who: 'players with maxed earnings gear and this weaker delivery set',
    want: 2,
    gear: {
      slots: [...MAXED_EARN, ...deliver('C', 'R', 'R')],
      stones: [
        { family: 'lunar', tier: 4, where: 'every earnings slot' },
        { family: 'tachyon', tier: 4, where: 'every delivery slot' },
        { family: 'quantum', tier: 4, where: 'every delivery slot' },
      ],
      cte: 'The maxed earnings set: CTE 241 or more, like the accounts already on the board.',
    },
  },
  {
    id: 'gear-epic-everything',
    title: 'Epic everything',
    why: 'The middle ground between the weakest and strongest gear, so tables can be estimated between them.',
    who: 'players with this epic set, earnings and delivery',
    want: 1,
    gear: {
      slots: [...EPIC_EARN, ...deliver('E', 'E', 'E')],
      stones: EVERY(4),
      cte: 'The epic earnings set: about +104 earnings bonus, CTE 229 to 304 at TE 125 to 200.',
    },
  },
  {
    id: 'gear-rare-everything',
    title: 'Rare everything',
    why: 'Checks the lowest table (all common gear) against a real account between it and the weakest player.',
    who: 'players with this rare set, earnings and delivery',
    want: 1,
    gear: {
      slots: [...RARE_EARN, ...deliver('C', 'R', 'R')],
      stones: [
        { family: 'lunar', tier: 4, where: 'one per artifact' },
        { family: 'tachyon', tier: 4, where: 'one per artifact' },
        { family: 'quantum', tier: 4, where: 'one per artifact' },
      ],
      cte: 'The rare earnings set: CTE 212 to 287 at TE 125 to 200.',
    },
  },
  {
    id: 'gear-legendary-t3-stones',
    title: 'Legendary set on T3 stones',
    why: 'Shows how much of the gap the stones alone make up. Lowest priority.',
    who: 'players with legendary artifacts and T3 stones',
    want: 1,
    gear: {
      slots: [...MAXED_EARN, ...deliver('L', 'L', 'L')],
      stones: EVERY(3),
      cte: 'Below the maxed set by what T4 stones add; the drop is what this measures.',
    },
  },
];

/**
 * The Highest TE by a date asks, sized as "start it in the morning, come back at night": about 8 to 12
 * hours on a desktop (8 cores) at TE 180, by the same speed model as the other cards (`byDateSets`,
 * `byDateSeconds`). Nothing here is detected from the rows: they stay listed.
 *
 * Why these widths. 1 to 4 ascensions is one card (4 ascensions on the 195-250 / 230-295 boxes at every
 * 2nd / 3rd TE would be 19,036 sets, 66 h, so it is thinned to every 5th / 10th: 2,433). 5 to 8 are one
 * card each, every stop at every TE around the panel's suggestion, so the sets are (2*pm+1)^(n-1) and
 * the width is the widest that stays near a day: 5 at +-3 is 2,401 sets, 6 at +-2 is 3,125, 7 at +-1 is
 * 729, 8 at +-1 is 2,187. The model's hours are in needs.spec.ts; they do not all land in 8 to 12 because
 * a width is a whole number of TE (6 at +-2 and 8 at +-1 come to about 14 h, 7 at +-1 to about 4 h).
 */
function byDateNeeds(): DataNeed[] {
  const base = { who: 'anyone', have: 0, want: 1, runs: 1, preset: '', group: 'bydate' as const };
  return [
    {
      ...base,
      id: 'bydate-1-4',
      title: 'Egg Day, 1 to 4 ascensions',
      why: "By a date runs now save every leg, so each leg checks the tables, and the best plan for each count checks the instant answer's route finder.",
      byDate: {
        asc: [1, 2, 3, 4],
        eggDay: true,
        chainBoxes: {
          2: '+1-+40:1',
          3: '+1-+40:1; 195-250:2',
          4: '+1-+40:1; 195-250:5; 230-295:10',
        },
        last: '195-330',
        summary:
          'Your first stop at every TE from 1 to 40 above yours, then 195 to 250 and 230 to 295 (every 2nd TE for 3 ascensions, every 5th and 10th for 4, which would be 66 hours at every 2nd and 3rd).',
      },
    },
    {
      ...base,
      id: 'bydate-5',
      title: 'Egg Day, 5 ascensions, a close look around the suggested route',
      why: 'Every stop tried a few TE either side of the suggested route, at every TE. It measures how much a pruned search misses.',
      who: 'anyone who can leave a fast PC running',
      byDate: {
        asc: [5],
        eggDay: true,
        around: { 5: { pm: 3, step: 1 } },
        altPm: 5,
        summary: 'Every stop within ±3 TE of the suggested route, every TE.',
      },
    },
    {
      ...base,
      id: 'bydate-6',
      title: 'Egg Day, 6 ascensions, a close look around the suggested route',
      why: 'Every stop tried a few TE either side of the suggested route, at every TE. It measures how much a pruned search misses.',
      who: 'anyone who can leave a fast PC running',
      byDate: {
        asc: [6],
        eggDay: true,
        around: { 6: { pm: 2, step: 1 } },
        altPm: 3,
        summary: 'Every stop within ±2 TE of the suggested route, every TE.',
      },
    },
    {
      ...base,
      id: 'bydate-7',
      title: 'Egg Day, 7 ascensions, a close look around the suggested route',
      why: 'Every stop tried a few TE either side of the suggested route, at every TE. It measures how much a pruned search misses.',
      who: 'anyone who can leave a fast PC running',
      byDate: {
        asc: [7],
        eggDay: true,
        around: { 7: { pm: 1, step: 1 } },
        altPm: 3,
        summary: 'Every stop within ±1 TE of the suggested route, every TE.',
      },
    },
    {
      ...base,
      id: 'bydate-8',
      title: 'Egg Day, 8 ascensions, a close look around the suggested route',
      why: 'Every stop tried a few TE either side of the suggested route, at every TE. It measures how much a pruned search misses.',
      who: 'anyone who can leave a fast PC running',
      byDate: {
        asc: [8],
        eggDay: true,
        around: { 8: { pm: 1, step: 1 } },
        altPm: 3,
        summary: 'Every stop within ±1 TE of the suggested route, every TE.',
      },
    },
  ];
}

/** Sets of early stops each count of a By a date ask tries from this TE: counted from the boxes where
 *  there are some, else the most there can be around the suggestion (the first stop at every TE, each
 *  later one 2*floor(pm/step)+1 values; overlapping routes make it fewer). */
export function byDateSets(ask: ByDateAsk, currentTE: number): { asc: number; sets: number }[] {
  const req = byDateRequestFor(ask, currentTE);
  return ask.asc.map(asc => {
    if (asc <= 1) return { asc, sets: 1 };
    const text = req.chains[asc];
    if (text) {
      const bands = parseBands(text.split(';').map(b => b.trim()).join(';'));
      return { asc, sets: countStopShapes(bands, currentTE, 490) };
    }
    const a = ask.around?.[asc];
    if (!a) return { asc, sets: 0 };
    return { asc, sets: (2 * a.pm + 1) * (2 * Math.floor(a.pm / a.step) + 1) ** Math.max(0, asc - 2) };
  });
}

/** "±3 would take about 3.1 days" for the wider look at the same counts, on `workers` workers. */
export function byDateWiderText(
  ask: ByDateAsk,
  currentTE: number,
  workers: number,
  measured?: Map<number, { seconds: number }>
): string {
  if (!ask.altPm || !ask.around) return '';
  const wider: ByDateAsk = {
    ...ask,
    around: Object.fromEntries(Object.entries(ask.around).map(([n, a]) => [n, { ...a, pm: ask.altPm! }])),
  };
  const hours = byDateSeconds(wider, currentTE, workers, measured) / 3600;
  const days = hours / 24;
  return `±${ask.altPm} would take about ${days < 1.5 ? `${Math.round(hours)} hours` : `${days.toFixed(days < 10 ? 1 : 0)} days`}.`;
}

/** Seconds a By a date ask takes on a machine with `workers` workers: the panel's own route estimate
 *  (`plannedRoutes`) for each count, at the board's worker-seconds per route for that length. */
export function byDateSeconds(
  ask: ByDateAsk,
  currentTE: number,
  workers: number,
  measured?: Map<number, { seconds: number }>
): number {
  let total = 0;
  for (const { asc, sets } of byDateSets(ask, currentTE)) {
    const routes = plannedRoutes({ sets, workers, currentTE });
    total += sweepSeconds(routes, workers, workerSecondsPerChain(asc, measured));
  }
  return total;
}

export function dataNeeds(rows: CollectorRow[]): DataNeed[] {
  const accounts = groupByAccount(rows);
  const needs: DataNeed[] = [];
  const count = (test: (r: CollectorRow) => boolean) => accounts.filter(a => a.rows.some(test)).length;

  // The Full sweep preset asks (M1-M4, F2, F4, F5, E7-E9) and the force-continue pair were removed at the
  // user's call on 7 Oct 2026: the precomputed tables answer those questions, and By a date runs, which
  // now save every leg, check the tables. SWEEP_PRESETS and the runner stay: the gear cards, te-low and
  // uploads still use them.

  // No 'later-start' ask (the same account run again a day or more later, to see whether the best plan
  // moves with the date): the precomputed tables price every start TE at every hour of the week, so
  // how the best plan moves with the start date is already answered without paired runs (the user,
  // 7 Oct 2026).

  // GEAR THE BOARD HAS NEVER SEEN (the collector analyst, 7 Oct 2026, in rank order). Every account
  // so far has strong earnings gear: between the all-common floor and the weakest player there is
  // nothing, so each card is a set we would build a table for. `have` is NOT detected yet (0 on
  // every card): nothing here matches an account's gear against these sets, so they stay listed
  // until the counts are wired up and this list is edited by hand.
  for (const g of GEAR_ASKS) needs.push({ ...g, preset: 'M3', runs: 1, have: 0, group: 'gear' });

  const lowAccounts = count(r => finished490(r) && r.currentTE < LOW_TE && (gearOf(r).clothedTE ?? 0) >= 225);
  if (lowAccounts < 2) {
    needs.push({
      id: 'te-low',
      title: `Accounts under ${LOW_TE} TE whose plans still work (CTE 225 or more)`,
      why: "Below about 218 to 225 CTE (the planner's estimate) a first ascension gets stuck on Integrity saving up for habs, so under 125 TE only a strong earnings set makes a plan work at all. Runs from accounts like this show whether they want the same ascension targets as higher accounts.",
      who: `players under ${LOW_TE} TE with CTE 225 or more`,
      have: lowAccounts,
      want: 2,
      preset: 'F2',
      runs: 1,
      group: 'gear',
      note: 'For example a T4L Lunar totem plus two of T4L Demeters necklace, T4L Tungsten ankh and T4L Puzzle cube, all with 3 T4 Lunar stones: that adds about +108 TE to your CTE.',
    });
  }

  const notMaxed = count(
    r => finished490(r) && r.clothedTE != null && (r.colleggtibles?.maxed === false || r.epicResearch?.maxed === false)
  );
  if (notMaxed < 2) {
    needs.push({
      id: 'not-maxed',
      title: 'Accounts still missing colleggtibles or epic research',
      why: 'Every run that recorded it had every colleggtible and all epic research maxed. CTE takes off whatever is missing, but nobody has checked that such an account plans like a maxed one with that much less TE, and some of them also help delivery, which CTE does not count.',
      who: 'players with some colleggtibles below their top tier, or epic research not finished (Lab Upgrade in particular)',
      have: notMaxed,
      want: 2,
      preset: 'M3',
      runs: 1,
      group: 'gear',
    });
  }

  // GEAR WITHOUT A TABLE (the user, 5 Oct). The instant answer is exact for any gear that has its own
  // precomputed table, and one finished run from a new gear is enough to build and check one (its
  // inventory and its legs). So instead of asking for patterns (weak delivery, mixed earnings...),
  // ask for any gear not on this list, from an account whose plans work at all (CTE 225 or more).
  needs.push({
    id: 'new-gear',
    title: "Any other gear we don't have a table for yet",
    why: "Instant answers are exact for gear that has its own precomputed table, and one run from a new gear is enough to build it: we take its artifacts and stones from the run, simulate every ascension once, and check the table against the run's own legs.",
    who: 'players at CTE 225 or more whose artifacts and stones are not one of the sets listed below',
    have: 0,
    want: 1,
    preset: 'F2',
    runs: 1,
    note: `Tables so far: ${COVERED_GEAR.join('; ')}. Spare stones and junk artifacts don't matter, only what your best sets use.`,
    group: 'gear',
  });

  needs.push(...byDateNeeds());

  return needs;
}

/**
 * A preset's bands, fitted to where this player is.
 *
 * The presets were written for a ~180 TE account, so their first band starts at 189-190. A 133 TE
 * player running them as written would skip 134-189 -- exactly where a low account's first
 * checkpoint may belong (a 133 TE account's best 4-ascension chain starts at 150). So the first band
 * is pulled down to start just above the player's TE, keeping its step.
 *
 * EVERY band is then fitted, not only the first. A band a player has already passed used to come
 * out as a single value at its own top (a 230 TE account got `215-215:5` for M4's second band) or
 * lost all its values later, so the run priced nothing: M4, F4, F5, E8 and E9 all came to 0 chains
 * from 230 TE. Now a band that falls behind the player is moved up by exactly the distance it needs
 * (its width and step kept) so it starts above the checkpoint before it, and the last of them is
 * kept under the target. A band that is already ahead of the player stays where it is.
 *
 * Not a blanket shift of every band by the player's offset from 180. Where the later checkpoints
 * land is a property of the delivery curve, not of the account: the last checkpoint of a
 * 3-ascension chain is 283-291 TE on every run from 126 to 198 TE (see exhaustive.ts, "WHY
 * ABSOLUTE TE"). Sliding them down 47 TE for a 133 TE account would aim the sweep away from where
 * the answer is. Returned as text, ready to paste into the planner.
 */
export function presetBandsFor(presetId: string, currentTE: number, final = 490): string {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.bands) return '';
  return fitBands(preset.bands, currentTE, final);
}

/** Any `lo-hi:step; ...` text (first band optionally `+a-+b:step`) fitted to a TE: see presetBandsFor. */
export function fitBands(bandsText: string, currentTE: number, final = 490): string {
  const start = Math.floor(currentTE) + 1;
  const parts = bandsText
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  const last = parts.length;
  /** The previous band's first value: a band never starts below the one before it. */
  let prevLo = start - 1;
  return parts
    .map((part, i) => {
      // `+a-+b:step`, first band only: the player's TE plus a to plus b.
      const rel = i === 0 ? part.match(/^\+(\d+)\s*-\s*\+(\d+)(?::(\d+))?$/) : null;
      const m = rel ?? part.match(/^(\d+)\s*-\s*(\d+)(?::(\d+))?$/);
      if (!m) return part;
      const step = m[3] ? Number(m[3]) : 5;
      // Room left for the bands after this one: each needs a TE of its own below the target.
      const ceiling = final - 1 - (last - 1 - i);
      let lo: number;
      let hi: number;
      if (rel) {
        lo = Math.floor(currentTE) + Number(rel[1]);
        hi = Math.floor(currentTE) + Number(rel[2]);
      } else {
        lo = Number(m[1]);
        hi = Number(m[2]);
      }
      const width = hi - lo;
      // The first range starts just above the player's TE whichever side of it the preset's own
      // start is: pulled down for a low account, raised for a high one (a 240-TE player used to be
      // shown a range starting at 195, all of it behind them).
      const floor = i === 0 ? start : Math.max(start, prevLo);
      if (i === 0 && !rel) {
        lo = start;
        if (hi < start) hi = start + width;
      } else if (lo < floor) {
        // Behind the player or the band before: move it up, keeping its width, or just trim it
        // when most of it is still ahead.
        if (hi < floor) hi = floor + width;
        lo = floor;
      }
      hi = Math.min(hi, ceiling);
      lo = Math.min(lo, hi);
      prevLo = lo;
      return `${lo}-${hi}:${step}`;
    })
    .join('; ');
}

/** What the Science tab says when a preset prices no chains from the player's TE. */
export const NO_FIT_TEXT = "This sweep doesn't fit an account at your TE.";

/** What the Science tab says on every sweep card and in its runner. */
export const SCIENCE_SWEEP_NOTE =
  "This sweep fills a gap in the shared data for science. It isn't tuned to find your best route; use Smart search or the instant answer for that.";

/** Whether a preset prices at least one chain from this TE with its bands fitted to it. */
export function presetFits(presetId: string, currentTE: number, final = 490): boolean {
  return presetChains(presetId, currentTE, final).chains > 0;
}

/** Chains one run of a preset prices from this TE toward `final`, with the bands fitted as above. */
export function presetChains(presetId: string, currentTE: number, final = 490): { chains: number; ascensions: number } {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  const text = presetBandsFor(presetId, currentTE, final);
  if (!preset || !text) return { chains: 0, ascensions: 0 };
  const bands = parseBands(text).map(band => band.filter(v => v > currentTE && v < final));
  return { chains: countBanded(bands, final, currentTE, preset.minGap), ascensions: preset.ascensions };
}

/**
 * A By a date ask as the request its screen reads (search/byDateRequest.ts), fitted to this TE: each
 * count's boxes with the first relative to the TE and nothing at or below it, and the last stop's box
 * starting above the TE.
 */
export function byDateRequestFor(ask: ByDateAsk, currentTE: number): ByDateRequest {
  const req: ByDateRequest = { asc: [...ask.asc], eggDay: true, chains: {} };
  for (const [n, text] of Object.entries(ask.chainBoxes ?? {})) req.chains[Number(n)] = fitBands(text, currentTE);
  if (ask.last) {
    const [lo, hi] = ask.last.split('-').map(Number);
    const top = Math.min(489, Math.max(hi, Math.floor(currentTE) + 3));
    req.last = `${Math.min(top, Math.max(lo, Math.floor(currentTE) + 2))}-${top}`;
  }
  if (ask.around) req.around = { ...ask.around };
  return req;
}

const RARITY_NUMBER: Record<GearRarity, number> = { C: 0, R: 1, E: 2, L: 3 };

/**
 * Whether the save's virtue inventory (`virtueInventory(rawBackup).artifacts`, the same list the
 * simulator picks sets from) holds every artifact on this gear card at exactly that tier and rarity.
 * Stones and the "any legendary set" delivery half are not checked: only the named artifacts.
 */
export function ownsGear(gear: GearSet, artifacts: InventoryCount[]): boolean {
  return gear.slots.every(s => {
    const family = s.family.replace(/_/g, '-');
    return artifacts.some(
      a => a.familyId === family && a.tier === s.tier && a.rarity === RARITY_NUMBER[s.rarity] && a.count > 0
    );
  });
}
