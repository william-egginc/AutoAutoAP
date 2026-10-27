/**
 * A board run's legs read back from its CSV (26 Oct 2026, Williamthe5thc: a route followed from his Fast run sent from
 * another browser showed only the instant estimate in this one, while the run's CSV on the planner's server has every
 * leg: start, build phase end, end, TE, strategy, peak delivery, each shift with its time and egg, and the time-off
 * cut). The CSV is the app's own (search/csv.ts: the chain search's COLUMNS, By a date's DEADLINE_COLUMNS); its times are
 * `YYYY-MM-DD HH:MM` in the run's timezone, named in its header (`generated … (<zone>)`), so they come back to the
 * minute. The route's rows are the first rows whose `chain` cell is the route; the priced-routes section after them is
 * never read.
 *
 * Pure: text in, legs out (null when the route isn't in the file or a time can't be read).
 */
import { readCsv } from '@/lib/csvParse';
import type { LegSummary } from './types';

/** `YYYY-MM-DD HH:MM` in `zone` to unix seconds (the inverse of search/csv.ts `formatInZone`); null when unreadable. */
export function unixFromZoned(text: string | undefined, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec((text ?? '').trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
  const wallOf = (t: number) => {
    const p = fmt.formatToParts(new Date(t * 1000));
    const g = (k: string) => Number(p.find(x => x.type === k)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) / 1000;
  };
  // A few passes settle the zone's offset (and its DST edge).
  let t = wall;
  for (let i = 0; i < 3; i++) t += wall - wallOf(t);
  return Number.isFinite(t) ? t : null;
}

/** The run's timezone from its CSV header (`# generated … (<zone>)`); null when absent. */
export function csvZone(text: string): string | null {
  const m = /^# generated [^\n]*\(([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*)\)\s*$/m.exec(text.slice(0, 20_000));
  return m ? m[1] : null;
}

/** The legs of `chain` in a run's CSV, as LegSummary (the simulator's own, to the minute). */
export function legsFromRunCsv(text: string, chain: readonly number[]): LegSummary[] | null {
  const zone = csvZone(text);
  if (!zone) return null;
  const want = chain.join(' ');
  let head: string[] | null = null;
  const rows: Record<string, string>[] = [];
  let done = false;
  try {
    readCsv(text, {
      record(cells) {
        if (done) return;
        // The route section's header; a second header (the priced routes) ends it.
        if (cells[0] === 'rank' || cells[0] === 'kind') {
          if (head) done = true;
          else if (cells[0] === 'rank') head = cells;
          return;
        }
        if (!head) return;
        const row: Record<string, string> = {};
        head.forEach((h, i) => (row[h] = cells[i] ?? ''));
        if (row.chain === want && row.leg) rows.push(row);
        else if (rows.length) done = true;
      },
    });
  } catch {
    return null;
  }
  if (!rows.length) return null;
  const legs: LegSummary[] = [];
  for (const r of rows) {
    const start = unixFromZoned(r.leg_start_local, zone);
    const end = unixFromZoned(r.leg_end_local, zone);
    const endTE = Number(r.target_te);
    if (start === null || end === null || !Number.isFinite(endTE) || !r.target_te) return null;
    const build = unixFromZoned(r.build_phase_end_local, zone);
    const shifts: { at: number; egg: string }[] = [];
    for (const part of (r.shift_times_local ?? '').split(';')) {
      const s = part.trim();
      if (!s) continue;
      const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) ([a-z]+)$/.exec(s);
      const at = m ? unixFromZoned(m[1], zone) : null;
      if (!m || at === null) return null;
      shifts.push({ at, egg: m[2] });
    }
    const qph = Number(r.peak_delivery_q_per_hr);
    legs.push({
      key: (r.strategy || 'continue') as LegSummary['key'],
      endTE,
      durationSeconds: end - start,
      maxELR: r.peak_delivery_q_per_hr && Number.isFinite(qph) ? (qph * 1e15) / 3600 : 0,
      endTime: end,
      tier13Unlocked: r.tier13 === 'yes',
      startTime: start,
      ...(build !== null ? { buildPhaseEndTime: build } : {}),
      shifts: shifts.map((s, i) => ({ ...s, ...(i === 0 && r.starts_on_egg ? { fromEgg: r.starts_on_egg } : {}) })),
      ...(r.time_off === 'stopped' || r.time_off === 'restarted' ? { timeOff: r.time_off } : {}),
    });
  }
  return legs;
}
