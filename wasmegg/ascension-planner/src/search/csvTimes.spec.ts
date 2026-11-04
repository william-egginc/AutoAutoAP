/**
 * The CSV's times in Excel (ux29 item 7, 27 Oct 2026): the *_local cells showed ######## in Excel. The cells are right
 * (`YYYY-MM-DD HH:MM` in the run's zone, search/csv.ts `formatInZone`): Excel turns them into dates and shows a date
 * in its own date format, wider than a column it never widens on opening a CSV, and a number or date that doesn't fit
 * shows as #s. The cells keep their format (the board's runs, the planner's readers and the analysis scripts read it);
 * the header now says what the times are and what the #s mean.
 *
 * And the readers (search/runLegsCsv.ts) take the times both ways: as written, and ISO 8601's `YYYY-MM-DDTHH:MM`
 * (which Excel keeps as text), so a later file written that way still reads in this release. Round trips: a DST day
 * each way, midnight, the shift lists.
 */
import { describe, expect, it } from 'vitest';
import { readCsv } from '@/lib/csvParse';
import { buildChainsCsv, buildDeadlineCsv, formatInZone } from './csv';
import { legsFromRunCsv, unixFromZoned } from './runLegsCsv';
import type { LegSummary } from './types';
import { XLSX_BUTTON } from '@/components/auto/csvButton';
import { XLSX_ROW_CAP } from '@/utils/xlsxRows';

const DENVER = 'America/Denver';
const H = 3600;
const D = 86400;
/** Denver wall time to unix seconds, its UTC offset given (-6 summer, -7 winter): plain, so the spec doesn't lean on a
 *  zone converter (lib/events.ts `getLocalTimestampInTimezone` is an hour late just after the spring-forward jump). */
const at = (day: string, time: string, offset: -6 | -7 = -7) => Date.parse(`${day}T${time}:00Z`) / 1000 - offset * H;
const minute = (t: number) => Math.floor(t / 60) * 60;
const meta = (planStart: number) => ({
  planStart,
  timezone: DENVER,
  currentTE: 195,
  final: 310,
  effort: 'quick',
  firstAscension: 'auto' as const,
  availability: null,
  seedChain: [197, 310],
  loadouts: [{ label: 'equipped in the backup', loadout: null }],
  generatedAt: planStart * 1000,
});
const leg = (start: number, end: number, endTE: number, shifts: number[], build = start): LegSummary => ({
  key: 'continue',
  endTE,
  durationSeconds: end - start,
  maxELR: 5.5e15 / 3600,
  endTime: end,
  tier13Unlocked: false,
  startTime: start,
  buildPhaseEndTime: build,
  shifts: shifts.map((t, i) => ({ at: t, egg: i % 2 ? 'humility' : 'kindness' })),
});

/** Legs across midnight and both of Denver's DST days (spring forward 14 Mar 2027, fall back 1 Nov 2026). */
const FALL = at('2026-10-31', '12:00', -6);
const LEGS = [
  // Starts at midnight exactly, ends on the fall-back day after the repeated hour; a shift in the first 01:30.
  leg(at('2026-10-31', '00:00', -6), Date.parse('2026-11-01T10:15:00Z') / 1000, 196, [Date.parse('2026-11-01T07:30:00Z') / 1000, at('2026-11-01', '00:00', -6) + 59]),
  // Across the spring-forward day: 01:59 then 03:00.
  leg(Date.parse('2026-11-01T10:15:00Z') / 1000, at('2027-03-14', '03:00', -6), 197, [at('2027-03-14', '01:59'), at('2027-03-14', '03:00', -6)], at('2026-11-02', '23:59')),
  leg(at('2027-03-14', '03:00', -6), at('2027-03-20', '00:00', -6), 219, [at('2027-03-15', '00:00', -6)]),
];
const CHAIN = [196, 197, 219];

function chainsCsv() {
  return buildChainsCsv([{ key: CHAIN.join(','), seconds: 150 * D, legs: LEGS }], meta(FALL));
}
function deadlineCsv() {
  const end = LEGS[2].endTime;
  return buildDeadlineCsv([{ chain: CHAIN, reachAt: end, ascendAt: end, spare: 10 * D, legs: LEGS }], meta(FALL), {
    deadline: end + 10 * D,
    priced: 1,
  });
}
/** Every *_local cell of the route's rows. */
function localCells(csv: string): string[] {
  let head: string[] | null = null;
  const out: string[] = [];
  readCsv(csv, {
    record(cells) {
      if (cells[0] === 'rank' && !head) return void (head = cells);
      if (!head || !/^\d/.test(cells[0] ?? '')) return;
      head.forEach((h, i) => h.endsWith('_local') && cells[i] && out.push(cells[i]));
    },
  });
  return out;
}

