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
import { groupByAccount, gearOf } from './analysis';
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

/** Accounts wanted per preset before that sweep stops being listed. */
const PRESET_WANT: Record<string, number> = { M1: 6, M2: 6, M3: 4, M4: 3, F2: 6, F4: 3, F5: 3, E7: 2, E8: 2, E9: 2 };

/**
 * What each sweep ask says, in player language. Audited against the board on 25 Sep 2026 (every
 * number below was recomputed from the rows and CSVs); update the numbers when the board moves on.
 */
const PRESET_TEXT: Record<string, { title: string; why: string; who?: string; note?: string }> = {
  M1: {
    title: '2 ascensions at every TE (M1)',
    why: 'The simplest plan: one ascension target, then on to 490. It shows how fast your delivery set covers the last stretch, and every longer plan on your account is measured against it.',
  },
  M2: {
    title: '3 ascensions at every 2nd TE (M2)',
    why: 'Shows where a 3-ascension plan puts its two ascension targets on your account, over a wider range of TEs than F2. It only tries every 2nd TE, so on the same save it has come out about 5 days behind F2.',
    note: 'If you are under 240 TE, F2 answers the same question more exactly, in fewer plans.',
  },
  M3: {
    title: '4 ascensions at every 5th TE (M3)',
    why: 'Shows roughly where a 4-ascension plan puts its targets on your account, and how much a 4th ascension saves you (4 to 28 days so far). It only tries every 5th TE, so its best plan can be 2 to 12 days behind the true best.',
  },
  M4: {
    title: '5 ascensions at every 5th TE (M4)',
    why: 'Shows whether a 5th ascension pays on your account: up to about 15 days near TE 125, under a week above TE 180. It only tries every 5th TE, so take its best plan as the right area rather than the exact TEs. F4 below looks closer.',
  },
  F2: {
    title: '3 ascensions at every TE (F2)',
    why: 'Ascending even one TE off the best can cost up to 31 days, and trying only every 2nd TE (M2) has come out about 5 days behind on the same save. F2 tries every TE where the best 3-ascension plans have ascended so far, using fewer plans than M2.',
    who: 'anyone under 240 TE',
  },
  F4: {
    title: '5 ascensions, a close look (F4)',
    why: "Most accounts' fastest plans have 5 to 7 ascensions, but 5-ascension plans have mostly been tried at every 5th TE, which on shorter plans has landed 2 to 12 days behind the best. F4 tries far more of the TEs in between.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  F5: {
    title: '6 ascensions, a close look (F5)',
    why: '6 ascensions is the most common count among the fastest plans (5 of the 12 accounts), but every 6-ascension run so far has mostly tried every 5th or 10th TE. F5 tries far more of the TEs in between.',
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E7: {
    title: '7 ascensions, a rough look (E7)',
    why: "On Allan's and Williamthe5thc's saves a 7th ascension changed the total by only about 0.1 days, once faster and once slower. Runs from more accounts show where adding ascensions stops saving time, so nobody plans more ascensions than they need.",
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E8: {
    title: '8 ascensions, a rough look (E8)',
    why: 'Wherever 8 ascensions have been tried next to 6 or 7 on the same account, 8 has not won yet (the closest was half a day behind). More runs show whether it ever wins, and for which accounts.',
    who: 'anyone who can leave a desktop or bigger running overnight',
  },
  E9: {
    title: '9 ascensions, a rough look (E9)',
    why: 'Only a handful of 9-ascension plans have been tried, all on older runs, and each lost to a shorter plan on the same account. With 7 and 8 it fills in the picture from 2 to 9 ascensions, so players can stop considering plans this long.',
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

/** A finished exhaustive run to the main 490 target: the only kind the asks below count. An
 *  uploaded sweep carries no `space`; its CSV's own chain count already guards against a partial
 *  file, so it counts as finished. */
function finished490(r: CollectorRow): boolean {
  const finished = r.space ? !r.space.stoppedEarly : r.source === 'upload';
  return finished && r.finalTE === 490;
}

/** Days between two runs' plan starts, from their `YYYY-MM-DD HH:MM` local stamps. */
function daysApart(a: CollectorRow, b: CollectorRow): number {
  const t = (r: CollectorRow) => Date.parse(`${(r.startLocal ?? '').slice(0, 10)}T00:00:00Z`);
  return Math.abs(t(a) - t(b)) / 86400000;
}

/** Every run so far started between TE 124 and 199. Outside that, the shape is a guess. */
const HIGH_TE = 200;
const LOW_TE = 125;

/** A delivery set under this share of the best counts as weak. One epic piece still leaves a set at
 *  about 96%, so 80% was never reached by the examples it used to give; 85% is two weak pieces. */
const WEAK_GEAR = 0.85;

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
      // A tagged run stopped partway does not cover the preset: these are the longest runs on the
      // list, and one abandoned overnight F4 would otherwise fill a third of the ask.
      ((r.sweep?.preset === preset.id && !r.space?.stoppedEarly) || finished490(r));
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

  // M1, not F2: F2's first range stops at 250, so it has nothing to try from TE 250 up.
  const highAccounts = count(r => finished490(r) && r.currentTE >= HIGH_TE);
  if (highAccounts < 2) {
    needs.push({
      id: 'te-high',
      title: `Accounts already past ${HIGH_TE} TE`,
      why: 'Every run so far started below 200 TE (the highest is 199), so nobody knows whether ascending last at about 280 TE is still best for an account that starts closer to it. A 2-ascension run at every TE from yours up answers that directly.',
      who: `players at ${HIGH_TE} TE or more`,
      have: highAccounts,
      want: 2,
      preset: 'M1',
      runs: 1,
    });
  }

  const lowAccounts = count(r => finished490(r) && r.currentTE < LOW_TE && (gearOf(r).clothedTE ?? 0) >= 225);
  if (lowAccounts < 2) {
    needs.push({
      id: 'te-low',
      title: `Accounts under ${LOW_TE} TE whose plans still work (CTE 225 or more)`,
      why: 'Below about 218 to 225 CTE a first ascension gets stuck on Integrity saving up for habs, so under 125 TE only a strong earnings set makes a plan work at all. Runs from accounts like this show whether they want the same ascension targets as higher accounts.',
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
      why: "Halceyx's best 3-ascension plan changed overnight: it was 201 282 on 24 Sep and 206 279 the next day, and by then the old plan took 13.5 days longer. Runs a few days apart show how often that happens, and so whether you need a fresh search before each ascension.",
      who: 'anyone who has run F2 (3 ascensions at every TE)',
      have: later,
      want: 3,
      preset: 'F2',
      runs: 2,
      note: 'Run F2 now, then again at least three days later after syncing the game, with the same artifacts. A new or better artifact in between means the two runs cannot be paired.',
    });
  }

  const weak = count(r => finished490(r) && r.schema >= 6 && (gearOf(r).delivery ?? 1) < WEAK_GEAR);
  if (weak < 2) {
    needs.push({
      id: 'weak-gear',
      title: 'Accounts with a weak delivery set',
      why: "Wolfcry1993's and Zen_Ferret's delivery sets are about 80% of the best possible set, and their fastest plans had 7 and 8 ascensions. That hints that weaker delivery wants more ascensions, but both ran on an older planner, so we need runs on today's.",
      who: `players whose delivery set is under ${Math.round(WEAK_GEAR * 100)}% of the best (all T4L with T4 stones), usually two or more weaker pieces`,
      have: weak,
      want: 2,
      preset: 'F2',
      runs: 1,
      note: 'For example a T3E Quantum metronome, T4R Interstellar compass and T4E Gusset with a T4L Lunar totem and T3 stones (about 80%), or a T4R metronome and compass with a T4C Gusset (about 78%). One weaker piece on its own is not enough: a single epic piece still leaves the set at about 96%.',
      group: 'gear',
    });
  }

  // GEAR THE BOARD HAS NEVER SEEN (audited 25 Sep 2026). Every account so far is at CTE 240 or more
  // with a T4L Lunar totem and a T4L Demeters necklace, so TE and CTE always rise together and
  // nothing separates what the gear decides from what the TE decides.
  const cteEdge = count(r => finished490(r) && (gearOf(r).clothedTE ?? 0) >= 200 && (gearOf(r).clothedTE ?? 999) < 240);
  if (cteEdge < 3) {
    needs.push({
      id: 'cte-edge',
      title: 'Accounts at CTE 200 to 240, around where plans start working',
      why: 'Below about 218 to 225 CTE a first ascension gets stuck on Integrity saving up for habs. That line rests on only two accounts below it, and the lowest account on the board is at CTE 240. Runs from CTE 200 to 240 would show exactly where the line is and whether the usual targets still hold there.',
      who: 'players at CTE 200 to 240',
      have: cteEdge,
      want: 3,
      preset: 'F2',
      runs: 1,
      note: 'For example TE 72 to 111 with a full T4L earnings set, TE 91 to 130 with an epic one, or TE 113 to 153 with rare pieces holding one T4 Lunar stone each. If the planner warns that your first ascension will wait on Integrity, run it anyway if it lets you start: that wait is part of what we are measuring.',
      group: 'gear',
    });
  }

  const setTE = (r: CollectorRow) => {
    const cte = gearOf(r).clothedTE;
    return cte === null ? null : cte - r.currentTE;
  };
  const mix = count(r => finished490(r) && (setTE(r) ?? 999) < 112);
  if (mix < 2) {
    needs.push({
      id: 'earnings-mix',
      title: 'A weaker earnings set at a higher TE',
      why: 'Every account so far has earnings sets adding +115 to +129 TE, so CTE and TE always rise together and we cannot tell whether the best plan depends on CTE alone. An account that reaches the same CTE with more TE and less gear would settle it.',
      who: 'players at TE 150 to 200 whose CTE is less than about 112 above their TE',
      have: mix,
      want: 2,
      preset: 'F2',
      runs: 1,
      note: 'For example a T4C or T3 Lunar totem (the set then adds about 104), an epic set (about 110), or rare pieces holding one T4 Lunar stone each (about 87). A T4E or T4R totem with everything else T4L is not enough: that still adds 114 to 122.',
      group: 'gear',
    });
  }

  const mid = count(r => finished490(r) && (gearOf(r).delivery ?? 1) >= 0.85 && (gearOf(r).delivery ?? 1) < 0.95);
  if (mid < 2) {
    needs.push({
      id: 'delivery-mid',
      title: 'Accounts whose delivery set is a little short of the best',
      why: 'Nine accounts have delivery sets at about 96 to 100% of the best possible set and two at about 80%; only one sits in between. More in the middle would show whether a slightly weaker delivery set changes your best plan a little at a time, or not at all until it is quite weak.',
      who: 'players whose delivery set is a step or two short of all T4L pieces with T4 stones',
      have: mid,
      want: 2,
      preset: 'F2',
      runs: 1,
      note: 'For example an epic Quantum metronome and epic Interstellar compass with the rest T4L (about 92.5%), a single T3 Quantum metronome (about 92%) or T2 Gusset (about 90%), or T3 Tachyon and Quantum stones instead of T4 (about 95%).',
      group: 'gear',
    });
  }

  const split = count(r => finished490(r) && (gearOf(r).clothedTE ?? 0) >= 280 && (gearOf(r).delivery ?? 1) < 0.9);
  if (split < 2) {
    needs.push({
      id: 'earnings-strong-delivery-weak',
      title: 'A strong earnings set with a weak delivery set',
      why: 'The only weak delivery sets on the board belong to accounts with lowish CTE, so we cannot tell whether it is the delivery set or the lower CTE that pushes them toward more ascensions. An account at CTE 280 or more with a weak delivery set would separate the two.',
      who: 'players at CTE 280 or more with two or more epic or rare delivery pieces',
      have: split,
      want: 2,
      preset: 'F2',
      runs: 1,
      note: 'For example all-epic delivery pieces with a T4L Lunar totem as the fourth (about 89% of the best possible set), or a rare Quantum metronome and rare Interstellar compass with a T4L Gusset (about 85.5%).',
      group: 'gear',
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
 * is pulled down to start just above the player's TE, keeping its step; every band then drops the
 * values the player has already passed. Returned as text, ready to paste into the planner.
 */
export function presetBandsFor(presetId: string, currentTE: number, final = 490): string {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.bands) return '';
  const start = Math.floor(currentTE) + 1;
  return preset.bands
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map((part, i) => {
      // `+a-+b:step`, first band only: the player's TE plus a to plus b.
      const rel = i === 0 ? part.match(/^\+(\d+)\s*-\s*\+(\d+)(?::(\d+))?$/) : null;
      if (rel) {
        const step = rel[3] ? Number(rel[3]) : 5;
        const lo = Math.floor(currentTE) + Number(rel[1]);
        const hi = Math.min(Math.floor(currentTE) + Number(rel[2]), final - 1);
        return `${Math.min(lo, hi)}-${hi}:${step}`;
      }
      const m = part.match(/^(\d+)\s*-\s*(\d+)(?::(\d+))?$/);
      if (!m) return part;
      const step = m[3] ? Number(m[3]) : 5;
      const hi = Math.min(Number(m[2]), final - 1);
      // The first range starts just above the player's TE whichever side of it the preset's own
      // start is: pulled down for a low account, raised for a high one (a 240-TE player used to be
      // shown a range starting at 195, all of it behind them).
      const lo = i === 0 ? start : Math.max(Number(m[1]), start);
      return `${Math.min(lo, hi)}-${hi}:${step}`;
    })
    .join('; ');
}

/** Chains one run of a preset prices from this TE toward `final`, with the bands fitted as above. */
export function presetChains(presetId: string, currentTE: number, final = 490): { chains: number; ascensions: number } {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  const text = presetBandsFor(presetId, currentTE, final);
  if (!preset || !text) return { chains: 0, ascensions: 0 };
  const bands = parseBands(text).map(band => band.filter(v => v > currentTE && v < final));
  return { chains: countBanded(bands, final, currentTE, preset.minGap), ascensions: preset.ascensions };
}
