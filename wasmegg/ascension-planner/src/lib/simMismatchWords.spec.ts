/** The yellow note on an instant answer made with another simulator (InstantRoute.vue, spec-tidy-words34, 15 Nov 2026). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIM_VERSION } from '@/search/simVersion';
import { simMismatchWords } from './simMismatchWords';

const sim = SIM_VERSION.replace(/^\d{4}-\d{2}-\d{2}-/, '');

describe('simMismatchWords', () => {
  it('names the old simulator by its short name and the one this page runs, and says the answers are being rebuilt', () => {
    expect(simMismatchWords('simulator 2026-11-03-sim4')).toBe(
      `This instant answer was made with simulator sim4. This page runs ${sim}, and the instant answers are being rebuilt for it. Until then its dates can differ by up to about a week on a 490 route (about 1%). Fast, Exact or Custom below prices them on your account.`
    );
  });
  it('an answer with no stamp: "an older simulator"', () => {
    expect(simMismatchWords('an older simulator')).toContain('This instant answer was made with an older simulator.');
  });
  it('no talk of the low-TE gate, C1/K1/I1, "moves only a little" or "tables"', () => {
    const t = simMismatchWords('simulator 2026-11-03-sim4');
    expect(t).not.toMatch(/low-TE|C1|K1|I1|only a little|table|gate/i);
  });
  it('the card reads it from here, not from its own sentence', () => {
    const card = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
    expect(card).toContain('{{ simMismatchWords(simNote) }}');
    expect(card).not.toContain('expected to move only a little');
  });
});
