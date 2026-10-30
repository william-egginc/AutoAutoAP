/**
 * The one save-age banner (spec-saveage, 29 Oct 2026; components/myruns/SaveAgeStrip.vue): how old the loaded save
 * is and how much of the virtue farm's silo time is used, in one tone, on every surface (My runs, the Auto Planner
 * screens, Setup). Before, two banners said it two ways: a strip on the save's age (6 h amber, 24 h red) and a red
 * line on the farm's last step against the plan start ("Your save is 40h old, longer than your silos hold").
 *
 * Jordan's thresholds (29 Oct 2026). S is the virtue farm's silo time: 3 h to 30 h with the silos bought (one silo
 * at full Silo Capacity is 3 h, ten are 30 h); once it runs out the farm earns nothing until the game syncs. Silos
 * are per farm, so contract farms don't count. Two clocks: the SAVE'S AGE (now - lastBackupTime) and the SILO TIME
 * USED (now - the virtue farm's lastStepTime; older than the backup when a check-in didn't sync).
 *   - green: both under half of S;
 *   - yellow: either at half of S or more, never before 1 h;
 *   - red: a tenth of S or less left on either (90% used), never before 1 h either;
 *   - no virtue ascension under way: the save's age alone, against the same S (the smallest, 3 h, unknown);
 *   - past a day old: a "sync your game" line, in any tone (not a tone of its own).
 * Pure: the clock and the zone are parameters. Every player-facing sentence here is a DRAFT (Words reviews).
 */
import { dateAt } from './eventWhen';
import { ageAgo, ageWords, siloSeconds as siloSecondsFor } from './saveAge';
import { countTEThresholdsPassed } from './truthEggs';

/**
 * My runs' "load a fresh save first" line (lib/recalc.ts `needsFreshSave`): 6 h. Was also the old strip's amber
 * (Jordan, 15 Oct 2026); the banner's tones now follow the silo thresholds below, this one stays as it was.
 */
export const SAVE_AMBER_HOURS = 6;

/** Yellow from this share of the silo time used. */
export const YELLOW_FRACTION = 0.5;
/** Red from this share used: a tenth or less left. */
export const RED_FRACTION = 0.9;
/** Neither yellow nor red before this, whatever the silos hold. */
export const TONE_FLOOR_SECONDS = 3600;
/** Past this the banner asks for a sync, in any tone. */
export const SYNC_AFTER_SECONDS = 24 * 3600;
/** The virtue farm is named only when its last step is further than this from the backup (as lib/saveAge.ts). */
export const FARM_NAMED_AFTER_SECONDS = 15 * 60;
/** The silo time when the save doesn't say: the smallest silos, one at full Silo Capacity. */
export const SMALLEST_SILO_SECONDS = 3 * 3600;

export type SaveTone = 'green' | 'yellow' | 'red';

/** What the banner reads off the save (`saveClockOf`), plus the clock. */
export interface SaveStateInput {
  /** The save's `lastBackupTime` (unix seconds). */
  backupSeconds: number | null | undefined;
  /** The virtue farm's `lastStepTime`; the backup's time when missing. Ignored without a virtue farm. */
  farmStepSeconds?: number | null;
  /** S, the virtue farm's silo time; null when unknown (the smallest, 3 h). */
  siloSeconds?: number | null;
  /** The silos bought, for the details; null when unknown. */
  siloCount?: number | null;
  /** A virtue ascension under way (a virtue farm in the save). False: the save's age alone. */
  hasVirtueFarm: boolean;
  nowSeconds: number;
  zone: string;
}

export interface SaveState {
  tone: SaveTone;
  /** The tone said in words, so colour is never alone. */
  word: string;
  icon: 'clock' | 'alert' | 'stop';
  saveAgeSeconds: number;
  /** Time since the virtue farm last ran; null without a virtue farm. */
  siloUsedSeconds: number | null;
  /** S minus the silo time used, never below 0; null without a virtue farm. */
  siloLeftSeconds: number | null;
  /** S as used (the smallest when unknown). */
  siloSeconds: number;
  /** The worse clock's share of S. */
  fractionUsed: number;
  /** The clock the tone and the reason follow. */
  driver: 'silo' | 'save';
  /** "your virtue farm" rather than "your save": the farm's time is more than 15 minutes from the backup's. */
  namesFarm: boolean;
  /** Past a day old: ask for a sync. */
  suggestSync: boolean;
  /** Green: the one quiet line. Yellow and red: what to do. */
  headline: string;
  /** Yellow and red: what is wrong and what is at stake. Null on green. */
  reason: string | null;
  /** The sync suggestion, or null. */
  syncLine: string | null;
  /** Behind "Details": both clocks, the silos, the thresholds, what catch-up does. */
  details: string[];
  /** A search's run note on red (store `runNotes`), else null. */
  runNote: string | null;
  /** The load button's words where the screen has none of its own (My runs). */
  link: string;
}

