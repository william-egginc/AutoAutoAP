import { describe, expect, it } from 'vitest';
import { enoughSets, estimateNote, estimateRoutes, roundedRoutes, usableRatio } from './deadlineEstimate';

describe('deadline route estimate', () => {
  const sets = 8632;
  const first = 95000;

  it('keeps the first guess until enough sets are done', () => {
    const e = estimateRoutes(500, first, { sets, finishedSets: 100, finishedRoutes: 300, openRoutes: 2000 });
    expect(e.learned).toBe(false);
    expect(e.total).toBe(first);
    expect(estimateNote(e)).toBe('');
  });

  it('never goes below what is already priced', () => {
    expect(estimateRoutes(120000, first, undefined).total).toBe(120000);
  });

  it('learns about 4 a set from finished sets, well under the 11 a set guess', () => {
    const e = estimateRoutes(19664, first, { sets, finishedSets: 1200, finishedRoutes: 4800, openRoutes: 2 * 7432 });
    expect(e.learned).toBe(true);
    expect(e.basedOnSets).toBe(1200);
    expect(e.perSet).toBeGreaterThan(3.9);
    expect(e.perSet).toBeLessThan(4.6);
    expect(e.total).toBeGreaterThan(30000);
    expect(e.total).toBeLessThan(42000);
  });

  it('counts routes open sets already used, and never goes negative', () => {
    const e = estimateRoutes(40000, first, { sets, finishedSets: 8000, finishedRoutes: 32000, openRoutes: 9000 });
    expect(e.total).toBeGreaterThanOrEqual(40000);
  });

  it('lands on the real count when every set is finished', () => {
    const e = estimateRoutes(34913, first, { sets, finishedSets: sets, finishedRoutes: 34913, openRoutes: 0 });
    expect(e.total).toBe(34913);
  });

  it('is trusted at 5% of a small run but not under 20 sets', () => {
    expect(enoughSets({ sets: 100, finishedSets: 5, finishedRoutes: 20, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 1000, finishedSets: 50, finishedRoutes: 200, openRoutes: 0 })).toBe(true);
    expect(enoughSets({ sets: 100000, finishedSets: 150, finishedRoutes: 600, openRoutes: 0 })).toBe(false);
    expect(enoughSets({ sets: 100000, finishedSets: 200, finishedRoutes: 800, openRoutes: 0 })).toBe(true);
  });

  it('words the note honestly', () => {
    const e = estimateRoutes(5000, first, { sets, finishedSets: 1200, finishedRoutes: 4800, openRoutes: 0 });
    expect(estimateNote(e)).toBe('estimated from the first 1,200 sets; first guess was ~95,000');
  });

  it('rounds for display and validates a remembered ratio', () => {
    expect(roundedRoutes(34913)).toBe(35000);
    expect(roundedRoutes(812)).toBe(812);
    expect(usableRatio('4.1')).toBe(4.1);
    expect(usableRatio('abc')).toBe(0);
    expect(usableRatio(0)).toBe(0);
  });
});
