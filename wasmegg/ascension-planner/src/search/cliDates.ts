/**
 * Small pure pieces of the command line (scripts/fastsearch.ts, scripts/siteRun.ts), here so they have specs.
 *
 * The command line's whole-date ranges (scripts/fastsearch.ts --time-off and --no-prestige): `2027-07-14` or
 * `2027-07-14:2027-07-16`, comma-separated or repeated, checked as Your setup checks them (search/timeOff.ts).
 */
import { usableTimeOff, type TimeOffDates } from './timeOff';

export function parseDateRanges(values: readonly string[], flag: string): TimeOffDates[] {
  const out = values
    .flatMap(v => v.split(','))
    .map(s => s.trim())
    .filter(Boolean)
    .map(spec => {
      const [from, to = from] = spec.split(':');
      return { from, to };
    });
  if (usableTimeOff(out).length !== out.length) throw new Error(`--${flag} must look like 2027-07-14 or 2027-07-14:2027-07-16`);
  return out;
}

/** --csv FILE for chain k of a queue: FILE itself for one chain, FILE-chain-K-Nasc.csv for each of several. */
export function queueCsvPath(file: string, k: number, count: number, asc: number): string {
  return count === 1 ? file : `${file.replace(/\.csv$/i, '')}-chain-${k + 1}-${asc}asc.csv`;
}
