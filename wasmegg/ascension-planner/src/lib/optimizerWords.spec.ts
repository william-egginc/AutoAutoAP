/**
 * The optimizer card's own words and where they are used (game expert's check and Jordan's hours job, 22 Nov 2026).
 * Wording approved by Jordan, 23 Nov 2026. Times are 12-hour.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CADENCE_HEADING,
  CADENCE_NOTE,
  bestAlternativeTitle,
  fitsAlternativeTitle,
  nightLaunchesText,
  SAME_CHANCE_AS_BEST,
  loadedSaveLine,
  sameChanceAsBest,
} from './optimizerWords';

const panel = readFileSync(new URL('../components/actions/rockets/HumilityOptimizerPanel.vue', import.meta.url), 'utf8');

describe('optimizer words', () => {
  it('cadence is a preference, not a game rule', () => {
    expect(CADENCE_HEADING).toBe('How often I will launch');
    expect(CADENCE_NOTE).toMatch(/your preference/i);
    expect(CADENCE_NOTE).toMatch(/not a game rule/i);
    expect(CADENCE_NOTE).toBe('Your preference, not a game rule: how often you are willing to relaunch.');
  });

  it('alternative titles and the night-launch line', () => {
    expect(bestAlternativeTitle).toBe('Best');
    expect(fitsAlternativeTitle).toBe('Fits your awake hours');
    expect(nightLaunchesText(0)).toBe('Every launch is in your awake hours');
    expect(nightLaunchesText(1)).toBe('1 launch in your hours off');
    expect(nightLaunchesText(3)).toBe('3 launches in your hours off');
  });

  it('the Fits card says so when it shows the same chance as Best', () => {
    expect(SAME_CHANCE_AS_BEST).toBe('Same chance as Best');
    // Compared as shown: two chances that read alike are the same chance to the player.
    expect(sameChanceAsBest('0.6%', '0.6%')).toBe(true);
    expect(sameChanceAsBest('0.6%', '0.5%')).toBe(false);
    // Nothing to compare against while Best is still being found.
    expect(sameChanceAsBest(null, '0.6%')).toBe(false);
  });

  it('the panel uses them: the effort heading, the permit note, the alternatives', () => {
    expect(panel).toContain("from '@/lib/optimizerWords'");
    expect(panel).toContain('{{ CADENCE_HEADING }}');
    expect(panel).toContain('{{ CADENCE_NOTE }}');
    // Standard permit saves do not see the optimizer at all (Jordan, 22 Nov 2026), so the card carries no note for them.
    expect(panel).not.toContain('proPermit');
    expect(panel).not.toContain('optimizer-standard-permit');
    expect(readFileSync(new URL('./optimizerWords.ts', import.meta.url), 'utf8')).not.toContain('STANDARD_PERMIT');
    expect(readFileSync(new URL('../components/actions/RocketActions.vue', import.meta.url), 'utf8')).toMatch(/<HumilityOptimizer\s+v-if="initialStateStore\.proPermit"/);
    expect(panel).toContain('nightLaunchesText(alt.nightLaunches)');
    expect(panel).toContain('{{ SAME_CHANCE_AS_BEST }}');
    expect(panel).toContain('alt.sameAsBest');
    // The old heading and the inline strings are gone.
    expect(panel).not.toMatch(/block text-small font-bold text-gray-700">Effort</);
    expect(panel).not.toContain('Every launch is in your awake hours');
  });
});

describe('the loaded-save line (Jordan, 23 Nov 2026: "and loaded?")', () => {
  it('says the save in use is the one already loaded, and when it is from', () => {
    expect(loadedSaveLine('Nov 22 at 9:40 PM')).toBe('Using your loaded save from Nov 22 at 9:40 PM for your ship levels, inventory and crafting level.');
    expect(loadedSaveLine('')).toBe('Using your loaded save for your ship levels, inventory and crafting level.');
  });
  it('the card shows it, with the button as a newer copy and not a step', () => {
    expect(panel).toContain('{{ loadedLine }}');
    expect(panel).toContain('Load a newer copy');
    expect(panel).not.toContain('Reload it');
    expect(panel).not.toContain('come from your save.');
  });
});

