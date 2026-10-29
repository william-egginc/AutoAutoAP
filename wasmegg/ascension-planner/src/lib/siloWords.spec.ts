/**
 * The silos run out, they don't fill (Jordan 26 Oct 2026): a farm waiting out a no-prestige day lays until its silos
 * run out, about how long with the save's silo time when there is a save, and no figure without one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { knownSiloSeconds, siloRunOutWords } from './siloWords';
import { siloSeconds } from './saveAge';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

describe('siloRunOutWords', () => {
  it('names the hours when the silo time is known', () => {
    expect(siloRunOutWords(12 * 3600)).toBe('until its silos run out (about 12 h with yours)');
    expect(siloRunOutWords(12.6 * 3600)).toBe('until its silos run out (about 13 h with yours)');
    expect(siloRunOutWords(600)).toBe('until its silos run out (about 1 h with yours)');
  });
  it('leaves the figure out when unknown', () => {
    for (const s of [null, undefined, 0, -5, NaN, Infinity]) expect(siloRunOutWords(s)).toBe('until its silos run out');
  });
});

describe('knownSiloSeconds', () => {
  it('null without a farm or a silo count', () => {
    expect(knownSiloSeconds(null, 5)).toBeNull();
    expect(knownSiloSeconds({}, 5)).toBeNull();
    expect(knownSiloSeconds({ numSilos: 0 }, 5)).toBeNull();
  });
  it('the save model (lib/saveAge.ts siloSeconds) with one', () => {
    expect(knownSiloSeconds({ numSilos: 4 }, 10)).toBe(siloSeconds(4, 10));
  });
});

describe('the player text', () => {
  it('the no-prestige explainer and the instant card say the silos run out', () => {
    const editor = read('components/auto/TimeOffEditor.vue');
    expect(editor).toContain('and the farm keeps laying while it waits, {silos}. Egg shifts still happen on these days.');
    expect(editor).toContain('siloRunOutWords(knownSiloSeconds(');
    const card = read('components/auto/InstantRoute.vue');
    expect(card).toContain('the farm keeps laying while it waits, {{ siloWords }} (the times shown include the wait).');
    expect(read('components/science/HowItWorks.vue')).toContain('until its silos run out; shifts still happen.');
  });
  it('nothing a player reads says the silos fill', () => {
    const files = [
      'components/auto/TimeOffEditor.vue',
      'components/auto/InstantRoute.vue',
      'components/science/HowItWorks.vue',
      '../public/about.html',
    ];
    for (const f of files) expect(read(f)).not.toMatch(/silos? (are|is) full|silos? fills?|fills? (the |its )?silos?/i);
  });
});
