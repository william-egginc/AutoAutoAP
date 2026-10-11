import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISTRIBUTION, SAWTOOTH, SAWTOOTH_STATS } from './chainSearchMath';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('SAWTOOTH_STATS run-end count', () => {
  // The box behind DISTRIBUTION and the sawtooth stats: `195 X2 X3 X4 490`,
  // X2 220-235, X3 265-295, X4 310-330. One sweep per (X2, X3) prefix.
  const prefixes = 16 * 31;
  const chains = prefixes * 21;

  it('is a count over the box it claims to come from', () => {
    expect(chains).toBe(10_416);
    expect(DISTRIBUTION.counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(chains);
    expect(SAWTOOTH_STATS.runEndTotal).toBeLessThanOrEqual(prefixes);
    expect(SAWTOOTH_STATS.runEndHits).toBeLessThanOrEqual(SAWTOOTH_STATS.runEndTotal);
  });

  it('holds on the sample sweep the figure draws', () => {
    const { days } = SAWTOOTH;
    const best = days.indexOf(Math.min(...days));
    expect(best).toBeLessThan(days.length - 1);
    expect(days[best + 1]).toBeGreaterThan(days[best]); // the next TE is a jump: a run-end
  });

  it('is the figure the doc, the driver and autoplan.py quote', () => {
    const figure = `${SAWTOOTH_STATS.runEndHits}/${SAWTOOTH_STATS.runEndTotal}`;
    for (const path of ['FOR_MATH_NERDS.md', 'src/search/driver.ts', 'scripts/autoplan.py']) {
      const text = read(path);
      expect(text, path).toContain(figure);
      // Any other "N/N" run-end figure (other than the retired one the doc names as retired) is a mismatch.
      const others = [...text.matchAll(/\b(\d{3,})\/\1\b/g)].map(m => m[0]).filter(f => f !== figure);
      expect(
        others.filter(f => !text.includes(`said ${f}`)),
        path
      ).toEqual([]);
    }
  });
});
