/**
 * @module explorer/upload
 * @description Turning the two files a chain search saves -- the chain CSV and the diagnostics
 * JSON -- into a collector submission, and refusing the ones that are broken.
 *
 * WHY FILES AND NOT THE PLANNER'S SUBMIT BUTTON. The long sweeps run overnight, sometimes on a
 * machine nobody is watching, and the button only exists while the tab that ran them is still
 * open. The files survive the tab. Between them they hold everything the button would have sent,
 * plus the variables the button never did: truth eggs per egg, backup age, the colleggtible and
 * epic research modifiers the run was priced with.
 *
 * TWO FILES, CHECKED AGAINST EACH OTHER. Each is written by a different code path at a different
 * moment, so a pair that disagrees -- different starting TE, a different winner -- is two runs'
 * files picked up together, and storing it would pin one run's result to another run's inputs.
 *
 * CORRUPTION. Downloads have been cut short before. A chain CSV always ends in a newline and always
 * states how many chains it holds, so a file that ends mid-row, or holds fewer chains than its
 * header says, is truncated and is refused rather than stored as a smaller run.
 *
 * WHAT IS NEVER SENT. The diagnostics carry the backup's `userName`. Nothing here reads it: the
 * submission is built by `buildSubmission`, the planner's own whitelist, from named fields only.
 */
import { artifactOptions, stoneOptions } from '@/lib/artifacts/data';
import { cteFromArtifacts, cteFromColleggtibles, cteFromLabUpgrade } from 'lib/virtue';
import type { Modifiers } from 'lib/collegtibles';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { epicResearchDefs } from '@/lib/epicResearch';
import { isConstrained, type Availability } from '@/search/availability';
import type { InventoryCount, LoadoutSlot } from '@/search/csv';
import { summariseEpicResearch } from '@/search/progression';
import {
  buildSubmission,
  type MachineInfo,
  type Submission,
  type SweepTag,
} from '@/search/submission';
import type { LegSummary } from '@/search/types';
import { checkFinalLegRate, deliveryScore, slotsFromLabels, type RateCheck } from '@/search/virtueScore';
import type { CollectorRow } from './collector';

/** The sweeps players are asked to run, in per-checkpoint bands mode. See collector/README.md. */
export const SWEEP_PRESETS: { id: string; label: string; ascensions: number; bands: string; minGap: number }[] = [
  { id: 'M1', label: 'M1 baseline, 2 ascensions', ascensions: 2, bands: '189-489:1', minGap: 0 },
  { id: 'M2', label: 'M2, 3 ascensions', ascensions: 3, bands: '190-280:2; 270-372:2', minGap: 10 },
  { id: 'M3', label: 'M3, 4 ascensions', ascensions: 4, bands: '190-250:5; 215-300:5; 280-360:5', minGap: 10 },
  {
    id: 'M4',
    label: 'M4 check, 5 ascensions',
    ascensions: 5,
    bands: '190-215:5; 210-250:5; 240-300:5; 285-350:5',
    minGap: 10,
  },
  // Fine, not wide (2026-09-25). The best chains are needle-sharp: one TE off costs 2-22 days, and
  // M2's every-2-TE grid loses 0.5-1 d on average against checking every TE. Every best 3-ascension
  // chain so far put its checkpoints at 197-233 and 282-292, so this checks EVERY TE there and
  // nothing else -- fewer chains than M2, and exact. After the M presets so a 3-ascension upload
  // still defaults to M2.
  { id: 'F2', label: 'F2 fine, 3 ascensions at every TE', ascensions: 3, bands: '195-250:1; 276-300:1', minGap: 10 },
  { id: 'custom', label: 'Something else', ascensions: 0, bands: '', minGap: 10 },
];

// ------------------------------------------------------------------------------------------ CSV

export interface CsvLeg {
  targetTE: number;
  strategy: string;
  days: number;
  peakQph: number;
  prestigeDelayHours: number;
  shiftHoldHours: number;
}

export interface UploadCsv {
  planStartLocal: string;
  timezone: string;
  currentTE: number;
  finalTE: number;
  effort: string;
  forceContinue: boolean;
  chainsStated: number;
  chainsFound: number;
  /** Rank 1. */
  best: { chain: number[]; days: number; legs: CsvLeg[] } | null;
  /** Total days of every chain in the file, by `chain.join(' ')`. */
  daysByChain: Map<string, number>;
  artifacts: string[];
  stones: { label: string; count: number }[];
  endsCleanly: boolean;
  /** Ranks whose total_days is below the rank before them: the file is not the sorted table it claims to be. */
  outOfOrder: number;
}

