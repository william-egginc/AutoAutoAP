import { describe, expect, it } from 'vitest';
import { SAVE_BANNER_SILO_HOURS, saveBannerState } from './saveBanner';
import { SAVE_BANNER_SILO_HOURS_WORDS, SAVE_LOW_SILOS_LEAD, thresholdsDetail } from './saveFreshnessWords';

const NOW = Date.UTC(2026, 9, 15, 23, 36) / 1000;
const H = 3600;
const base = { hasVirtueFarm: true, nowSeconds: NOW, zone: 'America/Denver' };

describe('the save banner words', () => {
  it('the words file knows the banner hours the rule uses', () => {
    expect(SAVE_BANNER_SILO_HOURS_WORDS).toBe(SAVE_BANNER_SILO_HOURS);
  });
  it('the Details sentence says the new rule, not "Getting old after 13.5h" alone', () => {
    expect(thresholdsDetail('13h 30m', '1d')).toBe(
      'The banner shows only when your silos have under 6 hours left and your save is getting old (after 13h 30m) or out of date (after 1d). The same lines apply to the silo time used.'
    );
    expect(thresholdsDetail('13h 30m', '1d', true)).toMatch(/, once your clock is right\.$/);
  });
  it('Details carries the new threshold sentence, in the clock-behind state too, and no other line changes', () => {
    const ok = saveBannerState({ ...base, backupSeconds: NOW - 16 * H, farmStepSeconds: NOW - 16 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(ok?.details.filter(d => /banner shows only/.test(d))).toHaveLength(1);
    expect(ok?.details.some(d => d.startsWith('Getting old after'))).toBe(false);
    expect(ok?.details[0]).toMatch(/^Save: from /);
    const behind = saveBannerState({ ...base, backupSeconds: NOW + 2 * H, farmStepSeconds: NOW + 2 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(behind?.clockBehindSeconds).toBeGreaterThan(0);
    expect(behind?.details.some(d => /once your clock is right\.$/.test(d))).toBe(true);
  });
  it('a 16 h old save with big silos: the quiet line says its age to a screen reader, never "Up to date"', () => {
    const s = saveBannerState({ ...base, backupSeconds: NOW - 16 * H, farmStepSeconds: NOW - 16 * H, siloSeconds: 40 * H, siloCount: 4 });
    expect(s?.word).toBe('Save is 16h old');
    expect(s?.headline).not.toBe(SAVE_LOW_SILOS_LEAD);
  });
  it('a save so old with silos under 6 h left: the banner keeps its tone word and the blurb', () => {
    const s = saveBannerState({ ...base, backupSeconds: NOW - 20 * H, farmStepSeconds: NOW - 20 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(s?.headline).toBe(SAVE_LOW_SILOS_LEAD);
    expect(s?.word).not.toMatch(/^Save is/);
  });
});