const WORD: Record<SaveTone, string> = { green: 'Up to date', yellow: 'Getting old', red: 'Out of date' };
const ICON: Record<SaveTone, SaveState['icon']> = { green: 'clock', yellow: 'alert', red: 'stop' };
const RANK: Record<SaveTone, number> = { green: 0, yellow: 1, red: 2 };

/** Where yellow and red start for silos holding `silo` seconds. */
export function toneLines(silo: number): { yellowAt: number; redAt: number } {
  return {
    yellowAt: Math.max((silo * 5) / 10, TONE_FLOOR_SECONDS),
    redAt: Math.max((silo * 9) / 10, TONE_FLOOR_SECONDS),
  };
}

function toneOf(used: number, silo: number): SaveTone {
  const { yellowAt, redAt } = toneLines(silo);
  return used >= redAt ? 'red' : used >= yellowAt ? 'yellow' : 'green';
}

/** The banner's state, null without a save time. */
export function saveState(i: SaveStateInput): SaveState | null {
  const backup = i.backupSeconds;
  if (!backup || !(backup > 1e9)) return null;
  const now = i.nowSeconds;
  const silo = i.siloSeconds && i.siloSeconds > 0 ? i.siloSeconds : SMALLEST_SILO_SECONDS;
  const saveAge = Math.max(0, now - backup);
  const farmAt = i.hasVirtueFarm ? (i.farmStepSeconds && i.farmStepSeconds > 1e9 ? i.farmStepSeconds : backup) : null;
  const used = farmAt == null ? null : Math.max(0, now - farmAt);
  const left = used == null ? null : Math.max(0, silo - used);
  const saveTone = toneOf(saveAge, silo);
  const siloTone = used == null ? 'green' : toneOf(used, silo);
  const tone = RANK[siloTone] > RANK[saveTone] ? siloTone : saveTone;
  const driver: SaveState['driver'] = used != null && used >= saveAge ? 'silo' : 'save';
  const namesFarm = farmAt != null && Math.abs(farmAt - backup) > FARM_NAMED_AFTER_SECONDS;
  const suggestSync = saveAge > SYNC_AFTER_SECONDS;
  const when = dateAt(backup, now, i.zone);

  // ---- the words (DRAFT: Words reviews)
  const headline =
    tone === 'green'
      ? `Your save is from ${when}, ${ageAgo(saveAge)}`
      : tone === 'yellow'
        ? 'Open Egg, Inc. so it syncs, then load a fresh save'
        : 'Open Egg, Inc. so it syncs, then load a fresh save before you rely on these answers';
  let reason: string | null = null;
  if (tone !== 'green') {
    if (driver === 'silo' && used != null && left != null) {
      const subject = namesFarm ? `Your virtue farm last ran ${ageAgo(used)}` : `Your save is ${ageWords(saveAge)} old`;
      if (tone === 'yellow')
        reason = `${subject}, and your silos run out in ${ageWords(left)}: after that the farm earns nothing until the game syncs.`;
      else if (left > 0)
        reason = `${subject}, and your silos run out in ${ageWords(left)}: after that the farm earns nothing, so the answers here stop being right.`;
      else
        reason = `${subject}, and your silos ran out ${ageAgo(used - silo)}: the farm has earned nothing since, so the answers here are probably wrong.`;
    } else {
      reason =
        tone === 'yellow'
          ? `Your save is ${ageWords(saveAge)} old (from ${when}), so the times here may have drifted.`
          : `Your save is ${ageWords(saveAge)} old (from ${when}), so the times here are probably wrong now and some may have passed.`;
    }
  }
  const syncLine = suggestSync ? 'Your save is over a day old: open Egg, Inc. and let it sync so the save here is up to date.' : null;

  const details = [`Save: from ${when} (${ageAgo(saveAge)}).`];
  const lines = toneLines(silo);
  if (farmAt != null && used != null && left != null) {
    details.push(`Virtue farm last ran: ${dateAt(farmAt, now, i.zone)} (${ageAgo(used)}).`);
    const holds = i.siloSeconds && i.siloSeconds > 0
      ? `Silos: ${i.siloCount ?? '?'}, holding ${ageWords(silo)}`
      : `Silos: not in the save, so the smallest is assumed (${ageWords(silo)})`;
    details.push(`${holds}; ${left > 0 ? `${ageWords(left)} left` : `ran out ${ageAgo(used - silo)}`}.`);
  } else {
    details.push(`No virtue ascension under way, so silo time doesn't apply: this follows your save's age alone, against ${ageWords(silo)}.`);
  }
  details.push(
    `Getting old after ${ageWords(lines.yellowAt)}, out of date after ${ageWords(lines.redAt)}: for both the save's age and the silo time used.`
  );
  if (farmAt != null)
    details.push(
      'Catch-up: from the farm\'s last run to the plan start, the planner runs your farm at its current rate, for as long as your silos hold, the way the game credits time away. Anything you did in the game since is not in it.'
    );

  return {
    tone,
    word: WORD[tone],
    icon: ICON[tone],
    saveAgeSeconds: saveAge,
    siloUsedSeconds: used,
    siloLeftSeconds: left,
    siloSeconds: silo,
    fractionUsed: Math.max(saveAge, used ?? 0) / silo,
    driver,
    namesFarm,
    suggestSync,
    headline,
    reason,
    syncLine,
    details,
    runNote: tone === 'red' ? `${reason} ${headline}.` : null,
    link: tone === 'green' ? 'Load a fresh one' : 'Load a fresh save',
  };
}

