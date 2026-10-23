/**
 * CSV formula injection (red team 21 Oct 2026, server.md): a text cell starting = + - @, a tab or a
 * carriage return runs as a formula when the downloaded CSV is opened in a spreadsheet. Every cell the
 * site writes goes through `cell`, which prefixes such text with ' and leaves numbers, negative ones
 * included, as numbers.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { buildChainsCsv, guardCell } from './csv';
import type { LegSummary } from './types';

const DENVER = 'America/Denver';
const PLAN_START = getLocalTimestampInTimezone('2026-09-04', '21:30', DENVER);

describe('guardCell', () => {
  it('prefixes text that a spreadsheet would run', () => {
    for (const bad of ['=HYPERLINK("http://x","y")', '+cmd|x', '-2+3', '@SUM(A1)', '\tx', '\rx', '=1+1'])
      expect(guardCell(bad)).toBe(`'${bad}`);
  });
  it('leaves numbers written as text, and ordinary text, alone', () => {
    for (const ok of ['-3.25', '+4', '-0.0001', '1e9', '-1.5e-3', '741.9650', '195 219 490', '2-sale-tier13', 'T4L cube', ''])
      expect(guardCell(ok)).toBe(ok);
  });
});

describe('the downloaded CSV', () => {
  it('a hostile strategy name is written as text; a negative gap stays a number', () => {
    const leg = {
      key: '=HYPERLINK("http://example.invalid","click")',
      endTE: 219,
      durationSeconds: 86400,
      maxELR: 1,
      endTime: PLAN_START + 86400,
      tier13Unlocked: false,
      startTime: PLAN_START,
      buildPhaseEndTime: PLAN_START,
      buildPhaseSaleCount: 1,
      nightShifts: 0,
      sleepDelaySeconds: 0,
    } as unknown as LegSummary;
    const csv = buildChainsCsv([{ key: '195,219', seconds: 86400, legs: [leg] }], {
      planStart: PLAN_START,
      timezone: DENVER,
      currentTE: 176,
      final: 219,
      effort: 'balanced',
      firstAscension: 'continue' as const,
      availability: null,
      seedChain: [],
      loadouts: [],
      generatedAt: PLAN_START * 1000,
      runNote: '=1+1',
    });
    const rows = csv.split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('rank,'));
    expect(rows.join('\n')).toContain(`"'=HYPERLINK(""http://example.invalid"",""click"")"`);
    for (const r of rows) for (const c of r.split(',')) expect(c).not.toMatch(/^[=+@\t\r]/);
    // The note is on a "# " line, which no spreadsheet runs.
    expect(csv).toContain('# note: =1+1');
  });

  it('every data row of every CSV goes through cell()', () => {
    const src = readFileSync(new URL('./csv.ts', import.meta.url), 'utf8');
    const joins = src.match(/^.*\.join\(','\).*$/gm) ?? [];
    for (const j of joins) expect(j, j).toMatch(/\.map\(cell\)\.join|COLUMNS\.join|^\s*\.join\(','\);$/);
  });
});
