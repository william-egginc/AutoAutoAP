/**
 * The optimizer card's own words and where they are used (game expert's check and Jordan's hours job, 22 Nov 2026).
 * DRAFT wording: Words owns the final text. Times are 12-hour.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CADENCE_HEADING,
  CADENCE_NOTE,
  STANDARD_PERMIT_NOTE,
  bestAlternativeTitle,
  fitsAlternativeTitle,
  nightLaunchesText,
} from './optimizerWords';

const panel = readFileSync(new URL('../components/actions/rockets/HumilityOptimizerPanel.vue', import.meta.url), 'utf8');

describe('optimizer words', () => {
  it('cadence is a preference, not a game rule', () => {
    expect(CADENCE_HEADING).toBe('How often I will launch');
    expect(CADENCE_NOTE).toMatch(/your preference/i);
    expect(CADENCE_NOTE).toMatch(/not a game rule/i);
  });

  it('the Standard permit note is one line and says what is assumed', () => {
    expect(STANDARD_PERMIT_NOTE).toMatch(/Pro permit/);
    expect(STANDARD_PERMIT_NOTE).not.toContain('\n');
  });

  it('alternative titles and the night-launch line', () => {
    expect(bestAlternativeTitle).toBe('Best');
    expect(fitsAlternativeTitle).toBe('Fits your awake hours');
    expect(nightLaunchesText(0)).toBe('Every launch is in your awake hours');
    expect(nightLaunchesText(1)).toBe('1 launch in your hours off');
    expect(nightLaunchesText(3)).toBe('3 launches in your hours off');
  });

  it('the panel uses them: the effort heading, the permit note, the alternatives', () => {
    expect(panel).toContain("from '@/lib/optimizerWords'");
    expect(panel).toContain('{{ CADENCE_HEADING }}');
    expect(panel).toContain('{{ CADENCE_NOTE }}');
    expect(panel).toContain('!initialStateStore.proPermit');
    expect(panel).toContain('{{ STANDARD_PERMIT_NOTE }}');
    expect(panel).toContain('nightLaunchesText(alt.nightLaunches)');
    // The old heading and the inline strings are gone.
    expect(panel).not.toMatch(/block text-small font-bold text-gray-700">Effort</);
    expect(panel).not.toContain('Every launch is in your awake hours');
  });
});