interface RawClockSave {
  game?: { epicResearch?: ({ id?: string | null; level?: number | null } | null)[] | null } | null;
  farms?: ({ eggType?: number | null; lastStepTime?: number | null; silosOwned?: number | null } | null)[] | null;
}

/** `saveState`'s inputs as the save itself has them (not the planner's stores), the clock aside. */
export type SaveClock = Omit<SaveStateInput, 'nowSeconds' | 'zone'> & {
  backupSeconds: number;
  farmStepSeconds: number | null;
  siloSeconds: number | null;
  siloCount: number | null;
};

/**
 * The save's own times, read from the save (the raw backup): its backup time, its virtue farm's last step and silos
 * (egg types 50 to 54; the home and contract farms have silos of their own and don't count) and Silo Capacity.
 * Null without a save time: a Manual plan's redacted save has none, so callers hand in the save itself (the store's
 * `saveClock` reads the kept save start while the stores hold a plan, search/saveStart.ts).
 */
export function saveClockOf(raw: unknown): SaveClock | null {
  const backupSeconds = backupSecondsOf(raw);
  if (!backupSeconds) return null;
  const r = raw as RawClockSave;
  const farm = (r.farms ?? []).find(f => f && typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54);
  if (!farm) return { backupSeconds, farmStepSeconds: null, siloSeconds: null, siloCount: null, hasVirtueFarm: false };
  const level = (r.game?.epicResearch ?? []).find(e => e?.id === 'silo_capacity')?.level ?? 0;
  const count = farm.silosOwned && farm.silosOwned > 0 ? farm.silosOwned : null;
  return {
    backupSeconds,
    farmStepSeconds: farm.lastStepTime && farm.lastStepTime > 1e9 ? farm.lastStepTime : null,
    siloSeconds: count ? siloSecondsFor(count, level) : null,
    siloCount: count,
    hasVirtueFarm: true,
  };
}

/** What the save itself says, read straight from it (the raw backup), not from the planner's stores. */
interface RawSave {
  settings?: { lastBackupTime?: number | null } | null;
  approxTime?: number | null;
  virtue?: { eovEarned?: (number | null)[] | null; eggsDelivered?: (number | null)[] | null } | null;
}

/**
 * The save's own time (unix seconds): `settings.lastBackupTime`, else `approxTime`, as the initial-state store's
 * `loadFromBackup` reads it; 0 without one. On a page load the store can hold the Manual planner's restored
 * draft, whose `lastBackupTime` is always 0 (stores/actions/io.ts `exportPlanData`), beside the save itself.
 */
export function backupSecondsOf(raw: unknown): number {
  const r = raw as RawSave | null | undefined;
  const t = r?.settings?.lastBackupTime || r?.approxTime || 0;
  return typeof t === 'number' && t > 1e9 ? t : 0;
}

/**
 * The save's own TE by virtue egg (Curiosity, Integrity, Humility, Resilience, Kindness): the claimed TE or the
 * thresholds passed, whichever is more, capped at 98 (pending Truth Eggs counted, as the planner counts them once it
 * sets the save up, and as a sent row's `backupTE`). Five zeros without a save. Not the initial-state store's
 * `initialTeEarned`: after an account switch that is the CLAIMED TE only (`loadFromBackup` without
 * `rollUpPendingTE`), and on a page load it can be a restored Manual draft's (ui fix 21).
 */
export function saveTEByEggOf(raw: unknown): number[] {
  const v = (raw as RawSave | null | undefined)?.virtue;
  const earned = v?.eovEarned ?? [];
  const delivered = v?.eggsDelivered ?? [];
  const out: number[] = [];
  for (let i = 0; i < 5; i++)
    out.push(v ? Math.min(98, Math.max(earned[i] ?? 0, countTEThresholdsPassed(delivered[i] ?? 0))) : 0);
  return out;
}

/** The save's own TE: `saveTEByEggOf` summed. 0 without a save. */
export function saveTEOf(raw: unknown): number {
  return saveTEByEggOf(raw).reduce((a, b) => a + b, 0);
}
