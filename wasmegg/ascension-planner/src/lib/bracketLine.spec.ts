/** The nearest-gear line under the instant answer (lib/bracketLine.ts): never the wrong way round (23 Oct 2026). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bracketLine, type BracketLineInput } from './bracketLine';
import { showDateTime } from './displayTime';

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 17) / 1000;
const show = (u: number) => showDateTime(u, 'UTC');
const STRONG = 'gear like 128.7 / 0.99';
const WEAK = 'gear like 127.9 / 0.96';

/** The report: the green box Jan 29, 2029; the line "between Jan 3, 2029 and Jan 13, 2029", both sooner. */
const report = (basis: 'maxed' | 'yours'): BracketLineInput => ({
  goal: 'fastest',
  answer: { basis, end: at(2029, 1, 29), te: 490 },
  hi: { end: at(2029, 1, 3), te: 490, name: STRONG },
  lo: { end: at(2029, 1, 13), te: 490, name: WEAK },
  show,
});

describe('bracketLine, Fastest', () => {
  it('the report, on a maxed answer: weaker gear priced sooner than maxed is not shown at all', () => {
    expect(bracketLine(report('maxed'))).toBe('');
  });
  it('the report, on the form G (the answer on your gear): the two estimates disagree, so no line', () => {
    expect(bracketLine(report('yours'))).toBe('');
  });
  it('a maxed answer with both sides later: the range, saying what it compares', () => {
    const t = bracketLine({
      ...report('maxed'),
      hi: { end: at(2029, 2, 3), te: 490, name: STRONG },
      lo: { end: at(2029, 2, 13), te: 490, name: WEAK },
    });
    expect(t).toBe(
      `The answer above is maxed gear's, at your delivery rate. With your gear you'd likely finish between ${show(at(2029, 2, 3))} (on ${STRONG}) and ${show(at(2029, 2, 13))} (on ${WEAK}); Fast, Exact or Custom below gives your real date.`
    );
  });
  it('a maxed answer, the stronger side sooner (dropped): from the answer to the weaker side; never sooner than the answer', () => {
    const t = bracketLine({ ...report('maxed'), lo: { end: at(2029, 2, 13), te: 490, name: WEAK } });
    expect(t).toContain(`between ${show(at(2029, 1, 29))} (the answer above) and ${show(at(2029, 2, 13))} (on ${WEAK})`);
    expect(t).not.toContain(STRONG);
  });
  it('a maxed answer, the weaker side sooner (dropped): no sooner than the stronger side', () => {
    const t = bracketLine({ ...report('maxed'), hi: { end: at(2029, 2, 3), te: 490, name: STRONG } });
    expect(t).toContain(`no sooner than ${show(at(2029, 2, 3))} (on ${STRONG})`);
    expect(t).not.toContain(WEAK);
  });
  it('the form G with the answer between the two sides: the range, as a second estimate', () => {
    const t = bracketLine({ ...report('yours'), lo: { end: at(2029, 2, 13), te: 490, name: WEAK } });
    expect(t).toBe(
      `Priced on the instant answers for the gear closest to yours on this site, your route would finish between ${show(at(2029, 1, 3))} (on ${STRONG}) and ${show(at(2029, 2, 13))} (on ${WEAK}); Fast, Exact or Custom below gives your real date.`
    );
  });
  it('no date shown ever comes before a maxed answer, whatever the sides', () => {
    const ends = [at(2028, 12, 1), at(2029, 1, 29), at(2029, 3, 1), null];
    for (const h of ends)
      for (const l of ends) {
        const t = bracketLine({
          ...report('maxed'),
          hi: h === null ? null : { end: h, te: 490, name: STRONG },
          lo: l === null ? null : { end: l, te: 490, name: WEAK },
        });
        if (h !== null && h < at(2029, 1, 29)) expect(t).not.toContain(STRONG);
        if (l !== null && l < at(2029, 1, 29)) expect(t).not.toContain(WEAK);
      }
  });
});

describe('bracketLine, By a date', () => {
  const date = (basis: 'maxed' | 'yours', hiTE: number, loTE: number): BracketLineInput => ({
    goal: 'date',
    answer: { basis, end: at(2027, 7, 1), te: 313 },
    hi: { end: at(2027, 7, 1), te: hiTE, name: STRONG },
    lo: { end: at(2027, 7, 1), te: loTE, name: WEAK },
    show,
  });
  it('a maxed answer: no side reaches more TE than it', () => {
    expect(bracketLine(date('maxed', 316, 318))).toBe('');
    expect(bracketLine(date('maxed', 312, 309))).toBe(
      `The answer above is maxed gear's, at your delivery rate. With your gear you'd likely reach between 309 TE (on ${WEAK}) and 312 TE (on ${STRONG}) by the date; Fast, Exact or Custom below gives your real TE.`
    );
  });
  it('the form G: shown only when the answer sits between the two', () => {
    expect(bracketLine(date('yours', 315, 310))).toContain('reach between 310 TE (on');
    expect(bracketLine(date('yours', 312, 310))).toBe('');
    expect(bracketLine(date('yours', 316, 314))).toBe('');
  });
});

describe('InstantRoute wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
  it('the line comes from bracketLine with the answer on screen and what it was built on', () => {
    expect(src).toContain("basis: shiftedTable.value ? 'yours' : 'maxed',");
    expect(src).toContain('return bracketLine({');
    expect(src).not.toContain("With your gear you'd likely finish between");
  });
  it('the bracket is priced as the answer (held tail), on tables of this simulator only', () => {
    expect(src).toContain('tail: instantTail(hours, store.deferShifts, undefined, answerDays),');
    expect(src).toContain('e.from <= legs.startTE && !tableSimMismatch(e)');
    // "What if you had maxed gear?" too.
    expect(src).toContain('tail: instantTail(w.hours, store.deferShifts, undefined, answerDays),');
  });
});
