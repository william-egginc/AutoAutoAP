/**
 * Two Leaderboard slips (site-wide fluff review 2, 5 Nov 2026, beyond-fluff item 5): By a date's tables said "Anonymous
 * answers are listed but not ranked, as in Fastest to N TE." with a literal N, and All runs showed plan length as
 * "380.000" (`durationDays.toFixed(3)`: days to a thousandth, no unit). Plan length now reads as By a date's Spare does,
 * "380.0 d", and the line names the race tab as its own tab does ("Fastest to 490 TE", or "Fastest to a target TE").
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planLengthText } from './boardWords';
import { isWordingOnly } from './resultCodeHash';

const panel = fs.readFileSync(path.resolve(__dirname, '../components/auto/LeaderboardPanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('<script'));

describe('All runs: plan length', () => {
  it('in days to a tenth, with its unit', () => {
    expect(planLengthText(380)).toBe('380.0 d');
    expect(planLengthText(739.4764)).toBe('739.5 d');
    expect(planLengthText(0.25)).toBe('0.3 d');
  });
  it('not recorded: a dash', () => {
    expect(planLengthText(Number.NaN)).toBe('—');
    expect(planLengthText(undefined)).toBe('—');
  });
  it('the cell uses it (never toFixed(3))', () => {
    expect(template).toContain('{{ planLengthText(line.row.durationDays) }}');
    expect(template).not.toContain('durationDays.toFixed(3)');
  });
  it('is wording only (never part of the result code hash)', () => {
    expect(isWordingOnly('src/lib/boardWords.ts')).toBe(true);
  });
});

describe('By a date: the anonymous line', () => {
  it('never a literal N; since fluff review 2 (L8, 5 Nov 2026) one clause, naming no tab', () => {
    expect(template).not.toContain('as in Fastest to N TE');
    expect(template).toContain("Anonymous answers aren't ranked.");
  });
});