const COLUMN_HEADER = 'rank,chain,prestiges,total_days,gap_days,leg,target_te,strategy,';

/**
 * A chain CSV, read for what an upload needs: the header facts, the rank-1 chain with its legs,
 * and enough of the rest to tell whether the file is whole.
 *
 * Throws with a readable message when it is not a chain CSV at all; everything else comes back as
 * data for `checkUpload` to judge. Scans by index for the reason `parseRunCsv` does.
 */
export function readUploadCsv(text: string): UploadCsv {
  if (!text.startsWith('# ascension-planner chain search')) {
    throw new Error('That is not a chain-search CSV: it does not start with the planner’s header line.');
  }
  const out: UploadCsv = {
    planStartLocal: '',
    timezone: '',
    currentTE: 0,
    finalTE: 0,
    effort: '',
    forceContinue: false,
    chainsStated: 0,
    chainsFound: 0,
    best: null,
    daysByChain: new Map(),
    artifacts: [],
    stones: [],
    endsCleanly: text.endsWith('\n'),
    outOfOrder: 0,
  };
  let sawColumns = false;
  let lastChain = '';
  let lastDays = -Infinity;
  const seen = new Set<string>();

  let i = 0;
  const n = text.length;
  while (i < n) {
    let end = text.indexOf('\n', i);
    if (end === -1) end = n;
    const line = text[end - 1] === '\r' ? text.slice(i, end - 1) : text.slice(i, end);
    i = end + 1;
    if (!line) continue;

    if (line.charCodeAt(0) === 35 /* # */) {
      let m: RegExpExecArray | null;
      if ((m = /^# plan start (.+)$/.exec(line))) out.planStartLocal = m[1].trim();
      else if ((m = /current TE (\d+)\s*->\s*final target (\d+)/.exec(line))) {
        out.currentTE = Number(m[1]);
        out.finalTE = Number(m[2]);
      } else if ((m = /^# effort (\w+); force-continue (on|off)/.exec(line))) {
        out.effort = m[1];
        out.forceContinue = m[2] === 'on';
      } else if ((m = /^# chains priced (\d+)/.exec(line))) out.chainsStated = Number(m[1]);
      else if ((m = /^# Local times are ([^.\s]+)\./.exec(line))) out.timezone = m[1];
      else if ((m = /^#\s+virtue inventory: (.*)$/.exec(line))) readInventory(m[1], out);
      continue;
    }
    if (line.startsWith(COLUMN_HEADER)) {
      sawColumns = true;
      continue;
    }
    const code = line.charCodeAt(0);
    if (code < 48 || code > 57) continue;

    const cells = line.split(',');
    const chainText = cells[1];
    const days = Number(cells[3]);
    if (chainText !== lastChain) {
      if (!seen.has(chainText)) {
        seen.add(chainText);
        out.daysByChain.set(chainText, days);
        if (days + 1e-6 < lastDays) out.outOfOrder++;
        lastDays = days;
      }
      lastChain = chainText;
    }
    if (cells[0] === '1') {
      if (!out.best) out.best = { chain: chainText.split(' ').map(Number), days, legs: [] };
      // Rank 1's per-leg rows. Columns are fixed by search/csv.ts; the only quoted cell is the
      // last one (shift times), which is to the right of everything read here.
      if (cells[5]) {
        out.best.legs.push({
          targetTE: Number(cells[6]),
          strategy: cells[7],
          days: Number(cells[13]),
          peakQph: Number(cells[14]),
          prestigeDelayHours: Number(cells[16]) || 0,
          shiftHoldHours: Number(cells[17]) || 0,
        });
      }
    }
  }
  if (!sawColumns) throw new Error('That CSV has no column header row, so it was not written by the planner.');
  out.chainsFound = seen.size;
  return out;
}

/** `T4E Puzzle cube, T4L Gusset; stones: 1x T2 Lunar stone, 14x T3 Quantum stone`. */
function readInventory(cell: string, out: UploadCsv): void {
  const [artifactPart, stonePart] = cell.split(/;\s*stones:\s*/);
  if (artifactPart && artifactPart !== 'empty') {
    out.artifacts = artifactPart
      .split(',')
      .map(s => s.trim())
      .filter(s => /^T\d/.test(s));
  }
  if (stonePart) {
    out.stones = stonePart
      .split(',')
      .map(s => /^(\d+)x (.+)$/.exec(s.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map(m => ({ label: m[2], count: Number(m[1]) }));
  }
}

// -------------------------------------------------------------------------------- diagnostics

/** The fields of `buildRunDiagnostics` this reads. Everything is optional: files come from any build. */
export interface Diagnostics {
  note?: string;
  takenAt?: string;
  backup?: { approxTime?: number; eovEarned?: number[] | null };
  te?: { searchStartsFrom?: number; target?: number };
  context?: {
    epicResearchLevels?: Record<string, number>;
    colleggtibleModifiers?: Modifiers;
  };
  loadout?: { delivery?: LoadoutSlot[]; earnings?: LoadoutSlot[] };
  schedule?: { planStart?: number; availability?: Availability | null; deferShifts?: boolean };
  result?: {
    chain: number[];
    days: number;
    legs?: { endTE: number; strategy: string; days: number; peakDeliveryQph: number }[];
  } | null;
}

export function readDiagnostics(text: string): Diagnostics {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('The diagnostics file is not valid JSON; it may have been cut off while saving.');
  }
  if (!d || typeof d !== 'object' || !String((d as Diagnostics).note ?? '').startsWith('Inputs handed to the chain-search')) {
    throw new Error('That JSON is not a chain-search diagnostics file (chain-search-diagnostics-*.json).');
  }
  return d as Diagnostics;
}

// ------------------------------------------------------------------------------------ checking

export interface UploadCheck {
  /** Any of these and the upload is refused. */
  errors: string[];
  /** Stored, but the reader should know. */
  warnings: string[];
  rate: RateCheck | null;
  /** Id of a stored run this pair already is. */
  duplicateOf: string | null;
}

const sameChain = (a: number[], b: number[]) => a.length === b.length && a.every((v, k) => v === b[k]);

export function checkUpload(csv: UploadCsv, diag: Diagnostics, existing: CollectorRow[]): UploadCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!csv.endsCleanly) errors.push('The CSV ends in the middle of a row. The download was cut off; save it again from the planner.');
  if (csv.chainsStated && csv.chainsFound < csv.chainsStated) {
    errors.push(
      `The CSV says it priced ${csv.chainsStated.toLocaleString()} chains but holds ${csv.chainsFound.toLocaleString()}. It is truncated.`
    );
  }
  if (csv.outOfOrder) errors.push(`${csv.outOfOrder} chains are out of rank order, so the file has been edited or damaged.`);
  if (!csv.best) errors.push('The CSV has no chains in it.');
  if (!diag.result) errors.push('The diagnostics have no result. Save them after the run finishes, not before.');
  if (!diag.schedule?.planStart) errors.push('The diagnostics have no plan start.');

  if (csv.best && diag.result) {
    if (diag.te?.searchStartsFrom !== csv.currentTE || diag.te?.target !== csv.finalTE) {
      errors.push(
        `The two files are from different runs: the CSV goes ${csv.currentTE} -> ${csv.finalTE} TE, the diagnostics ${diag.te?.searchStartsFrom} -> ${diag.te?.target}.`
      );
    } else {
      // Looked up anywhere in the table, not only at rank 1. On the live collector three runs
      // reported a winner that was not their own table's rank 1 -- one a tie, one a chain 0.4 d
      // slower than the table's best -- so "not rank 1" is not "a different run".
      const days = csv.daysByChain.get(diag.result.chain.join(' '));
      if (days === undefined || Math.abs(days - diag.result.days) > 0.01) {
        errors.push(
          `The two files are from different runs: the diagnostics' result ${diag.result.chain.join(' ')} (${diag.result.days.toFixed(2)} d) is not in the CSV at that duration.`
        );
      } else if (!sameChain(csv.best.chain, diag.result.chain) && csv.best.days < diag.result.days - 0.01) {
        warnings.push(
          `The CSV's best chain, ${csv.best.chain.join(' ')} at ${csv.best.days.toFixed(2)} d, beats the result the run reported (${diag.result.days.toFixed(2)} d). The CSV's best is what will be submitted.`
        );
      }
    }
  }
  if (!diag.loadout?.delivery?.length) warnings.push('No delivery set in the diagnostics, so the delivery score and the bug check are skipped.');
  if (!csv.best?.legs.length) warnings.push('The best chain has no per-leg rows, so the graphs cannot place it.');

  const legs = (csv.best?.legs ?? []).map(l => ({ peakDeliveryQph: l.peakQph }));
  const rate = csv.best ? checkFinalLegRate(csv.best.chain, legs, diag.loadout?.delivery) : null;
  if (rate?.suspect) {
    warnings.push(
      `The final leg peaks at ${rate.measuredQph.toFixed(2)} q/hr where this gear should reach about ${rate.expectedQph.toFixed(2)}. ` +
        'That is the signature of the old "delivery set used for earnings research" bug. It will be stored, and flagged.'
    );
  }

  let duplicateOf: string | null = null;
  if (csv.best) {
    const hit = existing.find(
      r =>
        sameChain(r.chain, csv.best!.chain) &&
        Math.abs(r.durationDays - csv.best!.days) < 1e-3 &&
        r.currentTE === csv.currentTE &&
        r.startLocal === csv.planStartLocal
    );
    if (hit) {
      duplicateOf = hit.id;
      errors.push(`This run is already in the collector (id ${hit.id}).`);
    }
  }
  return { errors, warnings, rate, duplicateOf };
}

// ------------------------------------------------------------------------------------ building

export interface UploadForm {
  nickname?: string;
  sweep: SweepTag;
  machine: MachineInfo;
}

const artifactMeta = new Map(artifactOptions.map(a => [a.label, a]));
const stoneMeta = new Map(stoneOptions.map(s => [s.label, s]));

function inventoryFromLabels(labels: string[]): InventoryCount[] {
  return labels.map(label => {
    const a = artifactMeta.get(label);
    return { label, count: 1, ...(a ? { familyId: a.familyId, tier: a.tier, rarity: a.rarity } : {}) };
  });
}

function stonesFromLabels(stones: { label: string; count: number }[]): InventoryCount[] {
  return stones.map(({ label, count }) => {
    const s = stoneMeta.get(label);
    return { label, count, ...(s ? { familyId: s.familyId, tier: s.tier } : {}) };
  });
}

/**
 * Clothed TE from the modifiers the run was priced with. Exactly the planner's formula
 * (`calculateClothedTEForSet`), except the permit, which the diagnostics do not record: Pro is
 * assumed, which is every virtue player who has submitted so far.
 */
function clothedTE(currentTE: number, diag: Diagnostics): number | null {
  const set = slotsFromLabels(diag.loadout?.earnings);
  const mods = diag.context?.colleggtibleModifiers;
  if (!set.length || !mods) return null;
  return (
    currentTE +
    cteFromArtifacts(equippedArtifactsToLibArtifacts(set)) +
    cteFromColleggtibles(mods) +
    cteFromLabUpgrade(diag.context?.epicResearchLevels?.cheaper_research ?? 0)
  );
}

/** Only call after `checkUpload` came back with no errors. */
export function buildUploadSubmission(csv: UploadCsv, diag: Diagnostics, form: UploadForm): Submission {
  const best = csv.best!;
  const levels = diag.context?.epicResearchLevels ?? {};
  // LegSummary is the simulator's own record; only the fields `buildSubmission` reads are filled.
  const legs = best.legs.map(
    l =>
      ({
        key: l.strategy as LegSummary['key'],
        endTE: l.targetTE,
        durationSeconds: l.days * 86400,
        maxELR: (l.peakQph * 1e15) / 3600,
        endTime: 0,
        tier13Unlocked: false,
        sleepDelaySeconds: l.prestigeDelayHours * 3600,
        shiftDelaySeconds: l.shiftHoldHours * 3600,
      }) as LegSummary
  );
  const availability = diag.schedule?.availability;
  const sub = buildSubmission({
    nickname: form.nickname,
    chain: best.chain,
    seconds: best.days * 86400,
    legs,
    planStart: diag.schedule!.planStart!,
    timezone: csv.timezone,
    currentTE: csv.currentTE,
    finalTE: csv.finalTE,
    effort: csv.effort,
    availability: isConstrained(availability) ? availability : null,
    holdShifts: !!diag.schedule?.deferShifts,
    forceContinue: csv.forceContinue,
    artifacts: inventoryFromLabels(csv.artifacts),
    stones: stonesFromLabels(csv.stones),
    delivery: diag.loadout?.delivery,
    earnings: diag.loadout?.earnings,
    chainsPriced: csv.chainsFound,
    epicResearch: Object.keys(levels).length
      ? summariseEpicResearch(
          epicResearchDefs.map(d => ({ id: d.id, name: d.name, level: levels[d.id] ?? 0, maxLevel: d.maxLevel }))
        )
      : null,
    deliveryScore: deliveryScore(slotsFromLabels(diag.loadout?.delivery)),
    clothedTE: clothedTE(csv.currentTE, diag),
    teByEgg: diag.backup?.eovEarned ?? null,
    backupTime: diag.backup?.approxTime ?? null,
  });
  const machine = Object.fromEntries(
    Object.entries(form.machine).filter(([, v]) => Number.isFinite(v) && (v as number) > 0)
  ) as MachineInfo;
  return {
    ...sub,
    sweep: form.sweep,
    ...(Object.keys(machine).length ? { machine } : {}),
    source: 'upload',
  };
}
