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
import { DAY_MS, localToUtcMs, startMs } from '@/lib/leaderboardRank';
import { groupByAccount, gearOf, isProof } from './analysis';
import type { CollectorRow } from './collector';
import { SWEEP_PRESETS } from './upload';

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
  group?: 'main' | 'big' | 'end' | 'gear';
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

/** Accounts wanted per preset before that sweep stops being listed. */
const PRESET_WANT: Record<string, number> = { M1: 6, M2: 6, M3: 4, M4: 3, F2: 6, F4: 3, F5: 3, E7: 2, E8: 2, E9: 2 };

/**
 * What each sweep ask says, in player language. Audited against the board on 25 Sept 2026 (every
 * number below was recomputed from the rows and CSVs) and again on 26 Sept 2026, when the count
 * claims were restated from each account's earliest standing finish at each count (`bestPerCount`)
 * with the page's own verdict on each gap (`countSteps`). Re-checked the same way on 27 Sept 2026,
 * after Williamthe5thc's E7, E8 and E9 and Willsalt · T4L cube's E8 and close look at 7 arrived;
 * update the numbers when the board moves on. Dates are written as the tables write them ("24 Sept").
 * Say how many accounts a claim rests on, and never that one more ascension "helps" where the two
 * counts were searched too differently to tell.
 */
