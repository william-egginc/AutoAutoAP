/**
 * The farm's silos estimated to now, from the save (My runs' Your eggs; item 6, 25 Oct 2026). Silo time only, no hab
 * fill (Jordan: silos empty, habs don't; once the silos run out no eggs are laid, so the habs stop filling too).
 *
 * The model is the planner's one offline-silo model (lib/saveAge.ts `siloSeconds`: silo count x the per-silo time
 * Silo Capacity sets, the time away the game credits): the silos are full while the game runs, so at the farm's last
 * step in the save, and run down one second per second away after it. Nothing else is simulated. Pure.
 */
import { dateAt } from './eventWhen';
import { ageWords } from './saveAge';
import { formatSiloTime } from '@/stores/silos';

export interface SiloNow {
  /** Seconds of time away the silos hold full. */
  capacitySeconds: number;
  /** Seconds of time away left now; 0 once empty. */
  leftSeconds: number;
  /** When the silos ran (or run) out, unix seconds. */
  emptyAt: number;
  empty: boolean;
}

/**
 * Null without a save time or silos. `stepSeconds`: the farm's own last step in the save (`lastStepTime`), when the
 * farm was last running; the save's time stands in without one (or with one after it).
 */
export function siloNow(o: {
  siloSeconds: number;
  saveSeconds: number;
  stepSeconds?: number | null;
  nowSeconds: number;
}): SiloNow | null {
  if (!(o.saveSeconds > 1e9) || !(o.siloSeconds > 0) || !Number.isFinite(o.nowSeconds)) return null;
  const from = o.stepSeconds && o.stepSeconds > 1e9 && o.stepSeconds <= o.saveSeconds ? o.stepSeconds : o.saveSeconds;
  const away = Math.max(0, o.nowSeconds - from);
  const leftSeconds = Math.max(0, o.siloSeconds - away);
  return { capacitySeconds: o.siloSeconds, leftSeconds, emptyAt: from + o.siloSeconds, empty: leftSeconds <= 0 };
}

export interface SiloNowWords {
  /** "about 14 h left" / "empty". */
  value: string;
  /** "of 1d 2h · estimated from your save of Oct 25 at 10:09 AM" / "since Oct 26 at 1:00 AM · estimated …". */
  note: string;
  /** The whole sentence: "Silos: about 14 h left (estimated from your save of Oct 25 at 10:09 AM)". */
  line: string;
}

export function siloNowWords(s: SiloNow, saveSeconds: number, nowSeconds: number, zone: string): SiloNowWords {
  const from = `estimated from your save of ${dateAt(saveSeconds, nowSeconds, zone)}`;
  if (s.empty) {
    const since = `since ${dateAt(s.emptyAt, nowSeconds, zone)}`;
    return { value: 'empty', note: `${since} · ${from}`, line: `Silos: empty ${since} (${from})` };
  }
  const left = s.leftSeconds < 60 ? 'under a minute left' : `about ${ageWords(s.leftSeconds)} left`;
  return {
    value: left,
    note: `of ${formatSiloTime(Math.round(s.capacitySeconds / 60))} · ${from}`,
    line: `Silos: ${left} (${from})`,
  };
}
