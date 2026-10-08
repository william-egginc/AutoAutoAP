/**
 * What a By a date result says about its own run (batch 4): how long it took and what space it
 * searched, read from the stored result so a saved answer and a carried-on run say it too.
 * Fields added later (`elapsedSeconds`, `workers`, `lastLo`, `bandSets`) are optional: an older result
 * simply leaves that part out.
 */
import { formatBand } from './exhaustive';
import type { SavedDeadlineResult } from './deadlineStore';

/** `45 s`, `5 min 40 s`, `1 h 12 min`: exact enough to compare runs, unlike `durationLabel`. */
export function tookDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type SearchedSummary = Pick<
  SavedDeadlineResult,
  | 'simple'
  | 'shapes'
  | 'priced'
  | 'elapsedSeconds'
  | 'workers'
  | 'carriedOn'
  | 'bandSets'
  | 'lastLo'
  | 'lastHi'
  | 'stoppedEarly'
>;

export interface ByDateSummary {
  /** "Took 5 min 40 s on 7 workers · searched 236 sets of early stops (...) · 1,107 routes priced". */
  line: string;
  /** Advanced: one entry per chain ("4 ascensions 189-215:1; 211-251:10; 257-297:10"). Empty on Simple
   *  and on results that did not keep their boxes. */
  chains: string[];
  /** Advanced: "last stop 278-318" (or "up to 318" on a result that did not keep its lower end). */
  lastStop: string;
}

/** The ± widths Simple used, widest first ("±3/±2/±1 TE"), read from the boxes it kept. */
export function simpleWidths(bandSets: number[][][] | undefined): string {
  const w = new Set<number>();
  for (const set of bandSets ?? [])
    if (set.length) w.add(Math.max(...set.map(b => Math.floor((b.length - 1) / 2))));
  return [...w]
    .filter(x => x > 0)
    .sort((a, b) => b - a)
    .map(x => `±${x}`)
    .join('/');
}

export function summariseByDate(r: SearchedSummary): ByDateSummary {
  const parts: string[] = [];
  if (r.elapsedSeconds != null && r.elapsedSeconds >= 0) {
    const w = r.workers && r.workers > 0 ? ` on ${r.workers} worker${r.workers === 1 ? '' : 's'}` : '';
    parts.push(`Took ${tookDuration(r.elapsedSeconds)}${w}${r.carriedOn ? ' (carried on)' : ''}`);
  }
  const sets = `${r.shapes.toLocaleString('en-US')} set${r.shapes === 1 ? '' : 's'} of early stops`;
  const widths = simpleWidths(r.bandSets);
  const how = r.simple
    ? `Simple: around the instant answer's routes${widths ? `, ${widths} TE` : ''}`
    : 'Advanced: your own boxes';
  parts.push(`${parts.length ? 'searched' : 'Searched'} ${sets} (${how})`);
  parts.push(`${r.priced.toLocaleString('en-US')} route${r.priced === 1 ? '' : 's'} priced`);

  const chains = r.simple
    ? []
    : (r.bandSets ?? []).map(set => `${set.length + 1} ascension${set.length ? 's' : ''} ${set.map(b => formatBand(b)).join('; ')}`);
  const lastStop = r.simple || !chains.length ? '' : r.lastLo ? `last stop ${r.lastLo}-${r.lastHi}` : `last stop up to ${r.lastHi}`;
  return { line: parts.join(' · '), chains, lastStop };
}