const PRESET_TEXT: Record<string, { title: string; why: string; who?: string; note?: string }> = {
  M1: {
    title: '2 ascensions at every TE (M1)',
    why: 'The simplest plan: one ascension target, then on to 490. It shows how fast your delivery set covers the last stretch, and every longer plan on your account is measured against it.',
  },
  M2: {
    title: '3 ascensions at every 2nd TE (M2)',
    why: "Shows where a 3-ascension plan puts its two ascension targets on your account, over a wider range of TEs than F2. It only tries every 2nd TE: in Halceyx's F2 table, where every plan was priced from one save, the best plan on M2's grid finishes about 5 days after F2's best.",
    note: 'If you are under 240 TE, F2 answers the same question more exactly, in fewer plans.',
  },
  M3: {
    title: '4 ascensions at every 5th TE (M3)',
    why: 'Shows roughly where a 4-ascension plan puts its targets on your account, and how much a 4th ascension saves you: 4.5 to 28 days on four of the five accounts that have tried 3 and 4, while on the fifth (a small staged search) the 4 finished 1.5 days later. It only tries every 5th TE, so its best plan can be 2 to 12 days behind the true best.',
  },
  M4: {
    title: '5 ascensions at every 5th TE (M4)',
    why: 'Shows whether a 5th ascension pays on your account: on the five accounts that have tried 4 and 5 it brought the finish date forward by 1.5 to 28 days. It only tries every 5th TE, so its best plan shows the right area but not the exact TEs. F4 below looks closer.',
  },
  F2: {
    title: '3 ascensions at every TE (F2)',
    why: "Ascending even one TE off the best can cost up to 31 days. In Halceyx's F2 table, where every plan was priced from one save, the best plan on M2's grid (every 2nd TE) finishes about 5 days after F2's best. F2 tries every TE where the best 3-ascension plans have ascended so far, using fewer plans than M2.",
    who: 'anyone under 240 TE',
  },
  F4: {
    title: '5 ascensions, a close look (F4)',
    why: 'Eight accounts have tried 5 ascensions, but most 5-ascension runs so far were staged searches or tried every 5th TE or coarser, and on shorter plans every 5th TE has landed 2 to 12 days behind the best. F4 tries far more of the TEs in between.',
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  F5: {
    title: '6 ascensions, a close look (F5)',
    why: "The plan that finishes first has 6 ascensions on 6 of the 13 accounts (on Allan's it ties with 7), though on 4 of them 6 is also the most they tried. Only two 6-ascension runs have looked this closely, Williamthe5thc's and Willsalt · T4L cube's; the rest tried every 5th TE or coarser, or were staged searches. F5 tries far more of the TEs in between.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E7: {
    title: '7 ascensions, a rough look (E7)',
    why: "Four accounts have tried both 6 and 7 ascensions. A 7th brought the finish forward 4.9 days on Willsalt · T4L cube and 1.0 day on BobSkiMajoo778; on Allan's it finished the same minute as his 6, and on Williamthe5thc's 0.9 days after it. All four are too close to call given how they were searched. Runs from more accounts show where adding ascensions stops saving time, so nobody plans more ascensions than they need.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E8: {
    title: '8 ascensions, a rough look (E8)',
    why: "On the three accounts that have tried 8 next to 7, 8 finished 3.0 days after the best on Allan's and 2.3 on Williamthe5thc's, and on Willsalt · T4L cube it now finishes 2.1 days before that account's 7 (every-TE close looks, 28 Sept). All three are within search noise. More runs show whether it ever clearly wins, and for which accounts.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E9: {
    title: '9 ascensions, a rough look (E9)',
    why: "Two accounts have tried 9 ascensions. On Williamthe5thc's, E9 finishes 4.1 days after his best plan (6 ascensions) and 1.8 days after his 8, within search noise; his one quick 15-ascension search finishes 20 days after his best. On Willsalt · T4L cube, 9 finishes 3.3 days after its best plan (8 ascensions), also within search noise. More accounts show whether 9 ever wins and, with 7 and 8, fill in the picture from 2 to 9 ascensions, so players can stop considering plans this long.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
};

/** A band's step, or null for a band with a single value. */
function stepOf(band: number[]): number | null {
  let worst = 0;
  for (let i = 1; i < band.length; i++) worst = Math.max(worst, band[i] - band[i - 1]);
  return band.length > 1 ? worst : null;
}

/** The bands a run actually priced: its own record, or the text an upload was tagged with. */
function runBands(r: CollectorRow): number[][] | undefined {
  if (r.space?.bands?.length) return r.space.bands;
  return r.sweep?.bands ? parseBands(r.sweep.bands) : undefined;
}

/** The preset's own bands with a TE-relative first band read as plain numbers: only the steps
 *  matter here, and `+1-+36:1` has the same step as `1-36:1`. */
function presetSteps(preset: { bands: string }): (number | null)[] {
  return parseBands(preset.bands.replace(/\+(\d+)\s*-\s*\+(\d+)/, '$1-$2')).map(stepOf);
}

/**
 * A run at least as fine as a preset, range by range: the same number of ascensions, and each
 * range's step no coarser than the preset's matching range. Comparing only the widest step let a
 * run at every 3rd TE throughout count toward a preset whose first range is every TE.
 */
function atLeastAsFineAs(r: CollectorRow, steps: (number | null)[]): boolean {
  const bands = runBands(r);
  if (!bands?.length || bands.length !== steps.length) return false;
  return bands.every((b, i) => {
    const want = steps[i];
    const have = stepOf(b);
    // A single-value range (a player whose TE leaves one value in it) is as fine as anything.
    return want === null || have === null || have <= want;
  });
}

/** A finished exhaustive run that checked EVERY TE in every band (step 1 throughout). */
function everyTE(r: CollectorRow): boolean {
  const bands = r.space?.bands;
  return !!bands?.length && bands.every(b => (stepOf(b) ?? 1) <= 1);
}

/** A finished exhaustive run to the main 490 target: the only kind the asks below count. Finished is
 *  the page's one proof test (`isProof`: every plan in its box priced), so a run whose end never
 *  recorded its count -- Halceyx's 6-ascension run priced 4,192 of 61,749 -- is not finished here
 *  while the runs table calls it partial. An uploaded sweep carries no `space`; its CSV's own chain
 *  count already guards against a partial file, so it counts as finished. */
function finished490(r: CollectorRow): boolean {
  const finished = r.space ? isProof(r) : r.source === 'upload';
  return finished && r.finalTE === 490;
}

/** Days between two runs' plan starts, as instants (the Leaderboard's `startMs`). A row whose zone
 *  cannot be read is taken at its local clock as if it were UTC, which is hours out at worst and fine
 *  for a days-apart test. NaN when a start cannot be read at all, which fails every such test. */
function daysApart(a: CollectorRow, b: CollectorRow): number {
  const t = (r: CollectorRow) => startMs(r) ?? localToUtcMs(r.startLocal, 'UTC');
  const x = t(a);
  const y = t(b);
  return x == null || y == null ? NaN : Math.abs(x - y) / DAY_MS;
}

/** Every run so far started at TE 124 or more. Below this, the shape is a guess. */
const LOW_TE = 125;

export function dataNeeds(rows: CollectorRow[]): DataNeed[] {
  const accounts = groupByAccount(rows);
  const needs: DataNeed[] = [];
  const count = (test: (r: CollectorRow) => boolean) => accounts.filter(a => a.rows.some(test)).length;

  for (const preset of SWEEP_PRESETS) {
    const want = PRESET_WANT[preset.id];
    const text = PRESET_TEXT[preset.id];
    if (!want || !text) continue;
    // A tagged run counts only at the preset's own length (an upload can be tagged with anything),
    // and so does any finished exhaustive run of that length: the planner's own Insane runs carry
    // `space` but often no tag. A FINE preset also needs the run to be at least as fine, range by
    // range: an every-2nd-TE M2 answers a coarser question than F2.
    const steps = presetSteps(preset);
    const covers = (r: CollectorRow) =>
      r.ascensions === preset.ascensions &&
      (!preset.fine || atLeastAsFineAs(r, steps)) &&
      // A tagged run that did not price its whole box does not cover the preset (`isProof`): these
      // are the longest runs on the list, and one abandoned overnight F4 would otherwise fill a third
      // of the ask. A tagged upload has no box to check; its CSV is the whole sweep.
      ((r.sweep?.preset === preset.id && (!r.space || isProof(r))) || finished490(r));
    const have = count(covers);
    if (have >= want) continue;
    needs.push({
      id: `sweep-${preset.id}`,
      title: text.title,
      why: text.why,
      who: text.who ?? 'anyone',
      have,
      want,
      preset: preset.id,
      runs: 1,
      ...(text.note ? { note: text.note } : {}),
      group: preset.group ?? 'main',
    });
  }

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
      note: 'For example a T4L Lunar totem plus two of T4L Demeters necklace, T4L Tungsten ankh and T4L Puzzle cube, all with 3 T4 Lunar stones: that adds about +108 TE to your CTE.',
    });
  }

  const pairs = accounts.filter(
    a => a.rows.some(r => r.forceContinue === true) && a.rows.some(r => r.forceContinue === false)
  ).length;
  if (pairs < 3) {
    needs.push({
      id: 'force-continue',
      title: 'The same save both ways: finishing your current ascension first, and ascending straight away',
      why: 'On the two accounts that have run it both ways, the best plan came out the same, and the choice only moved some slower plans (by up to 64 days). A third account well into an ascension will show whether you ever gain by ascending straight away.',
      who: 'anyone partway through an ascension',
      have: pairs,
      want: 3,
      preset: 'M1',
      runs: 2,
      note: 'Do both from the same save, without playing or syncing the game in between.',
    });
  }

  // Does the best plan move with the date? Two every-TE runs from one account, days apart, answer
  // it -- and decide whether a plan can be reused or has to be searched again before each ascension.
  const later = accounts.filter(a => {
    const fine = a.rows.filter(r => r.ascensions === 3 && finished490(r) && everyTE(r));
    return fine.some(x => fine.some(y => daysApart(x, y) >= 3));
  }).length;
  if (later < 3) {
    needs.push({
      id: 'later-start',
      title: 'The same account again, a few days later',
      why: "Halceyx's best 3-ascension plan changed overnight: it was 201 282 on 24 Sept and 206 279 the next day, and priced again from that day's save the old plan finished about 14 days later. Runs a few days apart show how often that happens, and so whether you need a fresh search before each ascension.",
      who: 'anyone who has run F2 (3 ascensions at every TE)',
      have: later,
      want: 3,
      preset: 'F2',
      runs: 2,
      note: 'Run F2 now, then again at least three days later after syncing the game, with the same artifacts. A new or better artifact in between means the two runs cannot be paired.',
    });
  }

  // GEAR THE BOARD HAS NEVER SEEN (audited 27 Sept 2026). Every account so far has a T4L Lunar totem
  // and a T4L Demeters necklace, and every one whose CTE we know is at CTE 241 or more (11 of the 12:
  // the Gear view cannot place Wolfcry1993, whose only run that is not a what-if records no CTE), so
  // TE and CTE always rise together and nothing separates what the gear decides from what the TE
  // decides.
  const cteEdge = count(r => finished490(r) && (gearOf(r).clothedTE ?? 0) >= 200 && (gearOf(r).clothedTE ?? 999) < 240);
  if (cteEdge < 3) {
    needs.push({
      id: 'cte-edge',
      title: 'Accounts at CTE 200 to 240, around where plans start working',
      why: "Below about 218 to 225 CTE (the planner's estimate) a first ascension gets stuck on Integrity saving up for habs. The runs only bracket that line: the two accounts measured below it (CTE 172 and 202) stalled, and the lowest account whose CTE we know is at CTE 241. Runs from CTE 200 to 240 would show exactly where the line is and whether the usual targets still hold there.",
      who: 'players at CTE 200 to 240',
      have: cteEdge,
      want: 3,
      preset: 'F2',
      runs: 1,
      note: 'For example TE 72 to 111 with a full T4L earnings set, TE 91 to 130 with an epic one, or TE 113 to 153 with rare pieces holding one T4 Lunar stone each. If the planner warns that your first ascension will wait on Integrity, run it anyway if it lets you start: that wait is part of what we are measuring.',
      group: 'gear',
    });
  }

  // GEAR WITHOUT A TABLE (the user, 5 Oct). The instant answer is exact for any gear that has its own
  // precomputed table, and one finished run from a new gear is enough to build and check one (its
  // inventory and its legs). So instead of asking for patterns (weak delivery, mixed earnings...),
  // ask for any gear not on this list, from an account whose plans work at all (CTE 225 or more).
  needs.push({
    id: 'new-gear',
    title: "Your gear, if it isn't one we have a table for yet",
    why: "Instant answers are exact for gear that has its own precomputed table, and one run from a new gear is enough to build it: we take its artifacts and stones from the run, simulate every ascension once, and check the table against the run's own legs.",
    who: 'players at CTE 225 or more whose artifacts and stones are not one of the sets listed below',
    have: 0,
    want: 1,
    preset: 'F2',
    runs: 1,
    note: `Tables so far: ${COVERED_GEAR.join('; ')}. Spare stones and junk artifacts don't matter, only what your best sets use.`,
    group: 'gear',
  });

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
      preset: 'F2',
      runs: 1,
      group: 'gear',
    });
  }

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
  const start = Math.floor(currentTE) + 1;
  const parts = preset.bands
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