describe('the CSV’s times', () => {
  it('stay YYYY-MM-DD HH:MM in the run’s zone (24-hour, midnight 00), lists too', () => {
    for (const csv of [chainsCsv(), deadlineCsv()]) {
      const cells = localCells(csv);
      expect(cells.length).toBeGreaterThan(6);
      for (const c of cells) expect(c).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}( [a-z]+)?(; \d{4}-\d{2}-\d{2} \d{2}:\d{2} [a-z]+)*$/);
      expect(cells).toContain('2026-10-31 00:00');
      expect(cells.join(' ')).toContain('2026-11-01 00:00 humility');
    }
    expect(formatInZone(at('2027-03-14', '00:00'), DENVER)).toBe('2027-03-14 00:00');
    expect(formatInZone(at('2027-03-14', '03:00', -6), DENVER)).toBe('2027-03-14 03:00');
    expect(formatInZone(at('2027-03-14', '01:59'), DENVER)).toBe('2027-03-14 01:59');
  });

  it('the header says what the times are, in which zone, and what ######## in Excel means', () => {
    for (const csv of [chainsCsv(), deadlineCsv()]) {
      const line = csv.split('\n').find(l => l.startsWith('# times '));
      // spec-xlsx (29 Oct 2026): still what the #s mean in the CSV, and a one-line tip pointing at the Excel download
      // beside the CSV button (components/auto/csvButton.ts XLSX_BUTTON), whose columns are sized. Draft for Words.
      expect(line).toBe(
        `# times (the columns ending _local) are YYYY-MM-DD HH:MM (24-hour) in America/Denver. ######## in Excel means the column is too narrow: widen it. Or use ${XLSX_BUTTON.replace(/ ↓$/, '')} beside the CSV button: its columns are sized (offered when the table is under ${XLSX_ROW_CAP} rows).`
      );
      // A note line: no commas, and no "This computer" (search/device.ts thisDevice()).
      expect(line).not.toContain(',');
      expect(line).not.toMatch(/this computer/i);
      // Still before the data, and not mistaken for the generated line the readers find the zone in.
      expect(csv.indexOf(line!)).toBeLessThan(csv.indexOf('\nrank,'));
      expect(legsFromRunCsv(csv, CHAIN)).not.toBeNull();
    }
  });
});

describe('reading the times back (search/runLegsCsv.ts)', () => {
  it('both ways of writing a time: YYYY-MM-DD HH:MM and ISO 8601’s YYYY-MM-DDTHH:MM', () => {
    for (const [day, time, offset] of [
      ['2026-11-02', '12:00', -7],
      ['2026-10-31', '00:00', -6],
      ['2027-03-14', '03:00', -6],
      ['2027-03-14', '01:59', -7],
    ] as const) {
      const t = at(day, time, offset);
      expect(unixFromZoned(`${day} ${time}`, DENVER), `${day} ${time}`).toBe(t);
      expect(unixFromZoned(`${day}T${time}`, DENVER), `${day}T${time}`).toBe(t);
    }
    expect(unixFromZoned('2026-11-02T12:00:00', DENVER)).toBeNull();
    expect(unixFromZoned('2026-11-02 12:00 ', DENVER)).toBe(at('2026-11-02', '12:00'));
    expect(unixFromZoned('2026-11-02 12:00', DENVER)).toBe(Date.parse('2026-11-02T19:00:00Z') / 1000);
    expect(unixFromZoned('Nov 2, 2026, 12:00 PM', DENVER)).toBeNull();
  });

  it('round trip, both files, both ways: every leg, build end and shift to the minute, across midnight and DST', () => {
    for (const written of [chainsCsv(), deadlineCsv()]) {
      // The same file with every time written ISO 8601's way (cells and lists; the header untouched).
      const [head, body] = [written.slice(0, written.indexOf('\nrank,')), written.slice(written.indexOf('\nrank,'))];
      const isoT = head + body.replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/g, '$1T$2');
      expect(isoT).not.toBe(written);
      for (const csv of [written, isoT]) {
        const legs = legsFromRunCsv(csv, CHAIN)!;
        expect(legs).toHaveLength(3);
        LEGS.forEach((l, i) => {
          expect(legs[i].startTime).toBe(minute(l.startTime!));
          expect(legs[i].endTime).toBe(minute(l.endTime));
          expect(legs[i].buildPhaseEndTime).toBe(minute(l.buildPhaseEndTime!));
          expect(legs[i].shifts!.map(s => [s.at, s.egg])).toEqual(l.shifts!.map(s => [minute(s.at), s.egg]));
        });
      }
    }
  });

  it('the fall-back day’s repeated hour reads back as its first pass (the cell has no offset)', () => {
    const first = Date.parse('2026-11-01T07:30:00Z') / 1000;
    const second = first + H;
    expect(formatInZone(first, DENVER)).toBe(formatInZone(second, DENVER));
    expect(unixFromZoned(formatInZone(second, DENVER), DENVER)).toBe(first);
  });
});
